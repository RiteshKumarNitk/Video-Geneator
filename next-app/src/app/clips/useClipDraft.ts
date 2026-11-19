'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { validSettings, type Settings, type Clip } from '@/lib/clips/model';

type Status = 'Saving' | 'Saved' | 'Save Failed';
type View = { settings: Settings; status: Status; error: string; undo: boolean; redo: boolean };
type Pending = { base: Settings; settings: Settings };

function draftFor(clip: Clip, duration: number, notify: (s: Settings) => void) {
  const key = 'clips.draft.' + clip.id;
  let base = clip.settings,
    settings = base;
  try {
    const cached: Pending = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (cached?.base && cached.settings) {
      base = cached.base;
      settings = cached.settings;
    }
  } catch {
    /* Storage may be disabled. The server save still works. */
  }
  const past: Settings[] = [],
    future: Settings[] = [];
  const listeners = new Set<() => void>();
  let view: View = {
    settings,
    status: settings === base ? 'Saved' : 'Saving',
    error: '',
    undo: false,
    redo: false,
  };
  let group: string | undefined,
    timer: ReturnType<typeof setTimeout> | undefined,
    inFlight: Promise<void> | undefined;
  function publish(status: Status, error = '') {
    view = { settings, status, error, undo: past.length > 0, redo: future.length > 0 };
    for (const listener of listeners) listener();
  }
  function stash() {
    try {
      if (settings === base) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify({ base, settings }));
    } catch {
      /* The in-memory draft remains available for retry. */
    }
  }
  async function write() {
    while (base !== settings) {
      const next = settings;
      if (!validSettings(next, duration)) throw Error('Check the trim, caption text and segment settings.');
      const response = await fetch('/api/clips/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: clip.id, settings: next, expected: base }),
      });
      if (!response.ok) throw Error((await response.json()).error || 'Save failed.');
      base = next;
      notify(base);
    }
    stash();
    publish('Saved');
  }
  function flush(): Promise<void> {
    clearTimeout(timer);
    if (inFlight) return inFlight;
    if (base === settings) {
      publish('Saved');
      return Promise.resolve();
    }
    publish('Saving');
    inFlight = write()
      .catch((e) => {
        stash();
        publish('Save Failed', e.message);
        throw e;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  }
  function schedule() {
    publish('Saving');
    clearTimeout(timer);
    timer = setTimeout(() => flush().catch(() => {}), 450);
  }
  function change(next: Settings, gesture?: string) {
    if (JSON.stringify(next) === JSON.stringify(settings)) return;
    if (!gesture || group !== gesture) {
      past.push(settings);
      if (past.length > 80) past.shift();
    }
    group = gesture;
    future.length = 0;
    settings = next;
    schedule();
  }
  function move(from: Settings[], to: Settings[]) {
    const next = from.pop();
    if (!next) return;
    to.push(settings);
    settings = next;
    group = undefined;
    schedule();
  }
  return {
    read: () => view,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    change,
    undo: () => move(past, future),
    redo: () => move(future, past),
    endGesture: () => {
      group = undefined;
    },
    flush,
    stash,
    discard: () => {
      try {
        sessionStorage.removeItem(key);
      } catch {}
      settings = base;
      clearTimeout(timer);
      location.reload();
    },
    mount: () => {
      if (base !== settings) schedule();
    },
  };
}
export function useClipDraft(clip: Clip, duration: number, onSaved: (s: Settings) => void) {
  const [draft] = useState(() => draftFor(clip, duration, onSaved));
  const view = useSyncExternalStore(draft.subscribe, draft.read, draft.read);
  useEffect(() => {
    draft.mount();
    window.addEventListener('pagehide', draft.stash);
    return () => {
      window.removeEventListener('pagehide', draft.stash);
      draft.stash();
      void draft.flush().catch(() => {});
    };
  }, [draft]);
  return { draft, view };
}
