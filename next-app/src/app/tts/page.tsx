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
  type?: 'MATTING' | 'SHORTS_SPLIT' | 'PLAYLIST_DOWNLOAD' | 'TEXT_TO_SPEECH';
  youtubeUrl?: string | null;
  processedClips?: string[];
  videoQuality?: string;
  ttsLanguage?: string;
  ttsSlow?: boolean;
  createdAt: string;
}

const LANGUAGES: Record<string, string> = {
  'hi': 'Hindi',
  'en': 'English',
  'bn': 'Bengali',
  'te': 'Telugu',
  'mr': 'Marathi',
  'ta': 'Tamil',
  'ur': 'Urdu',
  'gu': 'Gujarati',
  'kn': 'Kannada',
  'ml': 'Malayalam',
  'pa': 'Punjabi',
  'or': 'Odia',
  'as': 'Assamese',
  'mai': 'Maithili',
  'ne': 'Nepali',
  'fr': 'French',
  'de': 'German',
  'es': 'Spanish',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh-CN': 'Chinese (Simplified)',
};

export default function TextToSpeechPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(null);

  const [text, setText] = useState('');
  const [language, setLanguage] = useState('hi');
  const [slow, setSlow] = useState(false);
  const [generating, setGenerating] = useState(false);

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
        const ttsJobs = data.filter(j => j.type === 'TEXT_TO_SPEECH');
        setJobs(ttsJobs);
        const runningJob = ttsJobs.find(
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

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text || text.trim() === '') return;

    setGenerating(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language, slow }),
      });
      if (res.ok) {
        const job = await res.json();
        setActiveJobId(job.id);
        setActiveJob(job);
        setText('');
        fetchJobs();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to start TTS generation.');
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to TTS API.');
    } finally {
      setGenerating(false);
    }
  };

  const deleteJob = async (jobId: string) => {
    if (!confirm('Delete this TTS task?')) return;
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
    setGenerating(true);
    setActiveJob(null);
    setActiveJobId(null);
  };

  const exampleTexts = [
    { label: 'Hindi Greeting', text: 'नमस्ते, आप कैसे हैं? मुझे आपसे मिलकर बहुत खुशी हुई।', lang: 'hi' },
    { label: 'English Intro', text: 'Welcome to our channel. Today we are going to explore something amazing.', lang: 'en' },
    { label: 'Hindi Story', text: 'एक बार की बात है, एक छोटा सा गाँव था जहाँ सभी लोग मिलजुल कर रहते थे।', lang: 'hi' },
  ];

  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 flex flex-col gap-6">
        {!activeJob && (
          <div className="glass-card p-6 flex flex-col gap-6 text-left border-white/5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl"></div>
            <div>
              <span className="text-[10px] text-violet-400 font-extrabold uppercase tracking-widest">Audio Synthesis</span>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">Text to Speech Generator</h2>
              <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
                Convert text into natural-sounding speech. Supports Hindi, English, and 20+ Indian & international languages.
              </p>
            </div>

            <form onSubmit={handleGenerate} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Enter Text</label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type or paste your text here... Supports Hindi (देवनागरी) and other languages."
                  rows={6}
                  className="w-full px-4 py-3.5 bg-zinc-950 border border-white/10 rounded-2xl text-sm text-white placeholder-zinc-700 focus:outline-none focus:border-violet-500 focus:shadow-[0_0_15px_rgba(139,92,246,0.1)] transition-all leading-relaxed resize-none font-sans"
                  disabled={generating}
                  required
                />
                <span className="text-[10px] text-zinc-600 text-right">{text.length} / 5000 characters</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-3 bg-zinc-950 border border-white/10 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-violet-500 transition-colors"
                  >
                    {Object.entries(LANGUAGES).map(([code, name]) => (
                      <option key={code} value={code}>{name} ({code})</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Speed</label>
                  <div className="flex gap-3 h-full items-end pb-3">
                    <label className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      !slow ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' : 'bg-zinc-950 border-white/10 text-zinc-400 hover:border-white/20'
                    }`}>
                      <input type="radio" name="speed" checked={!slow} onChange={() => setSlow(false)} className="sr-only" />
                      Normal
                    </label>
                    <label className={`flex-1 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-xs font-bold cursor-pointer transition-all ${
                      slow ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' : 'bg-zinc-950 border-white/10 text-zinc-400 hover:border-white/20'
                    }`}>
                      <input type="radio" name="speed" checked={slow} onChange={() => setSlow(true)} className="sr-only" />
                      Slow
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-1 border-t border-white/[0.02]">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Try Examples (Click to fill)</span>
                <div className="flex flex-col sm:flex-row gap-2">
                  {exampleTexts.map((ex, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => { setText(ex.text); setLanguage(ex.lang); }}
                      className="text-left text-xs text-zinc-400 hover:text-white bg-zinc-900/30 hover:bg-zinc-900/60 border border-white/5 hover:border-white/10 px-3.5 py-2.5 rounded-xl transition-all duration-200 truncate cursor-pointer flex-1 active:scale-[0.98]"
                    >
                      <span className="text-violet-400 font-bold block text-[10px] mb-0.5">{ex.label}</span>
                      {ex.text.substring(0, 50)}...
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={generating || !text.trim()}
                className={`w-full py-4 rounded-2xl text-black font-extrabold text-xs uppercase tracking-widest transition-all duration-300 shadow-[0_0_20px_rgba(139,92,246,0.15)] flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
                  generating || !text.trim()
                    ? 'bg-zinc-800 text-zinc-500 shadow-none cursor-not-allowed border border-white/5'
                    : 'bg-violet-500 hover:bg-violet-400 hover:shadow-[0_0_30px_rgba(139,92,246,0.35)]'
                }`}
              >
                {generating ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating Speech...
                  </>
                ) : (
                  <>
                    <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Generate Speech
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {activeJob && (activeJob.status === 'PENDING' || activeJob.status === 'PROCESSING') && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center min-h-[350px] justify-center processing-glow relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl animate-pulse"></div>
            <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/25 flex items-center justify-center text-violet-400 shadow-inner">
              <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="flex flex-col gap-2.5 max-w-md w-full">
              <h3 className="text-xl font-extrabold text-white tracking-tight">Generating Speech</h3>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed px-4">
                Converting text to speech using Google TTS engine.
              </p>
              <div className="mt-2 text-xs font-mono bg-zinc-950 p-3 rounded-xl border border-white/5 text-zinc-400 text-left max-w-sm mx-auto w-full">
                <span className="text-violet-400 font-bold">Language: </span>
                {LANGUAGES[activeJob.ttsLanguage || 'hi'] || activeJob.ttsLanguage}
                {activeJob.ttsSlow ? ' (Slow)' : ''}
              </div>
            </div>
            <div className="w-full max-w-md flex flex-col gap-2 mt-2">
              <div className="flex justify-between text-xs sm:text-sm font-bold tracking-wide">
                <span className="text-violet-400 uppercase tracking-widest text-[10px]">Processing</span>
                <span className="text-white">{Math.round(activeJob.progress)}%</span>
              </div>
              <div className="w-full bg-zinc-950 rounded-full h-2.5 overflow-hidden border border-white/5 shadow-inner">
                <div className="bg-violet-500 h-full rounded-full transition-all duration-300 progress-animated" style={{ width: `${activeJob.progress}%` }} />
              </div>
            </div>
            <button onClick={() => deleteJob(activeJob.id)} className="px-4 py-2 rounded-xl border border-red-500/25 bg-red-500/5 hover:bg-red-500/15 text-red-400 text-xs font-bold mt-4 transition-all duration-300 active:scale-95 cursor-pointer">
              Cancel
            </button>
          </div>
        )}

        {activeJob && activeJob.status === 'FAILED' && (
          <div className="glass-card p-8 flex flex-col gap-6 items-center text-center border-red-500/20 relative">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex flex-col gap-3.5 max-w-md w-full">
              <h3 className="text-lg font-bold text-white tracking-tight">Generation Failed</h3>
              <p className="text-xs text-red-400/90 leading-relaxed font-mono bg-red-500/5 border border-red-500/15 p-4 rounded-2xl max-h-[140px] overflow-y-auto text-left">
                {activeJob.error || 'An error occurred during speech generation.'}
              </p>
            </div>
            <div className="flex gap-3.5 mt-2 w-full sm:w-auto">
              <button onClick={() => handleRetry(activeJob)} className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-violet-500 text-black font-bold hover:bg-violet-400 transition-colors text-xs cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.2)]">
                Retry
              </button>
              <button onClick={() => { setActiveJob(null); setActiveJobId(null); }} className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-zinc-900 border border-white/10 hover:bg-zinc-800 text-white font-semibold transition-colors text-xs cursor-pointer">
                Start Again
              </button>
            </div>
          </div>
        )}

        {activeJob && activeJob.status === 'COMPLETED' && (
          <div className="glass-card p-6 flex flex-col gap-6 relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl"></div>
            <div className="flex items-center justify-between border-b border-white/5 pb-4 gap-4">
              <div>
                <span className="text-[10px] text-violet-400 font-bold uppercase tracking-widest">Speech Ready</span>
                <h3 className="text-lg font-bold text-white mt-1">Audio Generated</h3>
              </div>
              <button onClick={() => { setActiveJob(null); setActiveJobId(null); }} className="text-xs text-zinc-400 hover:text-white transition-all bg-white/5 border border-white/10 px-3.5 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 cursor-pointer hover:bg-white/10">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Generate More
              </button>
            </div>

            <div className="flex items-center gap-3 text-sm text-zinc-400 bg-zinc-950/80 p-3 rounded-xl border border-white/5">
              <span className="text-violet-400 font-bold text-[10px] uppercase tracking-widest">Language:</span>
              <span className="font-mono text-xs">{LANGUAGES[activeJob.ttsLanguage || 'hi'] || activeJob.ttsLanguage}</span>
              {activeJob.ttsSlow && <span className="text-[10px] text-zinc-500 font-bold uppercase">(Slow Speed)</span>}
            </div>

            {activeJob.processedVideo && (
              <div className="flex justify-center w-full bg-zinc-950 rounded-2xl overflow-hidden border border-white/10 p-6 shadow-2xl">
                <audio
                  key={`${activeJob.id}-${Date.now()}`}
                  src={`/api/tts-download/${activeJob.id}?t=${Date.now()}`}
                  controls
                  className="w-full max-w-lg"
                  autoPlay
                />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`/api/tts-download/${activeJob.id}?t=${Date.now()}`}
                download={`tts_${activeJob.id}.mp3`}
                className="flex-1 sm:flex-initial px-6 py-3 rounded-xl bg-violet-500 text-black font-bold hover:bg-violet-400 transition-colors text-xs text-center cursor-pointer shadow-[0_0_15px_rgba(139,92,246,0.2)] flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download MP3
              </a>
            </div>

            <div className="text-[10px] text-zinc-600 text-center">
              Generated using Google Text-to-Speech engine
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="glass-card p-6 flex flex-col gap-4 max-h-[640px] overflow-y-auto border-white/5 relative">
          <div className="flex items-center justify-between border-b border-white/5 pb-3.5">
            <h3 className="font-bold text-white text-base tracking-tight flex items-center gap-2">
              <svg className="w-4 h-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Generation History
            </h3>
            <span className="px-2.5 py-1 rounded-lg bg-white/5 text-zinc-400 text-xs font-bold">{jobs.length}</span>
          </div>
          {jobs.length === 0 ? (
            <div className="text-center py-16 text-zinc-500 text-sm italic leading-relaxed">No TTS jobs yet. <br />Enter text on the left to begin.</div>
          ) : (
            <div className="flex flex-col gap-3">
              {jobs.map((job) => (
                <div key={job.id} onClick={() => { setActiveJobId(job.id); setActiveJob(job); }} className={`p-4 rounded-2xl border transition-all duration-300 cursor-pointer text-left flex flex-col gap-3 ${
                  activeJobId === job.id ? 'border-violet-500/40 bg-violet-500/5' : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10'
                }`}>
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-mono text-[10px] text-zinc-400 font-bold bg-white/5 px-2 py-0.5 rounded-md truncate max-w-[120px]" title={job.id}>#{job.id.substring(0, 8)}</span>
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide border ${
                      job.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : job.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20 animate-pulse'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${job.status === 'COMPLETED' ? 'bg-emerald-400' : job.status === 'FAILED' ? 'bg-red-400' : 'bg-yellow-400'}`}></span>
                      {job.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400">TTS</span>
                    <span className="text-[9px] text-zinc-500 font-mono font-bold">{LANGUAGES[job.ttsLanguage || 'hi'] || job.ttsLanguage}</span>
                    {job.ttsSlow && <span className="text-[9px] text-zinc-500 font-mono">Slow</span>}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1.5 border-t border-white/[0.02]">
                    <span>{new Date(job.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {job.status === 'COMPLETED' && <span className="text-violet-400 font-bold flex items-center gap-0.5">Listen →</span>}
                  </div>
                  {job.status === 'PROCESSING' && (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] font-bold text-yellow-400 uppercase tracking-wider"><span>Progress</span><span>{Math.round(job.progress)}%</span></div>
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
