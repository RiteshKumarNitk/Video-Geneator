'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Job {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  originalVideo: string;
  processedVideo: string | null;
  progress: number;
  error: string | null;
  createdAt: string;
}

interface Stats {
  PENDING: number;
  PROCESSING: number;
  COMPLETED: number;
  FAILED: number;
  TOTAL: number;
}

interface PythonHealth {
  status: string;
  cuda_available: boolean;
  device: string;
}

export default function AdminPanel() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats>({ PENDING: 0, PROCESSING: 0, COMPLETED: 0, FAILED: 0, TOTAL: 0 });
  const [health, setHealth] = useState<PythonHealth>({ status: 'checking', cuda_available: false, device: 'unknown' });
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch stats & health
      const statsRes = await fetch('/api/admin/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
        setHealth(statsData.pythonAi);
      }

      // Fetch jobs list
      const jobsRes = await fetch('/api/jobs');
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }
    } catch (err) {
      console.error('Failed to fetch admin dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8000); // refresh every 8s
    return () => clearInterval(interval);
  }, []);

  const triggerRetry = async (jobId: string) => {
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId }),
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('Failed to retry job.');
      }
    } catch (err) {
      console.error('Error retrying job:', err);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job and all associated files?')) return;
    try {
      const res = await fetch(`/api/job/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        alert('Failed to delete job.');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
      {/* Admin Panel Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/5 pb-5 gap-4">
        <div>
          <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Admin Console</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">Queue Monitoring</h2>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchData}
            className="px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-sm font-semibold transition-all flex items-center gap-2 text-white"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
            </svg>
            Refresh Logs
          </button>
        </div>
      </div>

      {/* Grid: Server Stats Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Jobs', value: stats.TOTAL, color: 'text-zinc-200' },
          { label: 'Pending in Queue', value: stats.PENDING, color: 'text-yellow-400' },
          { label: 'Processing Active', value: stats.PROCESSING, color: 'text-sky-400' },
          { label: 'Jobs Completed', value: stats.COMPLETED, color: 'text-emerald-400' },
          { label: 'Jobs Failed', value: stats.FAILED, color: 'text-red-400' },
        ].map((stat, idx) => (
          <div key={idx} className="glass-card p-5 flex flex-col gap-1.5 text-left">
            <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">{stat.label}</span>
            <span className={`text-2xl font-black ${stat.color}`}>{stat.value}</span>
          </div>
        ))}

        {/* AI Engine Status card */}
        <div className="glass-card p-5 flex flex-col gap-1.5 text-left border-emerald-500/20">
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider">AI Engine</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                health.status === 'healthy' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500'
              }`}
            ></span>
            <span className="text-xs font-bold capitalize text-white">
              {health.status === 'healthy' ? 'Active' : 'Offline'}
            </span>
          </div>
          <span className="text-[9px] text-zinc-500 mt-1 truncate">
            Device: {health.device} {health.cuda_available ? '(GPU)' : '(CPU)'}
          </span>
        </div>
      </div>

      {/* Jobs Log Table */}
      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-black/20">
          <h3 className="font-bold text-white text-base">Historical Logs</h3>
        </div>
        
        {loading && jobs.length === 0 ? (
          <div className="text-center py-20 text-zinc-400">Loading jobs database...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 italic">No job records found in JSON database.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.01] text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-6 py-3 font-semibold">Job ID</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Progress</th>
                  <th className="px-6 py-3 font-semibold">Created Date</th>
                  <th className="px-6 py-3 font-semibold">Error Message</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 font-mono text-[11px] text-zinc-300">
                      {job.id}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : job.status === 'FAILED'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-300 font-semibold">
                      {job.status === 'COMPLETED' ? '100%' : `${Math.round(job.progress)}%`}
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-xs">
                      {new Date(job.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 max-w-[200px] truncate text-red-400/90 font-mono text-[11px]" title={job.error || undefined}>
                      {job.error || <span className="text-zinc-600">-</span>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex gap-2 justify-end">
                        {job.status === 'FAILED' && (
                          <button
                            onClick={() => triggerRetry(job.id)}
                            className="px-2.5 py-1 rounded bg-emerald-500 text-black hover:bg-emerald-400 font-semibold text-[10px] transition-colors"
                          >
                            Retry
                          </button>
                        )}
                        {job.status === 'COMPLETED' && (
                          <Link
                            href={`/dashboard?job=${job.id}`}
                            className="px-2.5 py-1 rounded bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-zinc-300 text-[10px] transition-colors"
                          >
                            Preview
                          </Link>
                        )}
                        <button
                          onClick={() => deleteJob(job.id)}
                          className="px-2.5 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-[10px] transition-colors font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
