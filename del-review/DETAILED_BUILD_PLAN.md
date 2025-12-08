# 🔧 Detailed Build Plan for Voice Agent

> This document is written as detailed prompts/instructions for an LLM to execute. Each phase is broken down into specific, actionable tasks with clear context and constraints.

---

## ✅ Implementation Status (Updated Nov 27, 2025)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Foundation Cleanup | ✅ Complete | ES6 modules, utils, settings, theme, avatar, notifications |
| Phase 2: Avatar Enhancement | ✅ Complete | CSS animations, breathing, blinking, expressions, state transitions |
| Phase 3: Backend Improvements | ✅ Complete | Voice speed integration, test audio, clear conversation |
| Phase 4: UI Enhancements | ✅ Complete | Settings panel with volume/speed sliders, keyboard shortcuts modal |
| Phase 5: Mobile & PWA | ✅ Complete | Responsive design, PWA manifest, service worker, app icons |
| Phase 6: Testing & Documentation | ✅ Complete | 35 pytest tests, DEVELOPMENT.md, ARCHITECTURE.md, API.md |

### Key Features Implemented
- ✅ 9 color themes with CSS variables
- ✅ Animated avatar with breathing, blinking, and expressions
- ✅ Volume control via Web Audio API GainNode
- ✅ Voice speed control via Piper TTS length_scale
- ✅ Keyboard shortcuts (Space, T, Shift+T, Escape, Ctrl+/, ?)
- ✅ Shortcuts help modal
- ✅ Test audio button
- ✅ PWA manifest and service worker
- ✅ Mobile-responsive design (3 breakpoints)
- ✅ Clear conversation functionality
- ✅ Comprehensive documentation (docs/ folder)
- ✅ Backend pytest test suite (35 tests)

---

## 📁 Project Structure

```
voice-agent/
├── frontend/
│   ├── index.html              # Main entry point
│   ├── static/
│   │   ├── style.css           # All styles + theme variables
│   │   ├── app.js              # Main application logic
│   │   ├── audio.js            # Audio handling (recording/playback)
│   │   ├── avatar.js           # Avatar animations and states (TO CREATE)
│   │   ├── theme.js            # Theme management (TO CREATE)
│   │   └── utils.js            # Shared utilities (TO CREATE)
│   └── assets/
│       └── sounds/             # UI sound effects (TO CREATE)
├── server/
│   ├── main.py                 # FastAPI server, WebSocket handling
│   ├── config.py               # Configuration management (TO CREATE)
│   ├── audio/
│   │   ├── vad.py              # Voice Activity Detection
│   │   ├── stt.py              # Speech-to-Text (Whisper)
│   │   └── tts.py              # Text-to-Speech (Piper)
│   ├── llm/
│   │   ├── ollama.py           # Ollama integration
│   │   └── router.py           # LLM backend router (TO CREATE)
│   ├── session/
│   │   └── manager.py          # Session state management (TO CREATE)
│   └── tools/                  # Agent tools (FUTURE)
├── tests/                      # Test suite (TO CREATE)
├── docs/                       # Documentation (TO CREATE)
├── .cursor/
│   └── rules.md                # Cursor AI rules
├── VISION.md                   # High-level vision document
├── DETAILED_BUILD_PLAN.md      # This file
├── MISTAKES.md                 # Common AI mistakes to avoid
├── requirements.txt            # Python dependencies
└── launch.sh                   # Quick start script
```

---

## 🚫 MISTAKES.md - Common AI Mistakes to Avoid

Create this file and ALWAYS mention it when adding features:

```markdown
# Common Mistakes - AVOID THESE

## Frontend

### 1. Don't duplicate message handling
- WRONG: Creating new message elements in both `response_chunk` and `response` handlers
- RIGHT: Use `response_chunk` for streaming, finalize existing element on `response`

### 2. Don't forget cache busting
- WRONG: Making CSS/JS changes without updating version
- RIGHT: Always increment `?v=X` in index.html after changes

### 3. Don't break existing themes
- WRONG: Changing CSS variable names without updating all themes
- RIGHT: Check all theme definitions when modifying variables

### 4. Don't hardcode colors in components
- WRONG: `color: #ffffff`
- RIGHT: `color: var(--text-primary)`

### 5. Don't forget mobile
- WRONG: Fixed pixel widths, tiny tap targets
- RIGHT: Responsive units, minimum 44px touch targets

## Backend

### 1. Don't block the event loop
- WRONG: Synchronous file I/O or heavy computation in async handlers
- RIGHT: Use asyncio, run_in_executor for blocking operations

### 2. Don't forget to handle disconnections
- WRONG: Assuming WebSocket is always connected
- RIGHT: Wrap sends in try/except, clean up on disconnect

### 3. Don't leak audio resources
- WRONG: Creating audio streams without cleanup
- RIGHT: Always close streams, use context managers

### 4. Don't ignore barge-in state
- WRONG: Continuing TTS after user interrupts
- RIGHT: Check `interrupted` flag, stop TTS immediately

### 5. Don't send huge audio chunks
- WRONG: Buffering entire response before sending
- RIGHT: Stream in small chunks (4096 bytes or less)

## General

### 1. Don't add features I didn't ask for
- Just do what was requested, nothing more

### 2. Don't remove existing functionality
- If fixing a bug, don't break something else

### 3. Don't change the design system without asking
- Keep consistent with existing patterns

### 4. Don't forget error handling
- Always consider what happens when things fail
```

---

## 📋 Phase 1: Foundation Cleanup

### Task 1.1: Refactor Frontend into Modules

**Context**: Currently all JS is in one file (app.js) plus audio.js. As we add features, this will become unwieldy. Let's split it up.

**Prompt for AI**:
```
I need to refactor the frontend JavaScript into separate modules. Currently we have:
- app.js (main logic, theme handling, avatar states, WebSocket)
- audio.js (AudioHandler class)

Create the following new files by extracting code from app.js:

1. `avatar.js` - Extract all avatar-related code:
   - setAvatarEmotion function
   - Any avatar animation helpers
   - Export: setAvatarEmotion, initAvatar

2. `theme.js` - Extract all theme-related code:
   - applyTheme function
   - updateThemeSwatches function
   - Theme initialization
   - Export: applyTheme, initTheme, getTheme, setTheme

3. `utils.js` - Create utilities:
   - debounce function
   - formatTime function (for timestamps)
   - generateId function (for message IDs)
   - Export all utilities

Update app.js to:
- Import from the new modules
- Remove the extracted code
- Keep only core app logic (WebSocket, message handling, UI coordination)

Use ES6 modules with import/export. Update index.html to use type="module" on the main script.

Important files to reference:
- /home/stacy/voice-agent/frontend/static/app.js
- /home/stacy/voice-agent/frontend/index.html

DO NOT:
- Change any existing functionality
- Modify the CSS
- Change WebSocket message formats
- Remove any features
```

### Task 1.2: Add Settings Persistence

**Context**: User preferences (theme, volume, etc.) are lost on refresh. Let's persist them.

**Prompt for AI**:
```
Add localStorage persistence for user settings. Create a settings system that:

1. Create `settings.js` module with:
   - Default settings object
   - loadSettings() - load from localStorage or return defaults
   - saveSettings(settings) - save to localStorage
   - getSetting(key) - get single setting
   - setSetting(key, value) - set and persist single setting

2. Settings to persist:
   - theme (string, default: 'midnight')
   - volume (number, 0-1, default: 0.8)
   - pushToTalkKey (string, default: 'Space')
   - showTimestamps (boolean, default: false)
   - reducedMotion (boolean, default: false)

3. Update app.js to:
   - Load settings on init
   - Apply theme from settings
   - Apply volume to audio handler

4. Update theme.js to:
   - Call setSetting when theme changes

Important files:
- /home/stacy/voice-agent/frontend/static/app.js
- /home/stacy/voice-agent/frontend/static/theme.js (after 1.1)

DO NOT:
- Create a settings UI yet (that's a later task)
- Change the theme visual appearance
- Modify backend code
```

### Task 1.3: Improve Error Handling

**Context**: Errors can leave the app in broken states. Let's handle them gracefully.

**Prompt for AI**:
```
Improve error handling throughout the frontend:

1. Add connection state management:
   - Track WebSocket connection state (disconnected, connecting, connected, error)
   - Show visual indicator when disconnected (red dot or banner)
   - Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
   - Show "Reconnecting..." message during reconnection attempts

2. Add error toast/notification system:
   - Create showNotification(message, type) function
   - Types: 'error', 'warning', 'info', 'success'
   - Toast appears at top, auto-dismisses after 5s
   - Style to match current design (glassmorphism)

3. Handle specific errors:
   - Microphone permission denied → clear message with instructions
   - WebSocket connection failed → show reconnecting state
   - Audio playback failed → show error, continue conversation
   - Server error response → show friendly error message

4. Add to app.js error boundaries:
   - Wrap async operations in try/catch
   - Log errors to console with context
   - Never leave app in broken state

Style the notifications using existing CSS variables. Place notification container at top of body.

Important files:
- /home/stacy/voice-agent/frontend/static/app.js
- /home/stacy/voice-agent/frontend/static/style.css
- /home/stacy/voice-agent/frontend/index.html

DO NOT:
- Change working functionality
- Add complex animation libraries
- Modify backend code
```

---

## 📋 Phase 2: Avatar Enhancement

### Task 2.1: Improve Avatar Animations

**Context**: Current avatar has basic states but animations feel stiff. Let's make it more alive.

**Prompt for AI**:
```
Enhance the avatar animations to feel more natural and alive:

1. Update idle state:
   - Add subtle "breathing" - slight scale pulse (0.98 to 1.0, 4s cycle)
   - Random blinking every 3-6 seconds (not perfectly regular)
   - Occasional "look around" - eyes shift slightly left/right
   - Very subtle floating motion (translateY 2px)

2. Update listening state:
   - Eyes slightly wider (scale 1.05)
   - Pupils dilate slightly
   - Lean forward effect (subtle translateY -2px)
   - Remove blink during active listening (attentive)

3. Update thinking state:
   - Eyes look up and to the right (classic "thinking" pose)
   - Add subtle "hmm" expression - slight eyebrow raise
   - Slower, deeper breathing animation
   - Maybe eyes slightly narrowed (concentrating)

4. Update speaking state:
   - Mouth animation synced better to audio
   - Eyes express based on content sentiment (if possible)
   - Slight head bob occasionally
   - Return to center eye position

5. Add transitions:
   - Smooth 200ms transitions between all states
   - No jarring jumps
   - Use CSS transitions, not JavaScript animation loops

All animations should use CSS only (transforms, keyframes). Keep it performant.
Respect prefers-reduced-motion media query - reduce/disable animations for accessibility.

Important files:
- /home/stacy/voice-agent/frontend/index.html (avatar SVG)
- /home/stacy/voice-agent/frontend/static/style.css (animations)
- /home/stacy/voice-agent/frontend/static/avatar.js (state management)

DO NOT:
- Use JavaScript animation libraries
- Change the basic avatar shape
- Make animations distracting or too fast
- Forget reduced-motion support
```

### Task 2.2: Add Avatar Expressions

**Context**: Avatar should show more emotional range based on conversation.

**Prompt for AI**:
```
Add more avatar expressions beyond the basic states:

1. Add new emotion classes:
   - .avatar-happy - bigger eyes, upward curved mouth, slight bounce
   - .avatar-curious - head tilt, one eyebrow raised, wider eyes
   - .avatar-confused - both eyebrows raised, small mouth, head tilt other way
   - .avatar-excited - very wide eyes, big smile, bouncy animation
   - .avatar-calm - relaxed eyes, gentle smile, slow breathing

2. Update avatar.js to:
   - Add setAvatarExpression(expression) function separate from state
   - Expression is the emotional overlay, state is the activity (idle/listening/etc)
   - Both can be active (e.g., "listening" state + "curious" expression)

3. Create expression triggers:
   - For now, expressions change randomly during idle
   - Later: will be triggered by sentiment analysis of responses

4. CSS implementation:
   - Expressions modify eyes, mouth, and subtle position
   - Transitions should be smooth (300ms)
   - Can combine with state animations

Keep the expressions subtle and tasteful - this isn't a cartoon, it's a friendly assistant.

Important files:
- /home/stacy/voice-agent/frontend/index.html
- /home/stacy/voice-agent/frontend/static/style.css
- /home/stacy/voice-agent/frontend/static/avatar.js

DO NOT:
- Make expressions exaggerated or cartoonish
- Add too many expressions (keep it simple for now)
- Break existing state animations
```

---

## 📋 Phase 3: Backend Improvements

### Task 3.1: Create Configuration System

**Context**: Settings are scattered throughout main.py. Let's centralize them.

**Prompt for AI**:
```
Create a configuration system for the backend:

1. Create server/config.py:
   - Use pydantic BaseSettings for validation
   - Load from environment variables with defaults
   - Load from config.yaml if present (optional override)

2. Configuration categories:
   
   Server:
   - host: str = "0.0.0.0"
   - port: int = 8000
   - debug: bool = False
   
   Audio:
   - sample_rate: int = 16000
   - chunk_size: int = 4096
   - vad_threshold: float = 0.5
   - silence_duration: float = 0.8
   
   STT:
   - model: str = "base.en"
   - device: str = "cpu"
   - language: str = "en"
   
   TTS:
   - model_path: str = "./models/en_US-lessac-medium.onnx"
   - speaker_id: int = 0
   - speech_rate: float = 1.0
   
   LLM:
   - provider: str = "ollama"
   - model: str = "llama3.2"
   - base_url: str = "http://localhost:11434"
   - temperature: float = 0.7
   - max_tokens: int = 500
   - system_prompt: str = (default assistant prompt)

3. Update main.py to:
   - Import and use config object
   - Remove hardcoded values
   - Log configuration on startup (hide sensitive values)

4. Create config.example.yaml with all options documented

Important files:
- /home/stacy/voice-agent/server/main.py
- Create: /home/stacy/voice-agent/server/config.py
- Create: /home/stacy/voice-agent/config.example.yaml

DO NOT:
- Change functionality, only centralize config
- Add new features
- Break existing behavior
```

### Task 3.2: Improve Barge-in Detection

**Context**: Barge-in (interrupting the AI while it speaks) sometimes misses or has lag.

**Prompt for AI**:
```
Improve the barge-in detection system:

1. Current behavior analysis:
   - VAD runs continuously
   - When TTS is playing and speech detected, we interrupt
   - Sometimes there's delay or missed interrupts

2. Improvements to make:

   Backend (server/main.py):
   - Lower VAD threshold during TTS playback (more sensitive)
   - Add a small audio energy check as secondary confirmation
   - Send interrupt signal immediately on detection (don't wait for full VAD chunk)
   - Add "interrupt_sensitivity" config option (low/medium/high)
   - Log barge-in events with timestamps for debugging

   Frontend (audio.js):
   - On receiving "interrupted" state, immediately:
     - Stop all audio playback
     - Clear audio queue
     - Cancel any pending audio requests
   - Add visual feedback that interrupt was detected
   - Ensure no audio continues after interrupt

3. Add interrupt confirmation:
   - After interrupt, send brief "I heard you" acknowledgment
   - Or just immediately start listening

4. Edge cases to handle:
   - Background noise shouldn't trigger interrupt
   - Quick coughs/sounds vs actual speech
   - Multiple rapid interrupts

Important files:
- /home/stacy/voice-agent/server/main.py (barge-in detection)
- /home/stacy/voice-agent/frontend/static/audio.js (playback stopping)
- /home/stacy/voice-agent/frontend/static/app.js (interrupt handling)

DO NOT:
- Remove existing barge-in functionality while improving
- Make interrupts too sensitive (false positives)
- Add long delays
```

### Task 3.3: Add Session Memory

**Context**: Each conversation starts fresh. Let's add memory within a session.

**Prompt for AI**:
```
Add conversation memory to maintain context:

1. Create server/session/manager.py:
   - SessionManager class
   - Track active sessions by WebSocket connection
   - Each session has:
     - id: unique session identifier
     - conversation_history: list of messages
     - created_at: timestamp
     - last_activity: timestamp
     - metadata: dict for custom data

2. Conversation history format:
   ```python
   {
       "role": "user" | "assistant",
       "content": str,
       "timestamp": datetime,
       "audio_duration": float | None
   }
   ```

3. Update main.py to:
   - Create session on WebSocket connect
   - Store messages in session history
   - Include recent history in LLM prompt (last N messages)
   - Clean up session on disconnect
   - Add configurable history_length (default: 10 messages)

4. Update LLM prompt construction:
   - Include conversation history as context
   - Format: "Previous conversation:\nUser: ...\nAssistant: ...\n"
   - Truncate if history gets too long (token limit)

5. Add session management features:
   - Clear conversation history (from frontend command)
   - Session timeout after inactivity (configurable, default 30min)

Important files:
- Create: /home/stacy/voice-agent/server/session/manager.py
- Create: /home/stacy/voice-agent/server/session/__init__.py
- /home/stacy/voice-agent/server/main.py

DO NOT:
- Persist sessions to disk yet (future feature)
- Add complex memory systems (RAG, etc.)
- Share sessions between connections
```

---

## 📋 Phase 4: UI Enhancements

### Task 4.1: Add Settings Panel

**Context**: Users need a way to configure the app. Add a settings UI.

**Prompt for AI**:
```
Create a settings panel UI:

1. Design:
   - Slide-out panel from right side
   - Glassmorphism style matching app
   - Gear icon in top-right corner to toggle
   - Smooth slide animation

2. Settings to include:
   
   Appearance:
   - Theme selector (grid of theme swatches, bigger than current)
   - Reduced motion toggle
   
   Audio:
   - Microphone volume slider
   - Speaker volume slider
   - Test audio button (play sample TTS)
   
   Voice:
   - Voice speed slider (0.5x to 2x)
   - (Future: voice selection dropdown)
   
   Advanced:
   - Show timestamps toggle
   - Clear conversation button
   - About/version info

3. Implementation:
   - Create settings panel HTML in index.html
   - Add CSS for panel styling and animations
   - Integrate with settings.js from Task 1.2
   - Changes apply immediately (no save button needed)

4. Accessibility:
   - Keyboard navigable
   - Focus trap when open
   - Escape to close
   - Proper ARIA labels

Important files:
- /home/stacy/voice-agent/frontend/index.html
- /home/stacy/voice-agent/frontend/static/style.css
- /home/stacy/voice-agent/frontend/static/app.js
- /home/stacy/voice-agent/frontend/static/settings.js

DO NOT:
- Add settings that don't work yet
- Make the panel too complex
- Break existing theme picker
```

### Task 4.2: Improve Chat History Display

**Context**: Chat history is basic. Let's make it nicer.

**Prompt for AI**:
```
Enhance the chat history display:

1. Message improvements:
   - Add subtle timestamps (hover to see full time)
   - Add gentle fade-in animation for new messages
   - Improve message bubble styling
   - Add "speaking" indicator when TTS is playing that message
   - Distinguish between streaming and completed messages

2. Scroll behavior:
   - Auto-scroll to bottom on new messages (unless user scrolled up)
   - Smooth scrolling
   - "Jump to bottom" button when scrolled up
   - Virtual scrolling if history gets very long (>100 messages)

3. Empty state:
   - When no messages, show friendly prompt
   - "Say hello to start chatting!" with avatar wave animation

4. Message actions (subtle, on hover):
   - Copy message text
   - (Future: regenerate response, edit message)

5. Loading states:
   - Skeleton loader while waiting for first response
   - Typing indicator during streaming

Keep the design minimal and clean. Messages should be the focus, not chrome.

Important files:
- /home/stacy/voice-agent/frontend/index.html
- /home/stacy/voice-agent/frontend/static/style.css
- /home/stacy/voice-agent/frontend/static/app.js

DO NOT:
- Add complex message features yet (reactions, etc.)
- Change the message data format from backend
- Break existing streaming functionality
```

### Task 4.3: Add Keyboard Shortcuts

**Context**: Power users want keyboard control.

**Prompt for AI**:
```
Add keyboard shortcuts:

1. Shortcuts to implement:
   - Space: Push-to-talk (already exists, verify working)
   - Escape: Stop current audio / Cancel recording
   - Ctrl+/: Toggle settings panel
   - Ctrl+Shift+Delete: Clear conversation
   - T: Cycle to next theme
   - Shift+T: Cycle to previous theme
   - ?: Show keyboard shortcuts help

2. Implementation:
   - Create keyboard handler in app.js
   - Show small toast when shortcut used (e.g., "Theme: Midnight")
   - Shortcuts should not conflict with browser defaults
   - Disable shortcuts when typing in input fields

3. Shortcuts help modal:
   - Simple overlay showing all shortcuts
   - Keyboard navigable
   - Close with Escape or clicking outside

4. Visual hints:
   - Show Space hint on orb button
   - Show Escape hint while recording/playing

Important files:
- /home/stacy/voice-agent/frontend/static/app.js
- /home/stacy/voice-agent/frontend/index.html
- /home/stacy/voice-agent/frontend/static/style.css

DO NOT:
- Override browser shortcuts (Ctrl+T, Ctrl+W, etc.)
- Make shortcuts required for basic operation
- Add too many shortcuts (keep it simple)
```

---

## 📋 Phase 5: Mobile & PWA

### Task 5.1: Mobile Responsive Design

**Context**: App should work well on phones.

**Prompt for AI**:
```
Make the app fully responsive for mobile:

1. Breakpoints:
   - Desktop: > 1024px (current design)
   - Tablet: 768px - 1024px
   - Mobile: < 768px

2. Mobile layout changes:
   - Avatar smaller but still prominent
   - Chat takes more vertical space
   - Settings panel full-screen overlay
   - Theme picker scrollable row
   - Larger touch targets (min 44px)
   - Orb button larger and more accessible

3. Touch interactions:
   - Tap orb to record (tap again to stop)
   - Long-press orb for push-to-talk mode
   - Swipe from right edge to open settings
   - Pull-to-refresh to clear conversation

4. Mobile-specific considerations:
   - Safe areas for notched phones
   - Prevent zoom on double-tap
   - Handle orientation changes
   - Keyboard avoiding for any text inputs

5. Performance:
   - Reduce animation complexity on mobile
   - Lazy load non-critical assets
   - Test on real devices or accurate emulation

Important files:
- /home/stacy/voice-agent/frontend/static/style.css
- /home/stacy/voice-agent/frontend/index.html
- /home/stacy/voice-agent/frontend/static/app.js

DO NOT:
- Break desktop layout
- Remove features on mobile
- Add mobile-specific JS framework
```

### Task 5.2: PWA Setup

**Context**: Make app installable as PWA.

**Prompt for AI**:
```
Set up Progressive Web App:

1. Create manifest.json:
   - name: "Voice Agent"
   - short_name: "VoiceAI"
   - description: "Your friendly AI voice assistant"
   - start_url: "/"
   - display: "standalone"
   - background_color: match default theme
   - theme_color: match default theme
   - Icons: multiple sizes (192x192, 512x512)

2. Create service worker (sw.js):
   - Cache essential assets (HTML, CSS, JS)
   - Network-first strategy for API calls
   - Offline fallback page
   - Update notification for new versions

3. Create app icons:
   - Design simple icon based on avatar
   - Generate all required sizes
   - Include apple-touch-icon

4. Update index.html:
   - Link manifest.json
   - Add theme-color meta tag
   - Add apple-mobile-web-app meta tags
   - Register service worker

5. Offline experience:
   - Show friendly "offline" state
   - Can't do voice when offline (need server)
   - Preserve last conversation for viewing

Important files:
- Create: /home/stacy/voice-agent/frontend/manifest.json
- Create: /home/stacy/voice-agent/frontend/sw.js
- /home/stacy/voice-agent/frontend/index.html

DO NOT:
- Over-complicate service worker
- Cache too aggressively (assets can get stale)
- Pretend voice works offline
```

---

## 📋 Phase 6: Testing & Documentation

### Task 6.1: Add Frontend Tests

**Context**: No tests currently. Add basic test coverage.

**Prompt for AI**:
```
Set up frontend testing:

1. Testing stack:
   - Vitest (fast, modern)
   - happy-dom for DOM testing
   - @testing-library/dom for queries

2. Create tests/frontend/:
   - settings.test.js - Test settings persistence
   - theme.test.js - Test theme switching
   - avatar.test.js - Test avatar state changes
   - utils.test.js - Test utility functions

3. Test coverage for:
   - Settings load/save correctly
   - Themes apply correct CSS variables
   - Avatar emotions change appropriately
   - Utility functions work correctly

4. Mock WebSocket for integration tests:
   - Test message handling
   - Test state transitions
   - Test error handling

5. Create package.json with test script:
   - npm test runs all tests
   - npm test:watch for development

Keep tests simple and focused. Test behavior, not implementation.

DO NOT:
- Add complex testing infrastructure
- Test CSS visual appearance (too brittle)
- Write tests for everything (focus on critical paths)
```

### Task 6.2: Add Backend Tests

**Context**: Backend needs testing for audio pipeline.

**Prompt for AI**:
```
Set up backend testing:

1. Testing stack:
   - pytest
   - pytest-asyncio for async tests
   - pytest-cov for coverage

2. Create tests/server/:
   - test_config.py - Configuration loading
   - test_session.py - Session management
   - test_websocket.py - WebSocket handling

3. Test coverage for:
   - Config loads with defaults
   - Config overrides from env vars
   - Session creation and cleanup
   - Message handling flow
   - Error conditions

4. Mock external services:
   - Mock Ollama API
   - Mock Piper TTS
   - Mock Whisper STT

5. Add to requirements.txt:
   - pytest
   - pytest-asyncio
   - pytest-cov
   - httpx (for async HTTP testing)

6. Create pytest.ini with configuration

DO NOT:
- Test audio quality (too complex)
- Require running services for unit tests
- Over-mock (integration tests need real connections)
```

### Task 6.3: Write Documentation

**Context**: Need docs for users and developers.

**Prompt for AI**:
```
Create comprehensive documentation:

1. README.md (update existing):
   - Clear project description
   - Feature list
   - Quick start guide
   - Screenshots/GIFs
   - Requirements
   - Installation steps
   - Configuration options
   - Troubleshooting

2. docs/DEVELOPMENT.md:
   - Project structure
   - Development setup
   - How to run locally
   - How to run tests
   - Code style guide
   - PR guidelines

3. docs/ARCHITECTURE.md:
   - System overview
   - Component descriptions
   - Data flow diagrams
   - WebSocket protocol
   - Audio pipeline

4. docs/API.md:
   - WebSocket message types
   - Request/response formats
   - State transitions
   - Error codes

5. docs/CUSTOMIZATION.md:
   - Adding themes
   - Changing avatar
   - Custom LLM backends
   - Adding tools (future)

Keep docs concise but complete. Use examples.

DO NOT:
- Write documentation for features that don't exist
- Use overly technical language
- Forget to update docs when code changes
```

---

## 🔄 Continuous Improvement Checklist

After each feature implementation, run through this checklist:

### Code Quality
- [ ] No console.log left in production code
- [ ] All errors handled gracefully
- [ ] No unused code or commented-out blocks
- [ ] Consistent naming conventions
- [ ] Comments where logic is complex

### Performance
- [ ] No unnecessary re-renders/recalculations
- [ ] Assets optimized (images, audio)
- [ ] Lazy loading where appropriate
- [ ] Memory leaks checked

### Accessibility
- [ ] Keyboard navigable
- [ ] Screen reader friendly
- [ ] Color contrast sufficient
- [ ] Reduced motion respected

### Security
- [ ] No secrets in client code
- [ ] Input validation
- [ ] XSS prevention
- [ ] No sensitive data in logs

### Testing
- [ ] Unit tests pass
- [ ] Manual testing complete
- [ ] Edge cases covered
- [ ] Error states tested

### Documentation
- [ ] README updated if needed
- [ ] API docs updated
- [ ] Code comments added
- [ ] CHANGELOG updated

---

## 📝 Git Workflow

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code improvements
- `docs/description` - Documentation

### Commit Messages
```
type: short description

- Bullet points for details
- Keep under 72 characters per line
```

Types: feat, fix, refactor, docs, test, chore

### Release Process
1. All tests pass
2. Documentation updated
3. CHANGELOG updated
4. Version bumped
5. Tag release
6. Create GitHub release

---

## 🎯 Success Criteria for Each Phase

### Phase 1: Foundation
- [ ] JS modules load without errors
- [ ] Settings persist across refresh
- [ ] Errors display friendly messages
- [ ] Connection status visible

### Phase 2: Avatar
- [ ] Avatar feels alive in idle state
- [ ] All states visually distinct
- [ ] Transitions smooth
- [ ] Reduced motion works

### Phase 3: Backend
- [ ] Config file works
- [ ] Barge-in < 200ms response
- [ ] Conversation context maintained
- [ ] Clean session management

### Phase 4: UI
- [ ] Settings panel functional
- [ ] Chat history polished
- [ ] Shortcuts work correctly
- [ ] All themes consistent

### Phase 5: Mobile
- [ ] Responsive down to 320px width
- [ ] PWA installable
- [ ] Touch interactions smooth
- [ ] Offline state clear

### Phase 6: Testing
- [ ] >70% code coverage
- [ ] CI runs tests on PR
- [ ] Docs comprehensive
- [ ] README complete

---

*"Build it like you'll maintain it forever, because you probably will."*
