import os
import json
import time
import subprocess
import logging
import requests
from yt_dlp import YoutubeDL
from app.ffmpeg_utils import get_tool_path

logger = logging.getLogger(__name__)

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

def download_youtube_video(youtube_url: str, output_path: str, video_quality: str = "1080p", progress_callback=None) -> bool:
    """Download YouTube video using yt-dlp with specified format quality limits."""
    def yt_dlp_hook(d):
        if d['status'] == 'downloading':
            total = d.get('total_bytes') or d.get('total_bytes_estimate')
            downloaded = d.get('downloaded_bytes', 0)
            if total and progress_callback:
                percentage = int((downloaded / total) * 100)
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

    try:
        with YoutubeDL(ydl_opts) as ydl:
            ydl.download([youtube_url])
        return True
    except Exception as e:
        logger.error(f"yt-dlp download failed: {str(e)}")
        # Fallback: try best available with relaxed constraints
        try:
            logger.info("Retrying with best available format (no height limit)...")
            ydl_opts['format'] = 'bestvideo+bestaudio/best'
            ydl_opts['merge_output_format'] = 'mp4'
            with YoutubeDL(ydl_opts) as ydl:
                ydl.download([youtube_url])
            return True
        except Exception as retry_err:
            logger.error(f"yt-dlp retry failed: {str(retry_err)}")
            raise e

def split_video_into_shorts(
    job_id: str,
    youtube_url: str,
    output_dir: str,
    clip_duration: int,
    progress_callback_url: str,
    video_quality: str = "1080p",
    orientation: str = "horizontal"
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
            
        download_youtube_video(youtube_url, temp_download_path, video_quality, download_progress_hook)
        
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
            
        # Calculate segments (max 10 clips)
        clip_len = clip_duration
        num_clips = min(int(duration // clip_len), 10)
        
        if num_clips == 0:
            num_clips = 1
            clip_len = duration
            
        logger.info(f"Splitting video into {num_clips} segments of {clip_len}s duration ({orientation} format)...")
        
        clip_filenames = []
        ffmpeg_bin = get_tool_path("ffmpeg")
        
        # Step C: Split using FFmpeg
        for i in range(num_clips):
            start_time = i * clip_len
            end_time = min((i + 1) * clip_len, duration)
            
            clip_name = f"clip_{i + 1}.mp4"
            clip_output_path = os.path.join(output_dir, clip_name)
            
            if orientation.lower() == "vertical":
                # Vertical crop: crop to 9:16 centered, re-encode to high-quality H.264 (near-lossless)
                cmd = [
                    ffmpeg_bin,
                    "-y",
                    "-ss", str(start_time),
                    "-to", str(end_time),
                    "-i", temp_download_path,
                    "-vf", "crop=2*trunc(ih*9/32):ih",
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
            else:
                # Fast stream copy (instant!)
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
            subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
            
            clip_filenames.append(clip_name)
            
            prog = 50 + int(((i + 1) / num_clips) * 45)
            send_progress(prog, f"Extracting Clip {i+1}/{num_clips}...")

        return clip_filenames
        
    finally:
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
