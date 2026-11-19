'use client';
import { useState } from 'react';
import {
  centered,
  defaultStyle,
  cutAt,
  layoutAt,
  timeline,
  withLayout,
  validSettings,
  type Preset,
  type Clip,
  type Layout,
  type Output,
  type Settings,
  type Source,
} from '@/lib/clips/model';
import Preview, { timecode } from './Preview';
import CaptionStyleControls from './CaptionStyleControls';
import CaptionPanel from './CaptionPanel';
import { useClipDraft } from './useClipDraft';

type Props = {
  source: Source;
  clip: Clip;
  outputs: Output[];
  presets: Preset[];
  onSaved: (s: Settings) => void;
  run: (action: string, data: object) => Promise<void>;
  busy: boolean;
};
const modes = { split: 'Split Screen', top: 'Top Only', bottom: 'Bottom Only' } as const;
export default function Editor({ source, clip, outputs, presets, onSaved, run, busy }: Props) {
  const { draft, view } = useClipDraft(clip, source.metadata!.duration, onSaved);
  const s = view.settings,
    style = s.style ?? defaultStyle;
  const [time, setTime] = useState(s.start),
    [seekTo, setSeek] = useState<{ time: number }>();
  const [cutTime, setCutTime] = useState(''),
    [name, setName] = useState(''),
    [chosen, setChosen] = useState('');
  const [scope, setScope] = useState('segment'),
    [side, selectSide] = useState<'top' | 'bottom'>('top');
  const [message, report] = useState('');
  const seek = (t: number) => {
    setTime(t);
    setSeek({ time: t });
  };
  const t = Math.max(s.start, Math.min(time, s.end)),
    index = cutAt(s, t),
    layout = layoutAt(s, t);
  const frames = timeline(s),
    preset = presets.find((p) => p.name === chosen);
  const change = draft.change;
  const framed = (patch: Partial<Layout>) =>
    scope === 'whole'
      ? { ...s, ...patch, cuts: s.cuts?.map((c) => ({ ...c, layout: { ...c.layout, ...patch } })) }
      : withLayout(s, index, { ...layout, ...patch });
  const frame = (patch: Partial<Layout>, group?: string) => change(framed(patch), group);
  const at = Math.round((s.start + (cutTime === '' ? time - s.start : Number(cutTime))) * 1000) / 1000;
  const validCut =
    at > s.start && at < s.end && !(s.cuts ?? []).some((c) => c.at === at) && (s.cuts?.length ?? 0) < 128;
  function split() {
    if (!validCut) return;
    change({
      ...s,
      cuts: [...(s.cuts ?? []), { at, layout: layoutAt(s, at) }].sort((a, b) => a.at - b.at),
    });
    setCutTime('');
    seek(at);
  }
  return (
    <div className="clip-workspace">
      <div className="clip-left">
        <Preview
          source={source}
          settings={s}
          frame={frame}
          side={side}
          selectSide={selectSide}
          change={change}
          endGesture={draft.endGesture}
          onClock={setTime}
          seekTo={seekTo}
        />
        <div className="glass-card clip-guide-control">
          <label>
            Safe-area guide
            <select
              value={s.guide ?? 'Off'}
              onChange={(e) => change({ ...s, guide: e.target.value as Settings['guide'] })}
            >
              {['Off', 'Shorts', 'Reels'].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <small>Approximate interface margins for vertical playback.</small>
        </div>
      </div>
      <section className="clip-controls glass-card">
        <div className="clip-row">
          <h2>{clip.title}</h2>
          <span className="clip-save-state" role="status">
            {view.status}
          </span>
          <button className="btn btn-secondary" disabled={!view.undo} onClick={draft.undo}>
            Undo
          </button>
          <button className="btn btn-secondary" disabled={!view.redo} onClick={draft.redo}>
            Redo
          </button>
        </div>
        {view.error && (
          <div role="alert">
            {view.error}{' '}
            <button className="clip-link" onClick={() => draft.flush().catch(() => {})}>
              Retry save
            </button>
            {view.error.includes('another editor') && (
              <button className="clip-link" onClick={draft.discard}>
                Reopen saved version
              </button>
            )}
          </div>
        )}
        <fieldset>
          <legend>Trim</legend>
          <small>Selected duration · {timecode(Math.max(0, s.end - s.start))}</small>
          <div className="clip-row">
            {(['start', 'end'] as const).map((k) => (
              <label key={k}>
                {k === 'start' ? 'Start' : 'End'} (seconds)
                <input
                  className="input"
                  type="number"
                  min="0"
                  max={source.metadata!.duration}
                  step="any"
                  value={s[k]}
                  onChange={(e) => change({ ...s, [k]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Timeline segments</legend>
          <div className="clip-segments" aria-label="Timeline segments">
            {frames.map((f, i) => (
              <button
                key={f.at}
                style={{ flexGrow: Math.max(0.01, (frames[i + 1]?.at ?? s.end) - f.at) }}
                aria-pressed={index === cutAt(s, f.at)}
                onClick={() => seek(f.at)}
              >
                <time>{timecode(f.at - s.start)}</time> {modes[f.layout.mode]}
              </button>
            ))}
          </div>
          <div className="clip-row">
            <label>
              Cut at clip second
              <input
                type="number"
                min="0"
                step=".001"
                max={s.end - s.start}
                placeholder={String(Math.max(0, time - s.start).toFixed(3))}
                value={cutTime}
                onChange={(e) => setCutTime(e.target.value)}
              />
            </label>
            <button className="btn btn-secondary" disabled={!validCut} onClick={split}>
              Add cut
            </button>
            {index >= 0 && s.cuts![index].at > s.start && (
              <button
                className="clip-link"
                onClick={() => change({ ...s, cuts: s.cuts!.filter((_, i) => i !== index) })}
              >
                Remove cut
              </button>
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend>Framing</legend>
          <label>
            Apply framing to
            <select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="segment">Selected segment</option>
              <option value="whole">Whole clip</option>
            </select>
          </label>
          <label>
            Layout mode
            <select value={layout.mode} onChange={(e) => frame({ mode: e.target.value as Layout['mode'] })}>
              {Object.entries(modes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {layout.mode === 'split' && (
            <label>
              Top section (%)
              <input
                aria-label="Top section percent"
                type="number"
                min="10"
                max="90"
                step="any"
                value={Math.round((layout.topHeight / 19.2) * 100) / 100}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (Number.isFinite(n) && n >= 10 && n <= 90)
                    frame({ topHeight: 2 * Math.round(n * 9.6) });
                }}
              />
            </label>
          )}
          {layout.mode === 'split' && (
            <div className="clip-row">
              {[
                [50, 50],
                [60, 40],
                [30, 70],
              ].map(([a, b]) => (
                <button
                  className="btn btn-secondary"
                  key={a}
                  onClick={() => frame({ topHeight: Math.round(a * 19.2) })}
                >
                  {a}/{b}
                </button>
              ))}
              <label>
                Top height (px)
                <input
                  type="number"
                  min="192"
                  max="1728"
                  step="2"
                  value={layout.topHeight}
                  onChange={(e) => {
                    const n = e.target.valueAsNumber;
                    if (n >= 192 && n <= 1728) frame({ topHeight: 2 * Math.round(n / 2) });
                  }}
                />
              </label>
            </div>
          )}
          {(['top', 'bottom'] as const)
            .filter((side) => layout.mode === 'split' || layout.mode === side)
            .map((side) => (
              <div key={side} className="clip-control-row">
                <span>{side === 'top' ? 'Top' : 'Bottom'}</span>
                {layout[side] ? (
                  <>
                    <label>
                      {side === 'top' ? 'Top' : 'Bottom'} zoom · {Math.round(layout[side].zoom * 100)}%
                      <input
                        aria-label={side + ' zoom'}
                        type="range"
                        min="1"
                        max="8"
                        step=".01"
                        value={layout[side].zoom}
                        onPointerUp={draft.endGesture}
                        onBlur={draft.endGesture}
                        onKeyUp={draft.endGesture}
                        onChange={(e) =>
                          frame(
                            { [side]: { ...layout[side], zoom: Number(e.target.value) } },
                            'zoom-' + index + side,
                          )
                        }
                      />
                    </label>
                    <label>
                      {side} zoom (%)
                      <input
                        type="number"
                        min="100"
                        max="800"
                        value={Math.round(layout[side].zoom * 100)}
                        onChange={(e) => {
                          const n = e.target.valueAsNumber;
                          if (n >= 100 && n <= 800) frame({ [side]: { ...layout[side], zoom: n / 100 } });
                        }}
                      />
                    </label>
                    <button
                      className="clip-link"
                      onClick={() => frame({ [side]: side === 'top' ? null : centered(1.5) })}
                    >
                      {side === 'top' ? 'Fit frame' : 'Reset'}
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      selectSide('top');
                      frame({ top: centered(1) });
                    }}
                  >
                    Select Crop
                  </button>
                )}
              </div>
            ))}
          <small>Drag inside a cropped section to reposition it.</small>
        </fieldset>
        <fieldset>
          <legend>Caption Settings</legend>
          <div className="clip-row">
            {(['transcript', 'captions'] as const).map((k) => (
              <label key={k} className="clip-toggle">
                <input
                  type="checkbox"
                  checked={s[k]}
                  onChange={(e) => change({ ...s, [k]: e.target.checked })}
                />
                {k === 'transcript' ? 'Transcript' : 'Captions'} {s[k] ? 'On' : 'Off'}
              </label>
            ))}
          </div>
          <div className="clip-row">
            <label>
              Font size
              <input
                type="number"
                min="24"
                max="96"
                value={style.size}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (Number.isInteger(n) && n >= 24 && n <= 96)
                    change({ ...s, style: { ...style, size: n } });
                }}
              />
            </label>
            <label>
              Text color
              <input
                type="color"
                value={style.color}
                onChange={(e) => change({ ...s, style: { ...style, color: e.target.value } })}
              />
            </label>
            <label className="clip-toggle">
              <input
                type="checkbox"
                checked={style.background}
                onChange={(e) => change({ ...s, style: { ...style, background: e.target.checked } })}
              />
              Background
            </label>
          </div>
          <CaptionStyleControls
            style={style}
            change={(patch, group) => change({ ...s, style: { ...style, ...patch } }, group)}
            end={draft.endGesture}
          />
        </fieldset>
        <fieldset>
          <legend>Presets</legend>
          <div className="clip-row">
            <input
              className="input"
              aria-label="Preset name"
              placeholder="Preset name"
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="btn btn-secondary"
              disabled={!name.trim() || busy}
              onClick={async () => {
                try {
                  await run('preset', { name: name.trim(), layout, style });
                  setChosen(name.trim());
                  setName('');
                } catch {}
              }}
            >
              Save preset
            </button>
          </div>
          {presets.length > 0 && (
            <div className="clip-row">
              <label>
                Saved preset
                <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
                  <option value="">Choose a preset</option>
                  {presets.map((p) => (
                    <option key={p.name}>{p.name}</option>
                  ))}
                </select>
              </label>
              <button
                disabled={!preset}
                className="clip-link"
                onClick={() => preset && change({ ...framed(preset.layout), style: preset.style })}
              >
                Apply preset
              </button>
              <button
                disabled={!preset}
                className="clip-link"
                onClick={() => preset && change({ ...s, style: preset.style })}
              >
                Apply caption style
              </button>
            </div>
          )}
        </fieldset>
        <CaptionPanel
          s={s}
          source={source}
          time={time}
          change={change}
          endGesture={draft.endGesture}
          seek={seek}
          busy={busy}
          report={report}
          transcribe={() => run('transcribe', { id: source.id }).catch(() => {})}
        />
        {message && <p role="status">{message}</p>}
        <button
          className="btn btn-primary"
          disabled={busy || !validSettings(s, source.metadata!.duration)}
          onClick={async () => {
            try {
              await draft.flush();
              const snapshot = draft.read().settings;
              await run('export', { id: clip.id, settings: snapshot, expected: snapshot });
            } catch {}
          }}
        >
          Export MP4
        </button>
        {outputs.length > 0 && (
          <fieldset>
            <legend>Exports</legend>
            {outputs.map((o) => (
              <div className="clip-export" key={o.id}>
                <span>
                  {o.status}
                  {o.status === 'processing' ? ' · ' + (o.progress ?? 0) + '%' : ''}
                </span>
                {o.status === 'processing' && (
                  <progress aria-label="Export progress" max="100" value={o.progress ?? 0} />
                )}
                {o.status === 'completed' && (
                  <>
                    <a className="clip-link" href={'/clips/watch/' + o.id}>
                      Play export
                    </a>
                    <a download className="clip-link" href={'/api/clips/export/' + o.id}>
                      Download MP4
                    </a>
                  </>
                )}
                {o.error && <small>{o.error}</small>}
                {o.status === 'failed' && (
                  <button
                    className="clip-link"
                    disabled={busy}
                    onClick={() => run('retryExport', { id: o.id }).catch(() => {})}
                  >
                    Retry export
                  </button>
                )}
              </div>
            ))}
          </fieldset>
        )}
      </section>
    </div>
  );
}
