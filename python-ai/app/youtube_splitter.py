import os
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

    # Quality formats mapping (allow downloading high-res non-mp4 streams like VP9/WebM then merge to MP4 container)
    quality_map = {
        "1080p": "bestvideo[height<=1080]+bestaudio/best[height<=1080]/best",
        "720p": "bestvideo[height<=720]+bestaudio/best[height<=720]/best",
        "480p": "bestvideo[height<=480]+bestaudio/best[height<=480]/best",
        "360p": "bestvideo[height<=360]+bestaudio/best[height<=360]/best",
        "best": "bestvideo+bestaudio/best",
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
        # Fallback to general best format if merge failed
        try:
            logger.info("Retrying with simple best format...")
            ydl_opts['format'] = 'best'
            ydl_opts.pop('merge_output_format', None)
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
                # Vertical crop: crop to 9:16 centered, divisible by 2, and re-encode to H.264 (high-quality visually lossless)
                cmd = [
                    ffmpeg_bin,
                    "-y",
                    "-ss", str(start_time),
                    "-to", str(end_time),
                    "-i", temp_download_path,
                    "-vf", "crop=2*trunc(ih*9/32):ih",
                    "-c:v", "libx264",
                    "-crf", "20",
                    "-preset", "fast",
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
