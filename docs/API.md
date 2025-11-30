# Voice Agent API Reference

This document describes the WebSocket API for communicating with the Voice Agent server.

## Connection

### WebSocket Endpoint

```
ws://localhost:8000/ws
```

### Connection Lifecycle

1. Client opens WebSocket connection
2. Server creates session with unique ID
3. Server sends initial `state` message
4. Client/server exchange messages
5. On disconnect, server cleans up session

## Message Format

All control messages are JSON. Audio is sent as binary frames.

### Binary Messages (Audio)

**Client → Server:**
```
[1 byte: flags][N bytes: PCM16 audio data]
```

| Byte | Description |
|------|-------------|
| 0 | Flags (currently unused, send 0x00) |
| 1-N | PCM16 audio samples at 16kHz, mono |

**Server → Client:**

Audio is sent as base64-encoded data in JSON messages (see `audio` message type).

### JSON Messages

All JSON messages have a `type` field indicating the message type.

---

## Client → Server Messages

### `start_listening`

Begin voice capture. Server transitions to LISTENING state.

```json
{
    "type": "start_listening"
}
```

### `stop_listening`

Stop voice capture. Server processes any buffered audio.

```json
{
    "type": "stop_listening"
}
```

### `interrupt`

Interrupt current TTS playback (barge-in).

```json
{
    "type": "interrupt"
}
```

### `playback_done`

Notify server that TTS audio playback has completed.

```json
{
    "type": "playback_done"
}
```

### `settings`

Update session settings.

```json
{
    "type": "settings",
    "theme": "midnight",
    "voice_speed": 100,
    "volume": 80
}
```

| Field | Type | Range | Description |
|-------|------|-------|-------------|
| `theme` | string | Theme name | UI theme (server stores but doesn't use) |
| `voice_speed` | integer | 50-200 | TTS speed (50=0.5x, 100=1.0x, 200=2.0x) |
| `volume` | integer | 0-100 | Playback volume (client-side only) |

### `clear_conversation`

Clear conversation history for the session.

```json
{
    "type": "clear_conversation"
}
```

### `test_audio`

Request a test audio sample to verify TTS is working.

```json
{
    "type": "test_audio"
}
```

---

## Server → Client Messages

### `state`

Notification of state change.

```json
{
    "type": "state",
    "state": "listening"
}
```

| State | Description |
|-------|-------------|
| `idle` | Not actively listening |
| `listening` | Capturing audio, VAD active |
| `processing` | STT/LLM processing in progress |
| `speaking` | TTS audio being sent |
| `interrupted` | Barge-in detected, stopping TTS |

### `transcript`

Speech-to-text result.

```json
{
    "type": "transcript",
    "text": "Hello, how are you?",
    "is_final": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Transcribed text |
| `is_final` | boolean | `true` when transcription is complete |

### `response`

Complete LLM response (sent after streaming finishes).

```json
{
    "type": "response",
    "text": "I'm doing well, thank you for asking!"
}
```

### `response_chunk`

Streaming LLM response chunk.

```json
{
    "type": "response_chunk",
    "text": "I'm",
    "is_first": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Chunk of response text |
| `is_first` | boolean | `true` for first chunk of response |

### `audio`

TTS audio data.

```json
{
    "type": "audio",
    "data": "UklGRi..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | string | Base64-encoded WAV audio (22050Hz, mono, 16-bit) |

### `tool_call`

Notification that a tool is being called.

```json
{
    "type": "tool_call",
    "name": "get_weather",
    "args": {
        "location": "San Francisco"
    }
}
```

### `tool_result`

Result of a tool call.

```json
{
    "type": "tool_result",
    "name": "get_weather",
    "result": {
        "temperature": 65,
        "condition": "sunny"
    }
}
```

### `flyout`

Request to open a UI flyout panel.

```json
{
    "type": "flyout",
    "flyout_type": "browser",
    "content": "https://example.com"
}
```

| flyout_type | content | Description |
|-------------|---------|-------------|
| `browser` | URL string | Open URL in browser panel |
| `code` | Code string | Display code in code panel |
| `terminal` | Command output | Display in terminal panel |

### `error`

Error notification.

```json
{
    "type": "error",
    "message": "Failed to connect to Ollama"
}
```

---

## State Transitions

### Valid Transitions

```
IDLE → LISTENING         (start_listening)
LISTENING → PROCESSING   (speech ended, VAD silence)
LISTENING → IDLE         (stop_listening, no speech)
PROCESSING → SPEAKING    (response ready)
PROCESSING → LISTENING   (error, empty response)
SPEAKING → LISTENING     (playback_done)
SPEAKING → INTERRUPTED   (barge-in detected)
INTERRUPTED → LISTENING  (immediate)
```

### State Diagram

```
     start_listening
            │
            ▼
┌──────────────────────┐
│        IDLE          │◄─────────────────────────┐
└──────────┬───────────┘                          │
           │ start_listening                      │
           ▼                                      │
┌──────────────────────┐                          │
│      LISTENING       │◄────────────────────┐    │
└──────────┬───────────┘                     │    │
           │ speech_ended                    │    │
           ▼                                 │    │
┌──────────────────────┐                     │    │
│     PROCESSING       │                     │    │
└──────────┬───────────┘                     │    │
           │ response_ready                  │    │
           ▼                                 │    │
┌──────────────────────┐   playback_done     │    │
│      SPEAKING        │─────────────────────┘    │
└──────────┬───────────┘                          │
           │ barge_in                             │
           ▼                                      │
┌──────────────────────┐   resume                 │
│     INTERRUPTED      │──────────────────────────┘
└──────────────────────┘
```

---

## Audio Format Specifications

### Input Audio (Microphone)

| Property | Value |
|----------|-------|
| Format | PCM16 (signed 16-bit integers) |
| Sample Rate | 16000 Hz |
| Channels | Mono (1) |
| Endianness | Little-endian |

### Output Audio (TTS)

| Property | Value |
|----------|-------|
| Format | WAV container with PCM16 |
| Sample Rate | 22050 Hz |
| Channels | Mono (1) |
| Encoding | Base64 in JSON message |

---

## Available Tools

Tools are called automatically by the LLM when appropriate.

### Date & Time Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_current_time` | `timezone?: string` | Get current time |
| `get_current_date` | `timezone?: string` | Get current date |
| `calculate_date` | `days: int, from_date?: string` | Calculate date offset |
| `get_day_of_week` | `date: string` | Get day name |
| `time_until` | `target_date: string` | Time until a date |

### Weather Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_weather` | `location: string` | Current weather |
| `get_forecast` | `location: string, days?: int` | Weather forecast |

### Web Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `web_search` | `query: string` | Search the web |
| `quick_answer` | `query: string` | Get quick answer/definition |
| `open_url` | `url: string, description?: string` | Open URL in browser panel |
| `show_code` | `code: string, language?: string` | Display code in code panel |

### System Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_system_info` | none | System information |
| `get_resource_usage` | none | CPU/memory usage |
| `get_disk_space` | none | Disk space info |
| `get_uptime` | none | System uptime |

### Utility Tools

| Tool | Parameters | Description |
|------|------------|-------------|
| `calculate` | `expression: string` | Math calculation |
| `set_reminder` | `message: string, time: string` | Set a reminder |
| `tell_joke` | none | Get a random joke |

---

## Error Handling

### Connection Errors

If WebSocket connection fails:
1. Client should retry with exponential backoff
2. Max retry interval: 30 seconds
3. Show "Reconnecting..." status to user

### Message Errors

Invalid messages are logged server-side but don't disconnect the client.

### State Errors

Invalid state transitions are ignored with a warning log.

---

## Example Session

```javascript
// 1. Connect
const ws = new WebSocket('ws://localhost:8000/ws');

// 2. Receive initial state
// ← {"type": "state", "state": "idle"}

// 3. Start listening
ws.send(JSON.stringify({ type: 'start_listening' }));
// ← {"type": "state", "state": "listening"}

// 4. Send audio data
const audioData = new Uint8Array([0x00, ...pcm16Bytes]);
ws.send(audioData);

// 5. Stop after speech (or VAD detects silence)
// ← {"type": "state", "state": "processing"}
// ← {"type": "transcript", "text": "What's the weather?", "is_final": true}

// 6. Receive response
// ← {"type": "response_chunk", "text": "Let me", "is_first": true}
// ← {"type": "response_chunk", "text": " check", "is_first": false}
// ← {"type": "tool_call", "name": "get_weather", "args": {"location": "here"}}
// ← {"type": "tool_result", "name": "get_weather", "result": {...}}
// ← {"type": "response_chunk", "text": " It's 65°F...", "is_first": false}
// ← {"type": "response", "text": "Let me check It's 65°F and sunny."}
// ← {"type": "state", "state": "speaking"}

// 7. Receive audio
// ← {"type": "audio", "data": "UklGRi..."}

// 8. Notify playback complete
ws.send(JSON.stringify({ type: 'playback_done' }));
// ← {"type": "state", "state": "listening"}
```

---

*Last updated: November 27, 2025*
