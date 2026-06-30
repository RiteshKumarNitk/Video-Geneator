import { NextResponse } from 'next/server';
import { existsSync, statSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import { getJob } from '@/lib/jobsStore';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const job = await getJob(id);

    if (!job || !job.originalVideo) {
      return NextResponse.json({ error: 'Job or original video not found' }, { status: 404 });
    }

    if (!existsSync(job.originalVideo)) {
      console.error(`Original video file path does not exist: ${job.originalVideo}`);
      return NextResponse.json({ error: 'Video file not found on disk' }, { status: 404 });
    }

    const stat = statSync(job.originalVideo);
    const nodeStream = createReadStream(job.originalVideo);
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as any, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `inline; filename="original_${id}.mp4"`,
      },
    });
  } catch (err: any) {
    console.error('Original stream route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
