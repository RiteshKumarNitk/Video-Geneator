import { EventEmitter } from 'events';
import { updateJob } from './jobsStore';
import { getStoragePath } from './storage';

export const jobEvents = new EventEmitter();

interface QueueItem {
  jobId: string;
  videoPath: string | null;
  backgroundType: string;
  callbackBase: string;
  type: 'MATTING' | 'SHORTS_SPLIT' | 'PLAYLIST_DOWNLOAD' | 'TEXT_TO_SPEECH' | 'GENERATION';
  youtubeUrl: string | null;
  clipDuration: number;
  videoQuality: string;
  orientation: string;
  playlistUrl?: string;
  maxVideos?: number;
  ttsText?: string;
  ttsLanguage?: string;
  ttsSlow?: boolean;
}

const queue: QueueItem[] = [];
let isProcessing = false;

const PYTHON_AI_URL = process.env.PYTHON_AI_URL || 'http://localhost:8000';

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  
  const item = queue.shift()!;
  const { jobId, videoPath, backgroundType, callbackBase, type, youtubeUrl, clipDuration, videoQuality, orientation, playlistUrl, maxVideos, ttsText, ttsLanguage, ttsSlow } = item;
  console.log(`[Queue] Starting processing for job ${jobId} (type: ${type})`);

  try {
    await updateJob(jobId, { status: 'PROCESSING', progress: 0 });

    const processPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        jobEvents.off(`status:${jobId}`, onStatusUpdate);
        reject(new Error('Processing timed out after 20 minutes.'));
      }, 20 * 60 * 1000);

      const onStatusUpdate = (data: { status: string; error?: string }) => {
        if (data.status === 'COMPLETED') {
          clearTimeout(timeout);
          jobEvents.off(`status:${jobId}`, onStatusUpdate);
          resolve();
        } else if (data.status === 'FAILED') {
          clearTimeout(timeout);
          jobEvents.off(`status:${jobId}`, onStatusUpdate);
          reject(new Error(data.error || 'Processing failed.'));
        }
      };

      jobEvents.on(`status:${jobId}`, onStatusUpdate);
    });

    let response;
    if (type === 'SHORTS_SPLIT') {
      response = await fetch(`${PYTHON_AI_URL}/youtube-split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId, youtubeUrl, clipDuration, videoQuality, orientation,
          outputDir: getStoragePath(`processed/${jobId}`),
          progressCallbackUrl: `${callbackBase}/api/job/update-progress`,
        }),
      });
    } else if (type === 'PLAYLIST_DOWNLOAD') {
      response = await fetch(`${PYTHON_AI_URL}/youtube-playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId, playlistUrl, videoQuality, maxVideos,
          outputDir: getStoragePath(`processed/${jobId}`),
          progressCallbackUrl: `${callbackBase}/api/job/update-progress`,
        }),
      });
    } else if (type === 'TEXT_TO_SPEECH') {
      response = await fetch(`${PYTHON_AI_URL}/text-to-speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          text: ttsText,
          language: ttsLanguage || 'hi',
          slow: ttsSlow || false,
          outputPath: getStoragePath(`processed/${jobId}.mp3`),
          progressCallbackUrl: `${callbackBase}/api/job/update-progress`,
        }),
      });
    } else {
      response = await fetch(`${PYTHON_AI_URL}/process-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId, videoPath,
          outputPath: getStoragePath(`processed/${jobId}.mp4`),
          progressCallbackUrl: `${callbackBase}/api/job/update-progress`,
          backgroundType,
        }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`FastAPI request failed: ${response.statusText}. Details: ${errorText}`);
    }

    await processPromise;
    console.log(`[Queue] Job ${jobId} completed successfully.`);

  } catch (err: any) {
    console.error(`[Queue] Job ${jobId} failed:`, err);
    await updateJob(jobId, {
      status: 'FAILED',
      error: err.message || 'Unknown processing error',
    });
  } finally {
    isProcessing = false;
    processQueue();
  }
}

export async function addVideoJob(
  jobId: string, 
  videoPath: string | null, 
  backgroundType: string = 'green',
  nextjsInternalUrl?: string,
  type: 'MATTING' | 'SHORTS_SPLIT' | 'PLAYLIST_DOWNLOAD' | 'TEXT_TO_SPEECH' | 'GENERATION' = 'MATTING',
  youtubeUrl: string | null = null,
  clipDuration: number = 30,
  videoQuality: string = '1080p',
  orientation: string = 'horizontal',
  playlistUrl?: string,
  maxVideos?: number,
  ttsText?: string,
  ttsLanguage?: string,
  ttsSlow?: boolean
) {
  const callbackBase = nextjsInternalUrl || process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
  queue.push({ 
    jobId, videoPath, backgroundType, callbackBase, type, youtubeUrl, clipDuration,
    videoQuality, orientation, playlistUrl, maxVideos, ttsText, ttsLanguage, ttsSlow
  });
  processQueue();
  return { jobId };
}
