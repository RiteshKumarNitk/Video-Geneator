import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '@/lib/jobsStore';
import { addVideoJob } from '@/lib/queue';

export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();
    if (!prompt || prompt.trim() === '') {
      return NextResponse.json({ error: 'Missing prompt parameter' }, { status: 400 });
    }

    const jobId = uuidv4();
    
    // Determine the dynamic Next.js internal URL based on request headers (ports like 3001, etc.)
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const nextjsInternalUrl = `${protocol}://${host}`;

    // Create a database job with type GENERATION
    const newJob = await createJob({
      id: jobId,
      status: 'PENDING',
      type: 'GENERATION',
      prompt: prompt,
      originalVideo: null,
    });

    // Enqueue job with type 'GENERATION'
    await addVideoJob(jobId, null, 'green', nextjsInternalUrl, 'GENERATION', prompt);

    console.log(`[API] Generation Job ${jobId} enqueued.`);
    return NextResponse.json(newJob);
  } catch (err: any) {
    console.error('Generate route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
