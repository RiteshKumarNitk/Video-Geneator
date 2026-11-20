'use client';
import { captionCues } from '@/lib/clips/hinglish';
import { useState, useEffect, useMemo } from 'react';
import {
  defaultStyle,
  guides,
  captionOrigin,
  timeline,
  parseTimedText,
  type Cue,
  type Settings,
  type Source,
} from '@/lib/clips/model';
import { timecode } from './Preview';

type Props = {
  s: Settings;
  source: Source;
  time: number;
  change: (s: Settings, group?: string) => void;
  endGesture: () => void;
  seek: (t: number) => void;
  transcribe: () => void;
  busy: boolean;
  report: (msg: string) => void;
};
type Measure = { bounds: number[]; overflow: boolean };
const pageSize = 32;
export default function CaptionPanel({
  s,
  source,
  time,
  change,
  endGesture,
  seek,
  transcribe,
  busy,
  report,
}: Props) {
  const cues = captionCues(s, source.cues),
    style = s.style ?? defaultStyle;
  const rows = useMemo(() => {
    const selected = cues
      .map((cue, i) => ({ cue, i, overlap: false }))
      .filter(({ cue }) => cue.end > s.start && cue.start < s.end);
    let furthest: (typeof selected)[number] | undefined;
    for (const r of [...selected].sort((a, b) => a.cue.start - b.cue.start)) {
      if (furthest && r.cue.start < furthest.cue.end) {
        r.overlap = true;
        furthest.overlap = true;
      }
      if (!furthest || r.cue.end > furthest.cue.end) furthest = r;
    }
    return selected;
  }, [cues, s.start, s.end]);
  const active = rows.findIndex(({ cue }) => cue.start <= time && cue.end > time);
  const [manualPage, setManualPage] = useState({ active: -1, page: 0 });
  const last = Math.max(0, Math.ceil(rows.length / pageSize) - 1);
  const current = Math.min(
    last,
    manualPage.active === active ? manualPage.page : Math.max(0, Math.floor(active / pageSize)),
  );
  const setPage = (page: number) => setManualPage({ active, page });
  const visible = rows.slice(current * pageSize, (current + 1) * pageSize);
  const query = JSON.stringify({ style, cues: visible.map(({ cue }) => ({ text: cue.text })) });
  const [measure, setMeasure] = useState<{ query: string; values: Measure[] } | null>(null);
  const [measureError, setMeasureError] = useState(false);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/clips/captions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: query,
          signal: controller.signal,
        });
        if (!res.ok) throw Error();
        setMeasure({ query, values: await res.json() });
        setMeasureError(false);
      } catch {
        if (!controller.signal.aborted) setMeasureError(true);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, attempt]);
  const flags = (row: (typeof rows)[number], i: number) => {
    const flags: string[] = [];
    if (row.overlap) flags.push('Overlapping cues');
    const m = measure?.query === query ? measure.values[i] : null;
    if (m?.overflow) flags.push('Text exceeds caption area');
    const g = s.guide && s.guide !== 'Off' ? guides[s.guide] : null;
    if (m) {
      const segments = timeline(s);
      for (const [index, segment] of segments.entries()) {
        if (row.cue.end <= segment.at || row.cue.start >= (segments[index + 1]?.at ?? s.end)) continue;
        const { captionX: x, captionY } = captionOrigin(segment.layout, style);
        const y = captionY - style.y;
        const [left, top, right, bottom] = m.bounds;
        if (left + x < 0 || right + x > 1080 || top + y < 0 || bottom + y > 1920)
          flags.push('Outside preview');
        if (g && (left + x < g.left || top + y < g.top || right + x > g.right || bottom + y > g.bottom))
          flags.push('Outside ' + s.guide + ' safe area');
      }
    }
    return [...new Set(flags)].join(' · ');
  };
  const updateCue = (index: number, patch: Partial<Cue>) =>
    change({ ...s, cues: cues.map((c, i) => (i === index ? { ...c, ...patch } : c)) }, 'cue-' + index);
  if (!s.transcript) {
    const r = rows[active];
    const warning = r && flags(r, active - current * pageSize);
    return warning ? (
      <p className="clip-warning" role="status">
        {warning}
      </p>
    ) : null;
  }
  return (
    <fieldset>
      <legend>Transcript</legend>
      {!rows.length && <p>No timed cues in this trim. Attach subtitles or transcribe the source.</p>}
      {measureError && (
        <p role="alert">
          Caption measurements unavailable.{' '}
          <button className="clip-link" onClick={() => retry((n) => n + 1)}>
            Retry measurements
          </button>
        </p>
      )}
      <div className="clip-cues">
        {visible.map((row, offset) => {
          const { cue, i } = row,
            selected = current * pageSize + offset === active,
            warning = flags(row, offset);
          return (
            <div
              className={'clip-cue' + (selected ? ' active' : '')}
              key={i}
              aria-current={selected ? 'time' : undefined}
            >
              <button
                type="button"
                onClick={() => seek(Math.max(s.start, cue.start))}
                aria-label={'Seek to cue ' + (i + 1)}
              >
                <time>{timecode(Math.max(0, cue.start - s.start))}</time>{' '}
                {selected ? 'Active cue' : 'Seek to cue'}
              </button>
              <div className="clip-row">
                {(['start', 'end'] as const).map((k) => (
                  <label key={k}>
                    Cue {i + 1} {k}
                    <input
                      type="number"
                      step=".001"
                      min="0"
                      max={source.metadata!.duration}
                      value={cue[k]}
                      onBlur={endGesture}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber;
                        if (
                          Number.isFinite(n) &&
                          n >= 0 &&
                          n <= source.metadata!.duration &&
                          (k === 'start' ? n < cue.end : n > cue.start)
                        )
                          updateCue(i, { [k]: n });
                      }}
                    />
                  </label>
                ))}
              </div>
              <textarea
                aria-label={'Caption text ' + (i + 1)}
                maxLength={5000}
                rows={2}
                value={cue.text}
                onFocus={() => seek(Math.max(s.start, cue.start))}
                onBlur={endGesture}
                onChange={(e) => updateCue(i, { text: e.target.value })}
              />
              {warning && <small className="clip-warning">{warning}</small>}
            </div>
          );
        })}
      </div>
      {last > 0 && (
        <div className="clip-row">
          <button disabled={!current} onClick={() => setPage(current - 1)}>
            Previous cues
          </button>
          <small>
            {current + 1} / {last + 1}
          </small>
          <button disabled={current === last} onClick={() => setPage(current + 1)}>
            Next cues
          </button>
        </div>
      )}
      <div className="clip-row">
        <button
          className="clip-link"
          onClick={() => {
            const start = Math.max(s.start, Math.min(time, s.end - 0.1));
            change({
              ...s,
              cues: [...cues, { start, end: Math.min(s.end, start + 2), text: 'New caption' }],
            });
            seek(start);
          }}
        >
          Add cue
        </button>
        <label className="clip-file">
          Attach SRT / VTT
          <input
            type="file"
            accept=".vtt,.srt"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 4000000) throw Error('Subtitle file exceeds 4 MB.');
                change({ ...s, cues: parseTimedText(await file.text()) });
              } catch (err) {
                report(err instanceof Error ? err.message : 'Subtitle import failed.');
              }
            }}
          />
        </label>
        <button
          disabled={busy || (!!source.analysis && !['failed', 'complete'].includes(source.analysis))}
          className="clip-link"
          onClick={transcribe}
        >
          {source.analysis === 'failed'
            ? 'Retry transcription'
            : source.analysis && source.analysis !== 'complete'
              ? 'Transcribing…'
              : 'Transcribe source'}
        </button>
      </div>
      {s.cues && source.cues.length > 0 && (
        <button
          className="clip-link"
          onClick={() => {
            const next = { ...s };
            delete next.cues;
            change(next);
          }}
        >
          Use source transcript
        </button>
      )}
      {source.suggestions.length > 0 && (
        <label>
          Suggested highlight
          <select
            defaultValue=""
            onChange={(e) => {
              const h = source.suggestions[Number(e.target.value)];
              if (h) change({ ...s, start: h.start, end: Math.min(h.end, source.metadata!.duration) });
            }}
          >
            <option value="" disabled>
              Choose a highlight
            </option>
            {source.suggestions.map((h, i) => (
              <option key={i} value={i}>
                {h.title}
              </option>
            ))}
          </select>
        </label>
      )}
    </fieldset>
  );
}
