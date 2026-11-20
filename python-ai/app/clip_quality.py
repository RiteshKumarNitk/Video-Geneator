"""Sample encoded output against the saved crop geometry and original audio."""
import subprocess

import cv2
import numpy as np


def frame(cap, seconds):
    cap.set(cv2.CAP_PROP_POS_MSEC, max(0, seconds) * 1000)
    ok, pixels = cap.read()
    return pixels if ok else None


def audio(ffmpeg, path, seconds):
    raw = subprocess.check_output([ffmpeg, "-v", "error", "-ss", str(seconds), "-i", str(path),
                                   "-t", "0.6", "-vn", "-ac", "1",
                                   "-ar", "4000", "-f", "s16le", "-"], timeout=30)
    return np.frombuffer(raw, dtype="<i2").astype(np.float32)


def audit(source, result, request, segments, meta, ffmpeg, bounds):
    duration = request.end - request.start
    warnings, samples = [], []
    original, encoded = cv2.VideoCapture(str(source)), cv2.VideoCapture(str(result))
    try:
        for i, segment in enumerate(segments):
            stop = segments[i+1].at if i+1 < len(segments) else duration
            for t in sorted({min(segment.at+.2,(segment.at+stop)/2), max(stop-.2,(segment.at+stop)/2)}):
                a, b = frame(original, request.start+t), frame(encoded,t)
                if a is None or b is None:
                    warnings.append(f"Frame unreadable at {t:.2f}s")
                    continue
                a=cv2.resize(a,(meta["width"],meta["height"]))
                expected=np.zeros((1920,1080,3),dtype=np.uint8)
                y=0
                for s in segment.sections:
                    tile=a[s.y:s.y+s.h,s.x:s.x+s.w]
                    expected[y+s.dy:y+s.dy+s.dh,s.dx:s.dx+s.dw]=cv2.resize(tile,(s.dw,s.dh))
                    y+=s.sectionHeight
                # Captions are checked separately using the renderer's font metrics.
                y=segment.captionY if segment.captionY is not None else request.style.y
                if request.cues:
                    expected[max(0,y):min(1920,y+320)]=0
                    b[max(0,y):min(1920,y+320)]=0
                delta=float(cv2.absdiff(cv2.resize(expected,(54,96)),cv2.resize(b,(54,96))).mean())
                samples.append({"seconds":round(t,3),"frameMeanError":round(delta,2)})
                if delta>30:
                    warnings.append(f"Review framing at {t:.2f}s")
            audio_times = {min(segment.at+.3,stop-.65), stop-.65} if meta["audio"] and stop-segment.at>.65 else set()
            for t in sorted(audio_times):
                a,b=audio(ffmpeg,source,request.start+t),audio(ffmpeg,result,t)
                n=min(len(a),len(b))
                if n>=1600 and np.std(a[:n])>24:
                    ref=a[400:n-400].copy()
                    ref-=ref.mean()
                    corr=np.correlate(b[:n]-b[:n].mean(),ref,"valid")
                    lag=int(np.argmax(corr))-400
                    if abs(lag)>200 or np.std(b[:n])<8:
                        warnings.append(f"Review audio sync at {t:.2f}s")
                    samples.append({"seconds":round(t,3),"audioOffsetMs":round(lag/4,1)})
            for cue in request.cues:
                if cue.start>=stop or cue.end<=segment.at:
                    continue
                size=bounds(cue.text, request.style)
                x0,y0,x1,y1=size["bounds"]
                shift=(segment.captionY if segment.captionY is not None else request.style.y)-request.style.y
                left,top,right,bottom = {"Shorts":(72,180,864,1500),"Reels":(65,269,1015,1248)}.get(request.guide,(0,0,1080,1920))
                if x0+segment.captionX<left or x1+segment.captionX>right or y0+shift<top or y1+shift>bottom or size["overflow"]:
                    warnings.append(f"Review caption at {cue.start:.2f}s")
    finally:
        original.release()
        encoded.release()
    return {"samples":samples,"warnings":sorted(set(warnings))}
