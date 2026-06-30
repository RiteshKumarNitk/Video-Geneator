import os
import cv2
import torch
import numpy as np
import requests
import logging

logger = logging.getLogger(__name__)

# Global variable to cache model
_model_cache = {}

def get_model(device: torch.device):
    """Loads Robust Video Matting (RVM) model and caches it."""
    model_name = 'mobilenetv3'
    cache_key = (model_name, str(device))
    if cache_key in _model_cache:
        return _model_cache[cache_key]
        
    logger.info(f"Loading Robust Video Matting ({model_name}) on {device}...")
    try:
        # Load from PyTorch Hub (uses cache if already downloaded)
        model = torch.hub.load('PeterL1n/RobustVideoMatting', model_name, pretrained=True)
        model = model.to(device).eval()
        _model_cache[cache_key] = model
        logger.info("Model loaded successfully.")
        return model
    except Exception as e:
        logger.error(f"Failed to load RVM model: {str(e)}")
        raise e

def process_video_matting(
    job_id: str,
    video_path: str,
    output_temp_path: str,
    progress_callback_url: str,
    background_type: str = "green"
):
    """
    Reads the input video, applies Robust Video Matting to separate the foreground,
    composites it over the specified background, and writes the output frames.
    """
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = get_model(device)
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open input video: {video_path}")
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    
    if frame_count <= 0:
        # Fallback if frame count is not detectable
        frame_count = 100
        
    logger.info(f"Processing video: {width}x{height} @ {fps}fps, total frames: {frame_count}")
    
    # Calculate recommended downsample ratio
    # RVM recommends downsample ratio to make max dimension around 512
    max_dim = max(width, height)
    downsample_ratio = min(512.0 / max_dim, 1.0)
    logger.info(f"RVM Downsample Ratio: {downsample_ratio}")
    
    # Ensure parent dir of temp output exists
    os.makedirs(os.path.dirname(output_temp_path), exist_ok=True)
    
    # Set up VideoWriter
    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(output_temp_path, fourcc, fps, (width, height))
    if not out.isOpened():
        cap.release()
        raise ValueError(f"Could not open output video for writing: {output_temp_path}")
        
    # Recurrent states for RVM
    rec_states = [None, None, None, None]
    
    # Map background type to RGB color normalized (0-1)
    # Background options extensible: green, blue, white, black, transparent
    bg_map = {
        "green": np.array([0.0, 1.0, 0.0], dtype=np.float32),
        "blue": np.array([0.0, 0.0, 1.0], dtype=np.float32),
        "white": np.array([1.0, 1.0, 1.0], dtype=np.float32),
        "black": np.array([0.0, 0.0, 0.0], dtype=np.float32),
    }
    bg_color = bg_map.get(background_type.lower(), bg_map["green"])
    
    frame_idx = 0
    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break
                
            # Convert BGR frame (OpenCV) to RGB float32 [0, 1]
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame_tensor = torch.from_numpy(frame_rgb).permute(2, 0, 1).float().div(255.0)
            frame_tensor = frame_tensor.unsqueeze(0).to(device)  # (1, 3, H, W)
            
            # Run inference
            with torch.no_grad():
                fgr, pha, *rec_states = model(frame_tensor, *rec_states, downsample_ratio)
                
            # Convert tensors back to numpy on CPU
            fgr_np = fgr.squeeze(0).permute(1, 2, 0).cpu().numpy()  # (H, W, 3)
            pha_np = pha.squeeze(0).permute(1, 2, 0).cpu().numpy()  # (H, W, 1)
            
            # Composite formula: foreground * alpha + background * (1 - alpha)
            composite = fgr_np * pha_np + bg_color * (1.0 - pha_np)
            
            # Convert composite RGB back to BGR uint8 for OpenCV VideoWriter
            composite_bgr = (composite * 255.0).clip(0, 255).astype(np.uint8)
            composite_bgr = cv2.cvtColor(composite_bgr, cv2.COLOR_RGB2BGR)
            
            out.write(composite_bgr)
            
            frame_idx += 1
            if frame_idx % 15 == 0 or frame_idx == frame_count:
                progress = min(int((frame_idx / frame_count) * 100), 99)
                try:
                    # Non-blocking webhook call to Next.js API
                    requests.post(
                        progress_callback_url,
                        json={"jobId": job_id, "progress": progress, "status": "PROCESSING"},
                        timeout=1
                    )
                except Exception as e:
                    # Ignore network errors on callback to avoid crashing processing
                    logger.warning(f"Failed to post progress: {str(e)}")
                    
        logger.info("Finished processing video frames.")
    finally:
        cap.release()
        out.release()
        
    return frame_idx
