import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '@/lib/jobsStore';
import { addVideoJob } from '@/lib/queue';

export async function POST(req: Request) {
  try {
    const { text, language = 'hi', slow = false } = await req.json();
    if (!text || text.trim() === '') {
      return NextResponse.json({ error: 'Missing text parameter' }, { status: 400 });
    }

    if (text.length > 5000) {
      return NextResponse.json({ error: 'Text too long (max 5000 characters)' }, { status: 400 });
    }

    const jobId = uuidv4();
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const nextjsInternalUrl = `${protocol}://${host}`;

    const newJob = await createJob({
      id: jobId,
      status: 'PENDING',
      type: 'TEXT_TO_SPEECH',
      originalVideo: null,
      processedVideo: null,
      youtubeUrl: null,
      processedClips: [],
      ttsLanguage: language,
      ttsSlow: slow,
    });

    await addVideoJob(
      jobId,
      null,
      'green',
      nextjsInternalUrl,
      'TEXT_TO_SPEECH',
      null,
      30,
      'best',
      'horizontal',
      undefined,
      undefined,
      text,
      language,
      slow
    );

    console.log(`[API] TTS Job ${jobId} enqueued.`);
    return NextResponse.json(newJob);
  } catch (err: any) {
    console.error('TTS route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
