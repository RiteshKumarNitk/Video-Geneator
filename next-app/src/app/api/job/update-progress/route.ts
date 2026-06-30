import { NextResponse } from 'next/server';
import { updateJob } from '@/lib/jobsStore';
import { jobEvents } from '@/lib/queue';
import { getStoragePath } from '@/lib/storage';

export async function POST(req: Request) {
  try {
    const { jobId, progress, status, error } = await req.json();

    if (!jobId || progress === undefined || !status) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    console.log(`[Webhook] Job ${jobId}: status=${status}, progress=${progress}%`);

    let processedVideoPath: string | undefined;
    if (status === 'COMPLETED') {
      processedVideoPath = getStoragePath(`processed/${jobId}.mp4`);
    }

    // Update job in local JSON database
    const job = await updateJob(jobId, {
      status,
      progress: parseFloat(progress),
      error: error || null,
      ...(processedVideoPath ? { processedVideo: processedVideoPath } : {}),
    });

    // Notify local event listener (the queue promise)
    jobEvents.emit(`status:${jobId}`, {
      status,
      progress,
      error,
    });

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    console.error('Update progress webhook error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
