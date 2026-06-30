import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { getJob, deleteJobRecord } from '@/lib/jobsStore';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await getJob(id);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    return NextResponse.json(job);
  } catch (err: any) {
    console.error('GET job error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const job = await getJob(id);

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Attempt to delete physical files
    if (job.originalVideo) {
      try {
        await fs.unlink(job.originalVideo);
      } catch (err) {
        console.warn(`Could not delete original video file: ${job.originalVideo}`, err);
      }
    }

    if (job.processedVideo) {
      try {
        await fs.unlink(job.processedVideo);
      } catch (err) {
        console.warn(`Could not delete processed video file: ${job.processedVideo}`, err);
      }
    }

    // Delete job from JSON database
    await deleteJobRecord(id);

    return NextResponse.json({ success: true, message: 'Job and files deleted successfully.' });
  } catch (err: any) {
    console.error('DELETE job error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
