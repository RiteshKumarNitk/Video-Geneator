import { Queue, Worker, type Job } from 'bullmq';
import http from 'node:http';
import https from 'node:https';
import type { JSONValue } from 'postgres';
import { sql } from './db';

type Task = { kind: 'source' | 'export' | 'analysis'; id: string; attempt: string };
const redis = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  username: redis.username || undefined,
  password: redis.password || undefined,
  ...(redis.protocol === 'rediss:' ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
};
const queueName = 'clips';
let queue: Queue<Task> | undefined;
export async function enqueue(task: Task) {
  queue ??= new Queue(queueName, { connection });
  await queue.add('clip-' + task.kind, task, {
    jobId: task.attempt,
    removeOnComplete: { age: 86400 },
    removeOnFail: { age: 604800 },
  });
}

// Import and export can take longer than fetch's default response-header timeout.
function processMedia(endpoint: string, payload: object): Promise<Record<string, JSONValue>> {
  const url = new URL('/clips/' + endpoint, process.env.PYTHON_AI_URL || 'http://localhost:8000');
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('error', reject);
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            if (res.statusCode !== 200) throw Error(result.detail || 'Media service failed.');
            resolve(result);
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.setTimeout(4 * 3600000, () => req.destroy(Error('Media processing timed out.')));
    req.on('error', reject);
    req.end(JSON.stringify(payload));
  });
}

async function failed({ kind, id, attempt }: Task, message: string) {
  if (kind === 'analysis') {
    await sql`update clip_source set analysis='failed', error=${message} where id=${id} and analysis=${attempt}`;
  } else {
    const table = sql(kind === 'source' ? 'clip_source' : 'clip_export');
    await sql`update ${table} set status='failed', error=${message} where id=${id} and attempt=${attempt} and status in ('queued','processing')`;
  }
}

async function processTask({ data }: Job<Task>) {
  const { kind, id, attempt } = data;
  try {
    if (kind === 'analysis') {
      const [source] = await sql`select path from clip_source where id=${id} and analysis=${attempt}`;
      if (!source) return;
      const result = await processMedia('transcribe', { path: source.path });
      await sql`update clip_source set cues=${sql.json(result.transcript)}, suggestions=${sql.json(result.suggestions)}, analysis='complete', error=null where id=${id} and analysis=${attempt}`;
      return;
    }
    const table = sql(kind === 'source' ? 'clip_source' : 'clip_export');
    const [row] =
      await sql`update ${table} set status='processing' where id=${id} and attempt=${attempt} and status in ('queued','processing') returning *`;
    if (!row) return;
    if (kind === 'source') {
      const metadata = await processMedia('source', {
        path: row.path,
        youtubeId: row.url ? new URL(row.url).searchParams.get('v') : null,
      });
      await sql`update clip_source set status='ready', metadata=${sql.json(metadata)}, error=null where id=${id} and attempt=${attempt}`;
    } else {
      const result = await processMedia('export', { ...row.snapshot, id });
      await sql.begin(async (tx) => {
        await tx`update clip_export set status='completed',quality=${sql.json(result.quality || {})},error=null where id=${id} and attempt=${attempt}`;
        const report = result.quality as { warnings?: string[]; samples?: unknown[] };
        const warnings =
          row.snapshot.qualityCheck && !report?.samples?.length
            ? ['Quality samples missing. Re-export before posting.']
            : report?.warnings;
        if (warnings?.length)
          await tx`update clip_publication set status='review',error=${warnings.slice(0, 3).join(' · ')} where export_id=${id} and status='queued'`;
      });
    }
  } catch (e) {
    await failed(data, e instanceof Error ? e.message : 'Processing failed.');
    throw e;
  }
}

const singleton = globalThis as typeof globalThis & { clipsWorker?: Worker<Task> };
export function startClipsWorker() {
  if (singleton.clipsWorker) return;
  const worker = new Worker<Task>(queueName, processTask, { connection, concurrency: 2 });
  singleton.clipsWorker = worker;
  worker.on('error', (e) => console.error('[Clips worker]', e));
  worker.on('failed', (job, e) => {
    if (job) failed(job.data, e.message).catch(console.error);
  });
  // Replay committed queue intents after an app/Redis interruption. BullMQ IDs deduplicate.
  const recover = async () => {
    const rows = await sql<
      Task[]
    >`select 'source' as kind, id, attempt from clip_source where status in ('queued','processing')
      union all select 'export', id, attempt from clip_export where status in ('queued','processing')
      union all select 'analysis', id, analysis::uuid from clip_source where analysis ~ '^[0-9a-f-]{36}$'`;
    for (const row of rows) await enqueue(row);
    const { workspaceAuth } = await import('../auth');
    await workspaceAuth();
    const drafts =
      await sql`select c.id,c.settings,s.owner from clip c join clip_source s on s.id=c.source where c.auto_render and not c.skipped and not exists(select 1 from clip_export e where e.clip=c.id) order by c.created limit 25`;
    if (drafts.length) {
      const { saveClip } = await import('./library');
      for (const draft of drafts) {
        try {
          await saveClip(draft.id, draft.owner, draft.settings, true, draft.settings, true);
        } catch {
          console.error('[Clips] Could not queue batch draft', draft.id);
        }
      }
    }
    const requests =
      await sql`select r.id,r.source,s.owner from clip_batch_request r join clip_source s on s.id=r.source where r.error is null and (s.analysis='complete' or jsonb_array_length(s.cues)>0)`;
    for (const request of requests) {
      try {
        const { makeBatch } = await import('./batches');
        await makeBatch(request.owner, request.source, undefined, request.id);
        await sql`delete from clip_batch_request where id=${request.id}`;
      } catch {
        await sql`update clip_batch_request set error='Could not generate this batch. Retry from Shorts studio.' where id=${request.id}`;
      }
    }
    await sql`update clip_source set status='failed',error='Upload interrupted. Select the file again.' where status in ('waiting','uploading') and updated < now() - interval '6 hours'`;
  };
  const tick = () => recover().catch((e) => console.error('[Clips recovery]', e.message));
  const post = () =>
    import('./youtube')
      .then((m) => m.publishDue())
      .catch(() => console.error('[Clips] Publishing worker unavailable.'));
  void post();
  setInterval(post, 15000).unref();
  tick();
  setInterval(tick, 60000).unref();
}
