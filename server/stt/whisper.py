"""
Speech-to-Text using faster-whisper
GPU-accelerated transcription optimized for AMD MI50.
"""
import asyncio
from typing import Optional
import numpy as np
from faster_whisper import WhisperModel
import structlog

from ..config import settings

logger = structlog.get_logger()


class WhisperSTT:
    """
    faster-whisper based speech-to-text.
    Optimized for real-time transcription.
    """
    
    def __init__(
        self,
        model_name: str = None,
        device: str = None,
        compute_type: str = None,
    ):
        """
        Initialize Whisper STT.
        
        Args:
            model_name: Model size (tiny, base, small, medium, large-v2, large-v3)
            device: cuda, cpu, or auto
            compute_type: float16, int8, int8_float16
        """
        self.model_name = model_name or settings.whisper_model
        self.device = device or settings.whisper_device
        self.compute_type = compute_type or settings.whisper_compute_type
        
        self.model: Optional[WhisperModel] = None
        self._lock = asyncio.Lock()
        
        logger.info(
            "stt_config",
            model=self.model_name,
            device=self.device,
            compute_type=self.compute_type
        )
    
    async def initialize(self) -> None:
        """Load the Whisper model (call once at startup)."""
        async with self._lock:
            if self.model is not None:
                return
            
            logger.info("loading_whisper_model", model=self.model_name)
            
            # Load in thread pool to not block event loop
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(
                None,
                self._load_model
            )
            
            logger.info("whisper_model_loaded", model=self.model_name)
    
    def _load_model(self) -> WhisperModel:
        """Synchronous model loading."""
        return WhisperModel(
            self.model_name,
            device=self.device,
            compute_type=self.compute_type,
            # Download to cache
            download_root=None,
            # CPU threads if using CPU
            cpu_threads=4 if self.device == "cpu" else 0
        )
    
    async def transcribe(
        self,
        audio_data: bytes,
        sample_rate: int = 16000,
        language: str = "en",
    ) -> str:
        """
        Transcribe audio to text.
        
        Args:
            audio_data: PCM16 audio bytes
            sample_rate: Audio sample rate
            language: Language code or None for auto-detect
            
        Returns:
            Transcribed text
        """
        if self.model is None:
            await self.initialize()
        
        # Convert bytes to float32 numpy array
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        
        # Run transcription in thread pool
        loop = asyncio.get_event_loop()
        segments, info = await loop.run_in_executor(
            None,
            lambda: self.model.transcribe(
                audio_array,
                language=language,
                task="transcribe",
                beam_size=5,
                best_of=5,
                patience=1.0,
                length_penalty=1.0,
                temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
                compression_ratio_threshold=2.4,
                log_prob_threshold=-1.0,
                no_speech_threshold=0.6,
                condition_on_previous_text=True,
                initial_prompt=None,
                word_timestamps=False,
                vad_filter=True,
                vad_parameters=dict(
                    min_silence_duration_ms=500,
                    speech_pad_ms=400,
                ),
            )
        )
        
        # Combine segments into full transcript
        transcript = " ".join([segment.text.strip() for segment in segments])
        
        logger.debug(
            "transcription_complete",
            language=info.language,
            language_prob=info.language_probability,
            duration=info.duration,
            text_length=len(transcript)
        )
        
        return transcript.strip()
    
    async def transcribe_streaming(
        self,
        audio_stream,
        sample_rate: int = 16000,
        language: str = "en",
    ):
        """
        Stream transcription with interim results.
        
        Args:
            audio_stream: Async generator yielding audio chunks
            sample_rate: Audio sample rate
            language: Language code
            
        Yields:
            Dict with 'text' and 'is_final' keys
        """
        if self.model is None:
            await self.initialize()
        
        buffer = bytearray()
        min_audio_length = sample_rate * 2  # 1 second minimum (16-bit = 2 bytes per sample)
        
        async for chunk in audio_stream:
            buffer.extend(chunk)
            
            # Process when we have enough audio
            if len(buffer) >= min_audio_length:
                audio_array = np.frombuffer(buffer, dtype=np.int16).astype(np.float32) / 32768.0
                
                # Get interim transcription
                loop = asyncio.get_event_loop()
                segments, _ = await loop.run_in_executor(
                    None,
                    lambda: self.model.transcribe(
                        audio_array,
                        language=language,
                        beam_size=1,  # Faster for interim
                        vad_filter=True,
                    )
                )
                
                text = " ".join([s.text.strip() for s in segments])
                if text:
                    yield {"text": text, "is_final": False}
        
        # Final transcription with full audio
        if buffer:
            final_text = await self.transcribe(bytes(buffer), sample_rate, language)
            if final_text:
                yield {"text": final_text, "is_final": True}


# Global STT instance
_stt_instance: Optional[WhisperSTT] = None


async def get_stt() -> WhisperSTT:
    """Get or create the global STT instance."""
    global _stt_instance
    if _stt_instance is None:
        _stt_instance = WhisperSTT()
        await _stt_instance.initialize()
    return _stt_instance


async def transcribe_audio(audio_data: bytes) -> str:
    """Convenience function for one-shot transcription."""
    stt = await get_stt()
    return await stt.transcribe(audio_data)
