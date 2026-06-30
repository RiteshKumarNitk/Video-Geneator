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

    if (!job || !job.processedVideo) {
      return NextResponse.json({ error: 'Job or processed video not found' }, { status: 404 });
    }

    if (!existsSync(job.processedVideo)) {
      console.error(`Processed video file path does not exist: ${job.processedVideo}`);
      return NextResponse.json({ error: 'Video file not found on disk' }, { status: 404 });
    }

    const stat = statSync(job.processedVideo);
    const nodeStream = createReadStream(job.processedVideo);
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as any, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="greenscreen_${id}.mp4"`,
      },
    });
  } catch (err: any) {
    console.error('Download route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
