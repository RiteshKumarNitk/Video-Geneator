import { owner } from '@/lib/auth';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { readJobs } from '@/lib/jobsStore';
import { getStoragePath } from '@/lib/storage';
import { sql, uuid, InputError, failure } from '@/lib/clips/db';
import { validCues, defaults } from '@/lib/clips/model';
import { enqueue } from '@/lib/clips/worker';

import { exportProgress } from '@/lib/clips/media';
import { adoptUpload, saveClip, extension } from '@/lib/clips/library';
import { presets, savePreset } from '@/lib/clips/presets';

function youtube(value: unknown) {
  let url: URL;
  try {
    url = new URL(String(value));
  } catch {
    throw new InputError('Enter a YouTube video URL.');
  }
  const short = url.hostname === 'youtu.be';
  const id = short ? url.pathname.slice(1) : url.pathname === '/watch' ? url.searchParams.get('v') : null;
  if (
    (!short && !['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !id ||
    !/^[a-zA-Z0-9_-]{11}$/.test(id)
  ) {
    throw new InputError('Choose a supported HTTPS YouTube watch or share link.');
  }
  return 'https://www.youtube.com/watch?v=' + id;
}
export async function GET() {
  try {
    const user = await owner();
    const [sources, clips, exports, jobs, savedPresets] = await Promise.all([
      sql`select id,path,filename,url,status,error,metadata,cues,analysis,suggestions from clip_source where owner=${user} order by created desc`,
      sql`select c.* from clip c join clip_source s on c.source=s.id where s.owner=${user} order by c.created desc`,
      sql`select e.id,e.clip,e.status,e.error from clip_export e join clip c on c.id=e.clip join clip_source s on s.id=c.source where s.owner=${user} order by e.created desc`,
      readJobs(),
      presets(user),
    ]);
    await Promise.all(
      exports.map(async (e) => {
        e.progress = await exportProgress(e.id, e.status);
      }),
    );
    const uploads = jobs
      .filter(
        (j) => j.owner === user && j.originalVideo && uuid(j.id) && !sources.some((s) => s.id === j.id),
      )
      .map((j) => ({ id: j.id, filename: j.filename || path.basename(j.originalVideo!) }));
    await Promise.all(
      sources
        .filter((s) => s.url && s.status === 'processing')
        .map(async (s) => {
          try {
            const data = JSON.parse(await readFile(getStoragePath(s.path + '.progress'), 'utf8'));
            s.progress = data.progress;
            s.track = data.track;
          } catch {
            /* The downloader is resolving the video or finalizing the file. */
          }
        }),
    );
    return Response.json(
      { sources, clips, exports, uploads, presets: savedPresets },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const user = await owner();
    const data = await req.json();
    const { action } = data;
    const attempt = randomUUID();
    if (action === 'preset') {
      await savePreset(data, user);
      return Response.json({ name: data.name.trim() }, { status: 201 });
    }
    if (action === 'source') {
      const url = data.url ? youtube(data.url) : null;
      if (url && data.authorized !== true)
        throw new InputError('Confirm you have permission to download this source.');
      const filename = url
        ? new URL(url).searchParams.get('v') + '.mp4'
        : path.basename(String(data.filename || '')).slice(-250);
      const id = randomUUID(),
        relative = 'uploads/' + id + extension(filename);
      const [row] =
        await sql`insert into clip_source (owner,id, filename, path, url, status, attempt) values
        (${user},${id},${filename},${relative},${url},${url ? 'queued' : 'waiting'},${attempt}) on conflict (owner,url) do update set url=excluded.url returning id`;
      if (url && row.id === id) await enqueue({ kind: 'source', id, attempt });
      return Response.json(row, { status: 201 });
    }
    const { id } = data;
    if (!uuid(id)) throw new InputError('Invalid ID.');
    if (action === 'existing') {
      await adoptUpload(id, user);
      return Response.json({ id });
    }
    if (action === 'retryExport') {
      const [row] =
        await sql`update clip_export set status='queued',error=null,attempt=${attempt} where id=${id} and clip in (select c.id from clip c join clip_source s on c.source=s.id where s.owner=${user}) and status='failed' returning id`;
      if (!row) throw new InputError('Export is not awaiting retry.', 409);
      await enqueue({ kind: 'export', id, attempt });
      return Response.json(row);
    }
    if (action === 'save' || action === 'export') {
      const result = await saveClip(id, user, data.settings, action === 'export', data.expected);
      return Response.json({ id: result });
    }
    const [source] = await sql`select * from clip_source where id=${id} and owner=${user}`;
    if (!source) throw new InputError('Unknown source.', 404);
    if (action === 'retrySource') {
      const url = source.url;
      const fromFile = !url && path.basename(source.path, path.extname(source.path)) === id;
      const [row] =
        await sql`update clip_source set status=${fromFile ? 'waiting' : 'queued'}, updated=now(), error=null, attempt=${attempt}
        where id=${id} and status='failed' returning id`;
      if (!row) throw new InputError('Source is not awaiting retry.', 409);
      if (!fromFile) await enqueue({ kind: 'source', id, attempt });
      return Response.json(row);
    }
    if (source.status !== 'ready') throw new InputError('Wait for the source to finish importing.', 409);
    if (action === 'create') {
      const clipId = randomUUID();
      const title = String(data.title || 'Untitled clip')
        .trim()
        .slice(0, 120);
      await sql`insert into clip(id, source, title,settings) values(${clipId},${id},${title},${sql.json(defaults(source.metadata.duration))})`;
      return Response.json({ id: clipId }, { status: 201 });
    }
    if (action === 'cues') {
      if (!validCues(data.cues)) throw new InputError('Invalid timed transcript.');
      await sql`update clip_source set cues=${sql.json(data.cues)}, suggestions='[]',analysis=null,error=null where id=${id}`;
      return Response.json({ id });
    }
    if (action === 'transcribe') {
      const [row] =
        await sql`update clip_source set analysis=${attempt},error=null where id=${id} and (analysis is null or analysis in ('failed','complete')) returning id`;
      if (!row) throw new InputError('Transcription is already running.', 409);
      await enqueue({ kind: 'analysis', id, attempt });
      return Response.json(row);
    }
    throw new InputError('Unknown action.');
  } catch (e) {
    return failure(e);
  }
}
