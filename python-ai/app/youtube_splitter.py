import os
import json
import time
import subprocess
import logging
import re
import requests
from yt_dlp import YoutubeDL
from app.ffmpeg_utils import get_tool_path

logger = logging.getLogger(__name__)


class JobCanceled(Exception):
    """Raised when a user cancels a YouTube processing job."""


def _ass_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")


def _ass_timestamp(seconds: float) -> str:
    total = max(0.0, seconds)
    hours = int(total // 3600)
    minutes = int((total % 3600) // 60)
    remainder = total % 60
    return f"{hours}:{minutes:02d}:{remainder:05.2f}"


def write_bottom_center_captions(path: str, words: list[dict], start: float, end: float) -> None:
    """Write readable bottom-center captions for a rendered clip."""
    selected = [word for word in words if float(word.get("end", 0)) > start and float(word.get("start", 0)) < end]
    lines = [
        "[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        "Style: Default,Arial,58,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,1,4,1,2,60,60,190,1",
        "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for index in range(0, len(selected), 5):
        group = selected[index:index + 5]
        cue_start = max(start, float(group[0]["start"])) - start
        cue_end = min(end, float(group[-1]["end"])) - start
        text = " ".join(_ass_escape(str(word.get("word", "")).strip()) for word in group).strip()
        if text:
            lines.append(f"Dialogue: 0,{_ass_timestamp(cue_start)},{_ass_timestamp(cue_end)},Default,,0,0,0,,{text}")
    with open(path, "w", encoding="utf-8") as caption_file:
        caption_file.write("\n".join(lines) + "\n")

def get_video_duration(video_path: str) -> float:
    """Use ffprobe to get duration of the video in seconds."""
    ffprobe_bin = get_tool_path("ffprobe")
    cmd = [
        ffprobe_bin,
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return float(result.stdout.strip())
    except Exception as e:
        logger.error(f"Failed to get duration for {video_path}: {e}")
        return 0.0

def download_youtube_video(youtube_url: str, output_path: str, video_quality: str = "1080p", progress_callback=None, cancel_check=None, source_type: str = "video", clip_source: bool = False) -> bool:
    """Download YouTube video using yt-dlp with specified format quality limits."""
    def yt_dlp_hook(d):
        if cancel_check and cancel_check():
            raise JobCanceled("Canceled by user.")
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate')
            downloaded = d.get('downloaded_bytes', 0)
            if total and progress_callback:
                percentage = int((downloaded / total) * 100)
                if clip_source:
                    track = "Audio" if d.get("info_dict", {}).get("vcodec") == "none" else "Video"
                    progress_callback(percentage, track)
                else:
                    progress_callback(percentage)
        elif d['status'] == 'finished':
            logger.info("yt-dlp finished downloading.")

    # Quality formats mapping (highest quality options, prefer high-bitrate codecs)
    quality_map = {
        "2160p": "bestvideo[height<=2160]+bestaudio/best[height<=2160]/best",
        "1440p": "bestvideo[height<=1440]+bestaudio/best[height<=1440]/best",
        "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "720p": "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
        "480p": "bestvideo[height<=480]+bestaudio/best[height<=480]/best",
        "360p": "bestvideo[height<=360]+bestaudio/best[height<=360]/best",
        "best": "bestvideo[height<=2160]+bestaudio/best[height<=2160]/best",
    }
    
    selected_format = quality_map.get(video_quality.lower(), quality_map["best"])
    logger.info(f"Using yt-dlp format selection: '{selected_format}'")

    ydl_opts = {
        'format': selected_format,
        'outtmpl': output_path,
        'progress_hooks': [yt_dlp_hook],
        'quiet': True,
        'no_warnings': True,
        'overwrites': True,
        'merge_output_format': 'mp4',
        'ffmpeg_location': get_tool_path('ffmpeg')
    }

    if source_type == "livestream":
        # Live URLs are handled explicitly so yt-dlp does not look only for
        # a finished replay. The job still completes after the stream ends.
        ydl_opts.update({
            'live_from_start': True,
            'wait_for_video': (5, 30),
            'hls_use_mpegts': True,
        })

    # YouTube increasingly requires a browser session for some videos. Keep
    # cookies optional so public videos still work without extra setup.
    cookie_file = os.getenv('YOUTUBE_COOKIES_FILE', '').strip()
    if cookie_file and os.path.isfile(cookie_file):
        ydl_opts['cookiefile'] = cookie_file
        logger.info("Using configured YouTube cookies file.")

    if clip_source:
        # Download direct HTTPS streams inside the guarded Python process. The
        # FFmpeg merger may only open local MP4 tracks, never remote manifests.
        ydl_opts.update(format="bestvideo[height<=1080][ext=mp4][protocol=https][vcodec^=avc1]+bestaudio[ext=m4a][protocol=https]/best[ext=mp4][protocol=https]",
                        noplaylist=True, noprogress=True, proxy="", fixup="never", hls_prefer_native=True,
                        cachedir=False, js_runtimes={}, remote_components=set(), postprocessor_args={
                            "merger+ffmpeg_i": ["-protocol_whitelist", "file,pipe", "-format_whitelist", "mov"]},
                        match_filter=lambda info, *, incomplete=False: "Live video" if info.get("is_live") else None)
        with YoutubeDL(ydl_opts) as ydl:
            handlers = ydl._request_director.handlers
            for key in list(handlers):
                if key != "Urllib":
                    del handlers[key]
            if ydl.download([youtube_url]):
                raise RuntimeError("YouTube source download failed")
        return True

    try:
        if cancel_check and cancel_check():
            raise JobCanceled("Canceled by user.")
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])
        return True
    except JobCanceled:
        raise
    except Exception as e:
        logger.error(f"yt-dlp download failed: {str(e)}")
        # Fallback: try best available with relaxed constraints
        try:
            if cancel_check and cancel_check():
                raise JobCanceled("Canceled by user.")
            logger.info("Retrying with best available format (no height limit)...")
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
            ydl_opts['merge_output_format'] = 'mp4'
            with YoutubeDL(ydl_opts) as ydl:
                ydl.download([youtube_url])
            return True
        except JobCanceled:
            raise
        except Exception as retry_err:
            logger.error(f"yt-dlp retry failed: {str(retry_err)}")
            retry_message = str(retry_err).lower()
            if 'live stream recording is not available' in retry_message:
                raise RuntimeError(
                    "This YouTube livestream does not have a downloadable replay/archive. "
                    "Use a completed video, or wait until the livestream ends before clipping it."
                ) from retry_err
            if 'page needs to be reloaded' in retry_message:
                raise RuntimeError(
                    "YouTube rejected this request. Update yt-dlp, or configure "
                    "YOUTUBE_COOKIES_FILE with cookies exported from a browser."
                ) from retry_err
            raise e

def find_highlight_windows(video_path: str, target_duration: int = 30, limit: int = 10, cancel_check=None) -> list[dict]:
    """Find non-overlapping, transcript-aligned moments instead of fixed time slices."""
    from faster_whisper import WhisperModel

    model = WhisperModel(
        os.getenv("WHISPER_MODEL", "small"),
        device=os.getenv("WHISPER_DEVICE", "cpu"),
        compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"),
    )
    segments, _ = model.transcribe(video_path, vad_filter=True, word_timestamps=True)
    transcript = []
    for segment in segments:
        if cancel_check and cancel_check():
            raise JobCanceled("Canceled by user.")
        if segment.text and segment.text.strip():
            segment_words = [
                {"start": float(word.start), "end": float(word.end), "word": word.word.strip()}
                for word in (segment.words or [])
                if word.word and word.word.strip()
            ]
            transcript.append({"start": float(segment.start), "end": float(segment.end), "text": segment.text.strip(), "words": segment_words})
    if not transcript:
        return []

    target = max(15.0, min(float(target_duration), 90.0))
    hook_pattern = re.compile(
        r"\b(how|why|secret|mistake|truth|best|worst|learn|discover|never|always|because|first|finally|important|actually|imagine)\b",
        re.I,
    )
    candidates = []
    for index, first in enumerate(transcript):
        start = max(0.0, first["start"] - 1.25)
        end_index = index
        while end_index + 1 < len(transcript) and transcript[end_index]["end"] - start < target * 0.82:
            end_index += 1
        # Include a complete trailing sentence where possible, but keep the
        # requested duration useful for Shorts/Reels/TikTok exports.
        if end_index + 1 < len(transcript) and transcript[end_index]["end"] - start < target + 5:
            end_index += 1
        end = transcript[end_index]["end"]
        if end - start < 12:
            continue

        text = " ".join(item["text"] for item in transcript[index:end_index + 1]).strip()
        words = [word for item in transcript[index:end_index + 1] for word in item.get("words", [])]
        word_count = len(text.split())
        duration = max(end - start, 1.0)
        hook_count = len(hook_pattern.findall(text))
        density = word_count / duration
        punctuation_bonus = 5 if re.search(r"[!?]", text) else 0
        duration_bonus = max(0, 10 - abs(duration - target) * 0.35)
        score = min(99, round(30 + min(28, density * 8) + min(24, hook_count * 6) + punctuation_bonus + duration_bonus))
        candidates.append({
            "start": round(start, 2),
            "end": round(end, 2),
            "text": text,
            "score": score,
            "hook_count": hook_count,
            "density": density,
            "words": words,
        })

    candidates.sort(key=lambda item: (item["score"], item["density"]), reverse=True)
    selected = []
    for candidate in candidates:
        overlap = False
        for existing in selected:
            intersection = max(0.0, min(candidate["end"], existing["end"]) - max(candidate["start"], existing["start"]))
            shorter = min(candidate["end"] - candidate["start"], existing["end"] - existing["start"])
            if shorter and intersection / shorter > 0.45:
                overlap = True
                break
        if overlap:
            continue
        selected.append({
            "start": candidate["start"],
            "end": candidate["end"],
            "title": candidate["text"][:72] + ("..." if len(candidate["text"]) > 72 else ""),
            "text": candidate["text"],
            "score": candidate["score"],
            "reason": "Strong spoken moment" + (" with hook language" if candidate["hook_count"] else " with clear speech density"),
            "words": candidate.get("words", []),
        })
        if len(selected) >= limit:
            break
    return selected

def split_video_into_shorts(
    job_id: str,
    youtube_url: str,
    output_dir: str,
    clip_duration: int,
    progress_callback_url: str,
    video_quality: str = "1080p",
    orientation: str = "horizontal",
    source_type: str = "video",
    cancel_check=None
) -> list:
    """Downloads a YouTube video and splits it into multiple clip segments of specified duration."""
    
    # Setup paths
    os.makedirs(output_dir, exist_ok=True)
    temp_download_path = os.path.join(output_dir, f"raw_{job_id}.mp4")
    
    def send_progress(prog: int, detail: str = "PROCESSING"):
        try:
            requests.post(
                progress_callback_url,
                json={"jobId": job_id, "progress": prog, "status": "PROCESSING"},
                timeout=1
            )
        except Exception as e:
            logger.warning(f"Failed to post progress: {e}")

    try:
        # Step A: Download YouTube video (5% to 45% progress)
        logger.info(f"Downloading YouTube video ({video_quality}): {youtube_url}")
        send_progress(5, "Downloading YouTube Video...")
        
        def download_progress_hook(pct):
            prog = 5 + int(pct * 0.40)
            send_progress(prog, "Downloading YouTube Video...")
            
        download_youtube_video(youtube_url, temp_download_path, video_quality, download_progress_hook, cancel_check, source_type)
        if cancel_check and cancel_check():
            raise JobCanceled("Canceled by user.")
        
        # Verify download exists
        if not os.path.exists(temp_download_path):
            if os.path.exists(temp_download_path + ".mp4"):
                os.rename(temp_download_path + ".mp4", temp_download_path)
            else:
                raise FileNotFoundError(f"Downloaded file not found at {temp_download_path}")

        # Step B: Get duration
        duration = get_video_duration(temp_download_path)
        logger.info(f"Downloaded video duration: {duration}s")
        
        if duration <= 0:
            raise ValueError("Failed to retrieve valid video duration.")
            
        # Analyze spoken content and select meaningful, non-overlapping windows.
        # Set YOUTUBE_AI_CLIPS=false to restore the legacy fixed-slice behavior.
        use_ai_clips = os.getenv("YOUTUBE_AI_CLIPS", "true").lower() not in {"0", "false", "no"}
        if use_ai_clips:
            send_progress(47, "Transcribing and finding meaningful moments...")
        highlight_windows = find_highlight_windows(temp_download_path, clip_duration, cancel_check=cancel_check) if use_ai_clips else []
        if not highlight_windows:
            logger.warning("No transcript highlights found; falling back to fixed intervals.")
            clip_len = clip_duration
            num_clips = min(max(1, int(duration // clip_len)), 10)
            highlight_windows = [{"start": i * clip_len, "end": min((i + 1) * clip_len, duration), "title": f"Clip {i + 1}"} for i in range(num_clips)]
        else:
            logger.info("Selected %s AI highlight windows from transcript.", len(highlight_windows))

        num_clips = len(highlight_windows)
        logger.info(f"Rendering {num_clips} transcript-aligned clips ({orientation} format)...")
        
        clip_filenames = []
        ffmpeg_bin = get_tool_path("ffmpeg")
        caption_paths = []
        
        # Step C: Split using FFmpeg
        for i, window in enumerate(highlight_windows):
            if cancel_check and cancel_check():
                raise JobCanceled("Canceled by user.")
            start_time = max(0.0, float(window["start"]))
            end_time = min(float(window["end"]), duration)
            
            clip_name = f"clip_{i + 1}.mp4"
            clip_output_path = os.path.join(output_dir, clip_name)
            caption_path = os.path.join(output_dir, f".captions_{job_id}_{i + 1}.ass")
            clip_words = window.get("words", [])
            has_captions = bool(clip_words)
            if has_captions:
                write_bottom_center_captions(caption_path, clip_words, start_time, end_time)
                caption_paths.append(caption_path)
            
            if orientation.lower() == "vertical":
                # Vertical crop: crop to 9:16 centered, re-encode to high-quality H.264 (near-lossless)
                video_filter = "crop=2*trunc(ih*9/32):ih"
                if has_captions:
                    video_filter += f",subtitles={caption_path}"
                cmd = [
                    ffmpeg_bin,
                    "-y",
                    "-ss", str(start_time),
                    "-to", str(end_time),
                    "-i", temp_download_path,
                    "-vf", video_filter,
                    "-c:v", "libx264",
                    "-crf", "18",
                    "-preset", "slow",
                    "-profile:v", "high",
                    "-level", "4.2",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    clip_output_path
                ]
            elif has_captions:
                # Captioned horizontal clips must be re-encoded so subtitles are burned in.
                cmd = [
                    ffmpeg_bin,
                    "-y",
                    "-ss", str(start_time),
                    "-to", str(end_time),
                    "-i", temp_download_path,
                    "-vf", f"subtitles={caption_path}",
                    "-c:v", "libx264",
                    "-crf", "18",
                    "-preset", "fast",
                    "-pix_fmt", "yuv420p",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    clip_output_path
                ]
            else:
                # Fast stream copy when no caption burn-in is needed.
                cmd = [
                    ffmpeg_bin,
                    "-y",
                    "-ss", str(start_time),
                    "-to", str(end_time),
                    "-i", temp_download_path,
                    "-c", "copy",
                    "-avoid_negative_ts", "make_zero",
                    clip_output_path
                ]
            
            logger.info(f"Creating Clip {i+1}: {start_time}s to {end_time}s (Orientation: {orientation})")
            process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            while process.poll() is None:
                if cancel_check and cancel_check():
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait()
                    raise JobCanceled("Canceled by user.")
                time.sleep(0.2)
            if process.returncode != 0:
                raise subprocess.CalledProcessError(process.returncode, cmd)
            
            clip_filenames.append(clip_name)
            
            prog = 50 + int(((i + 1) / num_clips) * 45)
            send_progress(prog, f"Extracting Clip {i+1}/{num_clips}...")

        return clip_filenames
        
    finally:
        for caption_path in locals().get("caption_paths", []):
            try:
                if os.path.exists(caption_path):
                    os.remove(caption_path)
            except Exception as e:
                logger.warning(f"Could not remove caption file {caption_path}: {e}")
        # Cleanup raw download file
        if os.path.exists(temp_download_path):
            try:
                os.remove(temp_download_path)
            except Exception as e:
                logger.warning(f"Could not remove temp download video: {e}")

def extract_playlist_info(playlist_url: str, max_videos: int = 20) -> list:
    """Extract video entries from a YouTube playlist with retries and SSL fallback."""
    def _parse_entries(raw_entries, limit):
        result = []
        for i, entry in enumerate(raw_entries):
            if i >= limit:
                break
            if entry is None:
                continue
            if isinstance(entry, str):
                result.append({'id': entry, 'title': f'Video {i+1}', 'url': f"https://www.youtube.com/watch?v={entry}", 'duration': 0, 'index': i + 1})
            elif isinstance(entry, dict):
                vid = entry.get('id') or entry.get('url', '')
                if not vid:
                    continue
                result.append({
                    'id': vid,
                    'title': entry.get('title', f'Video {i+1}'),
                    'url': f"https://www.youtube.com/watch?v={vid}",
                    'duration': entry.get('duration', 0),
                    'index': i + 1,
                })
        return result

    base_opts = {
        'quiet': True,
        'no_warnings': True,
        'force_generic_extractor': False,
        'extractor_retries': 5,
        'file_access_retries': 5,
    }

    # Try different combinations: flat/full, with/without legacy_ssl
    strategies = [
        {'extract_flat': True},
        {'extract_flat': False},
        {'extract_flat': True, 'legacyssl': True, 'http_headers': {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}},
        {'extract_flat': False, 'legacyssl': True, 'http_headers': {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}},
    ]

    for attempt in range(3):
        for strategy in strategies:
            try:
                opts = {**base_opts, **strategy}
                with YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(playlist_url, download=False)
                    if info is None:
                        continue
                    raw_entries = info.get('entries', [])
                    entries = _parse_entries(raw_entries, max_videos)
                    playlist_title = info.get('title', 'Untitled Playlist')
                    method = 'flat' if strategy.get('extract_flat') else 'full'
                    ssl_mode = 'legacy' if strategy.get('legacyssl') else 'modern'
                    logger.info(f"Playlist '{playlist_title}': found {len(entries)} videos ({method}, {ssl_mode}, attempt={attempt+1})")
                    if entries:
                        return entries
            except Exception as e:
                logger.warning(f"Playlist extraction failed (strategy={strategy}, attempt={attempt+1}): {type(e).__name__}")
                time.sleep(3 * (attempt + 1))
                continue

    # Last resort: use yt-dlp subprocess with --flat-playlist --dump-single-json
    logger.info("Trying yt-dlp subprocess as last resort...")
    try:
        yt_dlp_bin = get_tool_path("yt-dlp")
        if not yt_dlp_bin:
            yt_dlp_bin = "yt-dlp"
        cmd = [yt_dlp_bin, "--flat-playlist", "--dump-single-json", "--no-warnings", "--ignore-errors", playlist_url]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and result.stdout.strip():
            data = json.loads(result.stdout)
            raw_entries = data.get('entries', [])
            entries = _parse_entries(raw_entries, max_videos)
            playlist_title = data.get('title', 'Untitled Playlist')
            logger.info(f"Playlist '{playlist_title}': found {len(entries)} videos via subprocess")
            if entries:
                return entries
    except Exception as e:
        logger.warning(f"Subprocess extraction failed: {e}")

    raise ValueError("Could not extract any videos from the playlist URL.")

def download_playlist_videos(
    job_id: str,
    playlist_url: str,
    output_dir: str,
    progress_callback_url: str,
    video_quality: str = "best",
    max_videos: int = 10
) -> list:
    """Download all videos from a YouTube playlist."""
    os.makedirs(output_dir, exist_ok=True)

    def send_progress(prog: int, detail: str = "PROCESSING"):
        try:
            requests.post(
                progress_callback_url,
                json={"jobId": job_id, "progress": prog, "status": "PROCESSING"},
                timeout=2
            )
        except Exception as e:
            logger.warning(f"Failed to post progress: {e}")

    try:
        send_progress(2, "Fetching playlist info...")
        entries = extract_playlist_info(playlist_url, max_videos)

        if not entries:
            raise ValueError("No videos found in playlist.")

        total = len(entries)
        downloaded_files = []

        for i, entry in enumerate(entries):
            video_url = entry['url']
            safe_title = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in entry['title'])
            safe_title = safe_title.strip()[:80] or f"video_{entry['id']}"
            output_path = os.path.join(output_dir, f"{i + 1:02d}_{safe_title}.mp4")

            base_progress = 10 + int((i / total) * 85)
            send_progress(base_progress, f"Downloading video {i+1}/{total}...")

            def make_progress_hook(video_idx, total_videos):
                base = 10 + int((video_idx / total_videos) * 85)
                remaining = int((1 / total_videos) * 85) if total_videos > 0 else 85
                def hook(pct):
                    p = base + int(pct * remaining * 0.01)
                    send_progress(min(p, 95), f"Downloading video {video_idx+1}/{total_videos}...")
                return hook

            success = download_youtube_video(video_url, output_path, video_quality, make_progress_hook(i, total))

            if success and os.path.exists(output_path):
                downloaded_files.append({
                    'filename': os.path.basename(output_path),
                    'title': entry['title'],
                    'url': video_url,
                })
                logger.info(f"Downloaded [{i+1}/{total}]: {entry['title']}")
            else:
                if os.path.exists(output_path + ".mp4"):
                    os.rename(output_path + ".mp4", output_path)
                    downloaded_files.append({
                        'filename': os.path.basename(output_path),
                        'title': entry['title'],
                        'url': video_url,
                    })

        send_progress(100, "Playlist download complete")
        return downloaded_files

    except Exception as e:
        logger.error(f"Playlist download failed: {str(e)}")
        raise
