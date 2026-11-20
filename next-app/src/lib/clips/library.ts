import { captionCues } from './hinglish';
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
  firstBatchExport = false,
) {
  const attempt = randomUUID();
  const [clip] =
    await sql`select c.*,s.metadata,s.cues,s.path from clip c join clip_source s on s.id=c.source where c.id=${id} and s.owner=${user} and s.status='ready'`;
  if (!clip) throw new InputError('Clip unavailable.', 404);
  const s = settings;
  if (!validSettings(s, clip.metadata.duration))
    throw new InputError('Check trim times and crop settings.');
  const exportId = randomUUID();
  const prior = await sql.begin(async (tx) => {
    if (firstBatchExport) {
      const [draft] = await tx`select batch,skipped from clip where id=${id} for update`;
      if (!draft?.batch || draft.skipped) throw new InputError('Draft unavailable.', 409);
      const [existing] =
        await tx`select id from clip_export where clip=${id} order by created desc limit 1`;
      if (existing) return existing.id as string;
    }
    const updated = await tx`update clip set settings=${sql.json(s)} where id=${id}
      and (${expected === undefined} or settings=${sql.json(expected ?? null)}::jsonb or settings=${sql.json(s)}::jsonb) returning id`;
    if (!updated.length)
      throw new InputError(
        'This clip changed in another editor. Reopen its saved version before editing again.',
        409,
      );
    if (exporting) {
      const [channel] =
        await tx`select * from clip_channel where owner=${user} and automatic and credential is not null for update`;
      const snapshot = {
        qualityCheck: !!(channel || clip.batch),
        guide: s.guide ?? 'Off',
        path: clip.path,
        start: s.start,
        end: s.end,
        segments: timeline(s).map((c) => ({
          at: c.at - s.start,
          sections: sections(clip.metadata, c.layout),
          ...captionOrigin(c.layout, s.style ?? defaultStyle),
        })),
        style: s.style ?? defaultStyle,
        cues: s.captions ? cutCues(captionCues(s, clip.cues), s) : [],
      };
      await tx`insert into clip_export(id,clip,snapshot,status,attempt) values(${exportId},${id},${sql.json(snapshot)},'queued',${attempt})`;
      if (channel && !clip.skipped) {
        await tx`update clip_publication set export_id=${exportId},status='queued',error=null,tries=0 where clip=${id} and channel_id=${channel.channel_id} and uri is null and status in ('review','queued')`;
        const [post] =
          await tx`insert into clip_publication(clip,export_id,owner,channel_id,visibility,due,title,description) values(${id},${exportId},${user},${channel.channel_id},${channel.visibility},greatest(now(),${channel.next_slot}::timestamptz),${clip.title.slice(0, 100)},${clip.description || ''}) on conflict(clip) do nothing returning due`;
        if (post)
          await tx`update clip_channel set next_slot=${post.due}::timestamptz+spacing*interval '1 minute' where owner=${user}`;
      }
    }
  });
  if (prior) return prior;
  if (exporting) await enqueue({ kind: 'export', id: exportId, attempt });
  return exporting ? exportId : id;
}
