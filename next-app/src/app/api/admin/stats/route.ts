import { NextResponse } from 'next/server';
import { readJobs } from '@/lib/jobsStore';

export async function GET() {
  try {
    const jobs = await readJobs();
    
    const stats = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
      TOTAL: jobs.length,
    };

    jobs.forEach((job) => {
      if (job.status in stats) {
        stats[job.status as keyof typeof stats]++;
      }
    });

    // Fetch FastAPI server health status
    let pythonAiHealth = { status: 'offline', cuda_available: false, device: 'unknown' };
    try {
      const pythonAiUrl = process.env.PYTHON_AI_URL || 'http://localhost:8000';
      const healthRes = await fetch(`${pythonAiUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        pythonAiHealth = healthData;
      }
    } catch (err) {
      console.warn('FastAPI health check failed:', err);
    }

    return NextResponse.json({
      stats,
      pythonAi: pythonAiHealth,
    });
  } catch (err: any) {
    console.error('Fetch admin stats error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
