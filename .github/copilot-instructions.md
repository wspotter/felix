# Voice Agent - AI Coding Instructions

## Architecture Overview

Real-time voice assistant with barge-in (interrupt) support, running fully locally on AMD MI50 GPUs via ROCm:

```
Browser (Vanilla JS) ←→ WebSocket ←→ FastAPI Server
                                       ├── VAD (Silero, CPU)
                                       ├── STT (whisper.cpp, MI50 GPU #1)
                                       ├── LLM (Ollama, MI50 GPU #2)
                                       ├── TTS (Piper, CPU)
                                       └── Tools (async execution)
```

**Key decisions:**
- Audio: 16kHz PCM16 from browser, 22050Hz WAV from TTS
- WebSocket binary: `[1 byte TTS flag][audio data]` - flag enables barge-in detection
- State machine: `IDLE → LISTENING → PROCESSING → SPEAKING → INTERRUPTED`
- `Session._processing_lock` prevents concurrent pipeline runs

## Project Layout

| Path | Purpose |
|------|---------|
| `server/main.py` | FastAPI entry, WebSocket, `process_audio_pipeline()` |
| `server/session.py` | `Session` class, `SessionState` enum |
| `server/config.py` | Pydantic `Settings`, all config via `.env` |
| `server/tracing.py` | OpenTelemetry spans for STT/LLM/TTS pipeline |
| `server/tools/registry.py` | `@tool_registry.register()` decorator |
| `server/tools/builtin/` | Built-in tools (web, weather, knowledge, system) |
| `frontend/static/app.module.js` | Main app class, WebSocket client |
| `frontend/static/audio.module.js` | `AudioHandler` class, mic/playback |
| `frontend/static/settings.js` | LocalStorage persistence |
| `frontend/static/theme.js` | 9 themes, CSS variable switching |
| `frontend/static/avatar.js` | Animated avatar states |

## Code Patterns

### Adding a New Tool
```python
# server/tools/builtin/my_tool.py
from ..registry import tool_registry

@tool_registry.register(description="What this tool does")
async def my_tool(param: str, optional: int = 10) -> str:
    """Parameters auto-inferred from type hints."""
    return f"Result: {param}"
```
Then import in `server/tools/builtin/__init__.py`.

### Flyout Results (Browser/Code/Terminal panels)
```python
return {
    "text": "Opening the page",  # spoken by TTS
    "flyout": {"type": "browser", "content": "https://example.com"}
}
```
Valid types: `browser`, `code`, `terminal`

### Frontend Module Pattern
```javascript
// Each module exports init() called from app.module.js
import { initTheme, applyTheme } from './theme.js';
import { initAvatar, setAvatarState } from './avatar.js';

// In VoiceAgentApp.init():
initTheme();
initAvatar(document.getElementById('avatar'));
```
- **No build step** - Vanilla JS with ES6 modules
- **CSS variables only** - Never hardcode colors: `var(--text-primary)`
- Themes in `style.css` as `[data-theme="name"]` selectors

### Logging (Python)
```python
logger.info("tool_executed", name=tool_name, result_length=len(result))
```

### OpenTelemetry Tracing
Pipeline traces enabled via `OTEL_ENABLED=true` in `.env`:
```python
from .tracing import start_stt_span, start_llm_span, start_tool_span

with start_stt_span(len(audio_bytes)) as span:
    transcript = await stt.transcribe(audio_bytes)
    span.set_attribute("transcript_length", len(transcript))
```
Spans: `voice.pipeline`, `stt.transcribe`, `llm.generate`, `tool.<name>`, `tts.synthesize`

## Running & Testing

```bash
./run.sh              # Start server (auto-activates venv, checks Ollama)
./launch.sh           # Launch with Chrome app window
python test_imports.py # Quick import/tool registration test
pytest tests/ -v      # Run pytest
```

**Critical:** Access at `http://localhost:8000` (not IP) - mic requires secure context.

## External Dependencies

| Component | Binary/Service | Notes |
|-----------|---------------|-------|
| STT | `whisper.cpp/build/bin/whisper-cli` | Built with `GGML_HIP=1` for ROCm |
| LLM | Ollama at `:11434` | Supports OpenAI-compatible backends |
| TTS | `piper/piper/piper` | Voices: `amy`, `lessac`, `ryan` |
| VAD | Silero (PyTorch) | Lazy-loaded singleton |

GPU mapping: 0=RX6600 (display), 1=MI50#1 (STT), 2=MI50#2 (LLM)

## Related MCP Servers

### mcpart/ - Art Supply Store MCP Server
TypeScript MCP server with 36 business tools (inventory, orders, social media). Separate project, useful as MCP implementation reference.
```bash
cd mcpart && npm install && npm run build
npm start        # Run as MCP server
npm run dashboard # Web UI at :3000
```

### mcpower/ - Knowledge Vector Search
External FAISS-based semantic search at `/home/stacy/mcpower`. Used by `knowledge_tools.py`:
- Datasets in `mcpower/datasets/<name>/` with `metadata.json` + `index/` folder
- Uses sentence-transformers for embeddings
- Tools: `knowledge_search(query, dataset)`, `list_knowledge_datasets()`

### OpenMemory - Long-term Agent Memory
Cognitive memory system at `/home/stacy/openmemory`. Provides persistent memory across sessions.

**Backend** (TypeScript/Node.js):
```bash
cd /home/stacy/openmemory/backend
npx tsx src/server/index.ts  # Runs on port 8080
```

**Configuration** (`/home/stacy/openmemory/.env`):
- `OM_EMBEDDINGS=ollama` - Uses local Ollama for embeddings
- `OM_TIER=smart` - Balanced performance tier
- `OLLAMA_URL=http://localhost:11434`

**Memory Tools** (`server/tools/builtin/memory_tools.py`):
- `remember(content, tags, importance)` - Store a memory
- `recall(query, limit, min_relevance)` - Search memories semantically  
- `forget(memory_id)` - Delete a memory by ID
- `memory_status(sector, limit)` - List all memories

**Cognitive Sectors**: episodic, semantic, procedural, emotional, reflective

**API Endpoints** (port 8080):
- `POST /memory/add` - Store memory
- `POST /memory/query` - Search memories
- `GET /memory/all` - List memories
- `DELETE /memory/:id` - Delete memory
- `GET /health` - System status

## WebSocket Protocol

**Binary Messages** (audio):
```
[1 byte: TTS flag][N bytes: PCM16 audio]
```
- Flag=0: Normal audio capture
- Flag=1: TTS is playing (enables barge-in detection)

**JSON Messages - Client → Server:**
| Type | Purpose |
|------|---------|
| `start_listening` | Begin voice capture |
| `stop_listening` | Stop voice capture |
| `settings` | Update voice/model/backend settings |
| `interrupt` | Manual barge-in trigger |
| `playback_done` | TTS audio finished playing |
| `test_audio` | Test TTS output |
| `clear_conversation` | Reset conversation history |
| `music_command` | Direct music control from UI |

**JSON Messages - Server → Client:**
| Type | Purpose |
|------|---------|
| `state` | State machine update (`idle`, `listening`, `processing`, `speaking`, `interrupted`) |
| `transcript` | STT result with `text`, `is_final` |
| `response_chunk` | Streaming LLM text |
| `response` | Final LLM response |
| `tool_call` | Tool invocation notification |
| `tool_result` | Tool execution result |
| `flyout` | Open browser/code/terminal panel |
| `audio` | Base64-encoded TTS audio chunk |
| `error` | Error message |
| `settings_updated` | Settings confirmation |
| `music_state` | Music playback state update |

## mcpower Dataset Structure

To add a new knowledge dataset for `knowledge_search()`:
```
/home/stacy/mcpower/datasets/<dataset-name>/
├── metadata.json    # Document list with titles, snippets, paths
├── manifest.json    # Optional: description, document_count
└── index/
    └── *.index      # FAISS index file (or *.faiss)
```

**metadata.json format:**
```json
{
  "model": "sentence-transformers/all-MiniLM-L6-v2",
  "documents": [
    {"title": "Doc Title", "snippet": "First 300 chars...", "path": "source/file.md"},
    ...
  ]
}
```

## Common Pitfalls

1. **Barge-in not working**: Check TTS flag byte from frontend (`raw_bytes[0] == 1`)
2. **Pipeline runs twice**: Ensure `_processing_lock` acquired before STT/LLM/TTS
3. **Audio empty**: Min 0.5s audio required (see `16000 * 0.5` check)
4. **Theme not applying**: CSS vars must be in `:root` or `[data-theme]` selectors
5. **Tool not available**: Import module in `builtin/__init__.py` and restart
6. **Knowledge search fails**: Ensure `faiss-cpu` and `sentence-transformers` installed
7. **Memory tools fail**: Ensure OpenMemory backend is running on port 8080
8. **Music tools fail**: Ensure MPD is running (`systemctl --user start mpd`)

## Music Player - MPD Integration

Local music playback via Music Player Daemon (MPD). No external APIs or subscriptions.

**Requirements:**
- MPD installed: `sudo apt install mpd mpc`
- User config at `~/.config/mpd/mpd.conf`
- Music directory: `~/Music` (symlinked to storage)

**Music Tools** (`server/tools/builtin/music_tools.py`):
- `music_play(query)` - Play music by search or resume
- `music_pause()` / `music_stop()` - Pause/stop playback
- `music_next()` / `music_previous()` - Track navigation
- `music_volume(level)` - Set volume 0-100
- `music_now_playing()` - Current track info
- `music_search(query)` - Search library
- `music_queue_add(query)` - Add to queue
- `music_playlists()` / `music_playlist_load(name)` - Playlist management
- `music_shuffle(enabled)` / `music_repeat(enabled)` - Playback modes
- `music_update_library()` - Rescan music directory
- `music_stats()` - Library statistics

**Frontend** (`frontend/static/music.js`):
- Mini player widget shows now playing
- Controls: play/pause, prev/next, volume slider
- Avatar switches to `GROOVING` state when music plays
- Volume ducks to 20% when Felix speaks, restores after

**Avatar States** (`frontend/static/avatar.js`):
- `IDLE` - Default state with breathing animation
- `LISTENING` - Attentive, wider eyes
- `THINKING` - Eyes up and squinting
- `SPEAKING` - Animated mouth, expressive
- `GROOVING` - Head bob, relaxed happy vibe (music playing)
