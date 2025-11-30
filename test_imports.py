#!/usr/bin/env python3
"""
Quick import test to verify all modules load correctly.
"""
import sys


def test_imports():
    """Test all module imports."""
    errors = []
    
    modules = [
        ("server.config", "Settings"),
        ("server.session", "Session, SessionState"),
        ("server.audio.buffer", "AudioBuffer"),
        ("server.audio.vad", "SileroVAD"),
        ("server.stt.whisper", "WhisperSTT"),
        ("server.llm.ollama", "OllamaClient"),
        ("server.llm.conversation", "ConversationHistory"),
        ("server.tts.edge_tts", "EdgeTTS"),
        ("server.tools", "tool_registry, tool_executor"),
        ("server.main", "app"),
    ]
    
    for module_path, expected in modules:
        try:
            __import__(module_path)
            print(f"✓ {module_path}: {expected}")
        except Exception as e:
            errors.append(f"✗ {module_path}: {e}")
            print(f"✗ {module_path}: {e}")
    
    print()
    
    if errors:
        print(f"FAILED: {len(errors)} import errors")
        return 1
    else:
        print("SUCCESS: All modules imported correctly")
        return 0


def test_tools():
    """Test tool registration."""
    from server.tools import tool_registry
    
    tools = tool_registry.list_tools()
    print(f"\nRegistered tools ({len(tools)}):")
    for tool in tools:
        print(f"  - {tool.name}: {tool.description[:50]}...")
    
    return 0


if __name__ == "__main__":
    print("=" * 50)
    print("Voice Agent - Import Test")
    print("=" * 50)
    print()
    
    result = test_imports()
    
    if result == 0:
        test_tools()
    
    sys.exit(result)
