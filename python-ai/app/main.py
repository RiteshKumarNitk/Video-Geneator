import os
import shutil
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel, HttpUrl
import requests

from app.matting import process_video_matting
from app.youtube_splitter import split_video_into_shorts, download_playlist_videos
from app.ffmpeg_utils import has_audio, extract_audio_high_quality as extract_audio, merge_audio_video
from app.tts import text_to_speech, SUPPORTED_LANGUAGES

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Video Engine Service")

class ProcessVideoRequest(BaseModel):
    jobId: str
    videoPath: str
    outputPath: str
    progressCallbackUrl: str
    backgroundType: str = "green"

class YoutubeSplitRequest(BaseModel):
    jobId: str
    youtubeUrl: str
    clipDuration: int = 30
    videoQuality: str = "1080p"
    orientation: str = "horizontal"
    outputDir: str
    progressCallbackUrl: str

class YoutubePlaylistRequest(BaseModel):
    jobId: str
    playlistUrl: str
    videoQuality: str = "best"
    maxVideos: int = 10
    outputDir: str
    progressCallbackUrl: str

class TextToSpeechRequest(BaseModel):
    jobId: str
    text: str
    language: str = "hi"
    slow: bool = False
    outputPath: str
    progressCallbackUrl: str

def run_pipeline(request: ProcessVideoRequest):
    """Executes the full matting and audio composition pipeline in the background."""
    job_id = request.jobId
    video_path = request.videoPath
    output_path = request.outputPath
    callback_url = request.progressCallbackUrl
    bg_type = request.backgroundType

    # Temp file paths
    temp_dir = os.path.join(os.path.dirname(output_path), "temp")
    os.makedirs(temp_dir, exist_ok=True)
    
    temp_video = os.path.join(temp_dir, f"video_{job_id}.mp4")
    temp_audio = os.path.join(temp_dir, f"audio_{job_id}.aac")
    
    try:
        logger.info(f"Starting processing pipeline for job: {job_id}")
        
        # Step 1: Detect and Extract Audio
        audio_extracted = False
        if has_audio(video_path):
            logger.info(f"Job {job_id}: Audio stream detected. Extracting...")
            audio_extracted = extract_audio(video_path, temp_audio)
            if audio_extracted:
                logger.info(f"Job {job_id}: Audio extracted successfully.")
            else:
                logger.warning(f"Job {job_id}: Failed to extract audio. Video will be processed without audio.")
        else:
            logger.info(f"Job {job_id}: No audio stream found.")

        # Step 2: Run AI Matting and Background Replacement
        logger.info(f"Job {job_id}: Running AI matting model...")
        process_video_matting(
            job_id=job_id,
            video_path=video_path,
            output_temp_path=temp_video,
            progress_callback_url=callback_url,
            background_type=bg_type
        )
        
        # Step 3: Stitch/Merge Audio & Transcode to Web H264
        logger.info(f"Job {job_id}: Transcoding and merging streams...")
        actual_audio = temp_audio if audio_extracted else None
        success = merge_audio_video(temp_video, actual_audio, output_path)
        
        if not success:
            raise RuntimeError("FFmpeg transcode and merge failed.")
            
        logger.info(f"Job {job_id}: Pipeline complete! File saved to {output_path}")
        
        # Send complete status webhook
        requests.post(
            callback_url,
            json={"jobId": job_id, "progress": 100, "status": "COMPLETED"},
            timeout=5
        )
        
    except Exception as e:
        logger.error(f"Job {job_id} failed with error: {str(e)}", exc_info=True)
        # Send failure status webhook
        try:
            requests.post(
                callback_url,
                json={"jobId": job_id, "progress": 0, "status": "FAILED", "error": str(e)},
                timeout=5
            )
        except Exception as webhook_err:
            logger.error(f"Failed to send failure webhook for job {job_id}: {str(webhook_err)}")
            
    finally:
        # Cleanup temp files
        for temp_file in [temp_video, temp_audio]:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except Exception as cleanup_err:
                    logger.warning(f"Failed to delete temp file {temp_file}: {cleanup_err}")

def run_youtube_split_pipeline(request: YoutubeSplitRequest):
    """Executes the YouTube downloading and splitting pipeline in the background."""
    job_id = request.jobId
    youtube_url = request.youtubeUrl
    clip_duration = request.clipDuration
    video_quality = request.videoQuality
    orientation = request.orientation
    output_dir = request.outputDir
    callback_url = request.progressCallbackUrl

    try:
        logger.info(f"Starting YouTube split pipeline for job: {job_id}")
        clips = split_video_into_shorts(
            job_id=job_id,
            youtube_url=youtube_url,
            output_dir=output_dir,
            clip_duration=clip_duration,
            progress_callback_url=callback_url,
            video_quality=video_quality,
            orientation=orientation
        )
        
        logger.info(f"Job {job_id}: YouTube split complete. Generated clips: {clips}")
        
        # Send completion payload including the array of clip filenames
        requests.post(
            callback_url,
            json={
                "jobId": job_id,
                "progress": 100,
                "status": "COMPLETED",
                "processedClips": clips
            },
            timeout=5
        )
    except Exception as e:
        logger.error(f"Job {job_id} YouTube split failed: {str(e)}", exc_info=True)
        try:
            requests.post(
                callback_url,
                json={"jobId": job_id, "progress": 0, "status": "FAILED", "error": str(e)},
                timeout=5
            )
        except Exception as webhook_err:
            logger.error(f"Failed to send failure webhook for split job {job_id}: {str(webhook_err)}")

def run_playlist_pipeline(request: YoutubePlaylistRequest):
    job_id = request.jobId
    playlist_url = request.playlistUrl
    video_quality = request.videoQuality
    max_videos = request.maxVideos
    output_dir = request.outputDir
    callback_url = request.progressCallbackUrl

    try:
        logger.info(f"Starting playlist download pipeline for job: {job_id}")
        files = download_playlist_videos(
            job_id=job_id,
            playlist_url=playlist_url,
            output_dir=output_dir,
            progress_callback_url=callback_url,
            video_quality=video_quality,
            max_videos=max_videos
        )
        logger.info(f"Job {job_id}: Playlist download complete. Files: {files}")
        requests.post(
            callback_url,
            json={"jobId": job_id, "progress": 100, "status": "COMPLETED", "processedClips": [f['filename'] for f in files]},
            timeout=5
        )
    except Exception as e:
        logger.error(f"Job {job_id} playlist download failed: {str(e)}", exc_info=True)
        try:
            requests.post(
                callback_url,
                json={"jobId": job_id, "progress": 0, "status": "FAILED", "error": str(e)},
                timeout=5
            )
        except Exception as webhook_err:
            logger.error(f"Failed to send failure webhook for job {job_id}: {str(webhook_err)}")

def run_tts_pipeline(request: TextToSpeechRequest):
    job_id = request.jobId
    text = request.text
    language = request.language
    slow = request.slow
    output_path = request.outputPath
    callback_url = request.progressCallbackUrl

    try:
        logger.info(f"Starting TTS pipeline for job: {job_id} (lang={language}, chars={len(text)})")
        requests.post(callback_url, json={"jobId": job_id, "progress": 10, "status": "PROCESSING"}, timeout=2)

        success = text_to_speech(text, output_path, language, slow)

        if not success:
            raise RuntimeError("TTS generation failed.")

        logger.info(f"Job {job_id}: TTS complete. File saved to {output_path}")
        requests.post(
            callback_url,
            json={"jobId": job_id, "progress": 100, "status": "COMPLETED", "processedVideo": output_path},
            timeout=5
        )
    except Exception as e:
        logger.error(f"Job {job_id} TTS failed: {str(e)}", exc_info=True)
        try:
            requests.post(
                callback_url,
                json={"jobId": job_id, "progress": 0, "status": "FAILED", "error": str(e)},
                timeout=5
            )
        except Exception as webhook_err:
            logger.error(f"Failed to send failure webhook for TTS job {job_id}: {str(webhook_err)}")

@app.get("/health")
def health_check():
    import torch
    return {
        "status": "healthy",
        "cuda_available": torch.cuda.is_available(),
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "tts_languages": {k: v for k, v in SUPPORTED_LANGUAGES.items()},
    }

@app.get("/tts-languages")
def tts_languages():
    return SUPPORTED_LANGUAGES

@app.post("/process-video")
def process_video(request: ProcessVideoRequest, background_tasks: BackgroundTasks):
    if not os.path.exists(request.videoPath):
        logger.error(f"Input video not found: {request.videoPath}")
        raise HTTPException(status_code=400, detail=f"Input video file not found at path: {request.videoPath}")
        
    background_tasks.add_task(run_pipeline, request)
    return {"status": "processing", "jobId": request.jobId}

@app.post("/youtube-split")
def youtube_split(request: YoutubeSplitRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_youtube_split_pipeline, request)
    return {"status": "processing", "jobId": request.jobId}

@app.post("/youtube-playlist")
def youtube_playlist(request: YoutubePlaylistRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_playlist_pipeline, request)
    return {"status": "processing", "jobId": request.jobId}

@app.post("/text-to-speech")
def text_to_speech_endpoint(request: TextToSpeechRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(run_tts_pipeline, request)
    return {"status": "processing", "jobId": request.jobId}
