"""
Voice Agent Configuration
Loads settings from environment variables with sensible defaults.
Production-ready for AMD MI50 GPU acceleration.
"""
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Literal
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # STT Settings (faster-whisper with CUDA or whisper.cpp with ROCm)
    whisper_model: str = Field(default="ggml-large-v3-turbo.bin", description="Whisper model name/size")
    whisper_device: str = Field(default="cuda", description="Device: cuda, cpu, or auto")
    whisper_compute_type: str = Field(default="float16", description="Compute type: float16, int8, int8_float16")
    whisper_gpu_device: int = Field(default=0, description="GPU device index for CUDA")
    
    # LLM Settings
    llm_backend: Literal["ollama", "lmstudio", "openai"] = Field(default="ollama", description="LLM backend type")
    ollama_url: str = Field(default="http://localhost:11434", description="Ollama API URL")
    lmstudio_url: str = Field(default="http://localhost:1234", description="LM Studio API URL")
    openai_url: str = Field(default="https://api.openai.com", description="OpenAI-compatible API URL")
    openai_api_key: str = Field(default="", description="API key for OpenAI-compatible backends")
    ollama_model: str = Field(default="llama3.2", description="Ollama model")
    ollama_temperature: float = Field(default=0.7, ge=0, le=2)
    ollama_max_tokens: int = Field(default=500, ge=1)
    
    # TTS Settings (Piper - local)
    tts_engine: Literal["piper", "clone"] = Field(default="piper")
    tts_voice: str = Field(default="amy", description="Voice: amy, lessac, ryan")
    
    # Server Settings
    server_host: str = Field(default="0.0.0.0")
    server_port: int = Field(default=8000)
    admin_token: str = Field(default="", description="Admin dashboard token for protected endpoints")
    
    # Audio Settings
    audio_sample_rate: int = Field(default=16000)
    audio_channels: int = Field(default=1)
    audio_chunk_ms: int = Field(default=30)
    
    # Barge-in Settings
    barge_in_enabled: bool = Field(default=True)
    barge_in_threshold: float = Field(default=0.5, ge=0, le=1)
    barge_in_min_speech_ms: int = Field(default=150)
    
    # Logging
    log_level: str = Field(default="INFO")
    
    # Tracing
    otel_enabled: bool = Field(default=False, description="Enable OpenTelemetry tracing")
    otel_endpoint: str = Field(default="http://localhost:4318/v1/traces", description="OTLP endpoint")
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Convenience access
settings = get_settings()
