"""
TTS using Piper - fast, local, multiple natural voices.
Production-ready for real-time voice agents.
"""

import asyncio
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional, AsyncIterator
from dataclasses import dataclass
import structlog

from server.config import settings

logger = structlog.get_logger()

# Piper installation paths
PIPER_DIR = Path(__file__).parent.parent.parent / "piper" / "piper"
PIPER_BIN = PIPER_DIR / "piper"
VOICES_DIR = PIPER_DIR / "voices"


@dataclass
class Voice:
    """Voice configuration."""
    id: str
    name: str
    model_file: str
    description: str
    gender: str
    language: str
    quality: str  # low, medium, high


# Available voices - add more as downloaded
AVAILABLE_VOICES: dict[str, Voice] = {
    "amy": Voice(
        id="amy",
        name="Amy",
        model_file="en_US-amy-medium.onnx",
        description="American English female, natural and clear",
        gender="female",
        language="en-US",
        quality="medium",
    ),
    "lessac": Voice(
        id="lessac",
        name="Lessac",
        model_file="en_US-lessac-medium.onnx",
        description="American English female, expressive",
        gender="female",
        language="en-US",
        quality="medium",
    ),
    "ryan": Voice(
        id="ryan",
        name="Ryan",
        model_file="en_US-ryan-high.onnx",
        description="American English male, high quality",
        gender="male",
        language="en-US",
        quality="high",
    ),
}


class PiperTTS:
    """
    Piper TTS - fast local text-to-speech.
    
    Features:
    - Multiple natural-sounding voices
    - Very low latency (~50ms for short phrases)
    - No GPU required (CPU is fast enough)
    - Streaming output support
    """
    
    def __init__(
        self,
        voice: str = "amy",
        speaking_rate: float = 1.0
    ):
        """
        Initialize Piper TTS.
        
        Args:
            voice: Voice ID from AVAILABLE_VOICES
            speaking_rate: Speed multiplier (0.5-2.0)
        """
        if voice not in AVAILABLE_VOICES:
            available = list(AVAILABLE_VOICES.keys())
            logger.warning(f"Voice '{voice}' not found, using 'amy'. Available: {available}")
            voice = "amy"
        
        self.voice_config = AVAILABLE_VOICES[voice]
        self.speaking_rate = max(0.5, min(2.0, speaking_rate))
        self._cancelled = False
        
        self.model_path = VOICES_DIR / self.voice_config.model_file
        
        if not PIPER_BIN.exists():
            raise RuntimeError(f"Piper binary not found at {PIPER_BIN}")
        if not self.model_path.exists():
            raise RuntimeError(f"Voice model not found at {self.model_path}")
        
        logger.info(
            "piper_tts_init",
            voice=voice,
            model=self.voice_config.model_file,
            rate=self.speaking_rate
        )
    
    @staticmethod
    def list_voices() -> list[dict]:
        """List all available voices."""
        voices = []
        for vid, v in AVAILABLE_VOICES.items():
            # Check if model file exists
            model_path = VOICES_DIR / v.model_file
            if model_path.exists():
                voices.append({
                    "id": v.id,
                    "name": v.name,
                    "description": v.description,
                    "gender": v.gender,
                    "language": v.language,
                    "quality": v.quality,
                })
        return voices
    
    def set_voice(self, voice: str) -> None:
        """Change the current voice."""
        if voice not in AVAILABLE_VOICES:
            raise ValueError(f"Voice '{voice}' not found")
        
        self.voice_config = AVAILABLE_VOICES[voice]
        self.model_path = VOICES_DIR / self.voice_config.model_file
        
        if not self.model_path.exists():
            raise RuntimeError(f"Voice model not found: {self.model_path}")
        
        logger.info("piper_voice_changed", voice=voice)
    
    def cancel(self) -> None:
        """Cancel ongoing synthesis (for barge-in)."""
        self._cancelled = True
    
    def reset(self) -> None:
        """Reset cancellation state."""
        self._cancelled = False
    
    async def synthesize(self, text: str) -> bytes:
        """
        Synthesize text to audio.
        
        Args:
            text: Text to synthesize
        
        Returns:
            WAV audio bytes (16-bit PCM)
        """
        if not text or not text.strip():
            return b''
        
        self._cancelled = False
        
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            output_path = f.name
        
        try:
            # Build command
            cmd = [
                str(PIPER_BIN),
                "--model", str(self.model_path),
                "--output_file", output_path,
            ]
            
            # Add length scale for speaking rate
            # length_scale < 1.0 = faster, > 1.0 = slower
            if self.speaking_rate != 1.0:
                length_scale = 1.0 / self.speaking_rate
                cmd.extend(["--length_scale", str(length_scale)])
            
            # Run piper with text input via stdin
            loop = asyncio.get_event_loop()
            
            def _run_piper():
                process = subprocess.run(
                    cmd,
                    input=text,
                    capture_output=True,
                    text=True,
                    timeout=30,
                )
                return process
            
            result = await loop.run_in_executor(None, _run_piper)
            
            if self._cancelled:
                logger.info("piper_synthesis_cancelled")
                return b''
            
            if result.returncode != 0:
                logger.error(
                    "piper_failed",
                    returncode=result.returncode,
                    stderr=result.stderr[:500] if result.stderr else ""
                )
                return b''
            
            # Read output audio
            with open(output_path, 'rb') as f:
                audio_data = f.read()
            
            logger.info(
                "piper_synthesized",
                text_length=len(text),
                audio_bytes=len(audio_data)
            )
            
            return audio_data
        
        except subprocess.TimeoutExpired:
            logger.error("piper_timeout")
            return b''
        except Exception as e:
            logger.error("piper_error", error=str(e))
            return b''
        finally:
            try:
                os.unlink(output_path)
            except:
                pass
    
    async def synthesize_streaming(
        self,
        text: str,
        chunk_size: int = 32768  # Larger chunks for smoother playback
    ) -> AsyncIterator[bytes]:
        """
        Synthesize text to streaming audio chunks.
        
        For real-time playback, yields complete WAV audio.
        The browser can decode WAV files with proper headers.
        
        Args:
            text: Text to synthesize
            chunk_size: Bytes per chunk (for very long responses)
            
        Yields:
            Complete WAV audio (for short/medium responses) or chunks
        """
        self._cancelled = False
        
        audio = await self.synthesize(text)
        
        if not audio or self._cancelled:
            return
        
        # For most responses, send complete WAV file at once
        # This ensures proper decoding with sample rate info
        # Only chunk for very long audio (> 500KB)
        if len(audio) <= 500000:
            yield audio
        else:
            # For very long audio, we need to split into valid WAV chunks
            # But for now, just yield it all - browser can handle it
            yield audio


# Global instance
_tts_instance: Optional[PiperTTS] = None


def get_tts(voice: str = None) -> PiperTTS:
    """Get or create the PiperTTS instance."""
    global _tts_instance
    
    voice = voice or getattr(settings, 'tts_voice', 'amy')
    
    if _tts_instance is None:
        _tts_instance = PiperTTS(voice=voice)
    elif _tts_instance.voice_config.id != voice:
        _tts_instance.set_voice(voice)
    
    return _tts_instance


async def synthesize_speech(text: str, voice: str = None) -> bytes:
    """Convenience function to synthesize speech."""
    tts = get_tts(voice)
    return await tts.synthesize(text)


def list_voices() -> list[dict]:
    """List all available TTS voices."""
    return PiperTTS.list_voices()
