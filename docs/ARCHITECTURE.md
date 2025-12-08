# Voice Agent Architecture

⚠️ **IGNORE THIS FILE** if you are executing `MERGE_INSTRUCTIONS_FOR_LLM.md` - follow only that file.  
This is historical documentation for the AMD server - not relevant for the merge task.

---

This document describes the technical architecture of the Voice Agent system.

## System Overview

Voice Agent is a real-time conversational AI assistant with barge-in (interrupt) support. The system is designed for local execution on AMD MI50 GPUs via ROCm, with no cloud dependencies.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           WEB BROWSER                                    │
│  ┌──────────────┐  ┌────────────────┐  ┌─────────────────────────────┐  │
│  │ Microphone   │  │ Audio Playback │  │ Conversation UI             │  │
│  │ (16kHz PCM)  │  │ (22050Hz WAV)  │  │ + Avatar + Settings         │  │
│  └──────┬───────┘  └───────▲────────┘  └─────────────────────────────┘  │
│         │                  │                                             │
│         └────────┬─────────┘                                             │
│                  │                                                       │
│         WebSocket (binary audio + JSON messages)                         │
└──────────────────┼───────────────────────────────────────────────────────┘
                   │
┌──────────────────┼───────────────────────────────────────────────────────┐
│                  ▼                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    FastAPI WebSocket Server                      │    │
│  │  • Session management with state machine                         │    │
│  │  • Audio routing and buffering                                   │    │
│  │  • Message dispatching                                           │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                  │                                                       │
│    ┌─────────────┼─────────────┬──────────────┬───────────────┐         │
│    ▼             ▼             ▼              ▼               │         │
│  ┌─────┐   ┌──────────┐  ┌──────────┐   ┌─────────┐          │         │
│  │ VAD │   │   STT    │  │   LLM    │   │   TTS   │          │         │
│  │     │   │          │  │          │   │         │          │         │
│  │Silero│   │whisper.cpp│  │ Ollama   │   │ Piper   │          │         │
│  │ CPU  │   │ MI50 #1  │  │ MI50 #2  │   │  CPU    │          │         │
│  └──┬──┘   └────┬─────┘  └────┬─────┘   └────┬────┘          │         │
│     │           │             │              │                │         │
│     └───────────┴─────────────┴──────────────┴────────────────┘         │
│                              │                                           │
│                     ┌────────┴────────┐                                  │
│                     │  Tool Executor  │                                  │
│                     │  (19+ tools)    │                                  │
│                     └─────────────────┘                                  │
│                                                                          │
│                                              Voice Agent Server          │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Architecture

### 1. Frontend (Browser)

The frontend is a Progressive Web App (PWA) built with vanilla JavaScript ES6 modules.

**Key Components:**

| Module | File | Purpose |
|--------|------|---------|
| App | `app.module.js` | Main orchestration, WebSocket, state management |
| Audio | `audio.module.js` | Mic capture, playback, volume control via GainNode |
| Settings | `settings.js` | LocalStorage persistence, defaults |
| Theme | `theme.js` | 9 color themes, CSS variable switching |
| Avatar | `avatar.js` | Animated avatar with expressions |
| Notifications | `notifications.js` | Toast messages |
| Utils | `utils.js` | Debounce, formatting helpers |

**Audio Pipeline (Client):**

```
Microphone → MediaStream → AudioWorklet → PCM16 → WebSocket
                                              ↓
                                        Binary frames
                                        [1 byte flag][audio]
                                              ↓
WebSocket → Base64 decode → AudioContext → GainNode → Speakers
```

### 2. Backend Server

FastAPI async server with WebSocket support.

**`server/main.py`** - Entry point:
- WebSocket endpoint at `/ws`
- Static file serving
- Message routing
- Audio pipeline orchestration via `process_audio_pipeline()`

**`server/session.py`** - Session management:
- `Session` class with state machine
- `SessionState` enum: `IDLE`, `LISTENING`, `PROCESSING`, `SPEAKING`, `INTERRUPTED`
- `_processing_lock` for thread safety
- Conversation history storage

**`server/config.py`** - Configuration:
- Pydantic `Settings` class
- Environment variable loading
- Model paths, GPU device selection

### 3. Audio Components

**`server/audio/vad.py`** - Voice Activity Detection:
- Silero VAD model (PyTorch)
- Processes 512-sample chunks at 16kHz
- Returns probability of speech
- Tracks speech state with hysteresis
- Runs on CPU (<10ms latency)

**`server/audio/buffer.py`** - Audio buffering:
- Circular buffer for audio data
- Pre-roll buffer for capturing speech before VAD triggers
- Chunk management for STT

### 4. Speech-to-Text

**`server/stt/whisper_cpp.py`** - Whisper integration:
- Subprocess wrapper for whisper.cpp CLI
- Built with `GGML_HIP=1` for ROCm/MI50 support
- Model: `ggml-large-v3-turbo.bin`
- Writes temp WAV file, runs CLI, parses output

```python
# Whisper CLI invocation
whisper.cpp/build/bin/whisper-cli \
    -m models/ggml-large-v3-turbo.bin \
    -f /tmp/audio.wav \
    --gpu-device 1  # MI50 GPU index
```

### 5. Language Model

**`server/llm/ollama.py`** - Ollama client:
- Async httpx client
- Streaming responses via Server-Sent Events
- Tool calling support
- System prompt with tool definitions

**`server/llm/conversation.py`** - Context management:
- Conversation history with role/content pairs
- Token truncation for context window
- Tool call/response tracking

### 6. Text-to-Speech

**`server/tts/piper_tts.py`** - Piper integration:
- Subprocess wrapper for Piper binary
- Voices: `amy`, `lessac`, `ryan`
- Outputs 22050Hz WAV audio
- `length_scale` parameter for speed control (0.5x-2.0x)

```python
# Piper CLI invocation
piper/piper/piper \
    --model piper/piper/voices/en_US-amy-medium.onnx \
    --output_file /tmp/output.wav \
    --length_scale 1.0
```

### 7. Tools

**`server/tools/registry.py`** - Tool registration:
- `@tool_registry.register()` decorator
- Auto-infers parameters from type hints
- Generates OpenAI-compatible tool definitions

**`server/tools/executor.py`** - Execution:
- Async tool execution
- Error handling and timeout
- Result formatting for LLM

**Built-in Tools** (`server/tools/builtin/`):
- `datetime.py` - Time, date, calculations
- `weather.py` - Open-Meteo API integration
- `web.py` - DuckDuckGo search, URL opening
- `system.py` - System info, resource usage

## Data Flow

### Conversation Flow

```
1. User speaks into microphone
   │
2. Browser captures 16kHz PCM16 audio
   │
3. WebSocket sends binary frames to server
   │                [1 byte TTS flag][PCM16 data]
   │
4. VAD analyzes audio chunks
   │                If speech detected → state = LISTENING
   │                If silence >800ms → state = PROCESSING
   │
5. STT transcribes buffered audio
   │                whisper.cpp on MI50 GPU
   │
6. LLM generates response
   │                Ollama with streaming
   │                May call tools
   │
7. TTS synthesizes audio
   │                Piper at 22050Hz
   │
8. Server streams audio back
   │                Base64 in JSON messages
   │
9. Browser plays audio
   │                Via AudioContext + GainNode
   │
10. Barge-in detection
    │               VAD still running during playback
    │               If speech → interrupt → back to step 1
```

### State Machine

```
                         ┌─────────────────┐
                         │      IDLE       │
                         └────────┬────────┘
                                  │ start_listening
                                  ▼
         ┌───────────────┌─────────────────┐───────────────┐
         │               │    LISTENING    │               │
         │               └────────┬────────┘               │
         │                        │ speech_ended           │
         │                        ▼                        │
         │               ┌─────────────────┐               │
         │               │   PROCESSING    │               │
         │               └────────┬────────┘               │
         │                        │ response_ready         │
         │                        ▼                        │
         │               ┌─────────────────┐               │
         │      ┌────────│    SPEAKING     │────────┐      │
         │      │        └─────────────────┘        │      │
         │      │                                   │      │
         │ barge_in                           playback_done│
         │      │                                   │      │
         │      ▼                                   │      │
         │ ┌─────────────────┐                      │      │
         │ │   INTERRUPTED   │──────────────────────┴──────┘
         │ └────────┬────────┘
         │          │ resume_listening
         └──────────┘
```

### WebSocket Protocol

**Binary Messages** (audio):
```
[1 byte: TTS flag][N bytes: PCM16 audio]
```
- Flag = 0: Not playing TTS (normal audio)
- Flag = 1: TTS is playing (enables barge-in detection)

**JSON Messages** (control):

Client → Server:
```json
{"type": "start_listening"}
{"type": "stop_listening"}
{"type": "interrupt"}
{"type": "playback_done"}
{"type": "settings", "theme": "midnight", "voice_speed": 100}
{"type": "clear_conversation"}
{"type": "test_audio"}
```

Server → Client:
```json
{"type": "state", "state": "listening"}
{"type": "transcript", "text": "Hello", "is_final": true}
{"type": "response", "text": "Hi there!"}
{"type": "response_chunk", "text": "Hi", "is_first": true}
{"type": "audio", "data": "<base64>"}
{"type": "tool_call", "name": "get_weather", "args": {...}}
{"type": "tool_result", "name": "get_weather", "result": {...}}
{"type": "flyout", "flyout_type": "browser", "content": "https://..."}
{"type": "error", "message": "Something went wrong"}
```

## Hardware Utilization

| Component | Hardware | Notes |
|-----------|----------|-------|
| VAD (Silero) | CPU | Lightweight, <10ms per chunk |
| STT (whisper.cpp) | MI50 GPU #1 | ROCm/HIP, `--gpu-device 1` |
| LLM (Ollama) | MI50 GPU #2 | ROCm, separate from STT |
| TTS (Piper) | CPU | Fast ONNX runtime, ~50ms |
| WebSocket Server | CPU | Async I/O, minimal overhead |

**GPU Device Mapping:**
- Device 0: AMD RX 6600 (display)
- Device 1: AMD MI50 #1 (STT)
- Device 2: AMD MI50 #2 (LLM via Ollama)

## Security Considerations

1. **Local-only**: No data leaves the machine
2. **CORS**: Origin validation for WebSocket
3. **No auth**: Designed for single-user local use
4. **Secure context**: Mic requires localhost or HTTPS

## Performance Characteristics

| Operation | Typical Latency |
|-----------|-----------------|
| VAD chunk processing | <10ms |
| STT (5s utterance) | 1-2s |
| LLM first token | 300-500ms |
| LLM streaming | ~50 tokens/sec |
| TTS synthesis (short) | ~50ms |
| End-to-end response | 2-4s |

## Extensibility

### Adding New Tools

Tools are registered via decorator in `server/tools/builtin/`:

```python
@tool_registry.register(description="Tool description")
async def my_tool(param: str) -> str:
    return "result"
```

### Adding New Themes

Themes are CSS variable sets in `style.css`:

```css
[data-theme="mytheme"] {
    --bg-primary: #color;
    /* ... */
}
```

### Alternative TTS/STT

The architecture supports swapping components:
- STT: Implement `transcribe(audio_bytes) -> str`
- TTS: Implement `synthesize(text) -> bytes`
- LLM: Implement streaming `chat(messages) -> AsyncIterator[str]`

---

*Last updated: November 27, 2025*
