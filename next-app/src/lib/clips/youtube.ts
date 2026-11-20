import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { uploadVideo } from './resumable';
import { workspaceAuth } from '../auth';
import { getStoragePath } from '../storage';
import { InputError, sql } from './db';

const scopes = ['youtube.upload', 'youtube.readonly'].map((s) => 'https://www.googleapis.com/auth/' + s);
export const configured = () =>
  !!(
    process.env.BETTER_AUTH_URL &&
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_TOKEN_KEY
  );
const redirect = () => new URL('/api/clips/youtube/callback', process.env.BETTER_AUTH_URL).href;
function key() {
  const value = Buffer.from(process.env.YOUTUBE_TOKEN_KEY || '', 'base64');
  if (value.length !== 32) throw new InputError('Configure a 32-byte base64 YouTube token key.', 503);
  return value;
}
function seal(text: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key(), iv);
  return Buffer.concat([iv, cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString(
    'base64',
  );
}
function unseal(text: string) {
  const data = Buffer.from(text, 'base64'),
    cipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  cipher.setAuthTag(data.subarray(-16));
  return Buffer.concat([cipher.update(data.subarray(12, -16)), cipher.final()]).toString();
}
export async function connect(user: string) {
  if (!configured()) throw new InputError('Configure YouTube OAuth in the server environment first.', 503);
  key();
  const state = randomBytes(32).toString('base64url'),
    verifier = randomBytes(48).toString('base64url');
  await sql`delete from clip_oauth where expires < now() or owner=${user}`;
  await sql`insert into clip_oauth values (${state},${user},${verifier},now()+interval '10 minutes')`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID!,
    redirect_uri: redirect(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes.join(' '),
    state,
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  }).toString();
  return url.href;
}
async function tokens(fields: Record<string, string>) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    body: new URLSearchParams({
      ...fields,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
    }),
  });
  if (!response.ok)
    throw new Error('Google token request failed (' + response.status + '). Check the channel connection.');
  return response.json();
}
export async function callback(user: string, url: URL) {
  const [row] =
    await sql`delete from clip_oauth where state=${url.searchParams.get('state') || ''} and owner=${user} and expires>now() returning verifier`;
  if (!row || !url.searchParams.get('code'))
    throw new InputError('Channel authorization expired or was cancelled.');
  const token = await tokens({
    grant_type: 'authorization_code',
    code: url.searchParams.get('code')!,
    code_verifier: row.verifier,
    redirect_uri: redirect(),
  });
  if (!token.refresh_token || !scopes.every((s) => token.scope?.split(' ').includes(s)))
    throw new InputError('Grant both channel permissions to enable posting.');
  const info = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: 'Bearer ' + token.access_token },
  });
  const channel = info.ok && (await info.json()).items?.[0];
  if (!channel?.id) throw new InputError('Google could not identify the authorized YouTube channel.');
  await sql`insert into clip_channel(owner,channel_id,channel_name,credential) values(${user},${channel.id},${channel.snippet.title},${seal(token.refresh_token)}) on conflict(owner) do update set channel_id=excluded.channel_id,channel_name=excluded.channel_name,credential=excluded.credential,automatic=false`;
}

// A committed session URL lets the next worker reconcile an interrupted final PUT.
let running = false;
export async function publishDue() {
  if (running || !configured()) return;
  running = true;
  try {
    await workspaceAuth();
    await sql.begin(async (tx) => {
      const [locked] = await tx`select pg_try_advisory_xact_lock(56310273) as acquired`;
      if (!locked.acquired) return;
      const [candidate] =
        await tx`select draft.id from clip_publication p join clip draft on draft.id=p.clip join clip_channel c on c.owner=p.owner and c.channel_id=p.channel_id join clip_export e on e.id=p.export_id where c.automatic and c.credential is not null and e.status='completed' and p.status='queued' and p.due<=now() and p.retry_at<=now() order by p.due limit 1 for update of draft skip locked`;
      if (!candidate) return;
      const [row] =
        await tx`select p.*,c.credential from clip_publication p join clip_channel c on c.owner=p.owner and c.channel_id=p.channel_id join clip_export e on e.id=p.export_id where p.clip=${candidate.id} and e.status='completed' and p.status='queued' and c.automatic and c.credential is not null`;
      if (!row) return;
      try {
        const token = await tokens({ grant_type: 'refresh_token', refresh_token: unseal(row.credential) });
        const file = getStoragePath('processed/clips/' + row.export_id + '.mp4');
        const video = await uploadVideo(
          file,
          token.access_token,
          { title: row.title, description: row.description, visibility: row.visibility },
          row.uri && unseal(row.uri),
          async (uri) => {
            await sql`update clip_publication set uri=${seal(uri)} where clip=${row.clip}`;
          },
        );
        await tx`update clip_publication set status='uploaded',video=${video},error=null,uri=null where clip=${row.clip}`;
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Upload interrupted.';
        await tx`update clip_publication set tries=tries+1,status=case when tries>=3 then 'failed' else 'queued' end,retry_at=now()+interval '2 minutes'*(tries+1),error=${message} where clip=${row.clip}`;
      }
    });
  } finally {
    running = false;
  }
}
