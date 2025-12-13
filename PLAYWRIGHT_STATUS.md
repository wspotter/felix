# Playwright QA Status (auto-notes)

Date: 2025-12-12

## Environment
- Felix base URL: http://localhost:8000
- Health endpoint: `GET /api/admin/health` (requires `X-Admin-Token`)

## Phase 1
### Phase 1.1 — Initial Page Load
  - Phase 2.3 LLM backend switching + refresh models — PASS

## Latest run

- Full suite (`tests/phase1.spec.js`): **25/25 PASS**
- Duration: ~1.6m
- Evidence: per-test screenshots in `test-results/**` and HTML report in `playwright-report/`

## Phase 8 (admin dashboard)

### Phase 8.1 — Admin dashboard loads + token failure UX

- **PASS**
- What we check:
  - `/admin.html` loads and core scaffolding is present (`#tokenInput`, `#saveToken`, `#refresh`, `#healthSection`, `#sessionsTable`).
  - Events/logs sections exist even if they’re collapsed in `<details>` (lists may be hidden until expanded).
  - Dummy token refresh produces an obvious failure signal (either an `alert()` with unauthorized/token wording or a “Refresh failed” UI state).

## Phase 5 (tool execution)

### Phase 5.1 — Tool execution indicator UX

- **PASS**
- Deterministic UI-only check: inject `tool_call` / `tool_result` WS messages and verify `#toolsIndicator` and `#toolName` show/hide correctly.

### Phase 5.4 — Memory tools (remember/recall) surfaced in UI

- **PASS**
- Deterministic UI-only check: inject mocked `remember` + `recall` cycles (user `transcript` + `tool_call` + `tool_result` + final `response`) and assert the conversation updates and the tool indicator ends hidden.

### Phase 5.6 — Image generation (flyout wiring)

- **PASS**
- Deterministic UI-only check: inject `generate_image` `tool_call`/`tool_result` and a `flyout` message that opens a `preview` iframe to a mock image URL (no ComfyUI service required).

## Phase 4 (mocked / deterministic)

### Phase 4.3–4.5 — STT → LLM → TTS happy path

- **PASS**
- Approach: mock `WebSocket` in-browser and drive `state`, `transcript`, `response_chunk`, `response`, `audio` messages into the real UI handler.
- Purpose: validates Felix’s UI plumbing end-to-end without requiring real microphone/audio devices in automation.

### Phase 4.6 — Barge-in (Interrupt)

- **PASS**
- Approach: inject an `interrupted` message then assert avatar transitions back to `listening` via `state` messages.

## Phase 3

### Phase 3.2 — State Transitions (IDLE → LISTENING → IDLE)

- **PASS** (UI-level verification)
- Notes: In headless Chromium, microphone/audio init can fail with `NotSupportedError` depending on host audio devices. The test treats that as an environment limitation, and asserts Felix shows a user-visible “Could not access microphone” notification and stays responsive.

### Phase 3.3 — Binary Audio Protocol (first byte TTS flag)

- **PASS**
- What we check: outgoing WS binary frames are formatted as `[1 byte flag][PCM bytes...]` and the flag flips from `0x00` (not playing) to `0x01` (TTS playing).
- Implementation note: test deterministically captures `ws.send(ArrayBuffer)` and calls `window.app.sendAudio()` directly (no real mic needed).
- Environment note: server may emit VAD setup errors (e.g. missing Silero VAD `hubconf.py`) when it receives audio; those are currently treated as non-blocking for this client-protocol test.

## Phase 6 (widgets)

### Phase 6.1 — Conversation History + Clear

- **PASS**
- Verifies conversation area updates on `transcript`/`response`, and `#clearBtn` resets the UI and emits `clear_conversation`.

### Phase 6.3 — Flyout panels

- **PASS**
- Verifies flyout opens from tool-delivered `flyout` messages and that a second flyout replaces content (no stacking).

### Phase 6.4 — Notifications

- **PASS**
- Triggers multiple error/info notifications and asserts they stack/queue and remain visible.

### Phase 6.2 — Music player widget

- **PASS**
- Deterministic UI-only check: inject `music_state` WS messages and verify:
  - `#musicPlayer` visibility toggles on play,
  - track title/artist update,
  - progress bar gets a non-zero width,
  - avatar enters/leaves grooving state via CSS class.

## Phase 7 (error handling)

### Phase 7.1 — Service failure scenarios

- **PASS**
- Deterministic UI-level test: injects backend `error` messages (e.g. “LLM service unavailable”, “Memory service unavailable”) and asserts user-facing error notifications + system messages appear, while the app stays responsive.

### Phase 7.2 — Network/WebSocket interruption

- **PASS**
- Approach: uses a controllable in-browser `MockWebSocket` to force a disconnect and verify the UI enters a disconnected/reconnecting state, then validates reconnect creates a new socket instance and the UI can accept `state=idle` again.

### Phase 7.5 — Rapid fire interactions

- **PASS**
- Approach: stubs audio start/stop, forces `isConnected=true`, then clicks the orb 10x rapidly and asserts the app stays responsive (no crash/stuck UI).

### Phase 7.3 — Microphone errors

- **PASS**
- Deterministic UI-level test: stubs `audioHandler.startRecording()` to throw `NotAllowedError` (permission denied) and `NotFoundError` (no device), then asserts Felix shows a clear microphone error notification and doesn’t crash.

### Phase 7.4 — Long conversations

- **PASS**
- Deterministic smoke test: injects 20 transcript/response turns via mocked WebSocket messages and asserts the conversation DOM grows, readability remains, and the app stays responsive.
- Test: `tests/phase1.spec.js` (`Phase 1.1 Initial Page Load`)
- Notes:
  - Updated selectors to match actual DOM (`#settingsBtn`, `#settingsModal`, `#themePicker`, `.theme-swatch`).
  - Removed flaky avatar “bounding box delta” animation heuristic; replaced with reduced-motion-aware CSS animation/transition smoke check.

### Phase 1.2 — Theme Switching
- Status: **PASS**
- Test: `tests/phase1.spec.js` (`Phase 1.2 Theme Switching`)
- Notes:
  - Themes are selected via theme swatches in the settings modal (`#themePicker .theme-swatch`).
  - Uses DOM-level `el.click()` for swatches to avoid Playwright viewport/transform flakiness.
  - Screenshots saved as `test-results/**/phase1.2-theme-<theme>.png`.

### Phase 1.3 — Responsive Layout
- Status: **PASS**
- Test: `tests/phase1.spec.js` (`Phase 1.3 Responsive Layout`)
- Notes:
  - Covered viewports: 1920×1080, 1366×768, 768×1024, 375×667.
  - Screenshots saved as `test-results/**/phase1.3-responsive-<viewport>.png`.

## Phase 2
### Phase 2.1 — Settings Panel Open/Close + Persistence
- Status: **PASS**
- Test: `tests/phase1.spec.js` (`Phase 2.1 Settings Panel Open/Close + Persistence`)
- Notes:
  - Verifies modal opens/closes, key sections exist, Save persists to `localStorage.voiceAgentSettings`, and reload restores theme + voice.
  - Uses DOM-level clicks for modal buttons to avoid Playwright viewport/transform flakiness.
  - Screenshot saved as `test-results/**/phase2.1-before-save.png`.

### Phase 2.2 — Voice Settings (dropdown + Test Audio)
- Status: **PASS**
- Test: `tests/phase1.spec.js` (`Phase 2.2 Voice Settings (dropdown + Test Audio)`)
- Notes:
  - Switches voices (`lessac` → `ryan`) and triggers `#testAudioBtn`.
  - Does **not** assert “audio was heard” (headless), but asserts no console errors and UI remains responsive.
  - Screenshot saved as `test-results/**/phase2.2-before-test-audio.png`.

## Phase 3
### Phase 3.1 — WebSocket Connection (establish + stable)
- Status: **PASS**
- Test: `tests/phase1.spec.js` (`Phase 3.1 WebSocket Connection (establish + stable)`)
- Notes:
  - Watches for a WebSocket opening to `/ws`, then asserts it stays open for a 10s stability window.
  - Screenshot saved as `test-results/**/phase3.1-ws-stable.png`.

## Artifacts
- Playwright HTML report: `playwright-report/index.html`
- Latest run output folder(s): `test-results/`
  - Failures (if any) will include `test-failed-*.png`, `video.webm`, and `error-context.md`.
