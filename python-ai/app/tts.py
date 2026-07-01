import os
import time
import logging
from gtts import gTTS

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {
    "hi": "Hindi",
    "en": "English",
    "bn": "Bengali",
    "te": "Telugu",
    "mr": "Marathi",
    "ta": "Tamil",
    "ur": "Urdu",
    "gu": "Gujarati",
    "kn": "Kannada",
    "ml": "Malayalam",
    "pa": "Punjabi",
    "or": "Odia",
    "as": "Assamese",
    "mai": "Maithili",
    "sat": "Santali",
    "ks": "Kashmiri",
    "sd": "Sindhi",
    "ne": "Nepali",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "ja": "Japanese",
    "ko": "Korean",
    "zh-CN": "Chinese (Simplified)",
}

def text_to_speech(text: str, output_path: str, language: str = "hi", slow: bool = False) -> bool:
    """Convert text to speech using Google TTS with retry on transient failures."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Remove existing file to avoid permission issues
    if os.path.exists(output_path):
        try:
            os.remove(output_path)
        except OSError:
            pass

    max_attempts = 3
    for attempt in range(1, max_attempts + 1):
        try:
            tts = gTTS(text=text, lang=language, slow=slow)
            tts.save(output_path)
            logger.info(f"TTS saved to {output_path} (lang={language}, slow={slow}, chars={len(text)}, attempt={attempt})")
            return True
        except Exception as e:
            logger.warning(f"TTS attempt {attempt}/{max_attempts} failed: {str(e)}")
            if attempt < max_attempts:
                time.sleep(2 * attempt)
            continue

    logger.error(f"TTS generation failed after {max_attempts} attempts")
    return False
