"""Source inspection and split-screen exports in the shared media volume."""
import io
import json
import math
import os
from typing import Literal
from pathlib import Path
import subprocess
import sys
import tempfile
from uuid import UUID
from fractions import Fraction
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Response
from PIL import Image, ImageDraw, ImageFont, ImageColor
from pydantic import BaseModel, Field

from app.ffmpeg_utils import get_tool_path
from app.transcription import analyze_video

router = APIRouter(prefix="/clips")
ROOT = Path(os.getenv("SHARED_STORAGE_PATH", "/app/shared-storage")).resolve()
EXTENSIONS = {".mp4", ".m4v", ".mov", ".webm", ".mkv"}
LOCAL_INPUT = ["-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm"]


@lru_cache(maxsize=128)
def export_poster(export_id: UUID):
    file = ROOT / "processed" / "clips" / f"{export_id}.mp4"
    if not file.is_file():
        raise HTTPException(404, "Export unavailable")
    return subprocess.check_output([
        get_tool_path("ffmpeg"), "-nostdin", "-v", "error", "-threads", "1", *LOCAL_INPUT,
        "-i", str(file), "-frames:v", "1", "-vf", "scale=270:480", "-threads", "1",
        "-c:v", "mjpeg", "-f", "image2pipe", "-"
    ], timeout=15)


@router.get("/poster/{export_id}")
def poster(export_id: UUID):
    return Response(export_poster(export_id), media_type="image/jpeg")


def source_path(relative):
    path = (ROOT / relative).resolve()
    if path.parent != ROOT / "uploads" or path.suffix.lower() not in EXTENSIONS:
        raise ValueError("Unsupported saved source")
    UUID(path.stem)
    return path


def probe(path):
    args = [get_tool_path("ffprobe"), "-v", "error", *LOCAL_INPUT, "-show_streams",
            "-show_format", "-of", "json", str(path)]
    data = json.loads(subprocess.check_output(args, stderr=subprocess.PIPE))
    video = next(s for s in data["streams"] if s["codec_type"] == "video" and not s["disposition"].get("attached_pic"))
    width, height = video["width"], video["height"]
    ratio = video.get("sample_aspect_ratio", "1:1").split(":")
    if len(ratio) == 2 and all(int(value) > 0 for value in ratio):
        width = max(2, round(width * int(ratio[0]) / int(ratio[1])))
    rotation = next((s["rotation"] for s in video.get("side_data_list", []) if "rotation" in s), 0)
    if int(rotation) % 180 == 90:
        width, height = height, width
    duration = float(video.get("duration") or data["format"]["duration"])
    if not math.isfinite(duration) or duration <= 0 or min(width, height) < 2:
        raise ValueError("Invalid video dimensions or duration")
    return {"width": width, "height": height, "duration": duration, "stream": video["index"], "audio": any(s["codec_type"] == "audio" for s in data["streams"]), "rate": video.get("avg_frame_rate", "30/1")}


class SourceRequest(BaseModel):
    path: str
    youtubeId: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{11}$")


@router.post("/motion")
def sample_motion(request: SourceRequest):
    """Estimate action from nearby luma frames in a bounded sample of the source."""
    import cv2
    path = source_path(request.path)
    duration = probe(path)["duration"]
    cap = cv2.VideoCapture(str(path))
    samples = []
    try:
        for i in range(min(64, max(1, int(duration // 5)))):
            at = i * max(5, duration / 64)
            frames = []
            for timestamp in (at, at + .5):
                cap.set(cv2.CAP_PROP_POS_MSEC, 1000 * timestamp)
                ok, frame = cap.read()
                if ok:
                    frames.append(cv2.cvtColor(cv2.resize(frame, (96,54)), cv2.COLOR_BGR2GRAY))
            if len(frames) == 2:
                samples.append({"at": at, "score": float(cv2.absdiff(*frames).mean())})
    finally:
        cap.release()
    return samples


@router.post("/source")
def prepare_source(request: SourceRequest):
    try:
        path = source_path(request.path)
        if request.youtubeId and not path.is_file():
            path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(dir=path.parent) as temp:
                staged = Path(temp) / "source.mp4"
                progress = path.with_suffix(path.suffix + ".progress")
                try:
                    subprocess.run([sys.executable, "-m", "app.clip_download", request.youtubeId, str(staged), str(progress)],
                                   check=True, timeout=3600)
                finally:
                    progress.unlink(missing_ok=True)
                metadata = probe(staged)
                os.replace(staged, path)
                return metadata
        return probe(path)
    except Exception as exc:
        raise HTTPException(422, "Source could not be downloaded or decoded. Check the video and retry.") from exc


@router.post("/transcribe")
def transcribe(request: SourceRequest):
    path = source_path(request.path)
    if not probe(path)['audio']:
        return {'transcript': [], 'suggestions': [], 'words': [], 'language': None}
    return analyze_video(str(path), allow_silent=True)


class Caption(BaseModel):
    text: str = Field(max_length=5000)


class CaptionStyle(BaseModel):
    size: int = Field(default=52, ge=24, le=96)
    color: str = Field(default="#ffffff", pattern=r"^#[0-9a-fA-F]{6}$")
    background: bool = True
    font: Literal["sans","serif"] = "sans"
    weight: int = Field(default=400,ge=100,le=900)
    align: Literal["left","center","right"] = "center"
    bgColor: str = Field(default="#000000",pattern=r"^#[0-9a-fA-F]{6}$")
    opacity: float = Field(default=.76,ge=0,le=1)
    outline: int = Field(default=0,ge=0,le=12)
    outlineColor: str = Field(default="#000000",pattern=r"^#[0-9a-fA-F]{6}$")
    maxWidth: int = Field(default=960,ge=160,le=1000)
    shadow: bool = False
    y: int = Field(default=1460, ge=0, le=1600)


class StyledCaption(Caption):
    style: CaptionStyle = Field(default_factory=CaptionStyle)


@lru_cache(maxsize=96)
def caption_font(size, family, weight):
    filename = "NotoSerifDevanagari.ttf" if family == "serif" else "NotoSansDevanagari.ttf"
    font = ImageFont.truetype(str(Path(__file__).parent / "fonts" / filename), size)
    font.set_variation_by_axes([weight if axis["name"] == b"Weight" else axis["default"]
                                for axis in font.get_variation_axes()])
    return font


@lru_cache(maxsize=512)
def measure_text(text, requested, family="sans", weight=400, width=960, align="center", outline=0):
    draw = ImageDraw.Draw(Image.new("L", (1, 1)))
    size = requested
    while True:
        font = caption_font(size, family, weight)
        lines = []
        for paragraph in text.splitlines():
            line = ""
            for word in paragraph.split():
                candidate = (line + " " + word).strip()
                if line and draw.textlength(candidate,font=font) > width:
                    lines.append(line)
                    line = ""
                line = (line + " " + word).strip()
            lines.append(line)
        label = "\n".join(lines)
        box = draw.multiline_textbbox((540,160),label,font=font,anchor="mm",align=align,spacing=6,stroke_width=outline)
        if (box[2]-box[0]<=width+2*outline and box[1]>=14 and box[3]<=306) or size<=10:
            return size,label,box
        size=max(10,size-2)


def metrics(text, style):
    return measure_text(text, style.size, style.font, style.weight, style.maxWidth, style.align, style.outline)


def caption_bounds(text, style):
    size, _, box = metrics(text,style)
    xpad, ypad = (16, 10) if style.background else (0, 0)
    shadow = 4 if style.shadow else 0
    return {"bounds":[box[0]-xpad,box[1]+style.y-ypad,box[2]+max(xpad,shadow),box[3]+style.y+max(ypad,shadow)],
            "overflow": size != style.size}


def caption_image(text, style):
    image = Image.new("RGBA", (1080, 320))
    if text.strip():
        draw = ImageDraw.Draw(image)
        size,label,box = metrics(text,style)
        if style.background:
            draw.rounded_rectangle((box[0]-16,box[1]-10,box[2]+16,box[3]+10),radius=12,
                                   fill=(*ImageColor.getrgb(style.bgColor),round(255*style.opacity)))
        options = dict(font=caption_font(size,style.font,style.weight),anchor="mm",align=style.align,
                       spacing=6,stroke_width=style.outline)
        if style.shadow:
            draw.multiline_text((544,164),label,fill=(0,0,0,175),stroke_fill=(0,0,0,175),**options)
        draw.multiline_text((540,160),label,fill=style.color,stroke_fill=style.outlineColor,**options)
    return image


class MeasureRequest(BaseModel):
    cues: list[Caption] = Field(max_length=64)
    style: CaptionStyle


@router.post("/measure")
def measure(request: MeasureRequest):
    return [caption_bounds(c.text, request.style) for c in request.cues]


@router.post("/caption")
def caption(request: StyledCaption):
    out = io.BytesIO()
    caption_image(request.text, request.style).save(out, "PNG")
    return Response(out.getvalue(), media_type="image/png")


class Rect(BaseModel):
    sectionHeight: int = Field(default=960, ge=192, le=1920)
    x: int = Field(ge=0)
    font: Literal["sans","serif"] = "sans"
    weight: int = Field(default=400,ge=100,le=900)
    align: Literal["left","center","right"] = "center"
    bgColor: str = Field(default="#000000",pattern=r"^#[0-9a-fA-F]{6}$")
    opacity: float = Field(default=.76,ge=0,le=1)
    outline: int = Field(default=0,ge=0,le=12)
    outlineColor: str = Field(default="#000000",pattern=r"^#[0-9a-fA-F]{6}$")
    maxWidth: int = Field(default=960,ge=160,le=1000)
    shadow: bool = False
    y: int = Field(ge=0)
    w: int = Field(ge=2)
    h: int = Field(ge=2)
    dw: int = Field(ge=2, le=1080)
    dh: int = Field(ge=2, le=1920)
    dx: int = Field(ge=0, lt=1080)
    dy: int = Field(ge=0, lt=1920)


class Cue(Caption):
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)


class Segment(BaseModel):
    captionX: int = 0
    captionY: int | None = None
    at: float = Field(ge=0, allow_inf_nan=False)
    sections: list[Rect] = Field(min_length=1, max_length=2)


class Export(BaseModel):
    id: UUID
    path: str
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    top: Rect | None = None
    bottom: Rect | None = None
    segments: list[Segment] = Field(default_factory=list, max_length=129)
    style: CaptionStyle = Field(default_factory=CaptionStyle)
    cues: list[Cue]
    qualityCheck: bool = False
    guide: Literal['Off','Shorts','Reels'] = 'Off'


def caption_track(folder, cues, duration, style):
    # For overlaps the first active cue in source order wins, as in the editor.
    import heapq
    events = {0.0: [], duration: []}
    for index, cue in enumerate(cues):
        if 0 <= cue.start < cue.end <= duration + 1e-6:
            events.setdefault(cue.start, []).append(index)
            events.setdefault(min(duration, cue.end), [])
    active, lines, images = [], ["ffconcat version 1.0"], {}
    times = sorted(events)
    for start, end in zip(times, times[1:]):
        for index in events[start]:
            heapq.heappush(active, index)
        while active and cues[active[0]].end <= start:
            heapq.heappop(active)
        text = cues[active[0]].text if active else ""
        if text not in images:
            images[text] = f"cue{len(images)}.png"
            caption_image(text, style).save(folder / images[text])
        name = images[text]
        lines.extend([f"file {name}", "option framerate 1000", f"duration {end-start:.6f}"])
    lines.extend([f"file {name}", "option framerate 1000"])
    (folder / "track.txt").write_text("\n".join(lines), encoding="utf-8")


def output_rate(meta):
    try:
        fps = Fraction(meta["rate"])
    except (ValueError, ZeroDivisionError):
        fps = Fraction(30)
    return fps if 0 < fps <= 240 else Fraction(30)


def layout_graph(meta, segments, duration):
    """Quantize hard cuts once, then partition one decoded frame stream. Audio bypasses this graph."""
    fps = output_rate(meta)
    by_frame = {}
    for seg in segments:
        if sum(r.sectionHeight for r in seg.sections) != 1920 or seg.at >= duration:
            raise ValueError("Invalid segment bounds")
        by_frame[math.ceil(seg.at * fps - 1e-8)] = seg.sections
    starts = sorted(by_frame)
    if not starts or starts[0] != 0:
        raise ValueError("A layout is required at the start of the clip")
    starts = [i for i in starts if i < math.ceil(duration * fps - 1e-8)]
    graph = []
    stream = f"[0:{meta['stream']}]scale={meta['width']}:{meta['height']},setsar=1"
    # Single-layout renders can retain the original presentation timestamps.
    if len(starts) > 1:
        stream += f",fps={fps},split={len(starts)}" + "".join(f"[s{i}]" for i in range(len(starts)))
        graph.append(stream)
    for i, start in enumerate(starts):
        src = stream + "," if len(starts) == 1 else f"[s{i}]trim=start_frame={start}"
        if len(starts) > 1:
            if i + 1 < len(starts):
                src += f":end_frame={starts[i+1]}"
            src += ",setpts=PTS-STARTPTS,"
        rects = by_frame[start]
        if len(rects) == 2:
            graph.append(src + f"split[t{i}][b{i}]")
        for j, r in enumerate(rects):
            branch = f"[{'tb'[j]}{i}]" if len(rects) == 2 else src
            dest = f"[p{i}_{j}]" if len(rects) == 2 else f"[v{i}]"
            graph.append(branch + f"crop={r.w}:{r.h}:{r.x}:{r.y}:exact=1,scale={r.dw}:{r.dh},"
                         f"setsar=1,pad=1080:{r.sectionHeight}:{r.dx}:{r.dy}:black" + dest)
        if len(rects) == 2:
            graph.append(f"[p{i}_0][p{i}_1]vstack[v{i}]")
    if len(starts) == 1:
        return graph, "[v0]"
    graph.append("".join(f"[v{i}]" for i in range(len(starts))) +
                 f"concat=n={len(starts)}:v=1:a=0,setpts=N/({fps}*TB)[cut]")
    return graph, "[cut]"


def render(request):
    source = source_path(request.path)
    meta = probe(source)
    segments = request.segments
    if not segments and request.top and request.bottom:
        segments = [Segment(at=0, sections=[request.top, request.bottom])]
    duration = request.end - request.start
    if duration <= 0 or request.end > meta["duration"] + .001:
        raise ValueError("Trim falls outside the source")
    folder = ROOT / "processed" / "clips"
    folder.mkdir(parents=True, exist_ok=True)
    output = folder / f"{request.id}.mp4"
    with tempfile.TemporaryDirectory(dir=folder) as temp:
        temp = Path(temp)
        args = [get_tool_path("ffmpeg"), "-nostdin", "-v", "error", "-y", "-ss", str(request.start),
                *LOCAL_INPUT, "-i", str(source)]
        graph, video = layout_graph(meta, segments, duration)
        if request.cues:
            caption_track(temp, request.cues, duration, request.style)
            args += ["-f", "concat", "-safe", "0", "-i", "track.txt"]
            def coordinate(key, default):
                expr = str(default)
                for seg in segments:
                    value = getattr(seg, key)
                    value = default if value is None else value
                    expr = str(value) if seg.at == 0 else f"if(gte(t,{seg.at}),{value},{expr})"
                return expr
            x = coordinate("captionX", 0)
            y = coordinate("captionY", request.style.y)
            graph.append(f"{video}[1:v]overlay=x='{x}':y='{y}'[out]")
            video = "[out]"
        if len(segments) > 1:
            # concat uses a microsecond time base. Explicit CFR gives the last
            # encoded frame its full duration, including on sources without audio.
            args += ["-r", str(output_rate(meta)), "-fps_mode", "cfr"]
        args += ["-filter_complex_threads", "2", "-filter_complex", ";".join(graph), "-map", video, "-map", "0:a:0?",
                 "-t", str(duration), "-c:v", "libx264", "-preset", "veryfast", "-threads", "4", "-pix_fmt",
                 "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "result.mp4"]
        progress = folder / f"{request.id}.progress"
        try:
            with subprocess.Popen(args[:1]+["-progress","pipe:1","-nostats"]+args[1:],cwd=temp,
                                  stdout=subprocess.PIPE,text=True) as process:
                for line in process.stdout:
                    if line.startswith("out_time_us="):
                        value=line.strip().partition("=")[2]
                        if value.lstrip("-").isdigit():
                            (temp / "progress").write_text(str(max(0,min(99,int(int(value)/duration/10000)))))
                            os.replace(temp / "progress",progress)
                if process.wait():
                    raise ValueError("FFmpeg export failed")
        finally:
            progress.unlink(missing_ok=True)
        check = probe(temp / "result.mp4")
        if ((check["width"], check["height"]) != (1080, 1920)
                or check["audio"] != meta["audio"]
                or abs(check["duration"] - duration) > max(.15, 2 / float(output_rate(meta)))):
            raise ValueError("Export failed dimension, duration or audio validation")
        report = {"width": check["width"], "height": check["height"], "duration": check["duration"], "audio": check["audio"]}
        if request.qualityCheck:
            from app.clip_quality import audit
            report.update(audit(source, temp / "result.mp4", request, segments, meta,
                                get_tool_path("ffmpeg"), caption_bounds))
        os.replace(temp / "result.mp4", output)
        return report


@router.post("/export")
def export_clip(request: Export):
    try:
        return {"status": "completed", "quality": render(request)}
    except Exception as exc:
        raise HTTPException(422, "Could not encode the saved source and trim.") from exc
