import { owner } from '@/lib/auth';
import { sql, InputError, failure, uuid } from '@/lib/clips/db';
import { connect, configured } from '@/lib/clips/youtube';
import { makeBatch } from '@/lib/clips/batches';
export async function GET() {
  try {
    const user = await owner();
    const [profile] =
      await sql`select channel_name,automatic,visibility,spacing,seconds,preset,tone,credit,render_batches from clip_channel where owner=${user}`;
    const requests =
      await sql`select r.source,coalesce(r.error,s.error) as error from clip_batch_request r join clip_source s on s.id=r.source where s.owner=${user}`;
    const posts =
      await sql`select p.clip,p.status,p.video,p.due,p.error,e.status as render_status from clip_publication p join clip_export e on e.id=p.export_id where p.owner=${user} order by p.due desc`;
    return Response.json({ configured: configured(), profile, posts, requests });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const user = await owner();
    if (
      !req.headers.get('content-type')?.startsWith('application/json') ||
      req.headers.get('sec-fetch-site') === 'cross-site'
    )
      throw new InputError('Use the Clips studio.', 403);
    const d = await req.json();
    if (d.action === 'connect') return Response.json({ url: await connect(user) });
    if (d.action === 'preferences') {
      if (
        typeof d.automatic !== 'boolean' ||
        typeof d.render_batches !== 'boolean' ||
        !['private', 'public', 'unlisted'].includes(d.visibility) ||
        !Number.isInteger(d.seconds) ||
        d.seconds < 30 ||
        d.seconds > 55 ||
        !Number.isInteger(d.spacing) ||
        d.spacing < 0 ||
        d.spacing > 10080 ||
        typeof d.preset !== 'string' ||
        d.preset.length > 80
      )
        throw new InputError('Check the channel settings.');
      if (
        d.preset &&
        !(await sql`select 1 from clip_user_preset where owner=${user} and name=${d.preset}`).length
      )
        throw new InputError('Unknown preset.');
      if (!['quote', 'question'].includes(d.tone) || typeof d.credit !== 'boolean')
        throw new InputError('Check title and credit settings.');
      await sql.begin(async (tx) => {
        await tx`insert into clip_channel(owner) values(${user}) on conflict do nothing`;
        const rows =
          await tx`update clip_channel set automatic=${d.automatic},render_batches=${d.render_batches},visibility=${d.visibility},seconds=${d.seconds},spacing=${d.spacing},preset=${d.preset},tone=${d.tone},credit=${d.credit} where owner=${user} and (not ${d.automatic} or credential is not null) returning owner`;
        if (!rows.length) throw new InputError('Connect a YouTube channel first.');
      });
    } else if (d.action === 'metadata' && uuid(d.id)) {
      const title = typeof d.title === 'string' ? d.title.trim() : '';
      if (
        !title ||
        title.length > 100 ||
        typeof d.description !== 'string' ||
        Buffer.byteLength(d.description) > 5000 ||
        /[<>]/.test(title + d.description)
      )
        throw new InputError(
          'Use a title of 1–100 characters and a description under 5,000 bytes, without angle brackets.',
        );
      await sql.begin(async (tx) => {
        const rows =
          await tx`update clip c set title=${title},description=${d.description} from clip_source s where s.id=c.source and c.id=${d.id} and s.owner=${user} returning c.id`;
        if (!rows.length) throw new InputError('Unknown clip.', 404);
        await tx`update clip_publication set title=${title},description=${d.description} where clip=${d.id} and uri is null and status in ('queued','review')`;
      });
    } else if (d.action === 'disconnect') {
      await sql`update clip_channel set channel_id=null,channel_name=null,credential=null,automatic=false where owner=${user}`;
    } else if (d.action === 'batch' && uuid(d.id) && (!d.replace || uuid(d.replace))) {
      return Response.json(await makeBatch(user, d.id, d.replace));
    } else if (d.action === 'skip' && uuid(d.id)) {
      const rows =
        await sql`update clip c set skipped=true from clip_source s where c.id=${d.id} and c.source=s.id and s.owner=${user} and c.batch is not null and not exists(select 1 from clip_export where clip=c.id) returning c.id`;
      if (!rows.length) throw new InputError('Draft unavailable for skipping.', 409);
    } else if (d.action === 'retry' && uuid(d.id)) {
      const rows =
        await sql`update clip_publication set status='queued',tries=0,retry_at=now(),error=null where owner=${user} and clip=${d.id} and status='failed' returning clip`;
      if (!rows.length) throw new InputError('Upload is not awaiting retry.', 409);
    } else throw new InputError('Unknown studio action.');
    return Response.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
