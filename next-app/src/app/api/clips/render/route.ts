import { owner } from '@/lib/auth';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { getJob, updateJob } from '@/lib/jobsStore';
import { getStoragePath } from '@/lib/storage';
import { adoptUpload, saveClip } from '@/lib/clips/library';
import { defaults } from '@/lib/clips/model';
import { sql, uuid, failure, InputError } from '@/lib/clips/db';

// Keep the response shape used by the original highlights client. Its render
// now goes through exactly the same persisted settings and queue as the editor.
async function waitFor(id: string, source: boolean) {
  const table = sql(source ? 'clip_source' : 'clip_export');
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    const [row] = await sql`select * from ${table} where id=${id}`;
    if (!row || row.status === 'failed') throw new InputError(row?.error || 'Clip unavailable.', 422);
    if (row.status === (source ? 'ready' : 'completed')) return row;
    await delay(500);
  }
  throw new InputError('Processing continues in the Clips library.', 504);
}
export async function POST(req: Request) {
  try {
    const user = await owner();
    const { jobId, start, end, title } = await req.json();
    if (!uuid(jobId)) throw new InputError('Invalid source.');
    await adoptUpload(jobId, user);
    const source = await waitFor(jobId, true);
    const settings = {
      ...defaults(source.metadata.duration),
      start: Number(start),
      end: Number(end),
      captions: source.cues.length > 0,
    };
    if (
      !Number.isFinite(settings.start) ||
      !Number.isFinite(settings.end) ||
      settings.start < 0 ||
      settings.end > source.metadata.duration ||
      settings.start >= settings.end
    )
      throw new InputError('Invalid clip trim.');
    const id = randomUUID(),
      name = String(title || 'Vertical clip').slice(0, 120);
    await sql`insert into clip(id,source,title,settings) values(${id},${jobId},${name},${sql.json(settings)})`;
    const output = await saveClip(id, user, settings, true);
    await waitFor(output, false);
    const job = await getJob(jobId);
    const renderedClips = [
      ...(job?.renderedClips || []),
      { id: output, title: name, path: getStoragePath('processed/clips/' + output + '.mp4') },
    ];
    return Response.json(await updateJob(jobId, { renderedClips }));
  } catch (e) {
    return failure(e);
  }
}
