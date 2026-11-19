import { randomUUID } from 'node:crypto';
import { link, realpath } from 'node:fs/promises';
import path from 'node:path';
import { getJob } from '../jobsStore';
import { getStoragePath } from '../storage';
import { sql, InputError } from './db';
import {
  captionOrigin,
  sections,
  timeline,
  defaultStyle,
  cutCues,
  validSettings,
  type Settings,
} from './model';
import { enqueue } from './worker';

export function extension(name: string) {
  const ext = path.extname(name).toLowerCase();
  if (!['.mp4', '.m4v', '.mov', '.webm', '.mkv'].includes(ext))
    throw new InputError('Choose an MP4, MOV, WebM or MKV video.');
  return ext;
}

export async function adoptUpload(id: string, user: string) {
  const attempt = randomUUID();
  const job = await getJob(id);
  if (!job?.originalVideo || job.owner !== user) throw new InputError('Original is unavailable.', 404);
  const original = await realpath(job.originalVideo);
  if (path.dirname(original) !== (await realpath(getStoragePath('uploads'))))
    throw new InputError('Invalid original path.');
  const filename = job.filename || path.basename(original),
    ext = extension(path.basename(original));
  // A hard link keeps the same saved bytes alive if the matting job is deleted.
  const alias = 'uploads/' + randomUUID() + ext;
  const result = await sql.begin(async (tx) => {
    const [row] = await tx`insert into clip_source(owner,id,filename,path,status,attempt,cues,suggestions)
      values(${user},${id},${filename},${alias},'queued',${attempt},${sql.json(job.transcript || [])},${sql.json(job.suggestions || [])})
      on conflict(id) do nothing returning id`;
    if (row) await link(original, getStoragePath(alias));
    return row;
  });
  if (result) await enqueue({ kind: 'source', id, attempt });
}

export async function saveClip(
  id: string,
  user: string,
  settings: Settings,
  exporting: boolean,
  expected?: Settings,
) {
  const attempt = randomUUID();
  const [clip] =
    await sql`select c.*,s.metadata,s.cues,s.path from clip c join clip_source s on s.id=c.source where c.id=${id} and s.owner=${user} and s.status='ready'`;
  if (!clip) throw new InputError('Clip unavailable.', 404);
  const s = settings;
  if (!validSettings(s, clip.metadata.duration))
    throw new InputError('Check trim times and crop settings.');
  const exportId = randomUUID();
  await sql.begin(async (tx) => {
    const updated = await tx`update clip set settings=${sql.json(s)} where id=${id}
      and (${expected === undefined} or settings=${sql.json(expected ?? null)}::jsonb or settings=${sql.json(s)}::jsonb) returning id`;
    if (!updated.length)
      throw new InputError(
        'This clip changed in another editor. Reopen its saved version before editing again.',
        409,
      );
    if (exporting) {
      const snapshot = {
        path: clip.path,
        start: s.start,
        end: s.end,
        segments: timeline(s).map((c) => ({
          at: c.at - s.start,
          sections: sections(clip.metadata, c.layout),
          ...captionOrigin(c.layout, s.style ?? defaultStyle),
        })),
        style: s.style ?? defaultStyle,
        cues: s.captions ? cutCues(s.cues ?? clip.cues, s) : [],
      };
      await tx`insert into clip_export(id,clip,snapshot,status,attempt) values(${exportId},${id},${sql.json(snapshot)},'queued',${attempt})`;
    }
  });
  if (exporting) await enqueue({ kind: 'export', id: exportId, attempt });
  return exporting ? exportId : id;
}
