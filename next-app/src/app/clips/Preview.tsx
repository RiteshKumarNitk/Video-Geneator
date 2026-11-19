'use client';
import { useEffect, useRef, useState } from 'react';
import {
  sections,
  cutAt,
  layoutAt,
  captionOrigin,
  captionRegion,
  rectangle,
  type Layout,
  defaultStyle,
  guides,
  type Crop,
  type Source,
  type Settings,
} from '@/lib/clips/model';

export function timecode(value: number) {
  const ms = Math.round(value * 1000);
  return (
    [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60]
      .map((n) => String(n).padStart(2, '0'))
      .join(':') +
    '.' +
    String(ms % 1000).padStart(3, '0')
  );
}
type Props = {
  side: 'top' | 'bottom';
  selectSide: (side: 'top' | 'bottom') => void;
  frame: (patch: Partial<Layout>, group?: string) => void;
  source: Source;
  settings: Settings;
  change: (s: Settings, gesture?: string) => void;
  endGesture: () => void;
  onClock: (t: number) => void;
  seekTo?: { time: number };
};
export default function Preview({
  side: chosenSide,
  selectSide,
  frame: editFrame,
  source,
  settings,
  change,
  endGesture,
  onClock,
  seekTo,
}: Props) {
  const video = useRef<HTMLVideoElement>(null),
    canvas = useRef<HTMLCanvasElement>(null);
  const [time, setTime] = useState(settings.start),
    [playing, setPlaying] = useState(false),
    [error, setError] = useState('');
  const sourceCanvas = useRef<HTMLCanvasElement>(null);
  const cropDrag = useRef<{
    x: number;
    y: number;
    crop: Crop;
    resize: boolean;
    w: number;
    h: number;
  } | null>(null);
  const [rangeOnly, setRangeOnly] = useState(true),
    [positioning, setPositioning] = useState(false);
  const minTime = rangeOnly ? settings.start : 0,
    maxTime = rangeOnly ? settings.end : source.metadata!.duration;
  const layout = layoutAt(settings, time),
    side = layout.mode === 'split' ? chosenSide : layout.mode;
  const meta = source.metadata!,
    section = sections(meta, layout).find((r) => r.side === side)!;
  const currentCrop = layout[side];
  const baseBox = rectangle(meta, currentCrop ? { ...currentCrop, zoom: 1 } : null, section.sectionHeight);
  const region = captionRegion(layout, settings.style ?? defaultStyle);
  const [enteredTime, setEnteredTime] = useState<string | null>(null);
  const drag = useRef<{
    side: 'top' | 'bottom';
    x: number;
    y: number;
    crop: Crop;
    w: number;
    h: number;
    height: number;
  } | null>(null);
  const sourceUrl = '/api/clips/source/' + source.id;
  const cues = settings.cues ?? source.cues;
  const style = settings.style ?? defaultStyle;
  const guide = settings.guide && settings.guide !== 'Off' ? guides[settings.guide] : null;
  const redrawRef = useRef<() => void>(() => {});
  const cache = useRef(new Map<string, ImageBitmap | null>());
  useEffect(() => {
    const images = cache.current;
    return () => {
      for (const img of images.values()) img?.close();
      images.clear();
    };
  }, []);
  useEffect(() => {
    const v = video.current!,
      c = canvas.current!,
      ctx = c.getContext('2d');
    if (!ctx || !source.metadata) return;
    const meta = source.metadata;
    let active = true,
      frame = 0;
    const draw = (t: number) => {
      if (!active || v.readyState < 2) return;
      const original = sourceCanvas.current;
      original?.getContext('2d')?.drawImage(v, 0, 0, original.width, original.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 1080, 1920);
      let offset = 0;
      for (const r of sections(meta, layoutAt(settings, t))) {
        ctx.drawImage(
          v,
          (r.x * v.videoWidth) / meta.width,
          (r.y * v.videoHeight) / meta.height,
          (r.w * v.videoWidth) / meta.width,
          (r.h * v.videoHeight) / meta.height,
          r.dx,
          r.dy + offset,
          r.dw,
          r.dh,
        );
        offset += r.sectionHeight;
      }
      if (settings.captions && t >= settings.start && t < settings.end) {
        const index = cues.findIndex((cue) => cue.start <= t && cue.end > t);
        const load = (i: number) => {
          const payload = JSON.stringify({ text: cues[i].text, style });
          const images = cache.current;
          if (!images.has(payload)) {
            if (images.size >= 12) {
              const oldest = images.keys().next().value!;
              images.get(oldest)?.close();
              images.delete(oldest);
            }
            images.set(payload, null);
            fetch('/api/clips/captions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
            })
              .then(async (res) => {
                if (!res.ok) throw Error('Caption preview unavailable.');
                return createImageBitmap(await res.blob());
              })
              .then((img) => {
                if (!images.has(payload)) {
                  img.close();
                  return;
                }
                images.set(payload, img);
                redrawRef.current();
              })
              .catch(() => setError('Caption preview unavailable.'));
          }
          return images.get(payload);
        };
        if (index >= 0) {
          const img = load(index);
          if (img) {
            const origin = captionOrigin(layoutAt(settings, t), style);
            ctx.drawImage(img, origin.captionX, origin.captionY);
          }
        }
        const next = cues.findIndex((c) => c.start > t && c.start < Math.min(t + 2, settings.end));
        if (next >= 0) load(next);
      }
    };
    let lastCue = -2,
      lastCut = -2,
      lastTime = -1;
    const clock = (t: number, force = false) => {
      const cue = cues.findIndex((c) => c.start <= t && c.end > t),
        cut = cutAt(settings, t);
      if (force || cue !== lastCue || cut !== lastCut || Math.abs(t - lastTime) >= 0.1) {
        lastCue = cue;
        lastCut = cut;
        lastTime = t;
        setTime(t);
        onClock(t);
      }
    };
    const redraw = () => {
      draw(v.currentTime);
      clock(v.currentTime, true);
    };
    redrawRef.current = redraw;
    const advance = (_now: number, info: VideoFrameCallbackMetadata) => {
      if (info.mediaTime >= maxTime && !v.paused) {
        v.pause();
        v.currentTime = maxTime;
      }
      draw(info.mediaTime);
      clock(info.mediaTime);
      frame = v.requestVideoFrameCallback(advance);
    };
    const limit = () => {
      if (v.currentTime < minTime || v.currentTime > maxTime) v.currentTime = minTime;
      redraw();
    };
    v.addEventListener('loadeddata', limit);
    v.addEventListener('seeked', redraw);
    if (v.readyState >= 2) limit();
    frame = v.requestVideoFrameCallback(advance);
    return () => {
      active = false;
      redrawRef.current = () => {};
      v.cancelVideoFrameCallback(frame);
      v.removeEventListener('loadeddata', limit);
      v.removeEventListener('seeked', redraw);
    };
  }, [settings, source.metadata, cues, style, onClock, minTime, maxTime]);
  useEffect(() => {
    if (seekTo && video.current) video.current.currentTime = seekTo.time;
  }, [seekTo]);

  const placeCaption = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    change(
      {
        ...settings,
        style: {
          ...style,
          positionX: clamp((e.clientX - box.left) / box.width),
          positionY: clamp((((e.clientY - box.top) / box.height) * 1920 - region.top) / region.height),
        },
      },
      'caption-drag',
    );
  };

  return (
    <section className="clip-preview glass-card">
      <video
        hidden
        ref={video}
        src={sourceUrl}
        preload="auto"
        playsInline
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setError('This browser could not decode the saved source.')}
      />
      <div className="clip-monitor">
        <canvas
          width="1080"
          height="1920"
          aria-label="Vertical split-screen preview"
          ref={canvas}
          onPointerDown={(e) => {
            if (!source.metadata) return;
            const v = video.current!;
            v.pause();
            const box = e.currentTarget.getBoundingClientRect(),
              layout = layoutAt(settings, v.currentTime);
            const rects = sections(source.metadata, layout);
            const r =
              rects.length === 1 || ((e.clientY - box.top) / box.height) * 1920 < rects[0].sectionHeight
                ? rects[0]
                : rects[1];
            const side = r.side,
              crop = layout[side];
            selectSide(side);
            if (!crop) return;
            drag.current = {
              side,
              w: r.w,
              h: r.h,
              height: r.sectionHeight,
              x: e.clientX,
              y: e.clientY,
              crop: {
                ...crop,
                x: (r.x + r.w / 2) / source.metadata.width,
                y: (r.y + r.h / 2) / source.metadata.height,
              },
            };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current,
              meta = source.metadata;
            if (!d || !meta) return;
            const box = e.currentTarget.getBoundingClientRect();
            const clamp = (n: number, extent: number) => Math.min(1 - extent / 2, Math.max(extent / 2, n));
            const crop = {
              ...d.crop,
              x: clamp(d.crop.x - (((e.clientX - d.x) / box.width) * d.w) / meta.width, d.w / meta.width),
              y: clamp(
                d.crop.y - (((e.clientY - d.y) / ((box.height * d.height) / 1920)) * d.h) / meta.height,
                d.h / meta.height,
              ),
            };
            editFrame({ [d.side]: crop }, 'pan');
          }}
          onLostPointerCapture={() => {
            drag.current = null;
            endGesture();
          }}
        />
        <div
          className="clip-active-section"
          aria-label={'Selected ' + side + ' section'}
          style={{
            top: layout.mode === 'split' && side === 'bottom' ? layout.topHeight / 19.2 + '%' : 0,
            height: section.sectionHeight / 19.2 + '%',
          }}
        />
        {layout.mode === 'split' && (
          <button
            aria-label="Drag split divider"
            className="clip-divider"
            style={{ top: layout.topHeight / 19.2 + '%' }}
            onPointerDown={(e) => {
              video.current?.pause();
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const b = canvas.current!.getBoundingClientRect();
              editFrame(
                {
                  topHeight: Math.min(
                    1728,
                    Math.max(192, 2 * Math.round(((e.clientY - b.top) / b.height) * 960)),
                  ),
                },
                'divider',
              );
            }}
            onLostPointerCapture={endGesture}
          />
        )}
        {positioning && (
          <div
            className="clip-position-pad"
            aria-label="Drag caption position"
            onPointerDown={(e) => {
              video.current?.pause();
              e.currentTarget.setPointerCapture(e.pointerId);
              placeCaption(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) placeCaption(e);
            }}
            onLostPointerCapture={endGesture}
          />
        )}
        {guide && (
          <div
            aria-label={settings.guide + ' safe area'}
            className="clip-guide"
            style={{
              left: (guide.left / 1080) * 100 + '%',
              top: (guide.top / 1920) * 100 + '%',
              right: (1 - guide.right / 1080) * 100 + '%',
              bottom: (1 - guide.bottom / 1920) * 100 + '%',
            }}
          >
            {settings.guide}
          </div>
        )}
      </div>
      <div className="clip-row">
        <label className="clip-toggle">
          <input type="checkbox" checked={rangeOnly} onChange={(e) => setRangeOnly(e.target.checked)} />
          Preview selected range
        </label>
        <button
          className="clip-link"
          aria-pressed={positioning}
          onClick={() => setPositioning(!positioning)}
        >
          {positioning ? 'Finish caption placement' : 'Drag caption position'}
        </button>
      </div>
      {error && (
        <p role="alert">
          {error}{' '}
          {error === 'Caption preview unavailable.' && (
            <button
              className="clip-link"
              onClick={() => {
                for (const [k, v] of cache.current) if (!v) cache.current.delete(k);
                setError('');
                redrawRef.current();
              }}
            >
              Retry captions
            </button>
          )}
        </p>
      )}
      <div className="clip-transport">
        <button
          className="btn btn-secondary"
          onClick={async () => {
            const v = video.current!;
            if (playing) v.pause();
            else {
              if (v.currentTime >= maxTime - 0.01) v.currentTime = minTime;
              try {
                await v.play();
              } catch {
                setError('Playback could not start.');
              }
            }
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <label>
          Source timecode
          <input
            aria-label="Source timecode"
            value={enteredTime ?? timecode(time)}
            onFocus={() => setEnteredTime(timecode(time))}
            onChange={(e) => setEnteredTime(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (/^(?:\d+:){0,2}\d+(?:\.\d{1,3})?$/.test(value)) {
                const seconds = value.split(':').reduce((total, part) => total * 60 + Number(part), 0);
                video.current!.currentTime = Math.min(maxTime, Math.max(minTime, seconds));
              }
              setEnteredTime(null);
            }}
          />
        </label>
      </div>
      <input
        type="range"
        aria-label="Seek source"
        min={minTime}
        max={maxTime}
        step=".001"
        value={Math.min(maxTime, Math.max(minTime, time))}
        onChange={(e) => {
          video.current!.currentTime = Number(e.target.value);
          setTime(Number(e.target.value));
        }}
      />
      <fieldset>
        <legend>Source crop</legend>
        <div className="clip-row">
          {sections(meta, layout).map((r) => (
            <button
              className="clip-link"
              key={r.side}
              aria-pressed={r.side === side}
              onClick={() => selectSide(r.side)}
            >
              Edit {r.side} crop
            </button>
          ))}
        </div>
        <div className="clip-source-frame" aria-label={'Source crop for ' + side}>
          <canvas
            ref={sourceCanvas}
            width={640}
            height={Math.max(2, Math.round((640 * meta.height) / meta.width))}
            aria-label="Original horizontal frame"
          />
          <div
            className="clip-crop-box"
            aria-label="Move source crop"
            style={{
              left: (100 * baseBox.x) / meta.width + '%',
              top: (100 * baseBox.y) / meta.height + '%',
              width: (100 * baseBox.w) / meta.width + '%',
              height: (100 * baseBox.h) / meta.height + '%',
            }}
            onPointerDown={(e) => {
              video.current?.pause();
              e.currentTarget.setPointerCapture(e.pointerId);
              const initial = currentCrop ?? { x: 0.5, y: 0.5, zoom: 1 };
              const base = rectangle(meta, { ...initial, zoom: 1 }, section.sectionHeight);
              cropDrag.current = {
                x: e.clientX,
                y: e.clientY,
                crop: {
                  ...initial,
                  x: (base.x + base.w / 2) / meta.width,
                  y: (base.y + base.h / 2) / meta.height,
                },
                w: base.w / meta.width,
                h: base.h / meta.height,
                resize: e.target !== e.currentTarget,
              };
              if (!currentCrop) editFrame({ [side]: initial }, 'source-crop');
            }}
            onPointerMove={(e) => {
              const d = cropDrag.current;
              if (!d) return;
              const b = sourceCanvas.current!.getBoundingClientRect(),
                dx = (e.clientX - d.x) / b.width,
                dy = (e.clientY - d.y) / b.height;
              let crop = { ...d.crop };
              if (d.resize) {
                const factor = Math.max(0.0625, 1 + (dx * d.w + dy * d.h) / (d.w * d.w + d.h * d.h));
                crop.basis = Math.min(16, Math.max(1, (crop.basis ?? 1) / factor));
                const scale = (d.crop.basis ?? 1) / crop.basis;
                crop.x += ((scale - 1) * d.w) / 2;
                crop.y += ((scale - 1) * d.h) / 2;
              } else {
                crop.x += dx;
                crop.y += dy;
              }
              const r = rectangle(meta, { ...crop, zoom: 1 }, section.sectionHeight);
              crop = { ...crop, x: (r.x + r.w / 2) / meta.width, y: (r.y + r.h / 2) / meta.height };
              editFrame({ [side]: crop }, 'source-crop');
            }}
            onLostPointerCapture={() => {
              cropDrag.current = null;
              endGesture();
            }}
          >
            <span role="img" aria-label="Resize source crop" className="clip-resize" />
          </div>
        </div>
        <small>
          Drag the box to frame the {side} section. Drag its corner to resize. Zoom enlarges this selection.
        </small>
      </fieldset>
    </section>
  );
}
