'use client';

import { useState, useEffect } from 'react';
import {
  Download,
  RefreshCw,
  AlertTriangle,
  Trash2,
  ArrowLeft,
  Clock,
  Film,
  Loader2,
} from 'lucide-react';

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
  clipDuration?: number;
  createdAt: string;
}

export default function YoutubeShortsCreator() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  const [youtubeUrlText, setYoutubeUrlText] = useState<string>('');
  const [clipDuration, setClipDuration] = useState<number>(30);
  const [videoQuality, setVideoQuality] = useState<string>('best');
  const [orientation, setOrientation] = useState<string>('horizontal');

  const [splitting, setSplitting] = useState<boolean>(false);
  const [activeClipName, setActiveClipName] = useState<string | null>(null);

  const exampleVideos = [
    { name: "Cinematic Nature Video", url: "https://www.youtube.com/watch?v=Bey4XXJAqS8" },
    { name: "Lo-Fi Instrumental Beats", url: "https://www.youtube.com/watch?v=jfKfPfyJRdk" }
  ];

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

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data: Job[] = await res.json();
        const youtubeJobs = data.filter(j => j.type === 'SHORTS_SPLIT');
        setJobs(youtubeJobs);

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
    <div className="page-container grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 flex flex-col gap-6">

        {!activeJob && (
          <div className="glass-card p-6 flex flex-col gap-6 text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl" />

            <div>
              <span className="text-[10px] text-purple-400 font-extrabold uppercase tracking-widest">Slicing Engine</span>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--text-white)] tracking-tight mt-1">YouTube Shorts Creator</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                Download a YouTube video, choose custom quality streams, and automatically slice it into multiple short segments.
              </p>
            </div>

            <form onSubmit={handleYoutubeSplit} className="flex flex-col gap-5">

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">YouTube Video URL</label>
                <input
                  type="url"
                  value={youtubeUrlText}
                  onChange={(e) => setYoutubeUrlText(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="input"
                  disabled={splitting}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Short Clip Duration</label>
                  <select
                    value={clipDuration}
                    onChange={(e) => setClipDuration(parseInt(e.target.value))}
                    className="select"
                  >
                    <option value={30}>30 Seconds</option>
                    <option value={45}>45 Seconds</option>
                    <option value={60}>60 Seconds</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Video Stream Quality</label>
                  <select
                    value={videoQuality}
                    onChange={(e) => setVideoQuality(e.target.value)}
                    className="select"
                  >
                    <option value="best">Best Available (Auto)</option>
                    <option value="2160p">4K (2160p)</option>
                    <option value="1440p">1440p (2K)</option>
                    <option value="1080p">1080p Full HD</option>
                    <option value="720p">720p HD</option>
                    <option value="480p">480p SD</option>
                    <option value="360p">360p LQ</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Aspect Crop Ratio</label>
                  <select
                    value={orientation}
                    onChange={(e) => setOrientation(e.target.value)}
                    className="select"
                  >
                    <option value="horizontal">Horizontal (Original)</option>
                    <option value="vertical">Vertical (9:16 Crop)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Example Video Links (Click to paste)</span>
                <div className="flex flex-col sm:flex-row gap-2">
                  {exampleVideos.map((video, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setYoutubeUrlText(video.url)}
                      className="text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-white)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--border-default)] px-3.5 py-2.5 rounded-xl transition-all duration-200 truncate cursor-pointer flex-1 active:scale-[0.98]"
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
                className={`btn w-full py-4 rounded-2xl ${
                  splitting || !youtubeUrlText.trim()
                    ? 'bg-[var(--bg-hover)] text-[var(--text-secondary)] shadow-none cursor-not-allowed border border-[var(--border-default)]'
                    : 'btn-primary w-full py-4 rounded-2xl bg-purple-500 hover:bg-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.15)] hover:shadow-[0_0_30px_rgba(168,85,247,0.35)]'
                }`}
              >
                {splitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    Contacting Local Worker...
                  </>
                ) : (
                  <>
                    <Download className="w-4.5 h-4.5" />
                    Download & Split Shorts
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'PROCESSING') && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center min-h-[350px] justify-center processing-glow shorts relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl animate-pulse" />
            <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-400 shadow-inner">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>

            <div className="flex flex-col gap-2.5 max-w-md w-full">
              <h3 className="text-xl font-extrabold text-[var(--text-white)] tracking-tight">YouTube Shorts Slicing Active</h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed px-4">
                Pulling high-quality video frames from YouTube, checking resolution metrics, and slicing them into clean short segments.
              </p>
              {activeJob.youtubeUrl && (
                <div className="mt-2 text-xs font-mono bg-[var(--bg-base)] p-3 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] text-left max-w-sm mx-auto w-full truncate">
                  <span className="text-purple-400 font-bold">YouTube URL: </span>
                  {activeJob.youtubeUrl}
                </div>
              )}
            </div>

            <div className="w-full max-w-md flex flex-col gap-2 mt-2">
              <div className="flex justify-between text-xs sm:text-sm font-bold tracking-wide">
                <span className="text-purple-400 uppercase tracking-widest text-[10px]">Processing Pipeline</span>
                <span className="text-[var(--text-white)]">{Math.round(activeJob.progress)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill shorts" style={{ width: `${activeJob.progress}%` }} />
              </div>
              <span className="text-[10px] text-[var(--text-secondary)] mt-0.5 tracking-wide">
                {activeJob.status === 'PENDING'
                  ? 'Waiting in local queue...'
                  : activeJob.progress < 50 ? 'Downloading video streams...' : 'Splitting into short clips...'}
              </span>
            </div>

            <button
              onClick={() => deleteJob(activeJob.id)}
              className="btn-danger btn mt-4"
            >
              Cancel YouTube Job
            </button>
          </div>
        )}

        {activeJob && activeJob.status === 'FAILED' && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center border-red-500/20 relative">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="flex flex-col gap-3.5 max-w-md w-full">
              <h3 className="text-lg font-bold text-[var(--text-white)] tracking-tight">Slicing Task Failed</h3>
              <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-500/5 border border-red-500/15 p-4 rounded-2xl max-h-[140px] overflow-y-auto text-left">
                {activeJob.error || 'Check that the YouTube link is public and accessible.'}
              </p>
            </div>

            <div className="flex gap-3.5 mt-2 w-full sm:w-auto">
              <button
                onClick={() => handleRetry(activeJob)}
                className="btn w-full py-4 rounded-2xl bg-purple-500 hover:bg-purple-400 text-black font-bold shadow-[0_0_15px_rgba(168,85,247,0.2)]"
              >
                Retry Downloading
              </button>
              <button
                onClick={() => {
                  setActiveJob(null);
                  setActiveJobId(null);
                  setActiveClipName(null);
                }}
                className="btn-secondary btn"
              >
                Start Another
              </button>
            </div>
          </div>
        )}

        {activeJob && activeJob.status === 'COMPLETED' && (
          <div className="glass-card p-6 flex flex-col gap-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl" />
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 gap-4">
              <div>
                <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Slicing Completed</span>
                <h3 className="text-lg font-bold text-[var(--text-white)] mt-1">Short Clips Compiled</h3>
              </div>
              <button
                onClick={() => {
                  setActiveJob(null);
                  setActiveJobId(null);
                  setActiveClipName(null);
                }}
                className="btn-ghost btn text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Create New Shorts
              </button>
            </div>

            {activeJob.youtubeUrl && (
              <div className="text-[11px] font-mono bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] w-full leading-relaxed truncate text-left">
                <span className="text-purple-400 font-bold">Source Link: </span>
                {activeJob.youtubeUrl}
              </div>
            )}

            <div className="flex justify-center w-full bg-[var(--bg-base)] rounded-2xl overflow-hidden border border-[var(--border-default)] aspect-video shadow-2xl relative">
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

            {activeJob.processedClips && (
              <div className="flex flex-col gap-4 text-left">
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-white)] tracking-tight">Generated Shorts Grid</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">Toggle clips to preview in the player or download to disk.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {activeJob.processedClips.map((clip, idx) => (
                    <div
                      key={clip}
                      onClick={() => setActiveClipName(clip)}
                      className={`p-3.5 rounded-2xl border transition-all duration-300 flex items-center justify-between cursor-pointer ${
                        activeClipName === clip
                          ? 'border-purple-500/40 bg-purple-500/5'
                          : 'border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-default)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className={`w-8.5 h-8.5 rounded-xl flex items-center justify-center ${
                          activeClipName === clip ? 'bg-purple-500 text-black shadow-lg shadow-purple-500/10' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)]'
                        }`}>
                          <Film className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-[var(--text-white)] truncate">Short Clip #{idx + 1}</span>
                          <span className="text-[9px] text-[var(--text-secondary)] font-mono font-bold uppercase tracking-wider">
                            Seg: {formatTime(idx * (activeJob.clipDuration || 30))} - {formatTime((idx + 1) * (activeJob.clipDuration || 30))}
                          </span>
                        </div>
                      </div>
                      <a
                        href={`/api/download/${activeJob.id}/${clip}`}
                        download={`${activeJob.id}_clip_${idx + 1}.mp4`}
                        onClick={(e) => e.stopPropagation()}
                        className="px-3.5 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] rounded-xl text-[10px] font-bold text-[var(--text-primary)] hover:text-[var(--text-white)] transition-all duration-300"
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

      <div className="flex flex-col gap-6">
        <div className="glass-card p-6 flex flex-col gap-4 max-h-[640px] overflow-y-auto relative">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3.5">
            <h3 className="font-bold text-[var(--text-white)] text-base tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-[var(--text-secondary)]" />
              Slices Log
            </h3>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-bold">
              {jobs.length}
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-secondary)] text-sm italic leading-relaxed">
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
                      : 'border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-card)] hover:border-[var(--border-default)]'
                  }`}
                >
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-mono text-[10px] text-[var(--text-secondary)] font-bold bg-[var(--bg-hover)] px-2 py-0.5 rounded-md truncate max-w-[120px]" title={job.id}>
                      #{job.id.substring(0, 8)}
                    </span>
                    <span className={`badge ${
                      job.status === 'COMPLETED' ? 'badge-completed' : job.status === 'FAILED' ? 'badge-failed' : 'badge-pending'
                    }`}>
                      <span className="badge-dot" />
                      {job.status}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="feature-tag feature-tag-shorts">Shorts Split</span>
                      {job.videoQuality && (
                        <span className="text-[9px] text-[var(--text-secondary)] font-mono font-bold">
                          {job.videoQuality}
                        </span>
                      )}
                      {job.orientation && (
                        <span className="text-[9px] text-[var(--text-secondary)] font-mono font-bold capitalize">
                          {job.orientation}
                        </span>
                      )}
                    </div>
                    {job.youtubeUrl && (
                      <p className="text-xs text-[var(--text-secondary)] line-clamp-1 italic mt-1 leading-relaxed truncate max-w-xs font-mono text-[10px]" title={job.youtubeUrl}>
                        {job.youtubeUrl}
                      </p>
                    )}
                    {job.status === 'COMPLETED' && job.processedClips && (
                      <span className="text-[10px] text-[var(--text-secondary)] font-bold mt-1">
                        &bull; {job.processedClips.length} clips generated
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] pt-1.5 border-t border-[var(--border-subtle)]">
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
                        View Clips &rarr;
                      </span>
                    )}
                  </div>

                  {job.status === 'PROCESSING' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-bold text-yellow-400 uppercase tracking-wider">
                        <span>Splitting Progress</span>
                        <span>{Math.round(job.progress)}%</span>
                      </div>
                      <div className="progress-bar h-1.5">
                        <div className="progress-fill shorts" style={{ width: `${job.progress}%` }} />
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
