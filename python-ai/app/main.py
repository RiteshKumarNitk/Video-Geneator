import os
import shutil
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel, HttpUrl
import requests
import json
import re
import subprocess
import cv2

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

class TranscribeVideoRequest(BaseModel):
    jobId: str
    videoPath: str
    outputDir: str
    progressCallbackUrl: str

class RenderClipRequest(BaseModel):
    jobId: str
    videoPath: str
    outputPath: str
    start: float
    end: float
    words: list[dict] = []
    captionStyle: str = "bold"

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

def run_transcription_pipeline(request: TranscribeVideoRequest):
    """Transcribe speech locally and rank transcript windows as clip suggestions."""
    try:
        os.makedirs(request.outputDir, exist_ok=True)
        requests.post(request.progressCallbackUrl, json={"jobId": request.jobId, "progress": 10, "status": "PROCESSING"}, timeout=3)
        from faster_whisper import WhisperModel
        model = WhisperModel(os.getenv("WHISPER_MODEL", "small"), device=os.getenv("WHISPER_DEVICE", "cpu"), compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"))
        segments, info = model.transcribe(request.videoPath, vad_filter=True, word_timestamps=True)
        words = []
        transcript = []
        for s in segments:
            if not s.text.strip():
                continue
            transcript.append({"start": round(float(s.start), 2), "end": round(float(s.end), 2), "text": s.text.strip()})
            for w in (s.words or []):
                words.append({"start": round(float(w.start), 2), "end": round(float(w.end), 2), "word": w.word.strip()})
        if not transcript:
            raise RuntimeError("No spoken words were detected in this video.")

        # Rank 20–60 second windows using speech density and hook language. This is a transparent MVP heuristic.
        hook_words = re.compile(r"\b(how|why|secret|mistake|truth|best|worst|learn|discover|never|always|because|first|finally)\b", re.I)
        candidates = []
        for i, item in enumerate(transcript):
            end_index = i
            while end_index + 1 < len(transcript) and transcript[end_index]["end"] - item["start"] < 45:
                end_index += 1
            end = min(transcript[end_index]["end"], item["start"] + 60)
            text = " ".join(x["text"] for x in transcript[i:end_index + 1])
            words = len(text.split())
            score = min(99, round(35 + min(words, 100) * 0.35 + len(hook_words.findall(text)) * 7))
            candidates.append({"id": f"suggestion-{len(candidates) + 1}", "start": round(item["start"], 2), "end": round(end, 2), "title": text[:72] + ("…" if len(text) > 72 else ""), "reason": "High speech density" + (" with a strong hook phrase" if hook_words.search(text) else ""), "score": score, "text": text})
        suggestions = sorted(candidates, key=lambda x: x["score"], reverse=True)[:5]
        with open(os.path.join(request.outputDir, "transcript.json"), "w", encoding="utf-8") as f:
            json.dump({"transcript": transcript, "words": words, "suggestions": suggestions, "language": getattr(info, "language", None)}, f, ensure_ascii=False)
        requests.post(request.progressCallbackUrl, json={"jobId": request.jobId, "progress": 100, "status": "COMPLETED", "transcript": transcript, "words": words, "suggestions": suggestions}, timeout=5)
    except Exception as e:
        logger.error(f"Job {request.jobId} transcription failed: {e}", exc_info=True)
        try:
            requests.post(request.progressCallbackUrl, json={"jobId": request.jobId, "progress": 0, "status": "FAILED", "error": str(e)}, timeout=5)
        except Exception:
            pass

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

@app.post("/transcribe-video")
def transcribe_video(request: TranscribeVideoRequest, background_tasks: BackgroundTasks):
    if not os.path.exists(request.videoPath):
        raise HTTPException(status_code=400, detail=f"Input video file not found at path: {request.videoPath}")
    background_tasks.add_task(run_transcription_pipeline, request)
    return {"status": "processing", "jobId": request.jobId}

def ass_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("{", "\\{").replace("}", "\\}")

def write_ass_captions(path: str, words: list[dict], start: float, end: float, style: str):
    selected = [w for w in words if float(w.get("end", 0)) > start and float(w.get("start", 0)) < end]
    lines = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1080", "PlayResY: 1920", "[V4+ Styles]", "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding", "Style: Default,Arial,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,1,4,1,2,60,60,180,1", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    for index in range(0, len(selected), 5):
        group = selected[index:index + 5]
        cue_start = max(start, float(group[0]["start"])) - start
        cue_end = min(end, float(group[-1]["end"])) - start
        def stamp(seconds):
            minutes = int(seconds // 60)
            return f"0:{minutes:02d}:{int((seconds % 60) * 100):04d}"
        text = " ".join(ass_escape(str(w.get("word", ""))) for w in group)
        lines.append(f"Dialogue: 0,{stamp(cue_start)},{stamp(cue_end)},Default,,0,0,0,,{text}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

def render_vertical_clip(request: RenderClipRequest):
    cap = cv2.VideoCapture(request.videoPath)
    if not cap.isOpened():
        raise RuntimeError("Could not open source video")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.set(cv2.CAP_PROP_POS_MSEC, request.start * 1000)
    temp_video = request.outputPath + ".silent.mp4"
    temp_ass = request.outputPath + ".ass"
    writer = cv2.VideoWriter(temp_video, cv2.VideoWriter_fourcc(*"mp4v"), fps, (1080, 1920))
    face_detector = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml"))
    last_center = width / 2
    frame_count = max(1, int((request.end - request.start) * fps))
    for _ in range(frame_count):
        ok, frame = cap.read()
        if not ok:
            break
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        faces = face_detector.detectMultiScale(gray, 1.1, 5, minSize=(max(40, width // 12), max(40, height // 12)))
        if len(faces):
            face = max(faces, key=lambda item: item[2] * item[3])
            target = face[0] + face[2] / 2
            last_center = last_center * 0.82 + target * 0.18
        crop_width = min(width, int(height * 9 / 16))
        x = max(0, min(width - crop_width, int(last_center - crop_width / 2)))
        cropped = frame[:, x:x + crop_width]
        writer.write(cv2.resize(cropped, (1080, 1920), interpolation=cv2.INTER_AREA))
    cap.release()
    writer.release()
    write_ass_captions(temp_ass, request.words, request.start, request.end, request.captionStyle)
    subprocess.run(["ffmpeg", "-y", "-i", temp_video, "-i", request.videoPath, "-ss", str(request.start), "-t", str(request.end - request.start), "-vf", f"subtitles={temp_ass}", "-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-c:a", "aac", "-shortest", request.outputPath], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    for path in (temp_video, temp_ass):
        if os.path.exists(path):
            os.remove(path)

@app.post("/render-clip")
def render_clip(request: RenderClipRequest):
    if not os.path.exists(request.videoPath):
        raise HTTPException(status_code=400, detail="Input video not found")
    os.makedirs(os.path.dirname(request.outputPath), exist_ok=True)
    try:
        render_vertical_clip(request)
        return {"status": "completed", "jobId": request.jobId, "outputPath": request.outputPath}
    except Exception as error:
        logger.error("Clip render failed", exc_info=True)
        raise HTTPException(status_code=500, detail=str(error))


