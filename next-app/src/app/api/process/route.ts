import { NextResponse } from 'next/server';
import { getJob, updateJob } from '@/lib/jobsStore';
import { addVideoJob } from '@/lib/queue';

export async function POST(req: Request) {
  try {
    const { jobId, backgroundType = 'green' } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId parameter' }, { status: 400 });
    }

    const job = await getJob(jobId);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Determine the dynamic Next.js internal URL based on request headers (ports like 3001, etc.)
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const nextjsInternalUrl = `${protocol}://${host}`;

    // Reset status to PENDING and clear previous errors
    const updatedJob = await updateJob(jobId, {
      status: 'PENDING',
      progress: 0.0,
      error: null,
      backgroundType,
    });

    // Enqueue the video processing task in the local queue with dynamic port routing
    await addVideoJob(jobId, job.originalVideo, backgroundType, nextjsInternalUrl);

    console.log(`[API] Job ${jobId} enqueued in local queue.`);
    return NextResponse.json(updatedJob);
  } catch (err: any) {
    console.error('Process route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
