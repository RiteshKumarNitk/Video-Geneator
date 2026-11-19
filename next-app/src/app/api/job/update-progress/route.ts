import {callbackToken} from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getJob, updateJob } from '@/lib/jobsStore';
import { jobEvents } from '@/lib/queue';
import { getStoragePath } from '@/lib/storage';

export async function POST(req: Request) {
  try {
    const { jobId, progress, status, error, processedClips, processedVideo, transcript, suggestions, words } = await req.json();

    if (!jobId || progress === undefined || !status) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    if (new URL(req.url).searchParams.get('token')!==await callbackToken(jobId)) return new Response(null,{status:403});
    console.log(`[Webhook] Job ${jobId}: status=${status}, progress=${progress}%`);

    let processedVideoPath: string | undefined;
    const currentJob = await getJob(jobId);
    if (status === 'COMPLETED' && currentJob?.type !== 'CLIP_ANALYSIS') {
      // For MATTING jobs, processedVideo is the direct file path
      processedVideoPath = getStoragePath(`processed/${jobId}.mp4`);
    }

    // Update job in local JSON database
    const job = await updateJob(jobId, {
      status,
      progress: parseFloat(progress),
      error: error || null,
      ...(processedVideo ? { processedVideo } : processedVideoPath ? { processedVideo: processedVideoPath } : {}),
      ...(processedClips ? { processedClips } : {}),
      ...(transcript ? { transcript } : {}),
      ...(suggestions ? { suggestions } : {}),
      ...(words ? { words } : {}),
    });

    // Notify local event listener (the queue promise)
    jobEvents.emit(`status:${jobId}`, {
      status,
      progress,
      error,
      processedClips,
    });

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    console.error('Update progress webhook error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
