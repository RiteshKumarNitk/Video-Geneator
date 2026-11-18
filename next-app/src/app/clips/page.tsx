'use client';

import { useEffect, useRef, useState } from 'react';
import { Upload, Sparkles, Download, Scissors, Loader2, Play } from 'lucide-react';

type Suggestion = { id: string; start: number; end: number; title: string; reason: string; score: number; text: string };
type ClipJob = { id: string; status: string; progress: number; error?: string | null; originalVideo?: string | null; transcript?: { start: number; end: number; text: string }[]; suggestions?: Suggestion[]; renderedClips?: { id: string; title: string }[] };

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function ClipsPage() {
  const [job, setJob] = useState<ClipJob | null>(null);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!job || (job.status !== 'PENDING' && job.status !== 'PROCESSING')) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/job/${job.id}?t=${Date.now()}`);
      if (response.ok) {
        const next = await response.json();
        setJob(next);
        if (next.suggestions?.length && !selected) setSelected(next.suggestions[0]);
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [job?.id, job?.status, selected]);

  const upload = async (file: File) => {
    setBusy(true);
    const data = new FormData(); data.append('file', file);
    const response = await fetch('/api/clips/upload', { method: 'POST', body: data });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return alert(result.error || 'Upload failed.');
    setJob(result);
  };

  const renderClip = async () => {
    if (!job || !selected) return;
    setBusy(true);
    const response = await fetch('/api/clips/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: job.id, ...selected, title: 'AI highlight' }) });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return alert(result.error || 'Could not render clip.');
    setJob(result);
  };

  return <main className="page-container max-w-6xl">
    <div className="mb-8 flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Phase 1 MVP</span>
      <h1 className="text-4xl font-black tracking-tight text-[var(--text-white)]">AI Clip Studio</h1>
      <p className="max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">Upload a long-form video. Local Whisper transcription finds the strongest spoken moments, then you can review and export them as vertical clips.</p>
    </div>
    {!job && <button onClick={() => inputRef.current?.click()} className="glass-card flex min-h-[300px] w-full flex-col items-center justify-center gap-5 border-2 border-dashed border-[var(--border-default)] p-10 text-center hover:border-emerald-500/50">
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400"><Upload /></span>
      <span><strong className="block text-lg text-[var(--text-white)]">Upload a long video</strong><small className="text-[var(--text-secondary)]">MP4, MOV, WebM · local processing</small></span>
    </button>}
    {job && <div className="grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
      <section className="glass-card overflow-hidden">
        <div className="aspect-video bg-black">{job.originalVideo && <video controls className="h-full w-full" src={`/api/original/${job.id}`} />}</div>
        {job.status !== 'COMPLETED' && <div className="p-6"><div className="mb-2 flex justify-between text-xs"><span className="text-emerald-400">{job.status === 'PENDING' ? 'Queued' : 'Transcribing locally'}</span><span>{Math.round(job.progress || 0)}%</span></div><div className="progress-bar"><div className="progress-fill" style={{ width: `${job.progress || 0}%` }} /></div>{job.error && <p className="mt-4 text-sm text-red-400">{job.error}</p>}</div>}
        {job.status === 'COMPLETED' && selected && <div className="border-t border-[var(--border-default)] p-5"><div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-400"><Scissors size={14} /> Review selection</div><div className="grid grid-cols-2 gap-3"><label className="text-xs text-[var(--text-secondary)]">Start<input className="input mt-1" type="number" step="0.1" value={selected.start} onChange={e => setSelected({ ...selected, start: Number(e.target.value) })} /></label><label className="text-xs text-[var(--text-secondary)]">End<input className="input mt-1" type="number" step="0.1" value={selected.end} onChange={e => setSelected({ ...selected, end: Number(e.target.value) })} /></label></div><button disabled={busy} onClick={renderClip} className="btn btn-primary mt-4 w-full">{busy ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />} Render vertical clip</button></div>}
      </section>
      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2"><Sparkles size={17} className="text-emerald-400" /><h2 className="font-bold text-[var(--text-white)]">Suggested highlights</h2></div>
        {job.status !== 'COMPLETED' && <div className="glass-card flex items-center gap-3 p-5 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin text-emerald-400" />Finding hooks in the transcript…</div>}
        {(job.suggestions || []).map(s => <button key={s.id} onClick={() => setSelected(s)} className={`glass-card p-4 text-left transition ${selected?.id === s.id ? 'border-emerald-400/60 bg-emerald-500/5' : ''}`}><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-emerald-400">{formatTime(s.start)} – {formatTime(s.end)}</span><span className="badge badge-completed">{s.score} score</span></div><p className="text-sm font-semibold text-[var(--text-white)]">{s.title}</p><p className="mt-2 text-xs text-[var(--text-secondary)]">{s.reason}</p></button>)}
        {(job.renderedClips || []).map(clip => <a key={clip.id} className="btn btn-secondary" href={`/api/clips/download/${job.id}/${clip.id}`}><Play size={14} /> Download {clip.title}</a>)}
      </section>
    </div>}
  </main>;
}
