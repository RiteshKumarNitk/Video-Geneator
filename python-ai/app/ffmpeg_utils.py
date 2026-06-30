import subprocess
import os
import shutil
import logging

logger = logging.getLogger(__name__)

def get_tool_path(name: str) -> str:
    """Resolve path of tool (ffmpeg or ffprobe), checking standard locations on Windows."""
    # Check standard PATH resolution
    resolved = shutil.which(name)
    if resolved:
        return resolved
        
    # Windows specific directory fallback searches
    if os.name == 'nt':
        fallbacks = [
            rf"C:\ffmpeg\bin\{name}.exe",
            rf"C:\ffmpeg\{name}.exe",
            rf"D:\ffmpeg\bin\{name}.exe",
            rf"D:\ffmpeg\{name}.exe",
            rf"C:\Program Files\ffmpeg\bin\{name}.exe",
        ]
        for path in fallbacks:
            if os.path.exists(path):
                logger.info(f"Resolved {name} path via fallback: {path}")
                return path
                
    return name

def has_audio(video_path: str) -> bool:
    """Check if the video file contains an audio stream."""
    ffprobe_bin = get_tool_path("ffprobe")
    cmd = [
        ffprobe_bin,
        "-v", "error",
        "-select_streams", "a",
        "-show_entries", "stream=codec_name",
        "-of", "default=noprint_wrappers=1:nokey=1",
        video_path
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
        return len(result.stdout.strip()) > 0
    except subprocess.CalledProcessError as e:
        logger.error(f"Error checking audio: {e.stderr}")
        return False
    except Exception as e:
        logger.error(f"Failed to check audio: {str(e)}")
        return False

def extract_audio(video_path: str, audio_output_path: str) -> bool:
    """Extract audio from video file and transcode to AAC."""
    ffmpeg_bin = get_tool_path("ffmpeg")
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", video_path,
        "-vn",
        "-c:a", "aac",
        audio_output_path
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Error extracting audio: {e.stderr.decode()}")
        return False

def extract_audio_high_quality(video_path: str, audio_output_path: str) -> bool:
    """Extract audio from video file and transcode to high-bitrate AAC."""
    ffmpeg_bin = get_tool_path("ffmpeg")
    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", video_path,
        "-vn",
        "-c:a", "aac",
        "-b:a", "320k",
        audio_output_path
    ]
    try:
        subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Error extracting audio: {e.stderr.decode()}")
        return False

def merge_audio_video(video_path: str, audio_path: str, output_path: str) -> bool:
    """Merge video stream and audio stream into a final MP4 with H264 video codec."""
    # Ensure output directory exists
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    ffmpeg_bin = get_tool_path("ffmpeg")
    
    if audio_path and os.path.exists(audio_path):
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i", video_path,
            "-i", audio_path,
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "slow",
            "-profile:v", "high",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "320k",
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-shortest",
            output_path
        ]
    else:
        cmd = [
            ffmpeg_bin,
            "-y",
            "-i", video_path,
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "slow",
            "-profile:v", "high",
            "-pix_fmt", "yuv420p",
            output_path
        ]
        
    try:
        logger.info(f"Running ffmpeg command: {' '.join(cmd)}")
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Error merging audio/video: {e.stderr.decode()}")
        return False
