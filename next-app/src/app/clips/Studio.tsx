'use client';
import { useState, useEffect, useRef } from 'react';
import type { Library, Source } from '@/lib/clips/model';

type Profile = {
  channel_name?: string;
  automatic: boolean;
  render_batches: boolean;
  visibility: string;
  spacing: number;
  seconds: number;
  preset: string;
  tone: string;
  credit: boolean;
};
type Post = {
  clip: string;
  status: string;
  render_status: string;
  due: string;
  video?: string;
  error?: string;
};
const initial: Profile = {
  automatic: false,
  render_batches: false,
  visibility: 'private',
  spacing: 0,
  seconds: 35,
  preset: '',
  tone: 'quote',
  credit: true,
};
async function send(data: object, url = '/api/clips/studio') {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || 'Request failed.');
  return result;
}
export default function Studio({
  lib,
  source,
  refresh,
  open,
}: {
  lib: Library;
  source?: Source;
  refresh: () => Promise<void>;
  open: (source: string, id: string) => void;
}) {
  const [profile, set] = useState<Profile>(initial),
    [posts, setPosts] = useState<Post[]>([]),
    [configured, setConfigured] = useState(false);
  const [busy, working] = useState(false),
    [notice, say] = useState(''),
    [ready, loaded] = useState(false);
  const [requests, pending] = useState<{ source: string; error?: string }[]>([]);
  async function read(settings = false) {
    const r = await fetch('/api/clips/studio', { cache: 'no-store' });
    if (!r.ok) throw Error('Could not load studio settings.');
    const data = await r.json();
    pending(data.requests || []);
    setPosts(data.posts);
    setConfigured(data.configured);
    if (settings) set(data.profile || initial);
    loaded(true);
  }
  useEffect(() => {
    const first = setTimeout(() => read(true).catch((e) => say(e.message)), 0);
    const timer = setInterval(() => read().catch(() => {}), 15000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, []);
  async function act(fn: () => Promise<unknown>, message = '') {
    working(true);
    say('');
    try {
      await fn();
      await refresh();
      await read(true);
      say(message);
    } catch (e) {
      say(e instanceof Error ? e.message : 'Studio request failed.');
    } finally {
      working(false);
    }
  }
  const history = lib.clips
    .filter((c) => c.source === source?.id)
    .sort((a, b) => a.settings.start - b.settings.start);
  const clips = lib.clips.filter((c) => c.source === source?.id && c.batch && !c.skipped);
  const queued = requests.find((r) => r.source === source?.id);
  const previousPending = useRef(false);
  useEffect(() => {
    if (previousPending.current && !queued) void refresh().catch(() => {});
    previousPending.current = !!queued;
    if (!queued || queued.error) return;
    const t = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [queued, refresh]);
  const batches = [...new Set(clips.map((c) => c.batch!))];
  return (
    <section className="glass-card clip-import shorts-studio">
      <h2>Shorts studio</h2>
      <details>
        <summary>Channel and batch settings</summary>
        <fieldset disabled={busy || !ready}>
          <label>
            <input
              type="checkbox"
              checked={profile.render_batches}
              onChange={(e) => set({ ...profile, render_batches: e.target.checked })}
            />
            Automatically export new batches
          </label>
          <label>
            Clip length (seconds){' '}
            <input
              type="number"
              min="30"
              max="55"
              value={profile.seconds}
              onChange={(e) => set({ ...profile, seconds: Number(e.target.value) })}
            />
          </label>
          <label>
            Hinglish title style{' '}
            <select value={profile.tone} onChange={(e) => set({ ...profile, tone: e.target.value })}>
              <option value="quote">Reaction quote</option>
              <option value="question">Question</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={profile.credit}
              onChange={(e) => set({ ...profile, credit: e.target.checked })}
            />{' '}
            Include timestamped source credit
          </label>
          <label>
            Layout and caption preset{' '}
            <select value={profile.preset} onChange={(e) => set({ ...profile, preset: e.target.value })}>
              <option value="">Next Five · facecam above gameplay</option>
              {lib.presets?.map((p) => (
                <option key={p.name}>{p.name}</option>
              ))}
            </select>
          </label>
          <p>
            {profile.channel_name
              ? 'Connected channel · ' + profile.channel_name
              : configured
                ? 'Connect your channel to post verified exports.'
                : 'YouTube setup required. Configure the OAuth client and token key on the server.'}
          </p>
          {profile.channel_name ? (
            <button onClick={() => act(() => send({ action: 'disconnect' }), 'Channel disconnected.')}>
              Disconnect channel
            </button>
          ) : (
            <button
              disabled={!configured}
              onClick={() =>
                act(async () => {
                  location.assign((await send({ action: 'connect' })).url);
                })
              }
            >
              Connect YouTube
            </button>
          )}
          <label>
            <input
              type="checkbox"
              disabled={!profile.channel_name}
              checked={profile.automatic}
              onChange={(e) => set({ ...profile, automatic: e.target.checked })}
            />{' '}
            Automatically upload new exports
          </label>
          <label>
            Visibility{' '}
            <select
              value={profile.visibility}
              onChange={(e) => set({ ...profile, visibility: e.target.value })}
            >
              {['private', 'unlisted', 'public'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Minutes between uploads{' '}
            <input
              type="number"
              min="0"
              max="10080"
              value={profile.spacing}
              onChange={(e) => set({ ...profile, spacing: Number(e.target.value) })}
            />
          </label>
          <button
            onClick={() => act(() => send({ action: 'preferences', ...profile }), 'Preferences saved.')}
          >
            Save preferences
          </button>
        </fieldset>
      </details>
      <button
        className="btn btn-primary"
        disabled={busy || source?.status !== 'ready'}
        onClick={() => act(() => send({ action: 'batch', id: source?.id }), 'Batch ready for review.')}
      >
        Find next 5 moments
      </button>
      <p role="status">
        {busy
          ? 'Working…'
          : queued?.error || (queued ? 'Preparing transcript and finding moments…' : notice)}
      </p>
      <details>
        <summary>Source highlight history</summary>
        {history.map((c) => (
          <p key={c.id}>
            {Math.floor(c.settings.start)}–{Math.ceil(c.settings.end)}s · {c.title} ·{' '}
            {posts.find((p) => p.clip === c.id)?.status ||
              (c.skipped ? 'skipped' : lib.exports.find((e) => e.clip === c.id)?.status || 'draft')}
          </p>
        ))}
      </details>
      {batches.map((batch, i) => {
        const group = clips.filter((c) => c.batch === batch);
        const waiting = group.filter((c) => !lib.exports.some((e) => e.clip === c.id));
        const completed = group.every(
          (c) => lib.exports.find((e) => e.clip === c.id)?.status === 'completed',
        );
        return (
          <details key={batch} open={i === 0}>
            <summary>
              Batch {batches.length - i} · {group.length} Shorts
            </summary>
            {group.map((c) => {
              const e = lib.exports.find((x) => x.clip === c.id);
              return (
                <div className="clip-row" key={c.id}>
                  <strong>{c.title}</strong>
                  <span>
                    {Math.floor(c.settings.start)}s · {e?.status || 'draft'}
                  </span>
                  {c.reason && <small>{c.reason}</small>}
                  {e?.warnings?.length ? <p role="status">{e.warnings.join(' · ')}</p> : null}
                  <details>
                    <summary>YouTube title and description</summary>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void act(
                          () =>
                            send({
                              action: 'metadata',
                              id: c.id,
                              title: data.get('title'),
                              description: data.get('description'),
                            }),
                          'Upload copy saved.',
                        );
                      }}
                    >
                      <label>
                        Title <input name="title" required maxLength={100} defaultValue={c.title} />
                      </label>
                      <label>
                        Description{' '}
                        <textarea name="description" maxLength={5000} defaultValue={c.description} />
                      </label>
                      <button disabled={busy}>Save upload copy</button>
                    </form>
                  </details>
                  <button onClick={() => open(c.source, c.id)}>Edit</button>
                  <button
                    disabled={busy || c.settings.start < 3}
                    onClick={() =>
                      act(
                        () =>
                          send(
                            {
                              action: 'save',
                              id: c.id,
                              expected: c.settings,
                              settings: { ...c.settings, start: c.settings.start - 3 },
                            },
                            '/api/clips/library',
                          ),
                        'Start moved three seconds earlier. Open the editor to export the revision.',
                      )
                    }
                  >
                    Start 3s earlier
                  </button>
                  {!e && (
                    <>
                      <button
                        disabled={busy}
                        onClick={() => act(() => send({ action: 'batch', id: c.source, replace: c.id }))}
                      >
                        Replace
                      </button>
                      <button disabled={busy} onClick={() => act(() => send({ action: 'skip', id: c.id }))}>
                        Skip
                      </button>
                    </>
                  )}
                  {e?.status === 'failed' && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        act(() => send({ action: 'retryExport', id: e.id }, '/api/clips/library'))
                      }
                    >
                      Retry export
                    </button>
                  )}
                  {e?.status === 'completed' && (
                    <details>
                      <summary>Preview</summary>
                      <video
                        width="180"
                        controls
                        playsInline
                        preload="none"
                        src={'/api/clips/export/' + e.id + '?play=1'}
                      />
                    </details>
                  )}
                </div>
              );
            })}
            {!!waiting.length && (
              <button
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    for (const c of waiting)
                      await send(
                        { action: 'batchExport', id: c.id, settings: c.settings, expected: c.settings },
                        '/api/clips/library',
                      );
                  }, 'Exports queued.')
                }
              >
                Export batch
              </button>
            )}
            {completed && <div className="clip-row">
              <a href={'/api/clips/pack/' + batch}>Download YouTube pack</a>
              <a download href={'/api/clips/pack/' + batch + '?platform=facebook'}>Download Facebook Reels pack</a>
            </div>}
          </details>
        );
      })}
      {!!posts.length && (
        <details>
          <summary>YouTube upload queue</summary>
          {posts.map((p) => (
            <p key={p.clip}>
              {lib.clips.find((c) => c.id === p.clip)?.title} ·{' '}
              {p.video ? (
                <a href={'https://youtu.be/' + p.video}>Watch on YouTube</a>
              ) : p.render_status === 'failed' ? (
                'Export failed'
              ) : (
                p.status + ' · ' + new Date(p.due).toLocaleString()
              )}{' '}
              {p.error}{' '}
              {p.status === 'failed' && (
                <button onClick={() => act(() => send({ action: 'retry', id: p.clip }))}>
                  Retry upload
                </button>
              )}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}
