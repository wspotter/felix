"""
Voice Activity Detection (VAD)
Using Silero VAD for accurate speech detection.
"""
import torch
import numpy as np
from typing import Optional, Tuple
import structlog

logger = structlog.get_logger()


class SileroVAD:
    """
    Silero VAD wrapper for voice activity detection.
    Optimized for real-time streaming with low latency.
    """
    
    def __init__(
        self,
        threshold: float = 0.5,
        sample_rate: int = 16000,
        min_speech_ms: int = 150,
        min_silence_ms: int = 300,
    ):
        """
        Initialize Silero VAD.
        
        Args:
            threshold: Speech probability threshold (0-1)
            sample_rate: Audio sample rate (8000 or 16000)
            min_speech_ms: Minimum speech duration to trigger
            min_silence_ms: Minimum silence to end speech
        """
        self.threshold = threshold
        self.sample_rate = sample_rate
        self.min_speech_samples = int(sample_rate * min_speech_ms / 1000)
        self.min_silence_samples = int(sample_rate * min_silence_ms / 1000)
        
        # Load Silero VAD model
        self.model, self.utils = torch.hub.load(
            repo_or_dir='snakers4/silero-vad',
            model='silero_vad',
            force_reload=False,
            onnx=True  # Use ONNX for faster CPU inference
        )
        
        # Expected chunk size: 512 samples for 16kHz, 256 for 8kHz
        self._chunk_size = 512 if sample_rate == 16000 else 256
        
        # State tracking
        self._is_speaking = False
        self._speech_samples = 0
        self._silence_samples = 0
        self._triggered = False
        self._buffer = np.array([], dtype=np.float32)
        
        logger.info("vad_initialized", threshold=threshold, sample_rate=sample_rate)
    
    def reset(self) -> None:
        """Reset VAD state."""
        self._is_speaking = False
        self._speech_samples = 0
        self._silence_samples = 0
        self._triggered = False
        self._buffer = np.array([], dtype=np.float32)
        self.model.reset_states()
    
    def process_chunk(self, audio_chunk: bytes) -> Tuple[float, bool, bool]:
        """
        Process an audio chunk and detect speech.
        Handles variable chunk sizes by buffering and processing in fixed windows.
        
        Args:
            audio_chunk: PCM16 audio bytes
            
        Returns:
            Tuple of (speech_probability, is_speech, speech_ended)
        """
        # Convert to float32
        samples = np.frombuffer(audio_chunk, dtype=np.int16).astype(np.float32) / 32768.0
        
        # Add to buffer
        self._buffer = np.concatenate([self._buffer, samples])
        
        # Process all complete chunks
        speech_prob = 0.0
        while len(self._buffer) >= self._chunk_size:
            chunk = self._buffer[:self._chunk_size]
            self._buffer = self._buffer[self._chunk_size:]
            
            audio_tensor = torch.from_numpy(chunk)
            speech_prob = self.model(audio_tensor, self.sample_rate).item()
            
            is_speech = speech_prob >= self.threshold
            
            # State machine for speech detection
            if is_speech:
                self._speech_samples += len(chunk)
                self._silence_samples = 0
                
                # Check if we've detected enough speech
                if self._speech_samples >= self.min_speech_samples:
                    if not self._triggered:
                        self._triggered = True
                        logger.debug("speech_start_detected", prob=speech_prob)
                    self._is_speaking = True
            else:
                self._silence_samples += len(chunk)
                
                # Check if speech has ended
                if self._is_speaking and self._silence_samples >= self.min_silence_samples:
                    self._is_speaking = False
                    self._triggered = False
                    self._speech_samples = 0
                    logger.debug("speech_end_detected", prob=speech_prob)
                    return speech_prob, self._is_speaking, True  # speech_ended
        
        return speech_prob, self._is_speaking, False
    
    @property
    def is_speaking(self) -> bool:
        """Whether speech is currently detected."""
        return self._is_speaking


class WebRTCVAD:
    """
    WebRTC VAD as a lighter alternative.
    Faster but less accurate than Silero.
    """
    
    def __init__(
        self,
        aggressiveness: int = 2,
        sample_rate: int = 16000,
        frame_ms: int = 30,
    ):
        """
        Initialize WebRTC VAD.
        
        Args:
            aggressiveness: 0-3, higher = more aggressive filtering
            sample_rate: Must be 8000, 16000, 32000, or 48000
            frame_ms: Frame duration, must be 10, 20, or 30
        """
        import webrtcvad
        
        self.vad = webrtcvad.Vad(aggressiveness)
        self.sample_rate = sample_rate
        self.frame_ms = frame_ms
        self.frame_bytes = int(sample_rate * frame_ms / 1000) * 2  # 16-bit
        
        self._is_speaking = False
        self._speech_frames = 0
        self._silence_frames = 0
        
        # Thresholds (in frames)
        self.speech_threshold = 3   # Frames of speech to trigger
        self.silence_threshold = 10  # Frames of silence to end
    
    def reset(self) -> None:
        """Reset VAD state."""
        self._is_speaking = False
        self._speech_frames = 0
        self._silence_frames = 0
    
    def process_chunk(self, audio_chunk: bytes) -> Tuple[bool, bool, bool]:
        """
        Process audio chunk.
        
        Returns:
            Tuple of (is_speech_frame, is_speaking, speech_ended)
        """
        # WebRTC VAD needs exact frame sizes
        if len(audio_chunk) != self.frame_bytes:
            # Pad or truncate
            if len(audio_chunk) < self.frame_bytes:
                audio_chunk = audio_chunk + b'\x00' * (self.frame_bytes - len(audio_chunk))
            else:
                audio_chunk = audio_chunk[:self.frame_bytes]
        
        is_speech = self.vad.is_speech(audio_chunk, self.sample_rate)
        speech_ended = False
        
        if is_speech:
            self._speech_frames += 1
            self._silence_frames = 0
            
            if self._speech_frames >= self.speech_threshold:
                self._is_speaking = True
        else:
            self._silence_frames += 1
            
            if self._is_speaking and self._silence_frames >= self.silence_threshold:
                self._is_speaking = False
                speech_ended = True
                self._speech_frames = 0
        
        return is_speech, self._is_speaking, speech_ended
    
    @property
    def is_speaking(self) -> bool:
        return self._is_speaking


def create_vad(vad_type: str = "silero", **kwargs) -> SileroVAD | WebRTCVAD:
    """Factory function to create VAD instance."""
    if vad_type == "silero":
        return SileroVAD(**kwargs)
    elif vad_type == "webrtc":
        return WebRTCVAD(**kwargs)
    else:
        raise ValueError(f"Unknown VAD type: {vad_type}")
