import { NextResponse } from 'next/server';
import { existsSync, statSync, createReadStream } from 'fs';
import { Readable } from 'stream';
import { getJob } from '@/lib/jobsStore';
import { getStoragePath } from '@/lib/storage';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; clipName: string }> }
) {
  try {
    const { id, clipName } = await params;
    
    const job = await getJob(id);

    if (!job || (job.type !== 'SHORTS_SPLIT' && job.type !== 'PLAYLIST_DOWNLOAD')) {
      return NextResponse.json({ error: 'Job not found or invalid type' }, { status: 404 });
    }

    // Resolve physical path to the clip
    // Clips are saved at: next-app/shared-storage/processed/{jobId}/{clipName}
    const clipFilePath = getStoragePath(`processed/${id}/${clipName}`);

    if (!existsSync(clipFilePath)) {
      console.error(`Clip file path does not exist: ${clipFilePath}`);
      return NextResponse.json({ error: 'Clip file not found on disk' }, { status: 404 });
    }

    const stat = statSync(clipFilePath);
    const nodeStream = createReadStream(clipFilePath);
    const webStream = Readable.toWeb(nodeStream);

    return new Response(webStream as any, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size.toString(),
        'Content-Disposition': `attachment; filename="${id}_${clipName}"`,
      },
    });
  } catch (err: any) {
    console.error('Download clip stream route error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
