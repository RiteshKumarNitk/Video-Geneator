'use client';
import type { CaptionStyle } from '@/lib/clips/model';
type Props = {
  style: CaptionStyle;
  change: (patch: Partial<CaptionStyle>, group?: string) => void;
  end: () => void;
};
export default function CaptionStyleControls({ style: s, change, end }: Props) {
  return (
    <div className="clip-style-controls">
      <label>
        Font family
        <select
          value={s.font ?? 'sans'}
          onChange={(e) => change({ font: e.target.value as CaptionStyle['font'] })}
        >
          <option value="sans">Noto Sans Devanagari</option>
          <option value="serif">Noto Serif Devanagari</option>
        </select>
      </label>
      <label>
        Font weight
        <select value={s.weight ?? 400} onChange={(e) => change({ weight: Number(e.target.value) })}>
          {[400, 500, 600, 700, 800].map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
      </label>
      <label>
        Text alignment
        <select
          value={s.align ?? 'center'}
          onChange={(e) => change({ align: e.target.value as CaptionStyle['align'] })}
        >
          {['left', 'center', 'right'].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Background color
        <input
          type="color"
          value={s.bgColor ?? '#000000'}
          onChange={(e) => change({ bgColor: e.target.value })}
        />
      </label>
      <label>
        Background opacity (%)
        <input
          type="number"
          min="0"
          max="100"
          value={Math.round((s.opacity ?? 0.76) * 100)}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (n >= 0 && n <= 100) change({ opacity: n / 100 });
          }}
        />
      </label>
      <label>
        Outline thickness
        <input
          type="number"
          min="0"
          max="12"
          value={s.outline ?? 0}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isInteger(n) && n >= 0 && n <= 12) change({ outline: n });
          }}
        />
      </label>
      <label>
        Outline color
        <input
          type="color"
          value={s.outlineColor ?? '#000000'}
          onChange={(e) => change({ outlineColor: e.target.value })}
        />
      </label>
      <label className="clip-toggle">
        <input
          type="checkbox"
          checked={s.shadow ?? false}
          onChange={(e) => change({ shadow: e.target.checked })}
        />
        Text shadow
      </label>
      <label>
        Maximum text width (px)
        <input
          type="number"
          min="160"
          max="1000"
          value={s.maxWidth ?? 960}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            if (Number.isInteger(n) && n >= 160 && n <= 1000) change({ maxWidth: n });
          }}
        />
      </label>
      <label>
        Position relative to
        <select
          value={s.region ?? 'canvas'}
          onChange={(e) => change({ region: e.target.value as CaptionStyle['region'] })}
        >
          <option value="canvas">Full canvas</option>
          <option value="top">Top section</option>
          <option value="bottom">Bottom section</option>
        </select>
      </label>
      <div className="clip-row">
        {(['Top', 'Middle', 'Bottom'] as const).map((v, i) => (
          <button
            className="clip-link"
            key={v}
            onClick={() => change({ positionX: 0.5, positionY: [0.15, 0.5, 0.85][i] })}
          >
            {v}
          </button>
        ))}
      </div>
      {(['positionX', 'positionY'] as const).map((key, i) => (
        <label key={key}>
          {i ? 'Vertical' : 'Horizontal'} position
          <input
            type="range"
            aria-label={i ? 'Caption vertical position' : 'Caption horizontal position'}
            min="0"
            max="1"
            step=".001"
            value={s[key] ?? (i ? (s.y + 160) / 1920 : 0.5)}
            onLostPointerCapture={end}
            onPointerUp={end}
            onKeyUp={end}
            onBlur={end}
            onChange={(e) => change({ [key]: Number(e.target.value) }, key)}
          />
        </label>
      ))}
    </div>
  );
}
