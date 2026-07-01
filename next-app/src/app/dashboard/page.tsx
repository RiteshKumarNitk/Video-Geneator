'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Upload,
  RefreshCw,
  AlertTriangle,
  Download,
  Trash2,
  ArrowLeft,
  Clock,
  Film,
} from 'lucide-react';

interface Job {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  originalVideo: string | null;
  processedVideo: string | null;
  progress: number;
  error: string | null;
  backgroundType?: string;
  type?: string;
  createdAt: string;
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [backgroundType, setBackgroundType] = useState<string>('green');
  const [previewMode, setPreviewMode] = useState<'processed' | 'original'>('processed');

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!activeJobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/job/${activeJobId}?t=${Date.now()}`);
        if (!res.ok) throw new Error('Job not found');
        const data: Job = await res.json();

        setActiveJob(data);

        setJobs((prevJobs) =>
          prevJobs.map((j) => (j.id === data.id ? data : j))
        );

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          clearInterval(pollInterval);
          fetchJobs();
        }
      } catch (err) {
        console.error('Polling error:', err);
        clearInterval(pollInterval);
      }
    }, 1500);

    return () => clearInterval(pollInterval);
  }, [activeJobId]);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data: Job[] = await res.json();
        const mattingJobs = data.filter(j => j.type === 'MATTING' || !j.type);
        setJobs(mattingJobs);

        const runningJob = mattingJobs.find(
          (j) => j.status === 'PENDING' || j.status === 'PROCESSING'
        );
        if (runningJob && !activeJobId) {
          setActiveJobId(runningJob.id);
          setActiveJob(runningJob);
        }
      }
    } catch (err) {
      console.error('Failed to fetch jobs:', err);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const uploadFile = (file: File) => {
    if (!file) return;

    const twoGB = 2 * 1024 * 1024 * 1024;
    if (file.size > twoGB) {
      alert('File size exceeds the 2GB limit.');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentage = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percentage);
      }
    };

    xhr.onload = async () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const job: Job = JSON.parse(xhr.response);
          setActiveJobId(job.id);
          setActiveJob(job);

          await triggerProcessing(job.id);
        } catch (err) {
          console.error('Upload complete but failed to parse response:', err);
          alert('Failed to initialize job metadata.');
        }
      } else {
        console.error('Upload failed with status:', xhr.status);
        alert('File upload failed. Ensure server limits allow large requests.');
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      alert('Network error occurred during file upload.');
    };

    xhr.send(formData);
  };

  const triggerProcessing = async (jobId: string) => {
    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId, backgroundType }),
      });
      if (res.ok) {
        const updatedJob = await res.json();
        setActiveJob(updatedJob);
        setPreviewMode('processed');
        fetchJobs();
      } else {
        const text = await res.text();
        console.error('Process start failed:', text);
      }
    } catch (err) {
      console.error('Error starting process:', err);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      uploadFile(e.target.files[0]);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this job and all associated files?')) return;
    try {
      const res = await fetch(`/api/job/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeJobId === jobId) {
          setActiveJobId(null);
          setActiveJob(null);
        }
        fetchJobs();
      } else {
        alert('Failed to delete job.');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  return (
    <div className="page-container grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 flex flex-col gap-6">

        {!activeJob && (
          <div className="glass-card p-6 flex flex-col gap-5 text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
            <div>
              <h3 className="text-base font-bold text-[var(--text-white)] tracking-tight flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Select AI Backdrop Replacement
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Choose the color to composite behind the subject. Customizable for green, blue, white, and black.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {[
                {
                  id: 'green',
                  name: 'Chroma Green',
                  colorClass: 'bg-[#00ff00]',
                  borderClass: 'border-emerald-500/60 shadow-[0_0_15px_rgba(16,185,129,0.15)] text-emerald-400',
                  dotColor: 'bg-emerald-400'
                },
                {
                  id: 'blue',
                  name: 'Chroma Blue',
                  colorClass: 'bg-[#0000ff]',
                  borderClass: 'border-blue-500/60 shadow-[0_0_15px_rgba(59,130,246,0.15)] text-blue-400',
                  dotColor: 'bg-blue-400'
                },
                {
                  id: 'white',
                  name: 'Studio White',
                  colorClass: 'bg-[#ffffff]',
                  borderClass: 'border-zinc-200/60 shadow-[0_0_15px_rgba(255,255,255,0.15)] text-[var(--text-white)]',
                  dotColor: 'bg-zinc-200'
                },
                {
                  id: 'black',
                  name: 'Studio Black',
                  colorClass: 'bg-[#000000] border border-white/20',
                  borderClass: 'border-zinc-700/60 shadow-[0_0_15px_rgba(0,0,0,0.4)] text-[var(--text-secondary)]',
                  dotColor: 'bg-[var(--bg-hover)]'
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBackgroundType(item.id)}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-300 active:scale-95 cursor-pointer relative group ${
                    backgroundType === item.id
                      ? `bg-[var(--bg-hover)] ${item.borderClass}`
                      : 'border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-default)] text-[var(--text-secondary)]'
                  }`}
                >
                  {backgroundType === item.id && (
                    <span className="absolute top-2 right-2 flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${item.dotColor}`} />
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${item.dotColor}`} />
                    </span>
                  )}
                  <div className={`w-9 h-9 rounded-full shadow-inner transform transition-transform group-hover:scale-105 duration-300 ${item.colorClass}`} />
                  <span className="text-[10px] font-bold tracking-wider uppercase">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!activeJob && (
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`glass-card p-10 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-3xl transition-all duration-300 min-h-[320px] cursor-pointer relative group overflow-hidden ${
              isDragActive ? 'border-emerald-500 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.05)]' : 'border-[var(--border-default)] hover:border-white/20'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*"
              className="hidden"
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-6 w-full max-w-md">
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 relative shadow-inner animate-pulse">
                  <Upload className="w-8 h-8 animate-bounce" />
                </div>

                <div className="flex flex-col gap-1.5 w-full">
                  <div className="flex justify-between text-xs sm:text-sm font-semibold tracking-wide">
                    <span className="text-[var(--text-primary)]">Uploading Video File...</span>
                    <span className="text-emerald-400">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-[var(--bg-base)] rounded-full h-2 overflow-hidden border border-[var(--border-default)] shadow-inner">
                    <div
                      className="h-full rounded-full transition-all duration-300 progress-fill"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[var(--text-secondary)] mt-1">Streaming directly to local disk cache. Keep this page open.</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-[var(--bg-hover)] border border-[var(--border-default)] flex items-center justify-center text-[var(--text-secondary)] transition-all duration-500 group-hover:scale-105 group-hover:border-emerald-500/30 group-hover:text-emerald-400 group-hover:shadow-[0_0_15px_rgba(16,185,129,0.1)] shadow-inner">
                  <Upload className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[var(--text-white)] tracking-tight group-hover:text-emerald-400 transition-colors duration-300">Drag and drop your video</h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-1.5 max-w-sm leading-relaxed">
                    Click to browse files. The background will be replaced using our temporal AI engine.
                  </p>
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] mt-1.5 bg-[var(--bg-elevated)] px-4 py-1.5 rounded-full border border-[var(--border-default)] uppercase tracking-wider font-semibold font-mono">
                  MP4, MOV, AVI, MKV, WebM &bull; Max 2 GB
                </div>
              </div>
            )}
          </div>
        )}

        {activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'PROCESSING') && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center min-h-[350px] justify-center processing-glow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" />
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>

            <div className="flex flex-col gap-2.5 max-w-md w-full">
              <h3 className="text-xl font-extrabold text-[var(--text-white)] tracking-tight">AI Background Matting Active</h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed px-4">
                Our local PyTorch AI model is segmenting the foreground subject frame-by-frame. Background audio will be merged back upon completion.
              </p>
            </div>

            <div className="w-full max-w-md flex flex-col gap-2 mt-2">
              <div className="flex justify-between text-xs sm:text-sm font-bold tracking-wide">
                <span className="text-emerald-400 uppercase tracking-widest text-[10px]">Processing Pipeline</span>
                <span className="text-[var(--text-white)]">{Math.round(activeJob.progress)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${activeJob.progress}%` }} />
              </div>
              <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 tracking-wide">
                {activeJob.status === 'PENDING' ? 'Waiting in local queue...' : 'Segmenting visuals & blending chroma-key backdrops...'}
              </span>
            </div>

            <button
              onClick={() => deleteJob(activeJob.id)}
              className="btn-danger btn text-xs mt-4"
            >
              Cancel AI Job
            </button>
          </div>
        )}

        {activeJob && activeJob.status === 'FAILED' && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center border-red-500/20 relative">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="flex flex-col gap-3.5 max-w-md w-full">
              <h3 className="text-lg font-bold text-[var(--text-white)] tracking-tight">AI Video Processing Failed</h3>
              <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-500/5 border border-red-500/15 p-4 rounded-2xl max-h-[140px] overflow-y-auto text-left">
                {activeJob.error || 'Unknown parsing or PyTorch inference error. Ensure files are valid media codecs.'}
              </p>
            </div>

            <div className="flex gap-3.5 mt-2 w-full sm:w-auto">
              <button
                onClick={() => triggerProcessing(activeJob.id)}
                className="btn-primary btn"
              >
                Retry Processing
              </button>
              <button
                onClick={() => {
                  setActiveJob(null);
                  setActiveJobId(null);
                }}
                className="btn-secondary btn"
              >
                Upload Another
              </button>
            </div>
          </div>
        )}

        {activeJob && activeJob.status === 'COMPLETED' && (
          <div className="glass-card p-6 flex flex-col gap-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl" />
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 gap-4">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Matting Completed</span>
                <h3 className="text-lg font-bold text-[var(--text-white)] mt-1">Chroma Key Composition Ready</h3>
              </div>
              <button
                onClick={() => {
                  setActiveJob(null);
                  setActiveJobId(null);
                }}
                className="btn-ghost btn text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Upload New
              </button>
            </div>

            <div className="flex gap-1.5 p-1 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-default)] w-fit">
              <button
                type="button"
                onClick={() => setPreviewMode('processed')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  previewMode === 'processed'
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-white)]'
                }`}
              >
                Chroma Output
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('original')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  previewMode === 'original'
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-white)]'
                }`}
              >
                Original Video
              </button>
            </div>

            <div className="w-full rounded-2xl overflow-hidden border border-[var(--border-default)] aspect-video bg-[var(--bg-base)] relative shadow-2xl">
              <video
                key={previewMode}
                src={previewMode === 'processed' ? `/api/download/${activeJob.id}` : `/api/original/${activeJob.id}`}
                controls
                className="w-full h-full object-contain"
                autoPlay
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-default)]">
              <div className="text-left w-full sm:w-auto">
                <div className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-semibold font-mono">Format Standard</div>
                <div className="text-sm font-bold text-[var(--text-white)] mt-0.5">H.264 MP4 (Web Optimized)</div>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <a
                  href={`/api/download/${activeJob.id}`}
                  download={`greenscreen_${activeJob.id}.mp4`}
                  className="btn-primary btn flex-1 sm:flex-initial"
                >
                  <Download className="w-4 h-4" />
                  Download Output Video
                </a>
                <button
                  onClick={() => deleteJob(activeJob.id)}
                  className="btn-secondary btn"
                  title="Delete File"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="glass-card p-6 flex flex-col gap-4 max-h-[640px] overflow-y-auto relative">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3.5">
            <h3 className="font-bold text-[var(--text-white)] text-base tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--text-secondary)]" />
              AI Matting Log
            </h3>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-bold">
              {jobs.length}
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-secondary)] text-sm italic leading-relaxed">
              No processing jobs found. <br /> Upload a video to trigger AI pipelines.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => {
                    setActiveJobId(job.id);
                    setActiveJob(job);
                  }}
                  className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer text-left flex flex-col gap-3 ${
                    activeJobId === job.id
                      ? 'border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_15px_rgba(16,185,129,0.02)]'
                      : 'border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-card)] hover:border-[var(--border-default)]'
                  }`}
                >
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-mono text-[10px] text-[var(--text-secondary)] font-bold bg-[var(--bg-hover)] px-2 py-0.5 rounded-md truncate max-w-[120px]" title={job.id}>
                      Job #{job.id.substring(0, 8)}
                    </span>
                    <span className={`badge ${
                      job.status === 'COMPLETED' ? 'badge-completed' : job.status === 'FAILED' ? 'badge-failed' : 'badge-pending'
                    }`}>
                      <span className="badge-dot" />
                      {job.status}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="feature-tag feature-tag-dashboard">Chroma Key</span>
                      {job.backgroundType && (
                        <span className="text-[9px] text-[var(--text-secondary)] uppercase font-mono">
                          bg: {job.backgroundType}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] pt-1 border-t border-[var(--border-subtle)]">
                    <span>
                      {new Date(job.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {job.status === 'COMPLETED' && (
                      <span className="text-emerald-400 font-bold flex items-center gap-0.5 hover:text-emerald-300">
                        View &rarr;
                      </span>
                    )}
                  </div>

                  {job.status === 'PROCESSING' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
                        <span>AI Blending</span>
                        <span>{Math.round(job.progress)}%</span>
                      </div>
                      <div className="progress-bar h-1.5">
                        <div className="progress-fill" style={{ width: `${job.progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
