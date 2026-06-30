'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Job {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  originalVideo: string | null;
  processedVideo: string | null;
  progress: number;
  error: string | null;
  backgroundType?: string;
  createdAt: string;
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [backgroundType, setBackgroundType] = useState<string>('green');
  const [previewMode, setPreviewMode] = useState<'processed' | 'original'>('processed');
  
  // Upload States
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll active job progress
  useEffect(() => {
    if (!activeJobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/job/${activeJobId}?t=${Date.now()}`);
        if (!res.ok) throw new Error('Job not found');
        const data: Job = await res.json();
        
        setActiveJob(data);

        // Sync the polled job status and progress back into the history sidebar list state
        setJobs((prevJobs) =>
          prevJobs.map((j) => (j.id === data.id ? data : j))
        );

        // If completed or failed, stop polling and refresh history list
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

  // Fetch jobs history list
  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data: Job[] = await res.json();
        // Filter history list to only show MATTING type tasks on the dashboard page
        const mattingJobs = data.filter(j => j.type === 'MATTING' || !j.type);
        setJobs(mattingJobs);

        // Automatically resume polling if there is a running/pending matting job in history
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

  // Handle file upload
  const uploadFile = (file: File) => {
    if (!file) return;

    // Validate size (2GB limit)
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

    // Track upload progress
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
          
          // Trigger the processing
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
        setPreviewMode('processed'); // Default to showing chroma matte
        fetchJobs();
      } else {
        const text = await res.text();
        console.error('Process start failed:', text);
      }
    } catch (err) {
      console.error('Error starting process:', err);
    }
  };

  // Drag & Drop event handlers
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
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main Action Area */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        
        {/* Background Color Selector */}
        {!activeJob && (
          <div className="glass-card p-6 flex flex-col gap-5 text-left border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl"></div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Select AI Backdrop Replacement
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
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
                  borderClass: 'border-zinc-200/60 shadow-[0_0_15px_rgba(255,255,255,0.15)] text-white',
                  dotColor: 'bg-zinc-200'
                },
                { 
                  id: 'black', 
                  name: 'Studio Black', 
                  colorClass: 'bg-[#000000] border border-white/20', 
                  borderClass: 'border-zinc-700/60 shadow-[0_0_15px_rgba(0,0,0,0.4)] text-zinc-400',
                  dotColor: 'bg-zinc-800'
                },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBackgroundType(item.id)}
                  className={`flex flex-col items-center gap-3 p-4 rounded-2xl border transition-all duration-300 active:scale-95 cursor-pointer relative group ${
                    backgroundType === item.id
                      ? `bg-white/[0.04] ${item.borderClass}`
                      : 'border-white/5 bg-zinc-950/45 hover:bg-zinc-900/65 hover:border-white/10 text-zinc-400'
                  }`}
                >
                  {backgroundType === item.id && (
                    <span className="absolute top-2 right-2 flex h-2 w-2">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${item.dotColor}`}></span>
                      <span className={`relative inline-flex rounded-full h-2 w-2 ${item.dotColor}`}></span>
                    </span>
                  )}
                  <div className={`w-9 h-9 rounded-full shadow-inner transform transition-transform group-hover:scale-105 duration-300 ${item.colorClass}`} />
                  <span className="text-[10px] font-bold tracking-wider uppercase">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        
        {/* Step 1: Upload Area */}
        {!activeJob && (
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`glass-card p-10 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-3xl transition-all duration-300 min-h-[320px] cursor-pointer relative group overflow-hidden ${
              isDragActive ? 'border-emerald-500 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.05)]' : 'border-white/10 hover:border-white/20'
            }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/*"
              className="hidden"
            />
            
            {uploading ? (
              <div className="flex flex-col items-center gap-6 w-full max-w-md">
                {/* Circular Uploading Icon */}
                <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 relative shadow-inner animate-pulse">
                  <svg className="w-8 h-8 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                
                <div className="flex flex-col gap-1.5 w-full">
                  <div className="flex justify-between text-xs sm:text-sm font-semibold tracking-wide">
                    <span className="text-zinc-200">Uploading Video File...</span>
                    <span className="text-emerald-400">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-white/5 shadow-inner">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300 progress-animated"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-zinc-500 mt-1">Streaming directly to local disk cache. Keep this page open.</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-400 transition-all duration-500 group-hover:scale-105 group-hover:border-emerald-500/30 group-hover:text-emerald-400 group-hover:shadow-[0_0_15px_rgba(16,185,129,0.1)] shadow-inner">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight group-hover:text-emerald-400 transition-colors duration-300">Drag and drop your video</h3>
                  <p className="text-xs sm:text-sm text-zinc-400 mt-1.5 max-w-sm leading-relaxed">
                    Click to browse files. The background will be replaced using our temporal AI engine.
                  </p>
                </div>
                <div className="text-[10px] text-zinc-500 mt-1.5 bg-zinc-950/80 px-4 py-1.5 rounded-full border border-white/5 uppercase tracking-wider font-semibold font-mono">
                  MP4, MOV, AVI, MKV, WebM &bull; Max 2 GB
                </div>
              </div>
            )}
          </div>
        )}

        {/* Active Processing State */}
        {activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'PROCESSING') && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center min-h-[350px] justify-center processing-glow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl animate-pulse"></div>
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-inner">
              <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
              </svg>
            </div>
            
            <div className="flex flex-col gap-2.5 max-w-md w-full">
              <h3 className="text-xl font-extrabold text-white tracking-tight">AI Background Matting Active</h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed px-4">
                Our local PyTorch AI model is segmenting the foreground subject frame-by-frame. Background audio will be merged back upon completion.
              </p>
            </div>

            <div className="w-full max-w-md flex flex-col gap-2 mt-2">
              <div className="flex justify-between text-xs sm:text-sm font-bold tracking-wide">
                <span className="text-emerald-400 uppercase tracking-widest text-[10px]">Processing Pipeline</span>
                <span className="text-white">{Math.round(activeJob.progress)}%</span>
              </div>
              <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-white/5 shadow-inner">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300 progress-animated"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 mt-0.5 tracking-wide">
                {activeJob.status === 'PENDING' ? 'Waiting in local queue...' : 'Segmenting visuals & blending chroma-key backdrops...'}
              </span>
            </div>
            
            <button
              onClick={() => deleteJob(activeJob.id)}
              className="px-4 py-2 rounded-xl border border-red-500/25 bg-red-500/5 hover:bg-red-500/15 text-red-400 text-xs font-bold mt-4 transition-all duration-300 active:scale-95 cursor-pointer"
            >
              Cancel AI Job
            </button>
          </div>
        )}

        {/* Failed State */}
        {activeJob && activeJob.status === 'FAILED' && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center border-red-500/20 relative">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="flex flex-col gap-3.5 max-w-md w-full">
              <h3 className="text-lg font-bold text-white tracking-tight">AI Video Processing Failed</h3>
              <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-500/5 border border-red-500/15 p-4 rounded-2xl max-h-[140px] overflow-y-auto text-left">
                {activeJob.error || 'Unknown parsing or PyTorch inference error. Ensure files are valid media codecs.'}
              </p>
            </div>

            <div className="flex gap-3.5 mt-2 w-full sm:w-auto">
              <button
                onClick={() => triggerProcessing(activeJob.id)}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-emerald-500 text-black font-bold hover:bg-emerald-400 transition-colors text-xs cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.2)]"
              >
                Retry Processing
              </button>
              <button
                onClick={() => {
                  setActiveJob(null);
                  setActiveJobId(null);
                }}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-white font-semibold transition-colors text-xs cursor-pointer"
              >
                Upload Another
              </button>
            </div>
          </div>
        )}

        {/* Completed State - Interactive Comparison Preview */}
        {activeJob && activeJob.status === 'COMPLETED' && (
          <div className="glass-card p-6 flex flex-col gap-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl"></div>
            <div className="flex items-center justify-between border-b border-white/5 pb-4 gap-4">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Matting Completed</span>
                <h3 className="text-lg font-bold text-white mt-1">Chroma Key Composition Ready</h3>
              </div>
              <button
                onClick={() => {
                  setActiveJob(null);
                  setActiveJobId(null);
                }}
                className="text-xs text-zinc-400 hover:text-white transition-all bg-white/5 border border-white/10 px-3.5 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 cursor-pointer hover:bg-white/10"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Upload New
              </button>
            </div>

            {/* TAB TOGGLES FOR COMPACT PREVIEW */}
            <div className="flex gap-1.5 p-1 bg-zinc-950/80 rounded-xl border border-white/5 w-fit">
              <button
                type="button"
                onClick={() => setPreviewMode('processed')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  previewMode === 'processed'
                    ? 'bg-emerald-500 text-black shadow-md'
                    : 'text-zinc-400 hover:text-white'
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
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                Original Video
              </button>
            </div>

            {/* Video Player Preview Container */}
            <div className="w-full rounded-2xl overflow-hidden border border-white/10 aspect-video bg-zinc-950 relative shadow-2xl">
              <video
                key={previewMode}
                src={previewMode === 'processed' ? `/api/download/${activeJob.id}` : `/api/original/${activeJob.id}`}
                controls
                className="w-full h-full object-contain"
                autoPlay
              />
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-zinc-950/40 p-4 rounded-2xl border border-white/5">
              <div className="text-left w-full sm:w-auto">
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold font-mono">Format Standard</div>
                <div className="text-sm font-bold text-white mt-0.5">H.264 MP4 (Web Optimized)</div>
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <a
                  href={`/api/download/${activeJob.id}`}
                  download={`greenscreen_${activeJob.id}.mp4`}
                  className="flex-1 sm:flex-initial text-center px-6 py-3 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 font-extrabold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] cursor-pointer active:scale-95"
                >
                  Download Output Video
                </a>
                <button
                  onClick={() => deleteJob(activeJob.id)}
                  className="px-3.5 py-3 rounded-xl border border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer active:scale-95"
                  title="Delete File"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* History sidebar */}
      <div className="flex flex-col gap-6">
        <div className="glass-card p-6 flex flex-col gap-4 max-h-[640px] overflow-y-auto border-white/5 relative">
          <div className="flex items-center justify-between border-b border-white/5 pb-3.5">
            <h3 className="font-bold text-white text-base tracking-tight flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              AI Matting Log
            </h3>
            <span className="px-2.5 py-1 rounded-lg bg-white/5 text-zinc-400 text-xs font-bold">
              {jobs.length}
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 text-sm italic leading-relaxed">
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
                      : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-mono text-[10px] text-zinc-400 font-bold bg-white/5 px-2 py-0.5 rounded-md truncate max-w-[120px]" title={job.id}>
                      Job #{job.id.substring(0, 8)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${
                        job.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : job.status === 'FAILED'
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        job.status === 'COMPLETED' ? 'bg-emerald-400' : job.status === 'FAILED' ? 'bg-red-400' : 'bg-yellow-400'
                      }`}></span>
                      {job.status}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">
                        Chroma Key
                      </span>
                      {job.backgroundType && (
                        <span className="text-[9px] text-zinc-500 uppercase font-mono">
                          bg: {job.backgroundType}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-white/[0.02]">
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
                        View →
                      </span>
                    )}
                  </div>
                  
                  {job.status === 'PROCESSING' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
                        <span>AI Blending</span>
                        <span>{Math.round(job.progress)}%</span>
                      </div>
                      <div className="w-full bg-zinc-950 rounded-full h-1.5 overflow-hidden border border-white/5 shadow-inner">
                        <div className="bg-yellow-500 h-full rounded-full transition-all duration-300" style={{ width: `${job.progress}%` }} />
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
