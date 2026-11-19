import {session,mayReadJob} from '@/lib/auth';
import { NextResponse } from 'next/server';
import { readJobs } from '@/lib/jobsStore';

export async function GET() {
  try {
    const user=(await session())?.user.id;
    const jobs = (await readJobs()).filter(j=>mayReadJob(j,user));
    // Sort desc by createdAt
    const sortedJobs = jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return NextResponse.json(sortedJobs.slice(0, 50));
  } catch (err: any) {
    console.error('Fetch jobs error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
