"""
Edge TTS Integration
Fast, free text-to-speech using Microsoft Edge's speech synthesis.
"""
import asyncio
import io
from typing import AsyncGenerator, Optional
import edge_tts
import structlog

from ..config import settings

logger = structlog.get_logger()


class EdgeTTS:
    """
    Edge TTS wrapper for fast text-to-speech.
    Uses Microsoft's free edge TTS service.
    """
    
    # Popular voices
    VOICES = {
        # US English
        "aria": "en-US-AriaNeural",
        "guy": "en-US-GuyNeural",
        "jenny": "en-US-JennyNeural",
        "davis": "en-US-DavisNeural",
        # UK English  
        "sonia": "en-GB-SoniaNeural",
        "ryan": "en-GB-RyanNeural",
        # Australian
        "natasha": "en-AU-NatashaNeural",
        "william": "en-AU-WilliamNeural",
    }
    
    def __init__(self, voice: str = None, rate: str = "+0%", pitch: str = "+0Hz"):
        """
        Initialize Edge TTS.
        
        Args:
            voice: Voice name or alias
            rate: Speech rate adjustment (e.g., "+10%", "-20%")
            pitch: Pitch adjustment (e.g., "+5Hz", "-10Hz")
        """
        voice = voice or settings.edge_tts_voice
        
        # Resolve voice alias
        if voice.lower() in self.VOICES:
            voice = self.VOICES[voice.lower()]
        
        self.voice = voice
        self.rate = rate
        self.pitch = pitch
        
        logger.info("edge_tts_initialized", voice=self.voice)
    
    async def synthesize(
        self,
        text: str,
        cancel_event: Optional[asyncio.Event] = None
    ) -> AsyncGenerator[bytes, None]:
        """
        Synthesize text to audio, yielding chunks.
        
        Args:
            text: Text to synthesize
            cancel_event: Event to signal cancellation (for barge-in)
            
        Yields:
            MP3 audio chunks
        """
        if not text or not text.strip():
            return
        
        logger.debug("tts_synthesize", text=text[:50], voice=self.voice)
        
        communicate = edge_tts.Communicate(
            text,
            self.voice,
            rate=self.rate,
            pitch=self.pitch
        )
        
        try:
            async for chunk in communicate.stream():
                # Check for cancellation
                if cancel_event and cancel_event.is_set():
                    logger.info("tts_cancelled")
                    break
                
                if chunk["type"] == "audio":
                    yield chunk["data"]
                    
        except Exception as e:
            logger.error("tts_error", error=str(e))
            raise
    
    async def synthesize_full(self, text: str) -> bytes:
        """
        Synthesize text to complete audio.
        
        Args:
            text: Text to synthesize
            
        Returns:
            Complete MP3 audio bytes
        """
        audio_data = io.BytesIO()
        
        async for chunk in self.synthesize(text):
            audio_data.write(chunk)
        
        return audio_data.getvalue()
    
    @classmethod
    async def list_voices(cls, language: str = "en") -> list[dict]:
        """List available voices for a language."""
        voices = await edge_tts.list_voices()
        
        filtered = [
            {
                "name": v["ShortName"],
                "gender": v["Gender"],
                "locale": v["Locale"],
            }
            for v in voices
            if v["Locale"].startswith(language)
        ]
        
        return sorted(filtered, key=lambda x: x["name"])


class TTSManager:
    """
    Manages TTS backends and provides unified interface.
    """
    
    def __init__(self):
        self._edge_tts: Optional[EdgeTTS] = None
        self._current_engine = settings.tts_engine
    
    def _get_edge_tts(self) -> EdgeTTS:
        """Get or create Edge TTS instance."""
        if self._edge_tts is None:
            self._edge_tts = EdgeTTS()
        return self._edge_tts
    
    async def synthesize(
        self,
        text: str,
        cancel_event: Optional[asyncio.Event] = None,
        engine: str = None
    ) -> AsyncGenerator[bytes, None]:
        """
        Synthesize text using configured TTS engine.
        
        Args:
            text: Text to synthesize
            cancel_event: Cancellation event for barge-in
            engine: Override engine selection
            
        Yields:
            Audio chunks (format depends on engine)
        """
        engine = engine or self._current_engine
        
        if engine == "edge":
            tts = self._get_edge_tts()
            async for chunk in tts.synthesize(text, cancel_event):
                yield chunk
        else:
            # Fallback to edge
            logger.warning("unknown_tts_engine", engine=engine)
            tts = self._get_edge_tts()
            async for chunk in tts.synthesize(text, cancel_event):
                yield chunk


# Global TTS manager
_tts_manager: Optional[TTSManager] = None


def get_tts_manager() -> TTSManager:
    """Get or create the global TTS manager."""
    global _tts_manager
    if _tts_manager is None:
        _tts_manager = TTSManager()
    return _tts_manager


async def synthesize_speech(
    text: str,
    cancel_event: Optional[asyncio.Event] = None
) -> AsyncGenerator[bytes, None]:
    """Convenience function for TTS synthesis."""
    manager = get_tts_manager()
    async for chunk in manager.synthesize(text, cancel_event):
        yield chunk
