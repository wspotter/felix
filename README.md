# Voice Agent - Real-Time Conversational AI with Barge-In

## Project Overview

A production-ready, fully local voice assistant with real-time conversation, barge-in (interruption) support, and autonomous tool execution. Built for high-performance on AMD MI50 GPUs.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WEB BROWSER                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────────────────┐ │
│  │ Mic Input   │  │ Audio Output │  │ Conversation UI + Tool Status       │ │
│  └──────┬──────┘  └──────▲───────┘  └─────────────────────────────────────┘ │
│         │                │                                                   │
│         └────────┬───────┘                                                   │
│                  │ WebSocket (binary audio + JSON control)                   │
└──────────────────┼───────────────────────────────────────────────────────────┘
                   │
┌──────────────────┼───────────────────────────────────────────────────────────┐
│                  ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     WEBSOCKET SERVER (FastAPI)                          │ │
│  │  - Session management                                                   │ │
│  │  - Audio routing                                                        │ │
│  │  - State machine (LISTENING → PROCESSING → SPEAKING → INTERRUPTED)     │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                  │                                                           │
│    ┌─────────────┼─────────────┬─────────────────┬────────────────┐         │
│    ▼             ▼             ▼                 ▼                │         │
│  ┌─────┐    ┌─────────┐   ┌─────────┐      ┌──────────┐          │         │
│  │ VAD │    │   STT   │   │   LLM   │      │   TTS    │          │         │
│  │     │    │         │   │         │      │          │          │         │
│  │Silero│   │Whisper  │   │ Ollama  │      │Edge-TTS/ │          │         │
│  │     │    │(MI50 GPU)│   │+ Tools │      │Orpheus   │          │         │
│  └──┬──┘    └────┬────┘   └────┬────┘      └────┬─────┘          │         │
│     │            │             │                 │                │         │
│     │    ┌───────┴─────────────┴─────────────────┴───────┐       │         │
│     │    │              AUDIO PIPELINE                    │       │         │
│     │    │  - Circular buffer for barge-in               │       │         │
│     │    │  - Streaming STT with interim results         │       │         │
│     │    │  - Streaming TTS with chunk playback          │       │         │
│     │    │  - Interrupt signal propagation               │       │         │
│     └────►  - VAD-triggered state transitions            │       │         │
│          └───────────────────────────────────────────────┘       │         │
│                              │                                    │         │
│                    ┌─────────┴─────────┐                         │         │
│                    │   TOOL EXECUTOR   │                         │         │
│                    │  - Weather API    │                         │         │
│                    │  - Web Search     │                         │         │
│                    │  - File Ops       │                         │         │
│                    │  - Custom Tools   │                         │         │
│                    └───────────────────┘                         │         │
│                                                      VOICE AGENT │         │
└──────────────────────────────────────────────────────────────────┘         │
```

---

## Tech Stack Decisions

### Why These Choices:

| Component | Choice | Rationale |
|-----------|--------|-----------|
| **Server** | FastAPI + WebSockets | Async-native, fast, great for streaming |
| **STT** | faster-whisper | Best local STT, GPU-accelerated on MI50 |
| **LLM** | Ollama (mistral/llama) | Local, tool support, streaming |
| **TTS** | Edge-TTS (primary) + Orpheus (optional) | Edge-TTS is fast & free; Orpheus for quality when GPU-warmed |
| **VAD** | Silero VAD | Lightweight, accurate, no cloud |
| **Frontend** | Vanilla JS + Web Audio API | No build step, hackable, works everywhere |
| **Audio Format** | 16kHz PCM16 | Universal, low latency |

### Hardware Utilization:

- **AMD MI50 #1**: faster-whisper STT (ROCm/HIP)
- **AMD MI50 #2**: Ollama LLM inference
- **AMD RX 6600**: Display + optional TTS if Orpheus is GPU-enabled
- **32 CPU cores**: Audio processing, WebSocket handling

---

## State Machine

```
                    ┌──────────────┐
                    │    IDLE      │
                    └──────┬───────┘
                           │ user speaks
                           ▼
                    ┌──────────────┐
         ┌─────────►│  LISTENING   │◄────────────┐
         │          └──────┬───────┘             │
         │                 │ speech ends (VAD)   │
         │                 ▼                     │
         │          ┌──────────────┐             │
         │          │  PROCESSING  │             │
         │          └──────┬───────┘             │
         │                 │ LLM responds        │
         │                 ▼                     │
         │          ┌──────────────┐             │
         │          │   SPEAKING   │─────────────┤
         │          └──────┬───────┘             │
         │                 │                     │
         │    user speaks  │  speech ends        │
         │    (barge-in)   │                     │
         │                 ▼                     │
         │          ┌──────────────┐             │
         └──────────│ INTERRUPTED  │─────────────┘
                    └──────────────┘
```

---

## File Structure

```
voice-agent/
├── README.md                 # This file
├── requirements.txt          # Python dependencies
├── .env.example             # Environment template
├── run.sh                   # Startup script
│
├── server/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry
│   ├── config.py            # Configuration management
│   ├── session.py           # Session state management
│   │
│   ├── audio/
│   │   ├── __init__.py
│   │   ├── pipeline.py      # Main audio pipeline
│   │   ├── vad.py           # Voice activity detection
│   │   └── buffer.py        # Audio buffering utilities
│   │
│   ├── stt/
│   │   ├── __init__.py
│   │   └── whisper.py       # faster-whisper integration
│   │
│   ├── llm/
│   │   ├── __init__.py
│   │   ├── ollama.py        # Ollama client with streaming
│   │   └── conversation.py  # Conversation history management
│   │
│   ├── tts/
│   │   ├── __init__.py
│   │   ├── edge_tts.py      # Edge TTS integration
│   │   └── orpheus.py       # Orpheus TTS (optional)
│   │
│   └── tools/
│       ├── __init__.py
│       ├── registry.py      # Tool registration system
│       ├── executor.py      # Async tool executor
│       └── builtin/
│           ├── __init__.py
│           ├── datetime.py  # Date/time tools
│           ├── weather.py   # Weather lookup
│           ├── web.py       # Web search
│           └── system.py    # System commands
│
├── frontend/
│   ├── index.html           # Main page
│   ├── app.js               # WebSocket client + audio
│   ├── audio.js             # Web Audio API handling
│   └── style.css            # Minimal styling
│
└── tests/
    ├── test_stt.py
    ├── test_llm.py
    ├── test_tts.py
    └── test_pipeline.py
```

---

## Implementation Checklist

### Phase 1: Foundation ✅
- [x] Project structure & dependencies
- [x] Configuration system
- [x] Basic FastAPI server with WebSocket
- [x] Session management

### Phase 2: Audio Pipeline ✅
- [x] VAD integration (Silero)
- [x] Audio buffer management
- [x] STT integration (faster-whisper)
- [x] Streaming transcription

### Phase 3: Intelligence ✅
- [x] Ollama LLM client
- [x] Streaming responses
- [x] Conversation memory
- [x] Tool/function calling

### Phase 4: Output ✅
- [x] TTS integration (Edge-TTS)
- [x] Streaming audio output
- [ ] Orpheus fallback (optional)

### Phase 5: Barge-In ✅
- [x] State machine implementation
- [x] Interrupt detection
- [x] Graceful audio cutoff
- [x] Context preservation on interrupt

### Phase 6: Tools ✅
- [x] Tool registry system
- [x] Built-in tools (datetime, weather, web, system)
- [x] Custom tool API
- [x] Async execution

### Phase 7: Frontend ✅
- [x] WebSocket client
- [x] Audio capture/playback
- [x] Conversation display
- [x] Status indicators

### Phase 8: Polish (In Progress)
- [x] Error handling
- [x] Logging
- [ ] Performance tuning
- [ ] Full testing
- [ ] Extended documentation
- [ ] Built-in tools (datetime, weather, web)
- [ ] Custom tool API
- [ ] Async execution

### Phase 7: Frontend
- [ ] WebSocket client
- [ ] Audio capture/playback
- [ ] Conversation display
- [ ] Status indicators

### Phase 8: Polish
- [ ] Error handling
- [ ] Logging
- [ ] Performance tuning
- [ ] Documentation

---

## Quick Start

```bash
# 1. Clone and setup
cd /home/stacy/voice-agent
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env with your settings (optional - defaults work)

# 3. Make sure Ollama is running with a model
ollama pull llama3.2  # or your preferred model

# 4. Run the server
./run.sh
# Or manually: uvicorn server.main:app --host 0.0.0.0 --port 8000

# 5. Open browser
# http://localhost:8000
```

---

## Available Tools

The voice agent comes with built-in tools that the LLM can call autonomously:

| Tool | Description |
|------|-------------|
| `get_current_time` | Get current date and time |
| `get_current_date` | Get today's date |
| `calculate_date` | Calculate future/past dates |
| `get_day_of_week` | Get day of week for a date |
| `time_until` | Calculate time until a date |
| `get_weather` | Get current weather (Open-Meteo API) |
| `get_forecast` | Get weather forecast |
| `web_search` | Search the web (DuckDuckGo) |
| `quick_answer` | Get quick answers/definitions |
| `calculate` | Math calculations |
| `get_system_info` | Get system information |
| `get_resource_usage` | Get CPU/memory usage |
| `get_disk_space` | Get disk space info |
| `get_uptime` | Get system uptime |
| `tell_joke` | Get a random joke |

### Adding Custom Tools

```python
from server.tools import tool_registry

@tool_registry.register(
    description="Do something custom",
)
async def my_custom_tool(param1: str, param2: int = 10) -> str:
    """Your custom tool logic here."""
    return f"Result: {param1} x {param2}"
```

---

## Configuration

```env
# .env
WHISPER_MODEL=large-v3        # STT model (tiny, base, small, medium, large-v3)
WHISPER_DEVICE=cuda:0         # GPU for STT (MI50 #1)
OLLAMA_MODEL=mistral:7b-instruct
OLLAMA_URL=http://localhost:11434
TTS_ENGINE=edge               # edge or orpheus
TTS_VOICE=en-US-AriaNeural    # Edge TTS voice
ORPHEUS_URL=http://localhost:5005
SERVER_HOST=0.0.0.0
SERVER_PORT=8000
```

---

## Barge-In Implementation Notes

The key to good barge-in:

1. **Continuous VAD**: Always listening, even during TTS playback
2. **Quick detection**: <100ms from speech start to interrupt signal
3. **Graceful cutoff**: Cancel TTS immediately on interrupt
4. **Context preservation**: Remember what was said before interrupt
5. **State recovery**: Seamlessly transition back to listening

---

## Project Status

**✅ Core Features Complete**

The voice agent is functional with:
- Real-time speech recognition (whisper.cpp with ROCm on MI50 GPU)
- LLM integration with tool calling (Ollama)
- Text-to-speech with streaming (Piper local TTS)
- Barge-in support via VAD (Silero)
- 16+ built-in tools
- Modern web-based UI with multiple themes

**✅ UI/UX Features (NEW)**
- 9 beautiful color themes (Midnight, Emerald, Sunset, Cyberpunk, Ocean, etc.)
- Animated avatar with expressions and breathing animation
- Volume and voice speed controls
- Keyboard shortcuts (Space to talk, T to change theme, ? for help)
- Progressive Web App (PWA) support - installable on mobile/desktop
- Mobile-responsive design
- Flyout panels for browser, code, and terminal views

**🚧 Future Improvements**
- Additional voices and languages
- More sophisticated conversation context
- Additional tools (calendar, reminders, smart home)
- Multi-user support

*Last updated: November 27, 2025*
