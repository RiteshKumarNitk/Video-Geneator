import { NextResponse } from 'next/server';
import { getJob, updateJob } from '@/lib/jobsStore';
import { getStoragePath } from '@/lib/storage';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const { jobId, start, end, title } = await req.json();
    const job = await getJob(jobId);
    if (!job?.originalVideo) return NextResponse.json({ error: 'Clip project not found.' }, { status: 404 });
    const safeStart = Math.max(0, Number(start));
    const safeEnd = Math.max(safeStart + 1, Number(end));
    const id = uuidv4();
    const dir = getStoragePath(`processed/${jobId}`);
    await fs.mkdir(dir, { recursive: true });
    const output = path.join(dir, `${id}.mp4`);
    const pythonUrl = process.env.PYTHON_AI_URL || 'http://localhost:8000';
    const renderResponse = await fetch(`${pythonUrl}/render-clip`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId, videoPath: job.originalVideo, outputPath: output, start: safeStart, end: safeEnd, words: job.words || [] }) });
    if (!renderResponse.ok) throw new Error(await renderResponse.text());
    const renderedClips = [...(job.renderedClips || []), { id, path: output, title: title || 'Vertical clip' }];
    return NextResponse.json(await updateJob(jobId, { renderedClips }));
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Render failed.' }, { status: 500 });
  }
}
