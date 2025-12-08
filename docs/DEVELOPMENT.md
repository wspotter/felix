# Development Guide

⚠️ **IGNORE THIS FILE** if you are executing `MERGE_INSTRUCTIONS_FOR_LLM.md` - follow only that file.  
This is historical documentation for the AMD server - not relevant for the merge task.

---

This guide covers setting up and developing the Voice Agent project.

## Prerequisites

- **Python 3.10+** - Core runtime
- **AMD MI50 GPUs** - For STT/LLM acceleration (ROCm/HIP)
- **Ollama** - Local LLM runtime
- **whisper.cpp** - Built with HIP support for ROCm
- **Piper TTS** - Local text-to-speech

## Development Setup

### 1. Clone and Create Virtual Environment

```bash
cd /home/stacy/voice-agent
python3 -m venv venv
source venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Verify External Dependencies

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Check whisper.cpp binary
./whisper.cpp/build/bin/whisper-cli --help

# Check Piper binary
./piper/piper/piper --help
```

### 4. Environment Configuration

Copy and edit the environment file:

```bash
cp .env.example .env
```

Key variables:
```env
WHISPER_MODEL=ggml-large-v3-turbo.bin
WHISPER_GPU_DEVICE=1          # MI50 GPU index (0=RX6600, 1=MI50#1, 2=MI50#2)
OLLAMA_MODEL=llama3.2
TTS_VOICE=amy                 # Piper voice: amy, lessac, ryan
```

## Running the Server

### Development Mode

```bash
cd /home/stacy/voice-agent
source venv/bin/activate
python -m server.main
```

Or use the launch script which also opens Chrome:

```bash
./launch.sh
```

### Access the UI

**Important:** Use `http://localhost:8000` (NOT an IP address) - microphone access requires a secure context.

## Project Structure

```
voice-agent/
├── server/                    # Python backend
│   ├── main.py               # FastAPI app, WebSocket handler
│   ├── config.py             # Pydantic settings
│   ├── session.py            # Session state machine
│   ├── audio/                # Audio processing
│   │   ├── vad.py           # Silero VAD wrapper
│   │   ├── buffer.py        # Audio buffering
│   │   └── pipeline.py      # Audio pipeline orchestration
│   ├── stt/                  # Speech-to-text
│   │   └── whisper_cpp.py   # whisper.cpp subprocess wrapper
│   ├── llm/                  # Language model
│   │   ├── ollama.py        # Ollama async client
│   │   └── conversation.py  # Conversation history
│   ├── tts/                  # Text-to-speech
│   │   └── piper_tts.py     # Piper TTS wrapper
│   └── tools/                # Agent tools
│       ├── registry.py      # Tool registration decorator
│       ├── executor.py      # Async tool execution
│       └── builtin/         # Built-in tools
│
├── frontend/                  # Web frontend
│   ├── index.html            # Main entry point
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # Service worker
│   └── static/
│       ├── app.module.js     # Main app logic
│       ├── audio.module.js   # Audio capture/playback
│       ├── settings.js       # Settings persistence
│       ├── theme.js          # Theme management
│       ├── avatar.js         # Avatar animations
│       ├── notifications.js  # Toast notifications
│       ├── utils.js          # Utilities
│       ├── style.css         # All styles
│       └── icons/            # PWA icons
│
├── docs/                      # Documentation
├── piper/                     # Piper TTS binaries
├── whisper.cpp/              # whisper.cpp build
└── mcpart/                    # MCP server reference
```

## Code Style Guide

### Python

- **Async-first**: All I/O operations should be `async def`
- **Type hints**: Required on all function signatures
- **Logging**: Use `structlog.get_logger()` with contextual key-value pairs
- **Config**: Use Pydantic `Settings` classes

```python
import structlog

logger = structlog.get_logger()

async def process_audio(session_id: str, audio: bytes) -> str:
    logger.info("processing_audio", session_id=session_id, size=len(audio))
    # ...
```

### JavaScript

- **ES6 Modules**: Use `import`/`export` syntax
- **CSS Variables**: Never hardcode colors, use `var(--variable-name)`
- **Event-driven**: Prefer event listeners over polling
- **No Build Step**: Vanilla JS only, no bundlers

```javascript
// Use CSS variables
element.style.color = 'var(--text-primary)';  // ✓
element.style.color = '#ffffff';               // ✗

// Use modules
import { settings } from './settings.js';
export function myFunction() { }
```

### CSS

- All colors via CSS variables (defined in `:root`)
- 9 themes available via `[data-theme="name"]`
- Mobile-first with 3 breakpoints: 480px, 768px, 1024px

## Adding New Features

### Adding a Tool

1. Create file in `server/tools/builtin/`:

```python
# server/tools/builtin/my_tools.py
from ..registry import tool_registry

@tool_registry.register(description="What this tool does")
async def my_tool(param: str, optional_param: int = 10) -> str:
    """Parameters are auto-inferred from type hints."""
    return f"Result: {param}"
```

2. Import in `server/tools/builtin/__init__.py`:

```python
from . import my_tools
```

### Adding a Theme

1. Add theme definition in `style.css`:

```css
[data-theme="mytheme"] {
    --bg-primary: #1a1a2e;
    --bg-secondary: #16213e;
    --text-primary: #ffffff;
    /* ... other variables */
}
```

2. Add to theme list in `theme.js`:

```javascript
const THEMES = [
    'midnight', 'emerald', 'sunset', /* ... */ 'mytheme'
];
```

### Adding a Frontend Module

1. Create the module in `frontend/static/`:

```javascript
// frontend/static/mymodule.js
export function myFunction() {
    // ...
}

export function init() {
    // Called on page load
}
```

2. Import in `app.module.js`:

```javascript
import { init as initMyModule } from './mymodule.js';

// In init():
initMyModule();
```

## Testing

### Run Import Tests

```bash
python test_imports.py
```

### Test Individual Components

```bash
# Test STT
timeout 30 python -c "
import asyncio
from server.stt.whisper_cpp import get_stt
stt = asyncio.run(get_stt())
print(stt)
"

# Test TTS
timeout 30 python -c "
from server.tts.piper_tts import get_tts
import asyncio
tts = get_tts('amy')
audio = asyncio.run(tts.synthesize('Hello world'))
print(f'Generated {len(audio)} bytes')
"

# Test LLM
timeout 30 python -c "
import asyncio
from server.llm.ollama import OllamaClient
client = OllamaClient()
asyncio.run(client.chat('Hello', []))
"
```

### Run pytest

```bash
pytest tests/ -v
```

## Debugging Tips

### WebSocket Messages

Enable debug logging in the browser console:
```javascript
localStorage.setItem('debug', 'true');
```

### Server Logs

Server uses structlog for structured logging. Watch for:
- `tool_registered` - Tool registration at startup
- `session_created` - New WebSocket connections
- `state_change` - Session state transitions
- `audio_processed` - Audio pipeline events

### Common Issues

1. **"Microphone access denied"**
   - Must use `localhost`, not IP address
   - Check browser permissions

2. **"WebSocket connection failed"**
   - Check server is running on port 8000
   - Check for firewall issues

3. **"STT returning empty"**
   - Check whisper.cpp binary exists
   - Verify GPU is available with `rocm-smi`

4. **"TTS not working"**
   - Check Piper binary and voices exist
   - Verify voice name matches available voices

## Performance Considerations

- **VAD runs on CPU** - Silero is lightweight, <10ms per chunk
- **STT on MI50 GPU #1** - Large model, ~1-2s for typical utterance
- **LLM on MI50 GPU #2** - Streaming response, first token <500ms
- **TTS on CPU** - Piper is fast, ~50ms for short sentences

## Contributing

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Make changes following the code style guide
3. Test thoroughly with the import tests
4. Update documentation if needed
5. Create a pull request

---

*Last updated: November 27, 2025*
