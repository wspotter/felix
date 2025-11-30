"""
Audio Buffer Utilities
Circular buffers and utilities for real-time audio processing.
"""
import numpy as np
from collections import deque
from typing import Optional
import struct


class AudioBuffer:
    """
    Circular audio buffer for real-time streaming.
    Stores PCM16 audio data efficiently.
    """
    
    def __init__(self, max_seconds: float = 30.0, sample_rate: int = 16000):
        self.sample_rate = sample_rate
        self.max_samples = int(max_seconds * sample_rate)
        self._buffer = deque(maxlen=self.max_samples)
        self._lock_free = True  # We use deque which is thread-safe for append/pop
    
    def write(self, audio_data: bytes) -> None:
        """Write PCM16 audio bytes to buffer."""
        # Convert bytes to int16 samples
        samples = np.frombuffer(audio_data, dtype=np.int16)
        for sample in samples:
            self._buffer.append(sample)
    
    def read(self, num_samples: Optional[int] = None) -> np.ndarray:
        """Read samples from buffer (does not remove them)."""
        if num_samples is None:
            return np.array(self._buffer, dtype=np.int16)
        
        # Read last N samples
        samples = list(self._buffer)[-num_samples:]
        return np.array(samples, dtype=np.int16)
    
    def read_bytes(self, num_samples: Optional[int] = None) -> bytes:
        """Read samples as PCM16 bytes."""
        samples = self.read(num_samples)
        return samples.tobytes()
    
    def clear(self) -> None:
        """Clear the buffer."""
        self._buffer.clear()
    
    @property
    def duration_seconds(self) -> float:
        """Current buffer duration in seconds."""
        return len(self._buffer) / self.sample_rate
    
    @property
    def num_samples(self) -> int:
        """Number of samples in buffer."""
        return len(self._buffer)
    
    def __len__(self) -> int:
        return len(self._buffer)


class ChunkedAudioBuffer:
    """
    Audio buffer that stores audio in chunks.
    Better for streaming to STT which expects fixed-size chunks.
    """
    
    def __init__(
        self, 
        chunk_ms: int = 30, 
        sample_rate: int = 16000,
        max_chunks: int = 1000
    ):
        self.chunk_ms = chunk_ms
        self.sample_rate = sample_rate
        self.samples_per_chunk = int(sample_rate * chunk_ms / 1000)
        self.bytes_per_chunk = self.samples_per_chunk * 2  # 16-bit = 2 bytes
        
        self._chunks: deque[bytes] = deque(maxlen=max_chunks)
        self._pending: bytearray = bytearray()
    
    def write(self, audio_data: bytes) -> int:
        """
        Write audio data, chunking as needed.
        Returns number of complete chunks added.
        """
        self._pending.extend(audio_data)
        chunks_added = 0
        
        # Extract complete chunks
        while len(self._pending) >= self.bytes_per_chunk:
            chunk = bytes(self._pending[:self.bytes_per_chunk])
            self._chunks.append(chunk)
            del self._pending[:self.bytes_per_chunk]
            chunks_added += 1
        
        return chunks_added
    
    def read_chunk(self) -> Optional[bytes]:
        """Read and remove the oldest chunk."""
        if self._chunks:
            return self._chunks.popleft()
        return None
    
    def read_all_chunks(self) -> list[bytes]:
        """Read and remove all chunks."""
        chunks = list(self._chunks)
        self._chunks.clear()
        return chunks
    
    def peek_chunks(self, n: int = None) -> list[bytes]:
        """Peek at chunks without removing."""
        if n is None:
            return list(self._chunks)
        return list(self._chunks)[:n]
    
    def clear(self) -> None:
        """Clear buffer and pending data."""
        self._chunks.clear()
        self._pending.clear()
    
    @property
    def num_chunks(self) -> int:
        return len(self._chunks)
    
    @property
    def duration_seconds(self) -> float:
        """Total duration of buffered audio."""
        return (len(self._chunks) * self.chunk_ms) / 1000.0


def pcm16_to_float32(pcm_data: bytes) -> np.ndarray:
    """Convert PCM16 bytes to float32 numpy array (normalized -1 to 1)."""
    samples = np.frombuffer(pcm_data, dtype=np.int16)
    return samples.astype(np.float32) / 32768.0


def float32_to_pcm16(float_data: np.ndarray) -> bytes:
    """Convert float32 numpy array to PCM16 bytes."""
    # Clip to valid range
    clipped = np.clip(float_data, -1.0, 1.0)
    # Convert to int16
    samples = (clipped * 32767).astype(np.int16)
    return samples.tobytes()


def calculate_rms(audio_data: bytes) -> float:
    """Calculate RMS (volume level) of PCM16 audio."""
    samples = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
    if len(samples) == 0:
        return 0.0
    return np.sqrt(np.mean(samples ** 2)) / 32768.0


def apply_fade(audio_data: bytes, fade_ms: int, sample_rate: int, fade_in: bool = True) -> bytes:
    """Apply fade in/out to audio."""
    samples = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
    fade_samples = int(sample_rate * fade_ms / 1000)
    
    if fade_samples >= len(samples):
        fade_samples = len(samples)
    
    if fade_in:
        fade = np.linspace(0, 1, fade_samples)
        samples[:fade_samples] *= fade
    else:
        fade = np.linspace(1, 0, fade_samples)
        samples[-fade_samples:] *= fade
    
    return samples.astype(np.int16).tobytes()
