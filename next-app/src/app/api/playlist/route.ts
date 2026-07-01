import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '@/lib/jobsStore';
import { addVideoJob } from '@/lib/queue';

export async function POST(req: Request) {
  try {
    const { playlistUrl, videoQuality = 'best', maxVideos = 10 } = await req.json();
    if (!playlistUrl || playlistUrl.trim() === '') {
      return NextResponse.json({ error: 'Missing playlistUrl parameter' }, { status: 400 });
    }

    const maxInt = parseInt(maxVideos, 10);
    if (isNaN(maxInt) || maxInt < 1 || maxInt > 50) {
      return NextResponse.json({ error: 'maxVideos must be between 1 and 50' }, { status: 400 });
    }

    const jobId = uuidv4();
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const nextjsInternalUrl = `${protocol}://${host}`;

    const newJob = await createJob({
      id: jobId,
      status: 'PENDING',
      type: 'PLAYLIST_DOWNLOAD',
      youtubeUrl: playlistUrl,
      originalVideo: null,
      processedClips: [],
      videoQuality: videoQuality,
    });

    await addVideoJob(
      jobId,
      null,
      'green',
      nextjsInternalUrl,
      'PLAYLIST_DOWNLOAD',
      null,
      30,
      videoQuality,
      'horizontal',
      playlistUrl,
      maxInt
    );

    console.log(`[API] Playlist Download Job ${jobId} enqueued.`);
    return NextResponse.json(newJob);
  } catch (err: any) {
    console.error('Playlist route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
