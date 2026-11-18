import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createJob } from '@/lib/jobsStore';
import { getStoragePath } from '@/lib/storage';
import { addVideoJob } from '@/lib/queue';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'A video file is required.' }, { status: 400 });
    if (!file.type.startsWith('video/')) return NextResponse.json({ error: 'Please upload a video file.' }, { status: 400 });

    const id = uuidv4();
    const dir = getStoragePath('uploads');
    await fs.mkdir(dir, { recursive: true });
    const ext = path.extname(file.name) || '.mp4';
    const videoPath = path.join(dir, `${id}${ext}`);
    await fs.writeFile(videoPath, Buffer.from(await file.arrayBuffer()));

    const job = await createJob({ id, type: 'CLIP_ANALYSIS', status: 'PENDING', originalVideo: videoPath });
    const host = req.headers.get('host') || 'localhost:3000';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    await addVideoJob(id, videoPath, 'green', `${protocol}://${host}`, 'CLIP_ANALYSIS');
    return NextResponse.json(job);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Upload failed.' }, { status: 500 });
  }
}
