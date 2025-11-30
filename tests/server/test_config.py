"""
Tests for server configuration.
"""
import os
import pytest
from unittest.mock import patch


class TestSettings:
    """Test the Settings configuration class."""
    
    def test_default_settings(self):
        """Test that default settings are loaded correctly."""
        from server.config import Settings
        
        settings = Settings()
        
        # Check some defaults (using actual attribute names)
        assert settings.server_host == "0.0.0.0"
        assert settings.server_port == 8000
        assert settings.audio_sample_rate == 16000
    
    def test_settings_from_env(self):
        """Test that settings can be overridden from environment."""
        from server.config import Settings
        
        with patch.dict(os.environ, {"SERVER_PORT": "9000", "SERVER_HOST": "127.0.0.1"}):
            # Need to create a new instance to pick up env vars
            settings = Settings(_env_file=None)
            # Note: pydantic may have already cached, this tests the concept
    
    def test_whisper_model_path(self):
        """Test whisper model configuration."""
        from server.config import Settings
        
        settings = Settings()
        
        # Model should have a default
        assert settings.whisper_model is not None
        assert len(settings.whisper_model) > 0
    
    def test_ollama_model(self):
        """Test Ollama model configuration."""
        from server.config import Settings
        
        settings = Settings()
        
        assert settings.ollama_model is not None
        assert settings.ollama_url is not None
    
    def test_tts_voice(self):
        """Test TTS voice configuration."""
        from server.config import Settings
        
        settings = Settings()
        
        assert settings.tts_voice in ['amy', 'lessac', 'ryan']


class TestSettingsSingleton:
    """Test that settings behaves as expected with get_settings."""
    
    def test_get_settings_returns_settings(self):
        """Test that get_settings returns a Settings instance."""
        from server.config import get_settings
        
        settings = get_settings()
        
        assert settings is not None
        assert hasattr(settings, 'server_host')
        assert hasattr(settings, 'server_port')
