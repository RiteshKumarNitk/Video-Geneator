'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Job {
  id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  originalVideo: string | null;
  processedVideo: string | null;
  progress: number;
  error: string | null;
  type?: 'MATTING' | 'SHORTS_SPLIT';
  youtubeUrl?: string | null;
  processedClips?: string[];
  videoQuality?: string;
  orientation?: string;
  createdAt: string;
}

export default function YoutubeShortsCreator() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  
  // Form Inputs
  const [youtubeUrlText, setYoutubeUrlText] = useState<string>('');
  const [clipDuration, setClipDuration] = useState<number>(30);
  const [videoQuality, setVideoQuality] = useState<string>('1080p');
  const [orientation, setOrientation] = useState<string>('horizontal');
  
  const [splitting, setSplitting] = useState<boolean>(false);
  const [activeClipName, setActiveClipName] = useState<string | null>(null);

  const exampleVideos = [
    { name: "Cinematic Nature Video", url: "https://www.youtube.com/watch?v=Bey4XXJAqS8" },
    { name: "Lo-Fi Instrumental Beats", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" }
  ];

  // Poll active job progress
  useEffect(() => {
    if (!activeJobId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/job/${activeJobId}?t=${Date.now()}`);
        if (!res.ok) throw new Error('Job not found');
        const data: Job = await res.json();
        
        setActiveJob(data);

        // Sync back into sidebar jobs state
        setJobs((prevJobs) =>
          prevJobs.map((j) => (j.id === data.id ? data : j))
        );

        if (data.status === 'COMPLETED' && data.processedClips && data.processedClips.length > 0 && !activeClipName) {
          setActiveClipName(data.processedClips[0]);
        }

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
  }, [activeJobId, activeClipName]);

  // Fetch jobs list
  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data: Job[] = await res.json();
        // Filter history list to only show SHORTS_SPLIT type tasks on this page
        const youtubeJobs = data.filter(j => j.type === 'SHORTS_SPLIT');
        setJobs(youtubeJobs);

        // Auto-resume if there is a running split task in history
        const runningJob = youtubeJobs.find(
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

  const handleYoutubeSplit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!youtubeUrlText || youtubeUrlText.trim() === '') return;

    setSplitting(true);
    setActiveClipName(null);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          youtubeUrl: youtubeUrlText, 
          clipDuration,
          videoQuality,
          orientation 
        }),
      });
      if (res.ok) {
        const job = await res.json();
        setActiveJobId(job.id);
        setActiveJob(job);
        setYoutubeUrlText('');
        fetchJobs();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to start YouTube split process.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to YouTube downloader API.');
    } finally {
      setSplitting(false);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      const res = await fetch(`/api/job/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeJobId === jobId) {
          setActiveJobId(null);
          setActiveJob(null);
          setActiveClipName(null);
        }
        fetchJobs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetry = async (job: Job) => {
    setSplitting(true);
    setActiveClipName(null);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          youtubeUrl: job.youtubeUrl, 
          clipDuration: job.clipDuration || 30,
          videoQuality: job.videoQuality || '1080p',
          orientation: job.orientation || 'horizontal'
        }),
      });
      if (res.ok) {
        const newJob = await res.json();
        setActiveJobId(newJob.id);
        setActiveJob(newJob);
        fetchJobs();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSplitting(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main Column */}
      <div className="lg:col-span-2 flex flex-col gap-6">
        
        {/* Step 1: Link Submission Form */}
        {!activeJob && (
          <div className="glass-card p-6 flex flex-col gap-6 text-left border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl"></div>
            
            <div>
              <span className="text-[10px] text-purple-400 font-extrabold uppercase tracking-widest">Slicing Engine</span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">YouTube Shorts Creator</h2>
              <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                Download a YouTube video, choose custom quality streams, and automatically slice it into multiple short segments.
              </p>
            </div>

            <form onSubmit={handleYoutubeSplit} className="flex flex-col gap-5">
              
              {/* YouTube Link Field */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">YouTube Video URL</label>
                <input
                  type="url"
                  value={youtubeUrlText}
                  onChange={(e) => setYoutubeUrlText(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full px-4 py-3.5 bg-zinc-950 border border-white/10 rounded-2xl text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-purple-500 focus:shadow-[0_0_15px_rgba(168,85,247,0.1)] transition-all leading-relaxed"
                  disabled={splitting}
                  required
                />
              </div>

              {/* Selectors Grid: Length, Quality, Crop Aspect Ratio */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* 1. Shorts Length */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Short Clip Duration</label>
                  <select
                    value={clipDuration}
                    onChange={(e) => setClipDuration(parseInt(e.target.value))}
                    className="w-full px-3 py-3 bg-zinc-950 border border-white/10 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option value={30}>30 Seconds</option>
                    <option value={45}>45 Seconds</option>
                    <option value={60}>60 Seconds</option>
                  </select>
                </div>

                {/* 2. Target Resolution Quality */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Video Stream Quality</label>
                  <select
                    value={videoQuality}
                    onChange={(e) => setVideoQuality(e.target.value)}
                    className="w-full px-3 py-3 bg-zinc-950 border border-white/10 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option value="1080p">1080p Full HD</option>
                    <option value="720p">720p HD</option>
                    <option value="480p">480p SD</option>
                    <option value="360p">360p LQ</option>
                    <option value="best">Best Available (Auto)</option>
                  </select>
                </div>

                {/* 3. Orientation / Crop Option */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Aspect Crop Ratio</label>
                  <select
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value)}
                    className="w-full px-3 py-3 bg-zinc-950 border border-white/10 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-purple-500 transition-colors"
                  >
                    <option value="horizontal">Horizontal (Original)</option>
                    <option value="vertical">Vertical (9:16 Crop)</option>
                  </select>
                </div>
              </div>

              {/* Examples Grid */}
              <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.02]">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Example Video Links (Click to paste)</span>
                <div className="flex flex-col sm:flex-row gap-2">
                  {exampleVideos.map((video, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setYoutubeUrlText(video.url)}
                      className="text-left text-xs text-zinc-400 hover:text-white bg-zinc-900/30 hover:bg-zinc-900/60 border border-white/5 hover:border-white/10 px-3.5 py-2.5 rounded-xl transition-all duration-200 truncate cursor-pointer flex-1 active:scale-[0.98]"
                    >
                      <span className="text-purple-400 font-bold block text-[10px] mb-0.5">{video.name}</span>
                      {video.url}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={splitting || !youtubeUrlText.trim()}
                className={`w-full py-4 rounded-2xl text-black font-extrabold text-xs uppercase tracking-widest transition-all duration-300 shadow-[0_0_20px_rgba(168,85,247,0.15)] flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                  splitting || !youtubeUrlText.trim()
                    ? 'bg-zinc-800 text-zinc-500 shadow-none cursor-not-allowed border border-white/5'
                    : 'bg-purple-500 hover:bg-purple-400 hover:shadow-[0_0_30px_rgba(168,85,247,0.35)]'
                }`}
              >
                {splitting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Contacting Local Worker...
                  </>
                ) : (
                  <>
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download & Split Shorts
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Step 2: Active Processing View */}
        {activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'PROCESSING') && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center min-h-[350px] justify-center processing-glow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl animate-pulse"></div>
            <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 shadow-inner">
              <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L22 4" />
              </svg>
            </div>
            
            <div className="flex flex-col gap-2.5 max-w-md w-full">
              <h3 className="text-xl font-extrabold text-white tracking-tight">YouTube Shorts Slicing Active</h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed px-4">
                Pulling high-quality video frames from YouTube, checking resolution metrics, and slicing them into clean short segments.
              </p>
              {activeJob.youtubeUrl && (
                <div className="mt-2 text-xs font-mono bg-zinc-950 p-3 rounded-xl border border-white/5 text-zinc-400 text-left max-w-sm mx-auto w-full truncate">
                  <span className="text-purple-400 font-bold">YouTube URL: </span>
                  {activeJob.youtubeUrl}
                </div>
              )}
            </div>

            <div className="w-full max-w-md flex flex-col gap-2 mt-2">
              <div className="flex justify-between text-xs sm:text-sm font-bold tracking-wide">
                <span className="text-purple-400 uppercase tracking-widest text-[10px]">Processing Pipeline</span>
                <span className="text-white">{Math.round(activeJob.progress)}%</span>
              </div>
              <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-white/5 shadow-inner">
                <div
                  className="bg-purple-500 h-full rounded-full transition-all duration-300 progress-animated"
                  style={{ width: `${activeJob.progress}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-500 mt-0.5 tracking-wide">
                {activeJob.status === 'PENDING' 
                  ? 'Waiting in local queue...' 
                  : activeJob.progress < 50 ? 'Downloading video streams...' : 'Splitting into short clips...'}
              </span>
            </div>
            
            <button
              onClick={() => deleteJob(activeJob.id)}
              className="px-4 py-2 rounded-xl border border-red-500/25 bg-red-500/5 hover:bg-red-500/15 text-red-400 text-xs font-bold mt-4 transition-all duration-300 active:scale-95 cursor-pointer"
            >
              Cancel YouTube Job
            </button>
          </div>
        )}

        {/* Step 3: Failed View */}
        {activeJob && activeJob.status === 'FAILED' && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center border-red-500/20 relative">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <div className="flex flex-col gap-3.5 max-w-md w-full">
              <h3 className="text-lg font-bold text-white tracking-tight">Slicing Task Failed</h3>
              <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-500/5 border border-red-500/15 p-4 rounded-2xl max-h-[140px] overflow-y-auto text-left">
                {activeJob.error || 'Check that the YouTube link is public and accessible.'}
              </p>
            </div>

            <div className="flex gap-3.5 mt-2 w-full sm:w-auto">
              <button
                onClick={() => handleRetry(activeJob)}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-purple-500 text-black font-bold hover:bg-purple-400 transition-colors text-xs cursor-pointer shadow-[0_0_15px_rgba(168,85,247,0.2)]"
              >
                Retry Downloading
              </button>
              <button
                onClick={() => {
                  setActiveJob(null);
                  setActiveJobId(null);
                  setActiveClipName(null);
                }}
                className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-white font-semibold transition-colors text-xs cursor-pointer"
              >
                Start Another
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Completed View */}
        {activeJob && activeJob.status === 'COMPLETED' && (
          <div className="glass-card p-6 flex flex-col gap-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl"></div>
            <div className="flex items-center justify-between border-b border-white/5 pb-4 gap-4">
              <div>
                <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Slicing Completed</span>
                <h3 className="text-lg font-bold text-white mt-1">Short Clips Compiled</h3>
              </div>
              <button
                onClick={() => {
                  setActiveJob(null);
                  setActiveJobId(null);
                  setActiveClipName(null);
                }}
                className="text-xs text-zinc-400 hover:text-white transition-all bg-white/5 border border-white/10 px-3.5 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 cursor-pointer hover:bg-white/10"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Create New Shorts
              </button>
            </div>

            {activeJob.youtubeUrl && (
              <div className="text-[11px] font-mono bg-zinc-950/80 p-3 rounded-xl border border-white/5 text-zinc-400 w-full leading-relaxed truncate text-left">
                <span className="text-purple-400 font-bold">Source Link: </span>
                {activeJob.youtubeUrl}
              </div>
            )}

            {/* Video Player Preview Container */}
            <div className="flex justify-center w-full bg-zinc-950 rounded-2xl overflow-hidden border border-white/10 aspect-video shadow-2xl relative">
              <video
                key={activeClipName}
                src={`/api/download/${activeJob.id}/${activeClipName}`}
                controls
                className={`h-full object-contain ${
                  activeJob.orientation === 'vertical' ? 'w-auto max-w-[280px]' : 'w-full'
                }`}
                autoPlay
              />
            </div>

            {/* Clips Grid List */}
            {activeJob.processedClips && (
              <div className="flex flex-col gap-4 text-left">
                <div>
                  <h4 className="text-sm font-bold text-white tracking-tight">Generated Shorts Grid</h4>
                  <p className="text-xs text-zinc-500 mt-0.5">Toggle clips to preview in the player or download to disk.</p>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {activeJob.processedClips.map((clip, idx) => (
                    <div
                      key={clip}
                      onClick={() => setActiveClipName(clip)}
                      className={`p-3.5 rounded-2xl border transition-all duration-300 flex items-center justify-between cursor-pointer ${
                        activeClipName === clip
                          ? 'border-purple-500/40 bg-purple-500/5'
                          : 'border-white/5 bg-zinc-950/40 hover:bg-zinc-900/60 hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center ${
                          activeClipName === clip ? 'bg-purple-500 text-black shadow-lg shadow-purple-500/10' : 'bg-white/5 text-zinc-400'
                        }`}>
                          <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          </svg>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-white truncate">Short Clip #{idx + 1}</span>
                          <span className="text-[9px] text-zinc-500 font-mono font-bold uppercase tracking-wider">
                            Seg: {formatTime(idx * (activeJob.duration || 30))} - {formatTime((idx + 1) * (activeJob.duration || 30))}
                          </span>
                        </div>
                      </div>
                      <a
                        href={`/api/download/${activeJob.id}/${clip}`}
                        download={`${activeJob.id}_clip_${idx + 1}.mp4`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/10 rounded-xl text-[10px] font-bold text-zinc-200 hover:text-white transition-all duration-300"
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* History Sidebar */}
      <div className="flex flex-col gap-6">
        <div className="glass-card p-6 flex flex-col gap-4 max-h-[640px] overflow-y-auto border-white/5 relative">
          <div className="flex items-center justify-between border-b border-white/5 pb-3.5">
            <h3 className="font-bold text-white text-base tracking-tight flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Slices Log
            </h3>
            <span className="px-2.5 py-1 rounded-lg bg-white/5 text-zinc-400 text-xs font-bold">
              {jobs.length}
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 text-sm italic leading-relaxed">
              No split jobs found. <br /> Submit a link on the left to split.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  onClick={() => {
                    setActiveJobId(job.id);
                    setActiveJob(job);
                    if (job.processedClips && job.processedClips.length > 0) {
                      setActiveClipName(job.processedClips[0]);
                    }
                  }}
                  className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer text-left flex flex-col gap-3 ${
                    activeJobId === job.id
                      ? 'border-purple-500/40 bg-purple-500/5 shadow-[0_0_15px_rgba(168,85,247,0.02)]'
                      : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10'
                  }`}
                >
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-mono text-[10px] text-zinc-400 font-bold bg-white/5 px-2 py-0.5 rounded-md truncate max-w-[120px]" title={job.id}>
                      #{job.id.substring(0, 8)}
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

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-purple-500/15 text-purple-400">
                        Shorts Split
                      </span>
                      {job.videoQuality && (
                        <span className="text-[9px] text-zinc-500 font-mono font-bold">
                          {job.videoQuality}
                        </span>
                      )}
                      {job.orientation && (
                        <span className="text-[9px] text-zinc-500 font-mono font-bold capitalize">
                          {job.orientation}
                        </span>
                      )}
                    </div>
                    {job.youtubeUrl && (
                      <p className="text-xs text-zinc-400 line-clamp-1 italic mt-1 leading-relaxed truncate max-w-xs font-mono text-[10px]" title={job.youtubeUrl}>
                        {job.youtubeUrl}
                      </p>
                    )}
                    {job.status === 'COMPLETED' && job.processedClips && (
                      <span className="text-[10px] text-zinc-400 font-bold mt-1">
                        &bull; {job.processedClips.length} clips generated
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1.5 border-t border-white/[0.02]">
                    <span>
                      {new Date(job.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {job.status === 'COMPLETED' && (
                      <span className="text-purple-400 font-bold flex items-center gap-0.5 hover:text-purple-300">
                        View Clips →
                      </span>
                    )}
                  </div>
                  
                  {job.status === 'PROCESSING' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
                        <span>Splitting Progress</span>
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
