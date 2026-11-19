import { InputError, failure } from '@/lib/clips/db';
import { owner } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { saveUpload } from '@/lib/videoUpload';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '@/lib/jobsStore';
import { getStoragePath } from '@/lib/storage';
import { addVideoJob } from '@/lib/queue';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const user = await owner();
    const id = uuidv4();
    const { relative, filename } = await saveUpload(req, id);
    const videoPath = getStoragePath(relative);
    const job = await createJob({
      owner: user,
      id,
      filename,
      type: 'CLIP_ANALYSIS',
      status: 'PENDING',
      originalVideo: videoPath,
    });
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    await addVideoJob(id, videoPath, 'green', `${protocol}://${host}`, 'CLIP_ANALYSIS');
    return NextResponse.json(job);
  } catch (error: any) {
    if (error instanceof InputError) return failure(error);
    return NextResponse.json({ error: error.message || 'Upload failed.' }, { status: 500 });
  }
}
