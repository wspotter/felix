"""
STT using whisper.cpp with GPU acceleration (NVIDIA CUDA or AMD ROCm/HIP).
Production-ready wrapper for GPU usage.
"""

import asyncio
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Optional
import structlog

from server.config import settings

logger = structlog.get_logger()

# Paths to whisper.cpp binaries and models
WHISPER_CPP_DIR = Path(__file__).parent.parent.parent / "whisper.cpp"
WHISPER_CLI = WHISPER_CPP_DIR / "build" / "bin" / "whisper-cli"
MODELS_DIR = WHISPER_CPP_DIR / "models"


class WhisperCppSTT:
    """
    Whisper.cpp STT with GPU acceleration (CUDA for NVIDIA, ROCm for AMD).

    Uses the compiled whisper-cli binary with platform-specific BLAS support
    for fast inference on GPU hardware.
    """
    
    def __init__(
        self,
        model: str = "ggml-large-v3-turbo.bin",
    gpu_device: int = 1,  # GPU device index (0 is first GPU)
        language: str = "en",
        threads: int = 8,
    ):
        """
        Initialize WhisperCpp STT.
        
        Args:
            model: Model filename in models directory
            gpu_device: GPU device index (1 or 2)
            language: Language code
            threads: CPU threads for non-GPU ops
        """
        self.model_path = MODELS_DIR / model
        self.gpu_device = gpu_device
        self.language = language
        self.threads = threads
        self._initialized = False
        
        if not WHISPER_CLI.exists():
            raise RuntimeError(f"whisper-cli not found at {WHISPER_CLI}")
        if not self.model_path.exists():
            raise RuntimeError(f"Model not found at {self.model_path}")
        
        logger.info(
            "whisper_cpp_init",
            model=model,
            gpu_device=gpu_device,
            language=language
        )
    
    async def initialize(self) -> None:
        """Pre-warm the model (optional, first transcription does this)."""
        if self._initialized:
            return
        
        # Create a tiny test audio to warm up
        logger.info("whisper_cpp_warming_up")
        
        # Generate 0.5s of silence for warmup
        silence = b'\x00' * 16000  # 0.5s at 16kHz mono 16-bit
        try:
            await self.transcribe(silence, sample_rate=16000)
            self._initialized = True
            logger.info("whisper_cpp_ready")
        except Exception as e:
            logger.warning("whisper_cpp_warmup_failed", error=str(e))
    
    async def transcribe(
        self,
        audio_data: bytes,
        sample_rate: int = 16000
    ) -> str:
        """
        Transcribe audio data to text.
        
        Args:
            audio_data: Raw PCM16 audio bytes (mono, 16-bit)
            sample_rate: Audio sample rate (default 16kHz)
        
        Returns:
            Transcribed text
        """
        if not audio_data or len(audio_data) < 3200:  # Less than 0.1s
            return ""
        
        # Write audio to temporary WAV file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            with wave.open(f, 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)  # 16-bit
                wav.setframerate(sample_rate)
                wav.writeframes(audio_data)
        
        try:
            # Build command
            cmd = [
                str(WHISPER_CLI),
                "-m", str(self.model_path),
                "-f", temp_path,
                "-l", self.language,
                "-t", str(self.threads),
                "--no-timestamps",
                "-np",  # No prints (quieter output)
            ]
            
            # Set environment for GPU device based on configured whisper device
            env = os.environ.copy()
            device_pref = getattr(settings, 'whisper_device', '')
            if isinstance(device_pref, str):
                dp = device_pref.lower()
                if dp.startswith("cuda"):
                    env["CUDA_VISIBLE_DEVICES"] = str(self.gpu_device)
                elif dp in ("rocm", "hip"):
                    env["HIP_VISIBLE_DEVICES"] = str(self.gpu_device)
            
            # Run in thread pool to avoid blocking event loop
            loop = asyncio.get_event_loop()
            
            def _run_whisper():
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=60,
                    env=env,
                )
                return result
            
            result = await loop.run_in_executor(None, _run_whisper)
            
            if result.returncode != 0:
                logger.error(
                    "whisper_cpp_failed",
                    returncode=result.returncode,
                    stderr=result.stderr[:500] if result.stderr else ""
                )
                return ""
            
            # Parse output - whisper.cpp outputs transcription text
            text = result.stdout.strip()
            
            # Clean up any debug/timing lines
            lines = text.split('\n')
            transcript_lines = []
            for line in lines:
                line = line.strip()
                # Skip empty lines, timing info, and whisper debug output
                if not line:
                    continue
                if line.startswith('[') or line.startswith('whisper_'):
                    continue
                if 'main:' in line or 'system_info' in line:
                    continue
                transcript_lines.append(line)
            
            transcript = ' '.join(transcript_lines).strip()
            
            if transcript:
                logger.info("whisper_cpp_transcribed", length=len(transcript))
            
            return transcript
        
        except subprocess.TimeoutExpired:
            logger.error("whisper_cpp_timeout")
            return ""
        except Exception as e:
            logger.error("whisper_cpp_error", error=str(e))
            return ""
        finally:
            # Cleanup temp file
            try:
                os.unlink(temp_path)
            except Exception:
                pass
    
    async def transcribe_chunks(
        self,
        audio_chunks: list[bytes],
        sample_rate: int = 16000,
    ) -> str:
        """
        Transcribe accumulated audio chunks.
        
        Args:
            audio_chunks: List of audio data chunks
            sample_rate: Audio sample rate
        
        Returns:
            Transcribed text
        """
        if not audio_chunks:
            return ""
        
        # Concatenate all chunks
        audio_data = b''.join(audio_chunks)
        return await self.transcribe(audio_data, sample_rate)


# Global instance
_stt_instance: Optional[WhisperCppSTT] = None


async def get_stt() -> WhisperCppSTT:
    """Get or create the WhisperCppSTT instance."""
    global _stt_instance
    
    if _stt_instance is None:
        _stt_instance = WhisperCppSTT(
            model=getattr(settings, 'whisper_model', 'ggml-large-v3-turbo.bin'),
            gpu_device=getattr(settings, 'whisper_gpu_device', 1),
            language="en",
            threads=8,
        )
        await _stt_instance.initialize()
    
    return _stt_instance


async def transcribe_audio(audio_data: bytes, sample_rate: int = 16000) -> str:
    """Convenience function to transcribe audio."""
    stt = await get_stt()
    return await stt.transcribe(audio_data, sample_rate)
