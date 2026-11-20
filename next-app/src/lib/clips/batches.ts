import { randomUUID } from 'node:crypto';
import { roman } from './hinglish';
import { sql, InputError } from './db';
import { defaults, type Cue, type Preset } from './model';
import { enqueue } from './worker';

type Moment = { start: number; end: number; title: string };
type Motion = { at: number; score: number };
function words(text: string) {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
}
function similar(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return false;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared >= 3 && shared / (a.size + b.size - shared) > 0.48;
}
function picks(
  cues: Cue[],
  motion: Motion[],
  duration: number,
  seconds: number,
  used: Moment[],
  count: number,
) {
  const starts = new Set<number>();
  for (let i = 0; i < cues.length; i++)
    if (!i || cues[i].start - cues[i - 1].end > 0.5 || i % 5 === 0) starts.add(cues[i].start);
  for (const m of motion) starts.add(Math.max(0, Math.round(m.at - 4)));
  const sorted = [...starts].filter((t) => t + seconds <= duration).sort((a, b) => a - b);
  let cursor = 0;
  const ranked = sorted
    .map((start) => {
      const end = start + seconds;
      while (cursor < cues.length && cues[cursor].end <= start) cursor++;
      const lines: Cue[] = [];
      for (let j = cursor; j < cues.length && cues[j].start < end; j++) lines.push(cues[j]);
      const reaction = (s: string) => /[!?]|\b(bhai|arre|kya|oh|wow|nahi|wait|kyun|kaise|haha)\b/i.test(s);
      const best =
        lines.find((c) => reaction(c.text) && c.text.length > 14 && /[!?]/.test(c.text)) ||
        lines.find((c) => reaction(c.text) && c.text.length > 15) ||
        lines.find((c) => c.text.length > 12) ||
        lines[0];
      const visual = Math.max(0, ...motion.filter((m) => m.at >= start && m.at < end).map((m) => m.score));
      const title =
        best?.text.slice(0, 94) ||
        'Gameplay ka moment ' + new Date(start * 1000).toISOString().slice(11, 19);
      const score =
        Math.min(visual / 12, 4) +
        Math.min(lines.filter((c) => reaction(c.text)).length, 4) +
        (best && lines.length >= 3 ? 1 : 0);
      const reason = lines.length
        ? 'Setup: ' + lines[0].text + ' · Reaction: ' + (best?.text || lines.at(-1)?.text)
        : 'Gameplay motion near ' + Math.floor(start + 4) + 's';
      return { start, end, title, score, lines, reason };
    })
    .sort((a, b) => b.score - a.score || a.start - b.start);
  const fingerprints = used.map((m) => words(roman(m.title)));
  const selected: typeof ranked = [];
  for (const m of ranked) {
    if (used.some((u) => m.start < u.end + 10 && m.end > u.start - 10)) continue;
    const fingerprint = words(m.title);
    if (m.lines.length && fingerprints.some((f) => similar(f, fingerprint))) continue;
    selected.push(m);
    used.push(m);
    fingerprints.push(fingerprint);
    if (selected.length === count) break;
  }
  return selected;
}
export async function makeBatch(user: string, id: string, replace?: string, requestId?: string) {
  const [source] = await sql`select * from clip_source where id=${id} and owner=${user} and status='ready'`;
  if (!source) throw new InputError('Source unavailable.', 404);
  if (!source.cues.length && source.analysis !== 'complete' && source.metadata.audio !== false) {
    if (replace) throw new InputError('Wait for source transcription before replacing a draft.', 409);
    const attempt = randomUUID();
    const started = await sql.begin(async (tx) => {
      await tx`insert into clip_batch_request(id,source) values(${randomUUID()},${id}) on conflict(source) do update set error=null`;
      return tx`update clip_source set analysis=${attempt},error=null where id=${id} and (analysis is null or analysis='failed') returning id`;
    });
    if (started.length) await enqueue({ kind: 'analysis', id, attempt });
    return { pending: true };
  }
  let motion = source.motion;
  if (!motion) {
    const response = await fetch(
      new URL('/clips/motion', process.env.PYTHON_AI_URL || 'http://localhost:8000'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: source.path }),
        signal: AbortSignal.timeout(180000),
      },
    );
    if (!response.ok) throw new InputError('Visual analysis failed. Retry this source.', 502);
    motion = await response.json();
    await sql`update clip_source set motion=${sql.json(motion)} where id=${id}`;
  }
  const cues = (source.cues as Cue[])
    .map((c) => ({ ...c, text: roman(c.text) }))
    .filter((c) => c.text)
    .sort((a, b) => a.start - b.start);
  return sql.begin(async (tx) => {
    await tx`select id from clip_source where id=${id} for update`;
    const [profile] = await tx`select * from clip_channel where owner=${user}`;
    const [preset] = await tx<
      Preset[]
    >`select * from clip_user_preset where owner=${user} and name=${profile?.preset || ''}`;
    const seconds = profile?.seconds || 35;
    const used = await tx<
      Moment[]
    >`select (settings->>'start')::float as start,(settings->>'end')::float as end,title from clip where source=${id} and (batch is not null or (settings->>'end')::float-(settings->>'start')::float<${source.metadata.duration}-.01)
      union all select (e.snapshot->>'start')::float,(e.snapshot->>'end')::float,c.title from clip_export e join clip c on c.id=e.clip where c.source=${id} and (e.snapshot->>'end')::float-(e.snapshot->>'start')::float<${source.metadata.duration}-.01`;
    let batch: string = requestId || randomUUID();
    if (requestId && (await tx`select id from clip where batch=${requestId} limit 1`).length)
      return { batch };
    if (replace) {
      const [old] =
        await tx`update clip set skipped=true where id=${replace} and source=${id} and batch is not null and not skipped and not exists(select 1 from clip_export where clip=${replace}) returning batch`;
      if (!old) throw new InputError('Only an unexported batch draft can be replaced.', 409);
      batch = old.batch;
    }
    const moments = picks(cues, motion, source.metadata.duration, seconds, used, replace ? 1 : 5);
    if (!moments.length) throw new InputError('No unused moment fits this duration.', 409);
    for (const m of moments) {
      const settings = {
        ...defaults(source.metadata.duration),
        ...(preset ? { ...preset.layout, style: preset.style, guide: 'Shorts' as const } : {}),
        start: m.start,
        end: m.end,
        cues: m.lines,
        captions: !!m.lines.length,
      };
      if (profile?.tone === 'question' && !m.title.endsWith('?'))
        m.title = ('Kya hua jab ' + m.title.replace(/[.!]+$/, '') + '?').slice(0, 100);
      const description =
        m.title +
        '\n\n' +
        (source.url && profile?.credit !== false
          ? 'Original stream: ' + source.url + '&t=' + Math.floor(m.start) + 's\n'
          : '') +
        '#Gaming #Shorts';
      await tx`insert into clip(id,source,title,description,reason,batch,settings,auto_render) values(${randomUUID()},${id},${m.title},${description},${m.reason},${batch},${sql.json(settings)},${!!profile?.render_batches})`;
    }
    if (!requestId) await tx`delete from clip_batch_request where source=${id} and error is not null`;
    return { batch, count: moments.length };
  });
}
