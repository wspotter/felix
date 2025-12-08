# Felix End-to-End Test Plan

## Objective
Verify that the Felix Voice Agent GUI is fully functional, specifically focusing on tool execution and error handling, to ensure the recent fixes (FAISS installation) are effective in the live application.

## Test Environment
- **URL**: http://localhost:8000
- **Backend**: FastAPI (Port 8000)
- **LLM**: LM Studio (Port 1234)
- **Tools**: Standard library + Knowledge Search (FAISS)

## Test Cases

### 1. System Health Check
- [ ] **Server Status**: Verify `uvicorn` process is running and listening.
- [ ] **Frontend Load**: Access web interface and check for HTTP 200.
- [ ] **Console Errors**: Check browser console for initialization errors.

### 2. Basic Interaction (Text Input)
- [ ] **Simple Chat**: Send "Hello" via text input.
- [ ] **Expected Result**: LLM responds with a greeting.

### 3. Tool Execution Verification
- [ ] **General Tool**: Send "What time is it?"
    - **Expected**: `get_current_time` tool triggers and returns correct time.
- [ ] **Knowledge Tool (Previously Broken)**: Send "What is Cherry Studio?"
    - **Expected**: `knowledge_search` triggers, FAISS index loads, and returns context (no "faiss-cpu not installed" error).

### 4. Error Handling & Logging
- [ ] **Server Logs**: Monitor `server.log` for exceptions during interactions.
- [ ] **UI Feedback**: Ensure no "Something went wrong" toasts appear for valid requests.

## Execution Log
*(To be updated during execution)*

## Execution Results (Run 1 - After Fix)
- **Server Status**: OK (PID verified)
- **Frontend Load**: OK (Loaded, Login required)
- **Login**: OK (Used default admin credentials)
- **Tool Execution**: OK
    - Input: "What is Cherry Studio?"
    - Tool: `knowledge_search`
    - Result: Success. UI displayed "Found 3 result(s)..." and LLM summarized it.
- **Notes**: Initial connection error to HuggingFace observed in logs, but operation succeeded (likely retry worked).

### 5. Extended Tool Verification (Run 2)
- [x] **Weather Tools**: Sent "What is the weather in London?"
    - **Tool**: `get_weather`
    - **Result**: ✅ **PASS** - Tool executed successfully, returned: "Current weather in London, United Kingdom: Partly cloudy. Temperature: 53.3°F (feels like 47.3°F). Humidity: 72%. Wind: 11.0 mph."

- [ ] **Music Tools**: Send "Play some music".
    - **Expected**: `music_play` triggers. (Requires MPD).
    - **Status**: Pending - UI reached "Listening..." state but response not received yet.

- [x] **File Tools (show_code)**: Sent "Show me the code for weather.py"
    - **Tool**: `show_code`
    - **Result**: ✅ **PASS** - Tool executed successfully, code displayed in Code Editor panel.

## Root Cause & Fix Applied
**Issue**: Tools like `weather_tools`, `music_tools`, `show_code` were failing with `JSONDecodeError` during tool argument reconstruction.

**Root Cause**: In `server/llm/ollama.py`, the `_stream_chat()` method was attempting to JSON-parse empty fragments during streaming, causing a silent crash loop.

**Fix Applied**:
```python
# In _stream_chat(), before json.loads():
if not reconstructed.strip():
    continue  # Skip empty fragments
```

**Status**: ✅ **FIXED** - Weather and File tools verified working. Other tools require additional testing.
- [ ] **File Operations**: Send "Show me the code in requirements.txt".
    - **Expected**: `show_code` triggers and displays file content.
