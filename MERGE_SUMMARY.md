MERGE SUMMARY: AMD -> NVIDIA consolidation
=========================================

Summary of updates made in 'copilot-dev' branch merging AMD commit 9707dad into NVIDIA-based repository:

- Admin UI & backend:
  - Copied frontend admin assets and updated service worker to cache admin resources.
  - Added admin endpoints in `server/main.py`: `/api/admin/health`, `/api/admin/sessions`, `/api/admin/events`, `/api/admin/logs`.
  - Implemented `require_admin()` to support both `X-Admin-Token` and `Authorization: Bearer <token>` headers and multi-user AuthManager tokens.

- Auth & sessions:
  - Integrated `server/auth.py` to provide multi-user auth flows with token-based sessions.
  - Added `save_sessions_to_disk()` and `load_sessions_from_disk()` to persist/restore sessions (`data/sessions.json`).
  - Implemented async/threaded persistence using `asyncio.to_thread()` to offload blocking I/O operations.
  - Added background periodic session saver using `settings.session_save_interval`.
  - Ensured atomic session file writes (tmp + os.replace + fsync) to avoid corruption.
  - Fire-and-forget saves on connect/disconnect using `asyncio.create_task()` for responsiveness.
  - Added unit tests: `tests/server/test_session.py::test_session_persistence_roundtrip` and `tests/server/test_async_persistence.py`.

- Tool Tutor integration:
  - Added Tool Tutor hooks, enabling `tool_tutor.prepare_prompt`, `tool_tutor.process_tool_call`, and `tool_tutor.record_result()` integrations in the LLM pipeline.

- STT/TTS adjustments:
  - Adjusted `server/stt/whisper_cpp.py` to set `CUDA_VISIBLE_DEVICES` or `HIP_VISIBLE_DEVICES` based on `settings.whisper_device`.
  - Made STT implementation and comment headers GPU-agnostic (CUDA/ROCm) instead of MI50-specific.

- Tests & validation:
  - All unit tests pass locally: `pytest -q` -> 38 passed.
  - Import test: `python3 test_imports.py` succeeded.

Notes & Next Steps:
- Admin UI E2E: If you want full browser-based tests, we can add Playwright tests for the admin dashboard locally.
- Background session save: Default interval set to 60s; change `SESSION_SAVE_INTERVAL` in `.env` to tune.
- Final code review: Please review `server/main.py` and `server/config.py` for any policy or feature-specific changes before merge.

How to run locally:
1. Create `.env` as needed and set `ENABLE_AUTH` and `ADMIN_TOKEN` in dev.
2. Run the FastAPI server: `./run.sh` or `python -m uvicorn server.main:app --reload`.
3. Run tests: `pytest -q`.

If you want me to push a final commit or create a PR summary, I can prepare that next.
