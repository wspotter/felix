# Common AI Mistakes - AVOID THESE

> Reference this file when adding any new feature to prevent repeated mistakes.

---

## Frontend Mistakes

### 1. Duplicate Message Handling
**WRONG:**
```javascript
// Creating new message in both handlers
ws.onmessage = (e) => {
    if (data.type === 'response_chunk') {
        createMessage(data.content);  // Creates message
    }
    if (data.type === 'response') {
        createMessage(data.content);  // Creates ANOTHER message
    }
}
```
**RIGHT:**
```javascript
// Stream into existing, finalize on complete
ws.onmessage = (e) => {
    if (data.type === 'response_chunk') {
        appendToStreamingMessage(data.content);
    }
    if (data.type === 'response') {
        finalizeStreamingMessage();
    }
}
```

### 2. Forgetting Cache Busting
**WRONG:** Making CSS/JS changes without updating version
**RIGHT:** Always increment `?v=X` in index.html link/script tags after changes

### 3. Breaking Existing Themes
**WRONG:** Changing CSS variable names without updating all themes
**RIGHT:** When modifying variables, search for all uses: `grep -r "var(--variable-name)"`

### 4. Hardcoding Colors
**WRONG:** `color: #ffffff; background: rgba(0,0,0,0.5);`
**RIGHT:** `color: var(--text-primary); background: var(--bg-glass);`

### 5. Forgetting Mobile
**WRONG:** Fixed pixel widths, tiny buttons
**RIGHT:** Responsive units (rem, %), min 44px touch targets

### 6. Event Listener Leaks
**WRONG:** Adding listeners without cleanup
**RIGHT:** Remove listeners on disconnect/unmount

### 7. Breaking Keyboard Accessibility
**WRONG:** Click handlers only
**RIGHT:** Support Enter/Space for clickable elements, proper focus management

---

## Backend Mistakes

### 1. Blocking the Event Loop
**WRONG:**
```python
def handle_audio(data):
    result = heavy_computation(data)  # Blocks everything
```
**RIGHT:**
```python
async def handle_audio(data):
    result = await asyncio.get_event_loop().run_in_executor(
        None, heavy_computation, data
    )
```

### 2. Ignoring Disconnections
**WRONG:**
```python
await websocket.send_json(data)  # Crashes if disconnected
```
**RIGHT:**
```python
try:
    await websocket.send_json(data)
except WebSocketDisconnect:
    cleanup_session()
```

### 3. Leaking Audio Resources
**WRONG:** Creating streams without cleanup
**RIGHT:** Use context managers, always close streams

### 4. Ignoring Barge-in State
**WRONG:** Continuing TTS generation after interrupt
**RIGHT:** Check `interrupted` flag, stop immediately

### 5. Huge Audio Chunks
**WRONG:** Buffering entire response before sending
**RIGHT:** Stream in chunks ≤4096 bytes

### 6. Missing Error Context
**WRONG:** `raise Exception("Error")`
**RIGHT:** `raise AudioProcessingError(f"VAD failed for session {session_id}: {e}")`

---

## General Mistakes

### 1. Adding Unrequested Features
> "I thought you might also want..."

**NO.** Just do what was asked. Nothing more.

### 2. Removing Existing Functionality
> "I simplified the code by removing..."

Check that everything still works after changes.

### 3. Changing Design System
> "I updated the colors to..."

Keep consistent with existing patterns. Ask first.

### 4. No Error Handling
**WRONG:** Assuming everything succeeds
**RIGHT:** Consider what happens when every operation fails

### 5. Console Logs in Production
**WRONG:** `console.log("DEBUG:", data)`
**RIGHT:** Remove debug logs, or use proper logging with levels

### 6. Magic Numbers
**WRONG:** `if (volume > 0.8) { ... }`
**RIGHT:** `const LOUD_THRESHOLD = 0.8; if (volume > LOUD_THRESHOLD) { ... }`

### 7. Long Functions
**WRONG:** 200-line function doing everything
**RIGHT:** Break into smaller, testable, single-purpose functions

### 8. Copy-Paste Code
**WRONG:** Same code in multiple places
**RIGHT:** Extract to shared function, import where needed

---

## WebSocket Protocol Mistakes

### 1. Wrong Message Format
**WRONG:** Changing message structure without updating both ends
**RIGHT:** Document protocol, update client and server together

### 2. Missing Message Types
**WRONG:** Sending data without type field
**RIGHT:** Every message has `{ "type": "...", "data": ... }`

### 3. No Acknowledgments
**WRONG:** Fire and forget critical messages
**RIGHT:** Confirm receipt for important state changes

---

## CSS Animation Mistakes

### 1. Layout Thrashing
**WRONG:** Animating width, height, top, left
**RIGHT:** Use transform and opacity only

### 2. No Reduced Motion
**WRONG:** Complex animations for everyone
**RIGHT:** `@media (prefers-reduced-motion: reduce) { ... }`

### 3. Animation Performance
**WRONG:** `animation: spin 0.1s infinite;`
**RIGHT:** Reasonable durations, use will-change sparingly

---

## Testing Mistakes

### 1. Testing Implementation
**WRONG:** Testing that function calls another function
**RIGHT:** Testing that behavior produces correct result

### 2. Brittle Selectors
**WRONG:** `querySelector('div.container > div:nth-child(3)')`
**RIGHT:** `querySelector('[data-testid="message-list"]')`

### 3. No Edge Cases
**WRONG:** Only testing happy path
**RIGHT:** Test errors, empty states, boundaries

---

## Security Mistakes

### 1. Secrets in Frontend
**WRONG:** API keys in JavaScript
**RIGHT:** All secrets server-side only

### 2. Trusting Client Data
**WRONG:** Using user input directly
**RIGHT:** Validate and sanitize everything

### 3. Verbose Errors
**WRONG:** Showing stack traces to users
**RIGHT:** Generic messages to users, detailed logs for devs

---

## Remember

- **Simple is better than clever**
- **Working is better than perfect**
- **Readable is better than compact**
- **Explicit is better than implicit**
- **When in doubt, ask first**
