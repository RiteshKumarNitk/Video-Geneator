import {callbackToken} from './auth';
import { EventEmitter } from 'events';
import { Job as BullJob, Queue, Worker } from 'bullmq';
import { getJob, updateJob } from './jobsStore';
import { getStoragePath } from './storage';

export const jobEvents = new EventEmitter();
export type VideoJobType = 'MATTING' | 'SHORTS_SPLIT' | 'PLAYLIST_DOWNLOAD' | 'CLIP_ANALYSIS';

interface QueueItem {
  jobId: string; videoPath: string | null; backgroundType: string; callbackBase: string; type: VideoJobType;
  youtubeUrl: string | null; sourceType: string; clipDuration: number; videoQuality: string; orientation: string;
  playlistUrl?: string; maxVideos?: number;
}

const queueName = 'video-processing';
const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
const redisConnection = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port || 6379),
  username: redisUrl.username || undefined,
  password: redisUrl.password || undefined,
  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
  maxRetriesPerRequest: null,
} as const;
const videoQueue = new Queue<QueueItem>(queueName, {
  connection: redisConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 604800, count: 1000 } },
});

async function waitForCallback(jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { jobEvents.off(`status:${jobId}`, onStatusUpdate); reject(new Error('Processing timed out after 20 minutes.')); }, 20 * 60 * 1000);
    const onStatusUpdate = (data: { status: string; error?: string }) => {
      if (data.status === 'COMPLETED') { clearTimeout(timeout); jobEvents.off(`status:${jobId}`, onStatusUpdate); resolve(); }
      if (data.status === 'FAILED' || data.status === 'CANCELED') { clearTimeout(timeout); jobEvents.off(`status:${jobId}`, onStatusUpdate); reject(new Error(data.error || `Processing ${data.status.toLowerCase()}.`)); }
    };
    jobEvents.on(`status:${jobId}`, onStatusUpdate);
  });
}

async function callPython(item: QueueItem): Promise<Response> {
  const { jobId, videoPath, backgroundType, callbackBase, type, youtubeUrl, sourceType, clipDuration, videoQuality, orientation, playlistUrl, maxVideos } = item;
  const common = { jobId, progressCallbackUrl: `${process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000'}/api/job/update-progress?token=${await callbackToken(jobId)}` };
  let endpoint: string;
  let body: Record<string, unknown>;
  if (type === 'SHORTS_SPLIT') { endpoint = '/youtube-split'; body = { ...common, youtubeUrl, sourceType, clipDuration, videoQuality, orientation, outputDir: getStoragePath(`processed/${jobId}`) }; }
  else if (type === 'PLAYLIST_DOWNLOAD') { endpoint = '/youtube-playlist'; body = { ...common, playlistUrl, videoQuality, maxVideos, outputDir: getStoragePath(`processed/${jobId}`) }; }
  else if (type === 'CLIP_ANALYSIS') { endpoint = '/transcribe-video'; body = { ...common, videoPath, outputDir: getStoragePath(`processed/${jobId}`) }; }
  else if (type === 'MATTING') { endpoint = '/process-video'; body = { ...common, videoPath, outputPath: getStoragePath(`processed/${jobId}.mp4`), backgroundType }; }
  else throw new Error('Unsupported video job type');
  return fetch(`${process.env.PYTHON_AI_URL || 'http://localhost:8000'}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function processBullJob(bullJob: BullJob<QueueItem>): Promise<void> {
  const item = bullJob.data;
  await updateJob(item.jobId, { status: 'PROCESSING', progress: 0, error: null });
  // Subscribe before calling FastAPI so very short jobs cannot complete before the listener exists.
  const callbackPromise = waitForCallback(item.jobId);
  const response = await callPython(item);
  if (!response.ok) throw new Error(`FastAPI request failed: ${response.status} ${await response.text()}`);
  try {
    await callbackPromise;
  } catch (error) {
    const currentJob = await getJob(item.jobId);
    if (currentJob?.status === 'CANCELED') return;
    throw error;
  }
}

const worker = new Worker<QueueItem>(queueName, processBullJob, { connection: redisConnection, concurrency: Number(process.env.VIDEO_WORKER_CONCURRENCY || 1) });
worker.on('failed', async (bullJob, error) => {
  if (bullJob && bullJob.attemptsMade >= (bullJob.opts.attempts || 1)) await updateJob(bullJob.data.jobId, { status: 'FAILED', error: error.message || 'Unknown processing error' });
});
worker.on('error', error => console.error('[Queue] Worker error:', error));

export async function addVideoJob(jobId: string, videoPath: string | null, backgroundType = 'green', nextjsInternalUrl?: string, type: VideoJobType = 'MATTING', youtubeUrl: string | null = null, clipDuration = 30, videoQuality = '1080p', orientation = 'horizontal', playlistUrl?: string, maxVideos?: number, sourceType = 'video') {
  const callbackBase = process.env.NEXTJS_INTERNAL_URL || nextjsInternalUrl || 'http://localhost:3000';
  const data: QueueItem = { jobId, videoPath, backgroundType, callbackBase, type, youtubeUrl, sourceType, clipDuration, videoQuality, orientation, playlistUrl, maxVideos };
  const queueOptions = type === 'SHORTS_SPLIT' ? { jobId, attempts: 1 } : { jobId };
  const queued = await videoQueue.add(jobId, data, queueOptions);
  return { jobId, queueId: queued.id };
}

export async function cancelVideoJob(jobId: string): Promise<boolean> {
  const bullJob = await videoQueue.getJob(jobId);
  if (!bullJob) return false;
  const state = await bullJob.getState();
  if (state === 'active') {
    const currentJob = await getJob(jobId);
    if (currentJob?.type !== 'SHORTS_SPLIT') return false;
    const pythonUrl = process.env.PYTHON_AI_URL || 'http://localhost:8000';
    const response = await fetch(`${pythonUrl}/youtube-split/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
    if (!response.ok) return false;
    await updateJob(jobId, { status: 'CANCELED', error: 'Canceled by user.' });
    jobEvents.emit(`status:${jobId}`, { status: 'CANCELED', error: 'Canceled by user.' });
    return true;
  }
  await bullJob.remove();
  await updateJob(jobId, { status: 'CANCELED', error: 'Canceled by user.' });
  jobEvents.emit(`status:${jobId}`, { status: 'CANCELED', error: 'Canceled by user.' });
  return true;
}
