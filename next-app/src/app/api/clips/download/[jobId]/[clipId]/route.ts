import { NextResponse } from 'next/server';
import { existsSync, statSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import { getJob } from '@/lib/jobsStore';

export async function GET(_: Request, { params }: { params: Promise<{ jobId: string; clipId: string }> }) {
  const { jobId, clipId } = await params;
  const job = await getJob(jobId);
  const clip = job?.renderedClips?.find(item => item.id === clipId);
  if (!clip || !existsSync(clip.path)) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  const stat = statSync(clip.path);
  return new Response(Readable.toWeb(createReadStream(clip.path)) as any, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(stat.size), 'Content-Disposition': `attachment; filename="${clipId}.mp4"` } });
}
