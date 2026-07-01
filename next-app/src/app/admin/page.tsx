'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  RefreshCw,
  Trash2,
  Activity,
  Server,
  Clock,
  ExternalLink,
} from 'lucide-react';

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
      const statsRes = await fetch('/api/admin/stats');
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.stats);
        setHealth(statsData.pythonAi);
      }

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
    const interval = setInterval(fetchData, 8000);
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
    <div className="page-container flex flex-col gap-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-[var(--border-default)] pb-5 gap-4">
        <div>
          <span className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Admin Console</span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-white)] tracking-tight mt-0.5">Queue Monitoring</h2>
        </div>
        <button
          onClick={fetchData}
          className="btn-secondary btn"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh Logs
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Jobs', value: stats.TOTAL, color: 'text-[var(--text-primary)]' },
          { label: 'Pending in Queue', value: stats.PENDING, color: 'text-yellow-400' },
          { label: 'Processing Active', value: stats.PROCESSING, color: 'text-sky-400' },
          { label: 'Jobs Completed', value: stats.COMPLETED, color: 'text-emerald-400' },
          { label: 'Jobs Failed', value: stats.FAILED, color: 'text-red-400' },
        ].map((stat, idx) => (
          <div key={idx} className="glass-card p-5 flex flex-col gap-1.5 text-left">
            <span className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">{stat.label}</span>
            <span className={`text-2xl font-black ${stat.color}`}>{stat.value}</span>
          </div>
        ))}

        <div className="glass-card p-5 flex flex-col gap-1.5 text-left border-emerald-500/20">
          <span className="text-[10px] text-[var(--text-secondary)] font-semibold uppercase tracking-wider">AI Engine</span>
          <div className="flex items-center gap-1.5 mt-1">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                health.status === 'healthy' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500'
              }`}
            />
            <span className="text-xs font-bold capitalize text-[var(--text-white)]">
              {health.status === 'healthy' ? 'Active' : 'Offline'}
            </span>
          </div>
          <span className="text-[9px] text-[var(--text-secondary)] mt-1 truncate">
            Device: {health.device} {health.cuda_available ? '(GPU)' : '(CPU)'}
          </span>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--bg-header)]">
          <h3 className="font-bold text-[var(--text-white)] text-base">Historical Logs</h3>
        </div>

        {loading && jobs.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-secondary)]">Loading jobs database...</div>
        ) : jobs.length === 0 ? (
          <div className="text-center py-20 text-[var(--text-secondary)] italic">No job records found in JSON database.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--bg-card)] text-[var(--text-secondary)] font-bold uppercase tracking-wider text-[10px]">
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
                  <tr key={job.id} className="hover:bg-[var(--bg-card)] transition-colors">
                    <td className="px-6 py-4 font-mono text-[11px] text-[var(--text-primary)]">
                      {job.id}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`badge ${
                        job.status === 'COMPLETED' ? 'badge-completed' : job.status === 'FAILED' ? 'badge-failed' : 'badge-pending'
                      }`}>
                        <span className="badge-dot" />
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[var(--text-primary)] font-semibold">
                      {job.status === 'COMPLETED' ? '100%' : `${Math.round(job.progress)}%`}
                    </td>
                    <td className="px-6 py-4 text-[var(--text-secondary)] text-xs">
                      {new Date(job.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 max-w-[200px] truncate text-red-400/90 font-mono text-[11px]" title={job.error || undefined}>
                      {job.error || <span className="text-[var(--text-tertiary)]">-</span>}
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
                            className="px-2.5 py-1 rounded bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] text-[10px] transition-colors"
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
