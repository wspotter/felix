PR: Merge AMD commit 9707dad into NVIDIA-based server (copilot-dev)
=================================================================

Summary
-------
This PR merges select features from the AMD commit `9707dad` into the NVIDIA server branch `copilot-dev`. The merge was performed with attention to GPU-agnostic behavior, testing, and minimal disruption to NVIDIA-specific deployment.

Key changes
-----------
- Admin dashboard and backend endpoints: `/admin.html`, `/api/admin/*` endpoints and telemetry.
- Multi-user auth (AuthManager) and admin-token fallback behavior; `require_admin()` now supports `Authorization: Bearer <token>` and `X-Admin-Token`.
- Tool Tutor integration for LLM tool call prompting and learning hooks.
- Session persistence with:
  - `load_sessions_from_disk()` on startup
  - `save_sessions_to_disk()` async implementation using `asyncio.to_thread()` to offload blocking I/O
  - Fire-and-forget saves on connect/disconnect/pipeline using `asyncio.create_task()` for non-blocking behavior
  - Background periodic saver controlled by `settings.session_save_interval` (default: 60s)
  - Atomic writes (tmp file + `os.replace` + `fsync`) to prevent corruption
- STT device handling improvements: `whisper_cpp.py` now sets CUDA/HIP env vars based on `settings.whisper_device`.
- Config: `session_save_interval` added to control background save frequency.

Tests & Validation
------------------
- Unit tests: `pytest -q` — 38+ passed (including added tests for admin auth, session persistence, and async I/O)
- Import test: `python3 test_imports.py` — Success
- Admin endpoints: tests cover both `Authorization` and `X-Admin-Token` use cases and static asset presence
- Session persistence: `tests/server/test_session.py::test_session_persistence_roundtrip` validates save/load behavior
- Async persistence: `tests/server/test_async_persistence.py` validates thread pool offloading

How to test locally (smoke-check)
---------------------------------
1. Run import test:
```
python3 test_imports.py
```
2. Run unit tests:
```
pytest -q
```
3. Start server (no background auto start):
```
./run.sh
# or
python -m uvicorn server.main:app --reload
```
4. Open the admin dashboard:
- Ensure you have `ENABLE_AUTH` enabled or `ADMIN_TOKEN` set if you prefer environment auth.
- For multi-user `ENABLE_AUTH=true`: login with `admin` / `felix2024` via `POST /api/auth/login` or use `get_auth_manager().login()` via Python REPL to obtain a token.
- Access `http://localhost:8000/admin.html`, click `Refresh` or use Dev Tools to verify `/api/admin/health` returns the expected `status: ok`.

Notes for merge reviewers
------------------------
- This PR deliberately avoids AMD-specific MI50 strings and uses `settings.whisper_device` to decide whether to set HIP/CUDA env variables.
- `server/main.py.amd` is a preserved snapshot of the original AMD file — left in the repo for reference only.
- The default `session_save_interval` is 60 seconds; set to 0 to disable background saving.
- If you prefer the persistent session write to be fully non-blocking, we could offload `save_sessions_to_disk()` to a background thread. I intentionally paused on that change until the team confirms to proceed.

Suggested PR title: Merge admin UI, session persistence, and Tool Tutor from AMD commit into NVIDIA branch

Files touched (high-level)
-------------------------
- server/main.py (session persistence, admin endpoints, Tool Tutor integration, background saver)
- server/auth.py (AuthManager)
- server/stt/whisper_cpp.py (CUDA/HIP env handling)
- server/stt/whisper.py & server/stt/__init__.py (doc updates)
- server/config.py (new `session_save_interval` and admin/auth settings)
- tests/server/test_admin.py, test_admin_ui.py, test_session.py (new/updated tests)
- MERGE_SUMMARY.md / AMD_TO_NVIDIA_MERGE_PLAN.md (meta docs)

Next steps (suggested)
----------------------
- Review PR content and confirm the background save interval default and `AUTH` behavior.
- Prefer non-blocking session saves if you expect large session objects frequently.
- Optionally run a browser-based E2E test (Playwright) for the admin dashboard.

---
End of PR description
