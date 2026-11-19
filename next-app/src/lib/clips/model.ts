export type Crop = { x: number; y: number; zoom: number; basis?: number };
export type Cue = { start: number; end: number; text: string };
export type Metadata = { width: number; height: number; duration: number };
export type Layout = {
  mode: 'split' | 'top' | 'bottom';
  topHeight: number;
  top: Crop | null;
  bottom: Crop;
};
export type Cut = { at: number; layout: Layout };
export type CaptionStyle = {
  size: number;
  color: string;
  background: boolean;
  y: number;
  font?: 'sans' | 'serif';
  weight?: number;
  align?: 'left' | 'center' | 'right';
  bgColor?: string;
  opacity?: number;
  outline?: number;
  outlineColor?: string;
  shadow?: boolean;
  maxWidth?: number;
  region?: 'canvas' | 'top' | 'bottom';
  positionX?: number;
  positionY?: number;
};
export const defaultStyle: CaptionStyle = { size: 52, color: '#ffffff', background: true, y: 1460 };
export type Preset = { name: string; layout: Layout; style: CaptionStyle };
export const guides = {
  Shorts: { left: 72, top: 180, right: 864, bottom: 1500 },
  Reels: { left: 65, top: 269, right: 1015, bottom: 1248 },
};
export type Guide = keyof typeof guides;
export type Settings = {
  mode?: Layout['mode'];
  cuts?: Cut[];
  style?: CaptionStyle;
  cues?: Cue[];
  guide?: Guide | 'Off';
  topHeight?: number;
  start: number;
  end: number;
  top: Crop | null;
  bottom: Crop;
  transcript: boolean;
  captions: boolean;
};
export type Source = {
  id: string;
  path: string;
  filename: string;
  url: string | null;
  progress?: number;
  track?: string;
  status: string;
  error: string | null;
  metadata: Metadata | null;
  cues: Cue[];
  analysis: string | null;
  suggestions: { start: number; end: number; title: string }[];
};
export type Clip = { id: string; source: string; title: string; settings: Settings };
export type Output = { progress?: number; id: string; clip: string; status: string; error: string | null };
export type Library = {
  presets?: Preset[];
  sources: Source[];
  clips: Clip[];
  exports: Output[];
  uploads: { id: string; filename: string }[];
};
export const centered = (zoom: number): Crop => ({ x: 0.5, y: 0.5, zoom });
export const defaults = (duration: number): Settings => ({
  topHeight: 960,
  start: 0,
  end: duration,
  top: null,
  bottom: centered(1.5),
  transcript: true,
  captions: false,
});
const between = (v: unknown, low: number, high: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high;
function validCrop(c: Crop) {
  return (
    c &&
    between(c.x, 0, 1) &&
    between(c.y, 0, 1) &&
    between(c.zoom, 1, 8) &&
    (c.basis === undefined || between(c.basis, 1, 16))
  );
}
export function validLayout(l: Layout) {
  return (
    l &&
    ['split', 'top', 'bottom'].includes(l.mode) &&
    between(l.topHeight, 192, 1728) &&
    l.topHeight % 2 === 0 &&
    validCrop(l.bottom) &&
    (l.top === null || validCrop(l.top))
  );
}
export function validStyle(s: CaptionStyle) {
  return (
    s &&
    Number.isInteger(s.size) &&
    between(s.size, 24, 96) &&
    /^#[0-9a-f]{6}$/i.test(s.color) &&
    typeof s.background === 'boolean' &&
    Number.isInteger(s.y) &&
    between(s.y, 0, 1600) &&
    (s.font === undefined || ['sans', 'serif'].includes(s.font)) &&
    (s.align === undefined || ['left', 'center', 'right'].includes(s.align)) &&
    (s.region === undefined || ['canvas', 'top', 'bottom'].includes(s.region)) &&
    [s.bgColor, s.outlineColor].every((c) => c === undefined || /^#[0-9a-f]{6}$/i.test(c)) &&
    (s.weight === undefined || [400, 500, 600, 700, 800].includes(s.weight)) &&
    (s.shadow === undefined || typeof s.shadow === 'boolean') &&
    (s.maxWidth === undefined || between(s.maxWidth, 160, 1000)) &&
    (s.outline === undefined || (Number.isInteger(s.outline) && between(s.outline, 0, 12))) &&
    [s.opacity, s.positionX, s.positionY].every((v) => v === undefined || between(v, 0, 1))
  );
}
export function captionRegion(layout: Layout, style: CaptionStyle) {
  if (layout.mode === 'split' && style.region === 'top') return { top: 0, height: layout.topHeight };
  if (layout.mode === 'split' && style.region === 'bottom')
    return { top: layout.topHeight, height: 1920 - layout.topHeight };
  return { top: 0, height: 1920 };
}
export function captionOrigin(layout: Layout, style: CaptionStyle) {
  const region = captionRegion(layout, style);
  return {
    captionX: Math.round(1080 * (style.positionX ?? 0.5)) - 540,
    captionY: region.top + Math.round(region.height * (style.positionY ?? (style.y + 160) / 1920)) - 160,
  };
}
export function baseLayout(s: Settings): Layout {
  return { mode: s.mode ?? 'split', topHeight: s.topHeight ?? 960, top: s.top, bottom: s.bottom };
}
export function cutAt(s: Settings, time: number) {
  const cuts = s.cuts ?? [];
  let i = cuts.length - 1;
  while (i >= 0 && cuts[i].at > time) i--;
  return i;
}
export function layoutAt(s: Settings, time: number) {
  return s.cuts?.[cutAt(s, time)]?.layout ?? baseLayout(s);
}
export function withLayout(s: Settings, index: number, layout: Layout): Settings {
  if (index < 0) return { ...s, ...layout };
  return { ...s, cuts: s.cuts?.map((cut, i) => (i === index ? { ...cut, layout } : cut)) };
}
export function timeline(s: Settings) {
  return [
    { at: s.start, layout: layoutAt(s, s.start) },
    ...(s.cuts ?? []).filter((c) => c.at > s.start && c.at < s.end),
  ];
}
export function sections(meta: Metadata, layout: Layout) {
  const sides = layout.mode === 'split' ? (['top', 'bottom'] as const) : [layout.mode];
  return sides.map((side) => {
    const h = layout.mode !== 'split' ? 1920 : side === 'top' ? layout.topHeight : 1920 - layout.topHeight;
    return { side, ...rectangle(meta, layout[side], h) };
  });
}
export function validSettings(s: Settings, duration: number) {
  return (
    s &&
    validLayout(baseLayout(s)) &&
    (s.cuts === undefined ||
      (Array.isArray(s.cuts) &&
        s.cuts.length <= 128 &&
        s.cuts.every(
          (cut, i, all) =>
            cut &&
            between(cut.at, 0, duration) &&
            cut.at > (i ? all[i - 1].at : 0) &&
            cut.at < duration &&
            validLayout(cut.layout),
        ))) &&
    (s.cues === undefined || validCues(s.cues)) &&
    (s.style === undefined || validStyle(s.style)) &&
    (s.guide === undefined || ['Off', 'Shorts', 'Reels'].includes(s.guide)) &&
    between(s.start, 0, duration) &&
    between(s.end, s.start, duration) &&
    s.end > s.start &&
    validCrop(s.bottom) &&
    (s.top === null || validCrop(s.top)) &&
    typeof s.transcript === 'boolean' &&
    typeof s.captions === 'boolean'
  );
}
export function validCues(cues: Cue[]) {
  return (
    Array.isArray(cues) &&
    cues.length <= 30000 &&
    cues.every(
      (c) =>
        c &&
        between(c.start, 0, 1e7) &&
        between(c.end, c.start, 1e7) &&
        c.end > c.start &&
        typeof c.text === 'string' &&
        c.text.length > 0 &&
        c.text.length <= 5000,
    )
  );
}
export function cutCues(cues: Cue[], s: Settings) {
  return cues
    .filter((c) => c.start < s.end && c.end > s.start)
    .map((c) => ({
      start: Math.max(c.start, s.start) - s.start,
      end: Math.min(c.end, s.end) - s.start,
      text: c.text,
    }));
}
// Integer source and destination rectangles are consumed by both Canvas and FFmpeg.
export function rectangle({ width, height }: Metadata, crop: Crop | null, sectionHeight = 960) {
  const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));
  if (!crop) {
    const scale = Math.min(1080 / width, sectionHeight / height);
    const w = Math.max(2, 2 * Math.round((width * scale) / 2)),
      h = Math.max(2, 2 * Math.round((height * scale) / 2));
    return {
      sectionHeight,
      x: 0,
      y: 0,
      w: width,
      h: height,
      dw: w,
      dh: h,
      dx: Math.floor((1080 - w) / 2),
      dy: Math.floor((sectionHeight - h) / 2),
    };
  }
  const scale = (crop.basis ?? 1) * crop.zoom * Math.max(1080 / width, sectionHeight / height);
  const w = Math.min(width, Math.max(2, Math.round(1080 / scale))),
    h = Math.min(height, Math.max(2, Math.round(sectionHeight / scale)));
  return {
    sectionHeight,
    x: clamp(Math.round(width * crop.x - w / 2), width - w),
    y: clamp(Math.round(height * crop.y - h / 2), height - h),
    w,
    h,
    dw: 1080,
    dh: sectionHeight,
    dx: 0,
    dy: 0,
  };
}
export function parseTimedText(input: string): Cue[] {
  const stamp = (s: string) =>
    s
      .replace(',', '.')
      .split(':')
      .reduce((n, part) => n * 60 + Number(part), 0);
  const cues = input
    .replace(/^\uFEFF/, '')
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block.trim().split('\n');
      if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) return [];
      const i = lines.findIndex((l) => l.includes('-->'));
      const times = lines[i]?.match(
        /^((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(?:\s|$)/,
      );
      if (!times) throw Error('Invalid subtitle timestamp.');
      return [
        {
          start: stamp(times[1]),
          end: stamp(times[2]),
          text: lines
            .slice(i + 1)
            .join('\n')
            .replace(/<[^>]*>/g, '')
            .trim(),
        },
      ];
    });
  if (!cues.length || !validCues(cues)) throw Error('Attach a timed SRT or WebVTT file with text cues.');
  return cues.sort((a, b) => a.start - b.start);
}
