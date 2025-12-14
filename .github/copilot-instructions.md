## Voice Agent – AI Coding Guide

⚠️ If executing `MERGE_INSTRUCTIONS_FOR_LLM.md`, follow only that file.

## Architecture & flow
- Browser (Vanilla JS, no build) ↔ WebSocket ↔ FastAPI (`server/main.py`) with session state machine (`IDLE→LISTENING→PROCESSING→SPEAKING→INTERRUPTED`, guarded by `Session._processing_lock`).
- Pipeline: Silero VAD (`server/audio/vad.py`) → faster-whisper STT (`server/stt/whisper.py`, GPU via `settings.whisper_device`) → LLM (Ollama/LM Studio/OpenAI in `server/llm/ollama.py`) → async tools (`server/tools/...`) → Piper TTS (`server/tts/piper_tts.py`, 22050Hz WAV).
- Binary audio frames: first byte is TTS-flag (1 while speaking for barge-in), rest PCM16 @16k. JSON messages handled in `main.py` (`state`, `transcript`, `response[_chunk]`, `tool_result`, `flyout`, `audio`, `error`).
- ComfyUI image tools start on-demand via `server/comfy_service.py` (uses `comfy/` subtree). Memory tools call OpenMemory (http://localhost:8080). Music tools rely on MPD.

## Key files to know
- `server/main.py` lifespan loads STT/TTS/tools/tracing/Comfy service; WebSocket handler `process_audio_pipeline()`.
- `server/session.py` state machine + barge-in helpers; session persistence in `data/sessions.json`.
- `server/audio/pipeline.py` buffering + VAD gating; `server/audio/buffer.py` ring buffer utilities.
- `server/tools/registry.py` and `server/tools/builtin/__init__.py` (import new tools). Built-ins: `knowledge_tools` (mcpower datasets), `memory_tools` (OpenMemory), `music_tools` (MPD), `image_tools` (ComfyUI), `web/weather/system` utilities.
- Frontend entry `frontend/static/app.module.js`; modules `audio.module.js`, `theme.js`, `avatar.js`, `music.js`, `settings.js`. CSS vars only (see `frontend/static/style.css`); selectors like `#avatar`, `#orb`, `#settingsBtn`, `#themePicker`, `#voiceSelect` are Playwright fixtures.
- Playwright helpers: `tests/helpers/error-monitor.js`, `tests/mockups/mock_websocket.js` stabilize UI tests.

## Workflows
- Run: `./run.sh` (creates venv, installs deps, checks Ollama model, starts OpenMemory + MPD best-effort, then uvicorn reload). Open http://localhost:8000.
- Quick checks: `python test_imports.py`; backend tests `pytest tests/ -v`.
- UI tests: `npm install` then `npm run test` or `npm run test:phase1`; needs app served at `FELIX_BASE_URL` (default http://localhost:8000). Reports/screens in `test-results/` (`npm run report`).
- Launch Chrome app window: `./launch.sh` (PWA-style wrapper).

## Patterns & expectations
- Register tools with `@tool_registry.register(...)` and add import in `builtin/__init__.py`; to open panels return `{"text": "...", "flyout": {"type": "browser|code|terminal", "content": ...}}`.
- Keep CSS theming via variables (never hardcode colors); themes are `[data-theme="name"]`. User settings persist in `localStorage.voiceAgentSettings` (`frontend/static/settings.js`).
- Tracing in `server/tracing.py` (`start_stt_span/start_llm_span/start_tool_span/start_tts_span`), gated by `OTEL_ENABLED`.
- Common pitfalls: missing TTS flag byte → barge-in broken; need ~0.5s audio before STT; forgetting to import a tool keeps it unregistered; `faiss-cpu` + `sentence-transformers` required for knowledge datasets at `/home/stacy/mcpower/datasets/<name>/`.
