import { NextResponse } from 'next/server';
import { readJobs } from '@/lib/jobsStore';

export async function GET() {
  try {
    const jobs = await readJobs();
    // Sort desc by createdAt
    const sortedJobs = jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return NextResponse.json(sortedJobs.slice(0, 50));
  } catch (err: any) {
    console.error('Fetch jobs error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
