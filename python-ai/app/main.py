import os
import shutil
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel, HttpUrl
import requests

from app.matting import process_video_matting
from app.ffmpeg_utils import has_audio, extract_audio, merge_audio_video

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Video Background Changer Service")

class ProcessVideoRequest(BaseModel):
    jobId: str
    videoPath: str
    outputPath: str
    progressCallbackUrl: str
    backgroundType: str = "green"

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

@app.get("/health")
def health_check():
    import torch
    return {
        "status": "healthy",
        "cuda_available": torch.cuda.is_available(),
        "device": "cuda" if torch.cuda.is_available() else "cpu"
    }

@app.post("/process-video")
def process_video(request: ProcessVideoRequest, background_tasks: BackgroundTasks):
    # Verify input file exists
    if not os.path.exists(request.videoPath):
        logger.error(f"Input video not found: {request.videoPath}")
        raise HTTPException(status_code=400, detail=f"Input video file not found at path: {request.videoPath}")
        
    # Start background processing
    background_tasks.add_task(run_pipeline, request)
    return {"status": "processing", "jobId": request.jobId}
