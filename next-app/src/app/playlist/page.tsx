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
  type?: 'MATTING' | 'SHORTS_SPLIT' | 'PLAYLIST_DOWNLOAD' | 'TEXT_TO_SPEECH';
  youtubeUrl?: string | null;
  processedClips?: string[];
  videoQuality?: string;
  createdAt: string;
}

export default function PlaylistDownloader() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  const [playlistUrl, setPlaylistUrl] = useState('');
  const [videoQuality, setVideoQuality] = useState('best');
  const [maxVideos, setMaxVideos] = useState(10);

  const [downloading, setDownloading] = useState(false);

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
        const playlistJobs = data.filter(j => j.type === 'PLAYLIST_DOWNLOAD');
        setJobs(playlistJobs);
        const runningJob = playlistJobs.find(
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

  const handleDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistUrl || playlistUrl.trim() === '') return;

    setDownloading(true);
    try {
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlistUrl, videoQuality, maxVideos }),
      });
      if (res.ok) {
        const job = await res.json();
        setActiveJobId(job.id);
        setActiveJob(job);
        setPlaylistUrl('');
        fetchJobs();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to start playlist download.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to playlist downloader API.');
    } finally {
      setDownloading(false);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Delete this playlist download task?')) return;
    try {
      const res = await fetch(`/api/job/${jobId}`, { method: 'DELETE' });
      if (res.ok) {
        if (activeJobId === jobId) {
          setActiveJobId(null);
          setActiveJob(null);
        }
        fetchJobs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetry = async (job: Job) => {
    setDownloading(true);
    try {
      const res = await fetch('/api/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playlistUrl: job.youtubeUrl,
          videoQuality: job.videoQuality || 'best',
          maxVideos,
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
      setDownloading(false);
    }
  };

  const examplePlaylists = [
    { name: "Lo-Fi Beats Mix", url: "https://youtube.com/playlist?list=PLMC9JlvZVncpUTORVWBcMy9IdBNd8Fth6" },
    { name: "Nature Relaxation", url: "https://youtube.com/playlist?list=PLYwfnL1MlmIbzV0eB4fDH6kJMi95S4MK8" },
  ];

  return (
    <div className="page-container grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 flex flex-col gap-6">
        {!activeJob && (
          <div className="glass-card p-6 flex flex-col gap-6 text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl" />
            <div>
              <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-widest">Batch Downloader</span>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--text-white)] tracking-tight mt-1">YouTube Playlist Downloader</h2>
              <p className="text-xs text-[var(--text-secondary)] mt-1.5 leading-relaxed">
                Download an entire YouTube playlist in batch with your preferred quality. Supports up to 50 videos per playlist.
              </p>
            </div>

            <form onSubmit={handleDownload} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Playlist URL</label>
                <input
                  type="url"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder="https://youtube.com/playlist?list=..."
                  className="input"
                  disabled={downloading}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Video Quality</label>
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
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Max Videos</label>
                  <select
                    value={maxVideos}
                    onChange={(e) => setMaxVideos(parseInt(e.target.value))}
                    className="select"
                  >
                    <option value={5}>5 Videos</option>
                    <option value={10}>10 Videos</option>
                    <option value={15}>15 Videos</option>
                    <option value={20}>20 Videos</option>
                    <option value={30}>30 Videos</option>
                    <option value={50}>50 Videos</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1 border-t border-[var(--border-subtle)]">
                <span className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">Example Playlists (Click to paste)</span>
                <div className="flex flex-col sm:flex-row gap-2">
                  {examplePlaylists.map((pl, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setPlaylistUrl(pl.url)}
                      className="text-left text-xs text-[var(--text-secondary)] hover:text-[var(--text-white)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-[var(--border-default)] px-3.5 py-2.5 rounded-xl transition-all duration-200 truncate cursor-pointer flex-1 active:scale-[0.98]"
                    >
                      <span className="text-emerald-400 font-bold block text-[10px] mb-0.5">{pl.name}</span>
                      {pl.url}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={downloading || !playlistUrl.trim()}
                className={`btn w-full py-4 rounded-2xl ${
                  downloading || !playlistUrl.trim()
                    ? 'bg-[var(--bg-hover)] text-[var(--text-secondary)] shadow-none cursor-not-allowed border border-[var(--border-default)]'
                    : 'btn-primary w-full py-4 rounded-2xl'
                }`}
              >
                {downloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                    Queuing Batch Download...
                  </>
                ) : (
                  <>
                    <Download className="w-4.5 h-4.5" />
                    Download Playlist
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'PROCESSING') && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center min-h-[350px] justify-center processing-glow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" />
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-inner">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
            <div className="flex flex-col gap-2.5 max-w-md w-full">
              <h3 className="text-xl font-extrabold text-[var(--text-white)] tracking-tight">Downloading Playlist</h3>
              <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed px-4">
                Fetching playlist videos and downloading each one at the selected quality.
              </p>
              {activeJob.youtubeUrl && (
                <div className="mt-2 text-xs font-mono bg-[var(--bg-base)] p-3 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] text-left max-w-sm mx-auto w-full truncate">
                  <span className="text-emerald-400 font-bold">Playlist: </span>
                  {activeJob.youtubeUrl}
                </div>
              )}
            </div>
            <div className="w-full max-w-md flex flex-col gap-2 mt-2">
              <div className="flex justify-between text-xs sm:text-sm font-bold tracking-wide">
                <span className="text-emerald-400 uppercase tracking-widest text-[10px]">Download Progress</span>
                <span className="text-[var(--text-white)]">{Math.round(activeJob.progress)}%</span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill playlist" style={{ width: `${activeJob.progress}%` }} />
              </div>
            </div>
            <button onClick={() => deleteJob(activeJob.id)} className="btn-danger btn mt-4">
              Cancel Download
            </button>
          </div>
        )}

        {activeJob && activeJob.status === 'FAILED' && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center border-red-500/20 relative">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="flex flex-col gap-3.5 max-w-md w-full">
              <h3 className="text-lg font-bold text-[var(--text-white)] tracking-tight">Download Failed</h3>
              <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-500/5 border border-red-500/15 p-4 rounded-2xl max-h-[140px] overflow-y-auto text-left">
                {activeJob.error || 'Check the playlist URL and try again.'}
              </p>
            </div>
            <div className="flex gap-3.5 mt-2 w-full sm:w-auto">
              <button onClick={() => handleRetry(activeJob)} className="btn-primary btn">
                Retry Download
              </button>
              <button onClick={() => { setActiveJob(null); setActiveJobId(null); }} className="btn-secondary btn">
                Start Another
              </button>
            </div>
          </div>
        )}

        {activeJob && activeJob.status === 'COMPLETED' && (
          <div className="glass-card p-6 flex flex-col gap-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl" />
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4 gap-4">
              <div>
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Download Complete</span>
                <h3 className="text-lg font-bold text-[var(--text-white)] mt-1">Playlist Videos Ready</h3>
              </div>
              <button onClick={() => { setActiveJob(null); setActiveJobId(null); }} className="btn-ghost btn text-xs">
                <ArrowLeft className="w-3.5 h-3.5" />
                Download More
              </button>
            </div>
            {activeJob.youtubeUrl && (
              <div className="text-[11px] font-mono bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-default)] text-[var(--text-secondary)] w-full leading-relaxed truncate text-left">
                <span className="text-emerald-400 font-bold">Source Playlist: </span>
                {activeJob.youtubeUrl}
              </div>
            )}
            {activeJob.processedClips && activeJob.processedClips.length > 0 && (
              <div className="flex flex-col gap-4 text-left">
                <div>
                  <h4 className="text-sm font-bold text-[var(--text-white)] tracking-tight">Downloaded Videos</h4>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">{activeJob.processedClips.length} videos downloaded successfully.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {activeJob.processedClips.map((clip, idx) => (
                    <div key={clip} className="p-3.5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] flex items-center justify-between">
                      <div className="flex items-center gap-3 truncate">
                        <div className="w-8.5 h-8.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <Film className="w-4.5 h-4.5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-[var(--text-white)] truncate">Video #{idx + 1}</span>
                          <span className="text-[9px] text-[var(--text-secondary)] font-mono truncate">{clip}</span>
                        </div>
                      </div>
                      <a href={`/api/download/${activeJob.id}/${clip}`} download={clip} onClick={(e) => e.stopPropagation()} className="px-3.5 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] border border-[var(--border-default)] rounded-xl text-[10px] font-bold text-[var(--text-primary)] hover:text-[var(--text-white)] transition-all duration-300">
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
              Download History
            </h3>
            <span className="px-2.5 py-1 rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] text-xs font-bold">{jobs.length}</span>
          </div>
          {jobs.length === 0 ? (
            <div className="text-center py-16 text-[var(--text-secondary)] text-sm italic leading-relaxed">No download jobs found. <br />Submit a playlist URL to begin.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {jobs.map((job) => (
                <div key={job.id} onClick={() => { setActiveJobId(job.id); setActiveJob(job); }} className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer text-left flex flex-col gap-3 ${
                  activeJobId === job.id ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-[var(--bg-card)] hover:border-[var(--border-default)]'
                }`}>
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-mono text-[10px] text-[var(--text-secondary)] font-bold bg-[var(--bg-hover)] px-2 py-0.5 rounded-md truncate max-w-[120px]" title={job.id}>#{job.id.substring(0, 8)}</span>
                    <span className={`badge ${job.status === 'COMPLETED' ? 'badge-completed' : job.status === 'FAILED' ? 'badge-failed' : 'badge-pending'}`}>
                      <span className="badge-dot" />
                      {job.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="feature-tag feature-tag-playlist">Playlist</span>
                    {job.videoQuality && <span className="text-[9px] text-[var(--text-secondary)] font-mono font-bold">{job.videoQuality}</span>}
                  </div>
                  {job.youtubeUrl && <p className="text-xs text-[var(--text-secondary)] line-clamp-1 italic mt-1 leading-relaxed truncate max-w-xs font-mono text-[10px]">{job.youtubeUrl}</p>}
                  {job.status === 'COMPLETED' && job.processedClips && <span className="text-[10px] text-[var(--text-secondary)] font-bold mt-1">&bull; {job.processedClips.length} videos downloaded</span>}
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)] pt-1.5 border-t border-[var(--border-subtle)]">
                    <span>{new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {job.status === 'PROCESSING' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-bold text-yellow-400 uppercase tracking-wider"><span>Progress</span><span>{Math.round(job.progress)}%</span></div>
                      <div className="progress-bar h-1.5">
                        <div className="progress-fill playlist" style={{ width: `${job.progress}%` }} />
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
