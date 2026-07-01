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
      return NextResponse.json({ error: 'Job or audio file not found' }, { status: 404 });
    }

    if (!existsSync(job.processedVideo)) {
      console.error(`TTS file path does not exist: ${job.processedVideo}`);
      return NextResponse.json({ error: 'Audio file not found on disk' }, { status: 404 });
    }

    const stat = statSync(job.processedVideo);
    const nodeStream = createReadStream(job.processedVideo);
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as any, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="tts_${id}.mp3"`,
      },
    });
  } catch (err: any) {
    console.error('TTS download route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
