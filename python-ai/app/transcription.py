import os
import re


def analyze_video(video_path):
    from faster_whisper import WhisperModel
    model = WhisperModel(os.getenv("WHISPER_MODEL", "small"), device=os.getenv("WHISPER_DEVICE", "cpu"), compute_type=os.getenv("WHISPER_COMPUTE_TYPE", "int8"))
    segments, info = model.transcribe(video_path, vad_filter=True, word_timestamps=True)
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
        word_count = len(text.split())
        score = min(99, round(35 + min(word_count, 100) * 0.35 + len(hook_words.findall(text)) * 7))
        candidates.append({"id": f"suggestion-{len(candidates) + 1}", "start": round(item["start"], 2), "end": round(end, 2), "title": text[:72] + ("…" if len(text) > 72 else ""), "reason": "High speech density" + (" with a strong hook phrase" if hook_words.search(text) else ""), "score": score, "text": text})
    suggestions = sorted(candidates, key=lambda x: x["score"], reverse=True)[:5]
    return {"transcript": transcript, "words": words, "suggestions": suggestions, "language": getattr(info, "language", None)}
