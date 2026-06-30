import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '@/lib/jobsStore';
import { addVideoJob } from '@/lib/queue';

export async function POST(req: Request) {
  try {
    const { youtubeUrl, clipDuration = 30, videoQuality = '1080p', orientation = 'horizontal' } = await req.json();
    if (!youtubeUrl || youtubeUrl.trim() === '') {
      return NextResponse.json({ error: 'Missing youtubeUrl parameter' }, { status: 400 });
    }

    const durationInt = parseInt(clipDuration, 10);
    if (isNaN(durationInt) || durationInt < 10 || durationInt > 300) {
      return NextResponse.json({ error: 'Clip duration must be between 10 and 300 seconds' }, { status: 400 });
    }

    const jobId = uuidv4();
    
    // Determine the dynamic Next.js internal URL based on request headers (ports like 3001, etc.)
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const nextjsInternalUrl = `${protocol}://${host}`;

    // Create a database job with type SHORTS_SPLIT
    const newJob = await createJob({
      id: jobId,
      status: 'PENDING',
      type: 'SHORTS_SPLIT',
      youtubeUrl: youtubeUrl,
      originalVideo: null,
      processedClips: [],
      videoQuality: videoQuality,
      orientation: orientation,
    });

    // Enqueue job with type 'SHORTS_SPLIT'
    await addVideoJob(
      jobId, 
      null, 
      'green', 
      nextjsInternalUrl, 
      'SHORTS_SPLIT', 
      youtubeUrl, 
      durationInt,
      videoQuality,
      orientation
    );

    console.log(`[API] YouTube Split Job ${jobId} enqueued.`);
    return NextResponse.json(newJob);
  } catch (err: any) {
    console.error('YouTube route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
