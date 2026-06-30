import { EventEmitter } from 'events';
import { updateJob } from './jobsStore';
import { getStoragePath } from './storage';

export const jobEvents = new EventEmitter();

interface QueueItem {
  jobId: string;
  videoPath: string | null;
  backgroundType: string;
  callbackBase: string;
  type: 'MATTING' | 'SHORTS_SPLIT';
  youtubeUrl: string | null;
  clipDuration: number;
  videoQuality: string;
  orientation: string;
}

const queue: QueueItem[] = [];
let isProcessing = false;

// Default URLs for local dev or Docker networks
const PYTHON_AI_URL = process.env.PYTHON_AI_URL || 'http://localhost:8000';

async function processQueue() {
  if (isProcessing || queue.length === 0) return;
  isProcessing = true;
  
  const item = queue.shift()!;
  const { jobId, videoPath, backgroundType, callbackBase, type, youtubeUrl, clipDuration, videoQuality, orientation } = item;
  console.log(`[Queue] Starting processing for job ${jobId} (type: ${type}, bg: ${backgroundType}, quality: ${videoQuality}, orientation: ${orientation})`);

  try {
    // 1. Update database job status to PROCESSING
    await updateJob(jobId, { status: 'PROCESSING', progress: 0 });

    // 2. Set up Promise waiting for status updates from webhook callback
    const processPromise = new Promise<void>((resolve, reject) => {
      // 20 minutes timeout
      const timeout = setTimeout(() => {
        jobEvents.off(`status:${jobId}`, onStatusUpdate);
        reject(new Error('AI processing timed out after 20 minutes.'));
      }, 20 * 60 * 1000);

      const onStatusUpdate = (data: { status: string; error?: string }) => {
        if (data.status === 'COMPLETED') {
          clearTimeout(timeout);
          jobEvents.off(`status:${jobId}`, onStatusUpdate);
          resolve();
        } else if (data.status === 'FAILED') {
          clearTimeout(timeout);
          jobEvents.off(`status:${jobId}`, onStatusUpdate);
          reject(new Error(data.error || 'AI video processing failed.'));
        }
      };

      jobEvents.on(`status:${jobId}`, onStatusUpdate);
    });

    // 3. Trigger FastAPI background task based on job type
    let response;
    if (type === 'SHORTS_SPLIT') {
      response = await fetch(`${PYTHON_AI_URL}/youtube-split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          youtubeUrl,
          clipDuration,
          videoQuality,
          orientation,
          outputDir: getStoragePath(`processed/${jobId}`),
          progressCallbackUrl: `${callbackBase}/api/job/update-progress`,
        }),
      });
    } else {
      response = await fetch(`${PYTHON_AI_URL}/process-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          videoPath,
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

    // 4. Wait for processing to complete
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
    // Process next item in the queue
    processQueue();
  }
}

export async function addVideoJob(
  jobId: string, 
  videoPath: string | null, 
  backgroundType: string = 'green',
  nextjsInternalUrl?: string,
  type: 'MATTING' | 'SHORTS_SPLIT' = 'MATTING',
  youtubeUrl: string | null = null,
  clipDuration: number = 30,
  videoQuality: string = '1080p',
  orientation: string = 'horizontal'
) {
  const callbackBase = nextjsInternalUrl || process.env.NEXTJS_INTERNAL_URL || 'http://localhost:3000';
  queue.push({ 
    jobId, 
    videoPath, 
    backgroundType, 
    callbackBase, 
    type, 
    youtubeUrl, 
    clipDuration,
    videoQuality,
    orientation
  });
  processQueue();
  return { jobId };
}
