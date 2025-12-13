"""
STT package - Speech to Text using whisper.cpp or faster-whisper. Supports CUDA or ROCm depending on settings.
"""

from .whisper_cpp import WhisperCppSTT, get_stt, transcribe_audio

__all__ = ["WhisperCppSTT", "get_stt", "transcribe_audio"]
