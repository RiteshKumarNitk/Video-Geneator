'use client';
import { useState } from 'react';
import {
  LayoutDashboard,
  LibraryBig,
  FolderOpen,
  WandSparkles,
  SlidersHorizontal,
  ArrowUpRight,
  Film,
  Play,
  ChevronRight,
} from 'lucide-react';
import type { Library, Source } from '@/lib/clips/model';

export const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'content', label: 'Content', icon: LibraryBig },
  { id: 'ai', label: 'AI workspace', icon: WandSparkles },
  { id: 'sources', label: 'Source library', icon: FolderOpen },
  { id: 'editor', label: 'Clip editor', icon: SlidersHorizontal },
] as const;
export type View = (typeof navigation)[number]['id'];
type Base = { library: Library; open: (source: string, clip: string) => void };
const duration = (seconds: number) =>
  Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

export function Content({ library, query, open, limit }: { query: string; limit?: number } & Base) {
  const [filter, setFilter] = useState('All');
  const latest = new Map<string, Library['exports'][number]>();
  for (const e of library.exports) if (!latest.has(e.clip)) latest.set(e.clip, e);
  const rows = library.clips.filter(
    (c) =>
      c.title.toLowerCase().includes(query.trim().toLowerCase()) &&
      (limit ||
        filter === 'All' ||
        (filter === 'Exported' ? latest.get(c.id)?.status === 'completed' : !latest.has(c.id))),
  );
  return (
    <section className="creator-card creator-list">
      {limit ? (
        <h2>Recent clips</h2>
      ) : (
        <div className="creator-filters">
          {['All', 'Drafts', 'Exported'].map((f) => (
            <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
      <div className="creator-table-head">
        <span>Clip</span>
        <span>Status</span>
        <span>Duration</span>
      </div>
      {rows.slice(0, limit ?? rows.length).map((c) => {
        const output = latest.get(c.id);
        const state = output?.status || 'draft';
        return (
          <button className="creator-table-row" key={c.id} onClick={() => open(c.source, c.id)}>
            <span className="creator-title">
              <span className="creator-thumb">
                {output?.status === 'completed' ? (
                  <img loading="lazy" alt="" src={'/api/clips/export/' + output.id + '?poster=1'} />
                ) : (
                  <Film size={18} />
                )}
              </span>
              <span>{c.title}</span>
            </span>
            <span className={'creator-state ' + state}>{state === 'completed' ? 'Exported' : state}</span>
            <span>
              {duration(c.settings.end - c.settings.start)} <ChevronRight size={14} />
            </span>
          </button>
        );
      })}
      {!rows.length && (
        <p>
          {library.clips.length
            ? 'No clips match this search or filter.'
            : 'Your drafts and exports will appear here.'}
        </p>
      )}
    </section>
  );
}

export function Dashboard({
  library,
  source,
  busy,
  selectSource,
  navigate,
  generate,
  open,
}: Base & {
  source?: Source;
  busy: boolean;
  selectSource: (id: string) => void;
  navigate: (view: View) => void;
  generate: () => void;
}) {
  const latest = library.exports.find((e) => e.status === 'completed');
  const clip = library.clips.find((c) => c.id === latest?.clip);
  const exported = new Set(library.exports.filter((e) => e.status === 'completed').map((e) => e.clip)).size;
  return (
    <>
      <div className="creator-grid">
        <section className="creator-card creator-feature">
          <h2>Latest exported clip</h2>
          {latest && clip ? (
            <>
              <div className="creator-player">
                <div
                  aria-hidden="true"
                  className="creator-backdrop"
                  style={{ backgroundImage: 'url("/api/clips/export/' + latest.id + '?poster=1")' }}
                />
                <video
                  poster={'/api/clips/export/' + latest.id + '?poster=1'}
                  key={latest.id}
                  controls
                  playsInline
                  preload="metadata"
                  src={'/api/clips/export/' + latest.id + '?play=1#t=0.1'}
                />
              </div>
              <h3>{clip.title}</h3>
              <div className="creator-actions">
                <button onClick={() => open(clip.source, clip.id)}>Open in editor</button>
                <a href={'/clips/watch/' + latest.id}>
                  View export <ArrowUpRight size={15} />
                </a>
              </div>
            </>
          ) : (
            <div className="creator-empty">
              <Play />
              <p>Your latest finished clip will appear here.</p>
              <button onClick={() => navigate('sources')}>Open source library</button>
            </div>
          )}
        </section>
        <div className="creator-stack">
          <section className="creator-card creator-ai">
            <div className="creator-ai-icon">
              <WandSparkles size={23} />
            </div>
            <h2>Create AI clips</h2>
            <p>Find five unused moments in your source video.</p>
            <label>
              Source video
              <select
                aria-label="Source video"
                value={source?.id || ''}
                onChange={(e) => selectSource(e.target.value)}
              >
                <option value="" disabled>
                  Choose a source
                </option>
                {library.sources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.filename}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="creator-primary"
              disabled={busy || source?.status !== 'ready'}
              onClick={generate}
            >
              <WandSparkles size={16} />
              {busy ? 'Working…' : 'Find next 5 moments'}
            </button>
            <button className="creator-text" onClick={() => navigate('ai')}>
              Batch review &amp; settings <ChevronRight size={14} />
            </button>
          </section>
          <section className="creator-card">
            <h2>Studio overview</h2>
            <dl className="creator-stats">
              {[
                ['Sources', library.sources.length],
                ['Clips', library.clips.length],
                ['Exported', exported],
              ].map(([label, count]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{count}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
      <Content library={library} query="" open={open} limit={5} />
    </>
  );
}
