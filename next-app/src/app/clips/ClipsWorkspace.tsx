'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Library } from '@/lib/clips/model';
import Editor from './Editor';
import Studio from './Studio';
import { SignOut } from './Account';
import { Dashboard, Content, navigation, type View } from './StudioDashboard';
import { Clapperboard, Upload, Search } from 'lucide-react';

async function copyPath(value: string) {
  if (navigator.clipboard) return navigator.clipboard.writeText(value);
  const field = document.createElement('textarea');
  field.value = value;
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand('copy')) throw Error('Clipboard unavailable.');
  } finally {
    field.remove();
  }
}

async function action(name: string, data: object) {
  const res = await fetch('/api/clips/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: name, ...data }),
  });
  const result = await res.json();
  if (!res.ok) throw Error(result.error);
  return result as { id: string };
}
export default function ClipsPage({ email }: { email: string }) {
  const [view, setView] = useState<View>('dashboard');
  const [editorVisited, visitEditor] = useState(false);
  const [query, search] = useState('');
  const editorPanel = useRef<HTMLDivElement>(null);
  const [lib, setLib] = useState<Library>({ sources: [], clips: [], exports: [], uploads: [] });
  const [sourceId, selectSource] = useState(''),
    [clipId, selectClip] = useState('');
  const [url, setUrl] = useState(''),
    [authorized, confirm] = useState(false),
    [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [progress, setProgress] = useState<number | null>(null);
  const [copied, setCopied] = useState('');
  const upload = useRef<HTMLInputElement>(null),
    retryId = useRef('');
  const seq = useRef(0);
  const refresh = useCallback(async () => {
    const num = ++seq.current;
    const res = await fetch('/api/clips/library', { cache: 'no-store' });
    if (!res.ok) throw Error('Could not load the source library.');
    const library = await res.json();
    if (num === seq.current) setLib(library);
  }, []);
  useEffect(() => {
    const read = () => {
      const hash = new URLSearchParams(location.hash.slice(1));
      selectSource(hash.get('source') || '');
      selectClip(hash.get('clip') || '');
      const tab = hash.get('view');
      const next =
        navigation.find((n) => n.id === tab)?.id ??
        (hash.has('clip') ? 'editor' : hash.has('source') ? 'sources' : 'dashboard');
      setView(next);
      if (next === 'editor') visitEditor(true);
    };
    read();
    window.addEventListener('hashchange', read);
    const poll = () => refresh().catch((e) => setError(e.message));
    poll();
    window.addEventListener('focus', poll);
    return () => {
      window.removeEventListener('focus', poll);
      window.removeEventListener('hashchange', read);
    };
  }, [refresh]);
  const pending =
    busy ||
    lib.exports.some((e) => ['queued', 'processing'].includes(e.status)) ||
    lib.sources.some(
      (s) =>
        ['queued', 'processing', 'uploading'].includes(s.status) ||
        (!!s.analysis && !['complete', 'failed'].includes(s.analysis)),
    );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => refresh().catch((e) => setError(e.message)), 1500);
    return () => clearInterval(timer);
  }, [pending, refresh]);
  const navigate = (next: View, source = sourceId, clip = clipId) => {
    const hash = new URLSearchParams({ view: next });
    if (source) hash.set('source', source);
    if (clip) hash.set('clip', clip);
    location.hash = hash.toString();
    setView(next);
    if (next === 'editor') visitEditor(true);
    selectSource(source);
    selectClip(clip);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (view !== 'editor') editorPanel.current?.querySelectorAll('video').forEach((v) => v.pause());
  }, [view]);
  const open = (source: string, clip = '') => navigate(clip ? 'editor' : 'sources', source, clip);
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.');
      await refresh().catch(() => {});
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const run = (name: string, data: object) =>
    work(async () => {
      await action(name, data);
    });
  const click = (fn: () => Promise<void>) => {
    void work(fn).catch(() => {});
  };
  const source = lib.sources.find((s) => s.id === sourceId) || (!sourceId ? lib.sources[0] : undefined);
  const clips = lib.clips.filter((c) => c.source === source?.id);
  const clip = clips.find((c) => c.id === clipId) || (!clipId ? clips[0] : undefined);
  const choose = (id = '') => {
    retryId.current = id;
    if (upload.current) {
      upload.current.value = '';
      upload.current.click();
    }
  };
  return (
    <div className="creator-shell clips">
      <aside className="creator-sidebar">
        <div className="creator-brand">
          <span>
            <Clapperboard size={24} />
          </span>{' '}
          Chroma Studio
        </div>
        <nav aria-label="Studio navigation">
          {navigation.map(({ id, label, icon: Icon }) => (
            <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="creator-account">
          <SignOut email={email} />
        </div>
      </aside>
      <div className="creator-main">
        <div className="creator-tools">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate('content');
            }}
          >
            <Search size={17} />
            <input
              aria-label="Search clips"
              placeholder="Search your clips"
              value={query}
              onChange={(e) => {
                search(e.target.value);
                if (view !== 'content') navigate('content');
              }}
            />
          </form>
          <button
            className="creator-create"
            disabled={busy}
            onClick={() => {
              navigate('sources');
              choose();
            }}
          >
            <Upload size={16} /> Upload video
          </button>
        </div>
        <h1>{view === 'dashboard' ? 'Channel dashboard' : navigation.find((n) => n.id === view)?.label}</h1>
        {view === 'dashboard' && (
          <Dashboard
            library={lib}
            source={source}
            busy={busy}
            selectSource={(id) => navigate('dashboard', id, '')}
            navigate={navigate}
            open={open}
            generate={() =>
              click(async () => {
                if (!source) return;
                const r = await fetch('/api/clips/studio', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'batch', id: source.id }),
                });
                const data = await r.json();
                if (!r.ok) throw Error(data.error);
                navigate('ai', source.id, '');
              })
            }
          />
        )}
        {view === 'content' && <Content library={lib} query={query} open={open} />}
        <div hidden={view !== 'sources'}>
          <section className="glass-card clip-import">
            <h2>Source library</h2>
            <div className="clip-row">
              <button disabled={busy} className="btn btn-primary" onClick={() => choose()}>
                Upload video
              </button>
              <input
                hidden
                ref={upload}
                type="file"
                accept=".mp4,.mov,.m4v,.webm,.mkv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  click(async () => {
                    let id = retryId.current;
                    if (!id) id = (await action('source', { filename: file.name })).id;
                    else {
                      const prev = lib.sources.find((s) => s.id === id)!;
                      if (file.name !== prev.filename)
                        throw Error(
                          'Choose the same file, ' + prev.filename + ', or upload it as a new source.',
                        );
                      if (prev.status === 'failed') await action('retrySource', { id });
                    }
                    open(id);
                    setProgress(0);
                    try {
                      await new Promise<void>((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('PUT', '/api/clips/source/' + id);
                        xhr.upload.onprogress = (e) => {
                          if (e.lengthComputable) setProgress(Math.round((100 * e.loaded) / e.total));
                        };
                        xhr.onload = () =>
                          xhr.status === 200
                            ? resolve()
                            : reject(Error('Upload failed. Retry from the source library.'));
                        xhr.onerror = () =>
                          reject(Error('Upload interrupted. Retry from the source library.'));
                        xhr.send(file);
                      });
                    } finally {
                      setProgress(null);
                    }
                  });
                }}
              />
              {lib.uploads.length > 0 && (
                <select
                  aria-label="Use a saved upload"
                  disabled={busy}
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    click(async () => {
                      await action('existing', { id });
                      open(id);
                    });
                  }}
                >
                  <option value="">Use a saved upload…</option>
                  {lib.uploads.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.filename}
                    </option>
                  ))}
                </select>
              )}
              {progress !== null && <span role="status">Uploading {progress}%</span>}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                click(async () => {
                  const r = await action('source', { url, authorized });
                  open(r.id);
                  setUrl('');
                  confirm(false);
                });
              }}
            >
              <div className="clip-row">
                <input
                  aria-label="YouTube URL"
                  className="input"
                  type="url"
                  placeholder="YouTube video URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <button className="btn btn-secondary" disabled={busy || !authorized || !url}>
                  Import URL
                </button>
              </div>
              <label className="clip-toggle">
                <input type="checkbox" checked={authorized} onChange={(e) => confirm(e.target.checked)} />I
                have permission to download this video.
              </label>
            </form>
            {lib.sources.length > 0 && (
              <label>
                Saved source
                <select value={source?.id || ''} onChange={(e) => open(e.target.value)}>
                  {lib.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.filename} · {s.status}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {source && (
              <div className="clip-source">
                <strong>{source.filename}</strong>
                <span> {source.status}</span>
                <small>App’s saved path in shared storage</small>
                <code>{source.path}</code>
                <div className="clip-row">
                  <button
                    className="clip-link"
                    onClick={() =>
                      copyPath(source.path)
                        .then(() => setCopied(source.path))
                        .catch(() => setError('Clipboard unavailable. Select the saved path to copy it.'))
                    }
                  >
                    {copied === source.path ? 'Copied' : 'Copy Path'}
                  </button>
                  {source.status === 'ready' && (
                    <a
                      className="clip-link"
                      target="_blank"
                      rel="noreferrer"
                      href={'/api/clips/source/' + source.id}
                    >
                      Open Source
                    </a>
                  )}
                  {['processing', 'queued', 'uploading'].includes(source.status) && (
                    <>
                      <progress aria-label="Import progress" max="100" value={source.progress} />
                      {source.progress !== undefined && (
                        <small>
                          {source.track} · {source.progress}%
                        </small>
                      )}
                    </>
                  )}
                  {['failed', 'waiting'].includes(source.status) && (
                    <button
                      className="clip-link"
                      disabled={busy}
                      onClick={() => {
                        if (!source.url && source.path.includes(source.id)) choose(source.id);
                        else
                          click(async () => {
                            await action('retrySource', { id: source.id });
                          });
                      }}
                    >
                      {source.status === 'waiting' ? 'Choose file' : 'Retry import'}
                    </button>
                  )}
                </div>
                {source.error && <p role="alert">{source.error}</p>}
              </div>
            )}
          </section>
          {source?.status === 'ready' && (
            <div className="creator-actions">
              <button onClick={() => navigate('ai', source.id, '')}>Open AI workspace</button>
              <button onClick={() => navigate('editor', source.id, '')}>Open editor</button>
            </div>
          )}
        </div>
        <div hidden={view !== 'ai'}>
          <label className="creator-source">
            Source video
            <select value={source?.id || ''} onChange={(e) => navigate('ai', e.target.value, '')}>
              <option disabled value="">
                Choose a source
              </option>
              {lib.sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.filename} · {s.status}
                </option>
              ))}
            </select>
          </label>
          <Studio lib={lib} source={source} refresh={refresh} open={open} />
        </div>
        {error && (
          <p role="alert" className="clip-error">
            {error}
          </p>
        )}
        <div ref={editorPanel} hidden={view !== 'editor'}>
          {view === 'editor' && source?.status !== 'ready' && (
            <button onClick={() => navigate('sources')}>Choose a ready source</button>
          )}
          {editorVisited && source?.status === 'ready' && (
            <>
              <div className="clip-picker">
                {clips.length > 0 && (
                  <label>
                    Saved clip
                    <select value={clip?.id || ''} onChange={(e) => open(source.id, e.target.value)}>
                      {clips.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <form
                  className="clip-row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    click(async () => {
                      const c = await action('create', {
                        id: source.id,
                        title: title || 'Clip ' + (clips.length + 1),
                      });
                      open(source.id, c.id);
                      setTitle('');
                    });
                  }}
                >
                  <input
                    className="input"
                    aria-label="New clip name"
                    maxLength={120}
                    placeholder="Clip name"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                  <button disabled={busy} className="btn btn-secondary">
                    Create clip
                  </button>
                </form>
              </div>
              {clip && (
                <Editor
                  key={clip.id}
                  clip={clip}
                  source={source}
                  presets={lib.presets ?? []}
                  onSaved={(settings) =>
                    setLib((current) => ({
                      ...current,
                      clips: current.clips.map((c) => (c.id === clip.id ? { ...c, settings } : c)),
                    }))
                  }
                  outputs={lib.exports.filter((o) => o.clip === clip.id)}
                  run={run}
                  busy={busy}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
