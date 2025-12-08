## Voice Agent Quickstart for AI Assistants

**Architecture**
- Browser (vanilla JS) ↔ WebSocket ↔ FastAPI server; pipeline stages: Silero VAD (CPU) → whisper.cpp STT → Ollama LLM → Piper TTS → async tools. Runs on available CPU/GPU; no fixed card assignment required.
- Binary audio frames are `[1 byte TTS-flag][PCM16]`; `raw_bytes[0]==1` means TTS playing and enables barge-in.
- State machine: `idle → listening → processing → speaking → interrupted`; `Session._processing_lock` guards the pipeline to prevent double-runs.

**Key Files**
- `server/main.py` WebSocket routes and `process_audio_pipeline`; `server/session.py` holds state/transcript buffers.
- `server/audio/` VAD/buffer helpers; `server/stt/whisper.py`, `server/llm/ollama.py`, `server/tts/piper.py` contain model calls.
- `server/tools/registry.py` + `server/tools/builtin/` for tool definitions; import new tools in `builtin/__init__.py`.
- Frontend is ES modules with no build step: `frontend/static/app.module.js` bootstraps, `audio.module.js` handles mic/playback, `avatar.js`, `theme.js`, `music.js` drive UI states.

**Developer Workflows**
- Start stack: `./run.sh` (venv + checks) then open `http://localhost:8000`; `./launch.sh` opens the Chrome app window.
- Quick sanity: `python test_imports.py` ensures tools register; main suite: `pytest tests/ -v`. ComfyUI subproject has its own `comfy/tests` and `comfy/tests-unit` (see their READMEs).
- Tracing: set `OTEL_ENABLED=true`; spans include `voice.pipeline`, `stt.transcribe`, `llm.generate`, `tts.synthesize`, `tool.<name>`.

**Tooling Pattern**
- Register with `@tool_registry.register(description=...)`; type hints drive params. Return optional `flyout` payloads (`browser|code|terminal`) to open UI panels.
- Music/knowledge/memory tools require local services: MPD for playback, `/home/stacy/mcpower` for FAISS search, `/home/stacy/openmemory` on :8080 for long-term memory.

**Protocols & UI Contracts**
- Client→server JSON: `start_listening`, `stop_listening`, `settings`, `interrupt`, `playback_done`, `test_audio`, `clear_conversation`, `music_command`.
- Server→client JSON: `state`, `transcript {text,is_final}`, `response_chunk`, `response`, `tool_call`, `tool_result`, `flyout`, `audio`, `error`, `settings_updated`, `music_state`.
- CSS colors must use variables (`var(--text-primary)`) under `[data-theme=...]`; avatar states: `IDLE/LISTENING/THINKING/SPEAKING/GROOVING`.

**Dependencies & Devices**
- whisper.cpp binary at `whisper.cpp/build/bin/whisper-cli`; Ollama on `:11434`; Piper voices `amy|lessac|ryan`; Silero VAD lazy-loads.
- Can run CPU-only or any available GPU. Keep 16kHz input, 22.05kHz TTS output; adjust `WHISPER_DEVICE`/`OLLAMA_HOST` if needed.

**Common Pitfalls**
- Barge-in fails when TTS flag byte is missing; enforce ≥0.5s audio before STT.
- Missing tool after adding: forgot to import in `builtin/__init__.py` or restart.
- Theme or UI glitch: only use CSS vars; no hardcoded colors; access via `http://localhost:8000` (secure-context requirement).
- Knowledge search/tool errors: ensure `faiss-cpu` + `sentence-transformers` installed and `mcpower` indices present; MPD/OpenMemory services must be running for music/memory tools.

**Related Projects in Repo**
- `mcpart/` TypeScript MCP server (see its README) — good reference for MCP patterns; do not break build when editing.
- `comfy/` vendored ComfyUI; follow its own READMEs for tests/install, avoid casual refactors unless explicitly working on it.
