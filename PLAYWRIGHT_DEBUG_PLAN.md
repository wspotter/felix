# Felix Voice Agent - Playwright Debug & Testing Plan

**For:** LLM agents with Playwright browser automation
**Purpose:** Systematically test Felix UI, identify bugs, and report issues with reproduction steps

---

## Testing Environment Setup

### Prerequisites Check
```bash
# 1. Start Felix server
./run.sh

# 2. Verify services are running
curl -s http://localhost:8000/ > /dev/null && echo "✓ Felix server running"
curl -s http://localhost:11434/api/tags > /dev/null && echo "✓ Ollama running"
curl -s http://localhost:8080/health > /dev/null && echo "✓ OpenMemory running"

# 3. Open browser to Felix
# Navigate to: http://localhost:8000
```

**Critical:** Use `http://localhost:8000` (not IP address) - microphone requires secure context.

---

## Phase 1: Visual & Layout Testing

### 1.1 Initial Page Load
**Test:** Page loads without errors, all assets present

**Steps:**
1. Navigate to `http://localhost:8000`
2. Wait for page to fully load
3. Check browser console for errors
4. Verify visible elements:
   - Avatar (animated breathing)
   - Microphone button (center, large)
   - Settings icon (top right)
   - Menu icon (top left)
   - Theme selector

**Expected:** No console errors, all UI elements visible

**Report if:**
- Console errors appear
- Elements missing or misaligned
- Avatar not animating
- Buttons not clickable

**Automated Test Example:**
```javascript
test('should load page without errors', async ({ page }) => {
  const errorMonitor = new ErrorMonitor(page);
  
  await page.goto('http://localhost:8000');
  
  // Wait for all resources to load
  await page.waitForLoadState('networkidle');
  
  // Check for console errors
  const errors = errorMonitor.getErrors();
  expect(errors).toHaveLength(0);
  
  // Verify all UI elements are present
  await expect(page.locator('#avatar')).toBeVisible();
  await expect(page.locator('#orb')).toBeVisible();
  await expect(page.locator('[data-theme-selector]')).toBeVisible();
  await expect(page.locator('[data-settings]')).toBeVisible();
  
  // Check avatar animation
  const initialPosition = await page.evaluate(() => {
    const avatar = document.getElementById('avatar');
    return avatar.getBoundingClientRect();
  });
  
  await page.waitForTimeout(1000);
  
  const finalPosition = await page.evaluate(() => {
    const avatar = document.getElementById('avatar');
    return avatar.getBoundingClientRect();
  });
  
  // Avatar should have moved (breathing animation)
  expect(initialPosition.top).not.toBe(finalPosition.top);
});
```

---

### 1.2 Theme Switching
**Test:** All 9 themes work without visual glitches

**Steps:**
1. Click theme selector (paint palette icon)
2. For each theme (9 total):
   - Click theme option
   - Wait 500ms for transition
   - Verify colors changed
   - Check contrast/readability
   - Screenshot for comparison

**Expected:** Smooth transitions, no color bleeding, readable text in all themes

**Report if:**
- Theme doesn't apply
- Text unreadable (contrast issues)
- UI elements disappear
- CSS variables not updating

**Themes to test:** default, dark, light, ocean, sunset, forest, lavender, cyberpunk, neon

**Automated Test Example:**
```javascript
test('should switch themes correctly', async ({ page }) => {
  const themes = ['default', 'dark', 'light', 'ocean', 'sunset', 'forest', 'lavender', 'cyberpunk', 'neon'];
  
  for (const theme of themes) {
    // Open theme selector
    await page.click('[data-theme-selector]');
    
    // Select theme
    await page.click(`[data-theme="${theme}"]`);
    
    // Wait for transition
    await page.waitForTimeout(500);
    
    // Verify theme applied
    const currentTheme = await page.getAttribute('html', 'data-theme');
    expect(currentTheme).toBe(theme);
    
    // Check CSS variables are set
    const primaryColor = await page.evaluate(() => 
      getComputedStyle(document.documentElement).getPropertyValue('--primary')
    );
    expect(primaryColor).toBeTruthy();
    
    // Check contrast ratio (should be > 4.5:1 for normal text)
    const textColor = await page.evaluate(() => 
      getComputedStyle(document.body).color
    );
    const backgroundColor = await page.evaluate(() => 
      getComputedStyle(document.body).backgroundColor
    );
    
    // Take screenshot for visual verification
    await page.screenshot({ path: `screenshots/theme-${theme}.png` });
    
    // Verify no elements are hidden/disappeared
    await expect(page.locator('#avatar')).toBeVisible();
    await expect(page.locator('#orb')).toBeVisible();
  }
});
```

---

### 1.3 Responsive Layout
**Test:** UI adapts to different screen sizes

**Steps:**
1. Test at these viewport sizes:
   - Desktop: 1920x1080
   - Laptop: 1366x768
   - Tablet: 768x1024
   - Mobile: 375x667
2. For each size:
   - Check element positions
   - Verify touch targets (min 44x44px)
   - Test scrolling behavior
   - Check overflow/clipping

**Expected:** No horizontal scroll, elements scale appropriately, no overlapping

**Report if:**
- Elements overflow viewport
- Text truncated incorrectly
- Buttons too small on mobile
- Layout breaks at specific widths

**Automated Test Example:**
```javascript
test('should handle responsive design correctly', async ({ page }) => {
  const viewports = [
    { name: 'desktop', width: 1920, height: 1080 },
    { name: 'laptop', width: 1366, height: 768 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 375, height: 667 }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.waitForTimeout(500); // Allow layout to settle
    
    // Check no horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = viewport.width;
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10); // Small tolerance for scrollbars
    
    // Check touch targets are adequate
    const touchTargets = await page.$$('[data-touch-target]');
    for (const target of touchTargets) {
      const box = await target.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    
    // Check critical elements are visible
    await expect(page.locator('#avatar')).toBeVisible();
    await expect(page.locator('#orb')).toBeVisible();
    
    // Test scrolling
    const initialScroll = await page.evaluate(() => window.scrollY);
    await page.mouse.wheel(0, 100);
    const afterScroll = await page.evaluate(() => window.scrollY);
    expect(afterScroll).toBeGreaterThan(initialScroll);
    
    // Take screenshot for visual verification
    await page.screenshot({ path: `screenshots/responsive-${viewport.name}.png` });
  }
});
```

---

## Phase 2: Settings Panel Testing

### 2.1 Settings Panel Open/Close
**Test:** Settings panel opens, closes, and persists

**Steps:**
1. Click settings icon (gear, top right)
2. Verify panel slides in from right
3. Check all sections visible:
   - Voice Settings
   - LLM Settings
   - Admin (if enabled)
4. Click outside panel → should close
5. Click settings again → should remember selections
6. Refresh page → verify persistence (localStorage)

**Expected:** Smooth animation, settings persist across refreshes

**Report if:**
- Panel doesn't open/close
- Animations janky/broken
- Settings reset on refresh
- Sections missing

---

### 2.2 Voice Settings
**Test:** All voice options work

**Steps:**
1. Open settings → Voice Settings
2. Test TTS Voice dropdown:
   - Select "Amy" → verify selection
   - Select "Lessac" → verify selection
   - Select "Ryan" → verify selection
3. Test "Test Audio" button:
   - Click button
   - Listen for TTS sample
   - Verify avatar enters SPEAKING state
4. Adjust volume slider (if present)
5. Test barge-in toggle (if present)

**Expected:** Dropdown updates, test audio plays, avatar responds

**Report if:**
- Dropdown doesn't change
- Test audio fails/silent
- Avatar doesn't animate
- Console errors on audio test

---

### 2.3 LLM Settings
**Test:** Backend switching and model selection

**Steps:**
1. Open settings → LLM Settings
2. Test Backend dropdown:
   - Select "Ollama" (default)
   - Select "LM Studio" (if available)
   - Select "OpenAI-compatible" (if available)
3. For Ollama backend:
   - Check model dropdown populates
   - Select different model
   - Verify URL field shows `localhost:11434`
4. Test temperature slider (if present)
5. Test max tokens input (if present)

**Expected:** Backend switches, models load, settings save

**Report if:**
- Backend switch fails
- Models don't load
- URL field doesn't update
- Settings don't persist

---

### 2.4 Admin Settings (if auth enabled)
**Test:** Admin panel access and controls

**Steps:**
1. Check if "Admin" section appears in settings
2. If admin token required:
   - Enter token
   - Verify access granted
3. If admin panel separate (`/admin`):
   - Navigate to `http://localhost:8000/admin.html`
   - Check authentication
4. Test admin features:
   - View active sessions
   - View event logs
   - View system stats

**Expected:** Admin panel loads, displays telemetry

**Report if:**
- Admin panel 404
- Authentication fails
- Telemetry not updating
- Console errors

---

## Phase 3: WebSocket & State Testing

### 3.1 WebSocket Connection
**Test:** WebSocket establishes and maintains connection

**Steps:**
1. Open browser DevTools → Network → WS filter
2. Refresh page
3. Verify WebSocket connection to `ws://localhost:8000/ws`
4. Check connection status:
   - Initial: Should connect within 2s
   - Stable: No disconnects for 30s
5. Simulate disconnect:
   - Stop server (`Ctrl+C` in terminal)
   - Wait 5s
   - Restart server
   - Check reconnection logic

**Expected:** Connection establishes, reconnects on failure

**Report if:**
- WebSocket never connects
- Frequent disconnects
- No reconnection attempt
- Error messages in console

---

### 3.2 State Transitions
**Test:** Avatar reflects WebSocket state messages

**Steps:**
1. Monitor avatar during these actions:
   - Initial load → Should be `IDLE`
   - Click mic (without speaking) → Should go `LISTENING`
   - Wait 5s → Should timeout back to `IDLE`
2. Verify state transitions in console logs
3. Check for state machine bugs:
   - Stuck in LISTENING
   - Stuck in SPEAKING
   - Rapid state flipping

**Expected:** Clean state transitions, avatar matches state

**Report if:**
- Avatar doesn't change state
- States out of sync with backend
- Visual glitches during transitions
- Console shows state errors

---

### 3.3 Binary Audio Protocol
**Test:** Audio data flows correctly over WebSocket

**Steps:**
1. Open DevTools → Network → WS → Messages
2. Click microphone button
3. Speak into mic (say "hello")
4. Observe WS messages:
   - Outgoing: Binary frames (audio + TTS flag byte)
   - Incoming: JSON messages (state, transcript)
5. Check first byte of binary frames:
   - Should be `0x00` when user speaking
   - Should be `0x01` when TTS playing (for barge-in)

**Expected:** Binary frames sent, JSON responses received

**Report if:**
- No binary frames sent
- Audio appears corrupted
- TTS flag byte incorrect
- WebSocket drops frames

---

## Phase 4: Voice Interaction Testing

### 4.1 Microphone Access
**Test:** Browser grants microphone permission

**Steps:**
1. Click microphone button
2. Browser should prompt for permission
3. Allow microphone access
4. Verify:
   - Permission granted
   - Audio indicator appears (visual feedback)
   - Avatar enters LISTENING state
5. Test permission denial:
   - Deny in browser
   - Check error message shown to user

**Expected:** Permission requested, graceful error if denied

**Report if:**
- No permission prompt
- Permission granted but no audio
- No error message on denial
- Mic continues requesting after denial

**Automated Test Example:**
```javascript
test('should handle microphone permission correctly', async ({ browser }) => {
  // Test with permission granted
  {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#avatar');
    
    // Click microphone button
    await page.click('#orb');
    
    // Should start listening without permission prompt
    await page.waitForTimeout(1000);
    
    const state = await page.getAttribute('#avatar', 'data-state');
    expect(state).toBe('listening');
    
    await context.close();
  }
  
  // Test with permission denied
  {
    const context = await browser.newContext({ permissions: [] });
    const page = await context.newPage();
    
    await page.goto('http://localhost:8000');
    await page.waitForSelector('#avatar');
    
    // Click microphone button
    await page.click('#orb');
    
    // Should show permission prompt, deny it
    page.on('dialog', async dialog => {
      await dialog.dismiss();
    });
    
    // Should show error message
    await page.waitForSelector('[data-error="microphone"]', { timeout: 5000 });
    const errorMessage = await page.textContent('[data-error="microphone"]');
    expect(errorMessage).toContain('microphone');
    
    await context.close();
  }
});
```

---

### 4.2 Voice Activity Detection (VAD)
**Test:** VAD detects speech start/stop

**Steps:**
1. Click microphone button
2. Stay silent for 2s → Avatar should stay LISTENING
3. Speak for 1s → Visual feedback should show activity
4. Stop speaking → After 1-2s, should transition to PROCESSING
5. Test edge cases:
   - Very quiet speech
   - Background noise
   - Sudden loud sound

**Expected:** VAD triggers on speech, ignores silence

**Report if:**
- VAD triggers on silence
- Doesn't detect speech
- Too sensitive/not sensitive enough
- No visual feedback

**Automated Test Example:**
```javascript
test('should detect voice activity correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock audio input with different volumes
  await page.addInitScript(() => {
    window.mockAudioInput = {
      volume: 0, // 0-1 range
      start() {
        this.interval = setInterval(() => {
          // Simulate audio processing
          const event = new CustomEvent('audio-volume', {
            detail: { volume: this.volume }
          });
          window.dispatchEvent(event);
        }, 100);
      },
      stop() {
        clearInterval(this.interval);
      },
      setVolume(v) { this.volume = v; }
    };
  });
  
  // Start listening
  await page.click('#orb');
  await voiceHelper.waitForState('listening');
  
  // Test silence (should stay listening)
  await page.evaluate(() => window.mockAudioInput.setVolume(0));
  await page.waitForTimeout(2000);
  
  let state = await page.getAttribute('#avatar', 'data-state');
  expect(state).toBe('listening');
  
  // Test speech detection (should show activity)
  await page.evaluate(() => window.mockAudioInput.setVolume(0.7));
  await page.waitForTimeout(1000);
  
  // Should show visual feedback (waveform animation)
  const waveformVisible = await page.isVisible('[data-waveform]');
  expect(waveformVisible).toBe(true);
  
  // Test speech end (should transition to processing)
  await page.evaluate(() => window.mockAudioInput.setVolume(0));
  await voiceHelper.waitForState('processing');
  
  state = await page.getAttribute('#avatar', 'data-state');
  expect(state).toBe('processing');
});
```

---

### 4.3 Speech-to-Text (STT)
**Test:** STT transcribes accurately

**Steps:**
1. Click microphone
2. Speak clearly: "What is the weather in San Francisco?"
3. Wait for processing
4. Check for transcript display:
   - Interim results (partial transcription)
   - Final transcript
5. Verify accuracy:
   - Correct words
   - Proper punctuation
   - Reasonable latency (<3s for short phrase)

**Expected:** Accurate transcription, visible in UI

**Report if:**
- No transcription appears
- Gibberish output
- Excessive latency (>5s)
- Interim results never finalize

**Automated Test Example:**
```javascript
test('should transcribe speech accurately', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock STT responses
  await page.addInitScript(() => {
    window.mockSTT = {
      interimResults: ['What is the weather'],
      finalResult: 'What is the weather in San Francisco?'
    };
  });
  
  // Mock WebSocket messages for STT
  await page.route('ws://localhost:8000/ws', route => {
    // Simulate interim results
    setTimeout(() => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'transcript',
          text: 'What is the weather',
          is_final: false
        })
      });
    }, 500);
    
    // Simulate final result
    setTimeout(() => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'transcript',
          text: 'What is the weather in San Francisco?',
          is_final: true
        })
      });
    }, 1500);
  });
  
  // Start listening
  await page.click('#orb');
  await voiceHelper.waitForState('listening');
  
  // Wait for interim result
  await page.waitForSelector('[data-transcript*="What is the weather"]', { timeout: 3000 });
  
  // Wait for final result
  await page.waitForSelector('[data-transcript="What is the weather in San Francisco?"]', { timeout: 5000 });
  
  // Verify transcript accuracy
  const transcript = await page.textContent('[data-transcript-final]');
  expect(transcript).toBe('What is the weather in San Francisco?');
  
  // Verify latency
  const startTime = await page.evaluate(() => window.performance.now());
  const endTime = await page.evaluate(() => window.performance.now());
  const latency = endTime - startTime;
  expect(latency).toBeLessThan(5000); // Should be under 5 seconds
});
```

---

### 4.4 LLM Response
**Test:** LLM generates appropriate response

**Steps:**
1. After STT completes, monitor for:
   - Avatar enters PROCESSING state
   - Response chunks stream in (if streaming enabled)
   - Final response appears in chat/conversation area
2. Verify response:
   - Contextually appropriate
   - Complete sentences
   - No truncation
   - Reasonable length

**Expected:** LLM responds within 5s, coherent answer

**Report if:**
- No response generated
- Response truncated
- Nonsensical output
- Timeout errors
- Response not displayed in UI

**Automated Test Example:**
```javascript
test('should generate appropriate LLM response', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock LLM streaming response
  await page.addInitScript(() => {
    window.mockLLM = {
      responses: [
        'I understand you want to know about the weather.',
        'Let me search for current weather information in San Francisco.',
        'Based on my search, the current weather in San Francisco is 65°F with light fog.',
        'The humidity is around 78% and winds are coming from the west at 8 mph.'
      ]
    };
  });
  
  // Mock WebSocket messages for LLM
  await page.route('ws://localhost:8000/ws', route => {
    const responses = [
      { type: 'response_chunk', text: 'I understand you want to know about the weather.' },
      { type: 'response_chunk', text: 'Let me search for current weather information in San Francisco.' },
      { type: 'response_chunk', text: 'Based on my search, the current weather in San Francisco is 65°F with light fog.' },
      { type: 'response', text: 'The humidity is around 78% and winds are coming from the west at 8 mph.' }
    ];
    
    responses.forEach((response, index) => {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response)
        });
      }, index * 500);
    });
  });
  
  // Simulate user query
  await voiceHelper.simulateSpeech('What is the weather in San Francisco?');
  await voiceHelper.waitForState('processing');
  
  // Wait for streaming response chunks
  for (let i = 0; i < 3; i++) {
    await page.waitForSelector(`[data-response-chunk*="${window.mockLLM.responses[i].split(' ')[0]}"]`, { timeout: 5000 });
  }
  
  // Wait for final response
  await page.waitForSelector('[data-response-final]', { timeout: 10000 });
  
  // Verify response quality
  const finalResponse = await page.textContent('[data-response-final]');
  expect(finalResponse).toContain('San Francisco');
  expect(finalResponse).toContain('weather');
  expect(finalResponse.length).toBeGreaterThan(20); // Should be a complete response
  
  // Verify no truncation
  expect(finalResponse).not.toMatch(/\.\.\.$/); // Should not end with ellipsis
  
  // Verify response time
  const startTime = await page.evaluate(() => window.performance.now());
  const endTime = await page.evaluate(() => window.performance.now());
  const responseTime = endTime - startTime;
  expect(responseTime).toBeLessThan(10000); // Should respond within 10 seconds
});
```

---

### 4.5 Text-to-Speech (TTS)
**Test:** TTS plays response audio

**Steps:**
1. After LLM responds, verify:
   - Avatar enters SPEAKING state
   - Audio plays from speakers
   - Mouth animates (if implemented)
2. Monitor playback:
   - No stuttering/crackling
   - Volume appropriate
   - Complete playback (doesn't cut off)
3. Test TTS flag:
   - During playback, WS binary frames should have flag `0x01`

**Expected:** Clear audio, smooth playback, avatar animates

**Report if:**
- No audio plays
- Audio distorted/crackling
- Playback cuts off early
- Avatar doesn't animate
- TTS flag byte incorrect

**Automated Test Example:**
```javascript
test('should play TTS audio correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock TTS audio response
  await page.addInitScript(() => {
    window.mockTTS = {
      audioData: new ArrayBuffer(1024), // Mock audio buffer
      duration: 3000 // 3 seconds
    };
  });
  
  // Mock WebSocket messages for TTS
  await page.route('ws://localhost:8000/ws', route => {
    // Simulate TTS audio chunks
    const audioChunks = [
      { type: 'audio', data: 'chunk1_base64', flag: 1 },
      { type: 'audio', data: 'chunk2_base64', flag: 1 },
      { type: 'audio', data: 'chunk3_base64', flag: 1 }
    ];
    
    audioChunks.forEach((chunk, index) => {
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(chunk)
        });
      }, index * 1000);
    });
  });
  
  // Mock AudioContext for testing
  await page.addInitScript(() => {
    window.AudioContext = class extends AudioContext {
      constructor() {
        super();
        this.mockAudio = true;
        this.playbackStarted = false;
      }
      
      decodeAudioData(audioData) {
        return Promise.resolve({
          duration: 3,
          sampleRate: 44100
        });
      }
      
      createBufferSource() {
        const source = {
          buffer: null,
          connect: () => {},
          start: () => { this.playbackStarted = true; },
          onended: null
        };
        return source;
      }
    };
  });
  
  // Simulate LLM response that triggers TTS
  await voiceHelper.simulateSpeech('Hello, how are you?');
  await voiceHelper.waitForState('processing');
  
  // Wait for TTS to start
  await voiceHelper.waitForState('speaking');
  
  // Verify avatar state
  const avatarState = await page.getAttribute('#avatar', 'data-state');
  expect(avatarState).toBe('speaking');
  
  // Verify audio playback started
  const audioStarted = await page.evaluate(() => {
    return window.audioContext?.playbackStarted || false;
  });
  expect(audioStarted).toBe(true);
  
  // Wait for TTS to complete
  await page.waitForTimeout(4000); // Longer than expected duration
  
  // Verify avatar returns to idle
  const finalState = await page.getAttribute('#avatar', 'data-state');
  expect(finalState).toBe('idle');
});
```

---

### 4.6 Barge-in (Interrupt)
**Test:** User can interrupt agent mid-speech

**Steps:**
1. Ask a question that generates long response
2. Wait for TTS to start playing
3. While TTS playing:
   - Click microphone button OR
   - Start speaking (if auto-detect enabled)
4. Verify:
   - TTS stops immediately
   - Avatar transitions SPEAKING → INTERRUPTED → LISTENING
   - New speech captured
   - Previous response cancelled

**Expected:** Instant interruption, smooth transition

**Report if:**
- TTS continues playing
- Barge-in not detected
- State machine stuck
- Audio overlap/confusion

**Automated Test Example:**
```javascript
test('should handle barge-in correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock long TTS response
  await page.addInitScript(() => {
    window.mockTTS = {
      duration: 10000, // 10 seconds
      interruptible: true
    };
  });
  
  // Mock WebSocket for TTS with interrupt capability
  await page.route('ws://localhost:8000/ws', route => {
    let ttsPlaying = false;
    
    // Start TTS
    setTimeout(() => {
      ttsPlaying = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'audio',
          data: 'long_tts_response',
          flag: 1
        })
      });
    }, 1000);
    
    // Handle interrupt
    page.on('request', interceptedRequest => {
      if (interceptedRequest.url().includes('/interrupt')) {
        ttsPlaying = false;
        interceptedRequest.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, interrupted: true })
        });
      }
    });
  });
  
  // Start long conversation
  await voiceHelper.simulateSpeech('Tell me a long story about artificial intelligence');
  await voiceHelper.waitForState('processing');
  
  // Wait for TTS to start
  await voiceHelper.waitForState('speaking');
  
  // Verify TTS is playing
  const ttsState = await page.evaluate(() => window.mockTTS?.interruptible);
  expect(ttsState).toBe(true);
  
  // Interrupt with microphone
  await page.click('#orb');
  
  // Verify state transitions
  await voiceHelper.waitForState('interrupted');
  await voiceHelper.waitForState('listening');
  
  // Verify final state
  const finalState = await page.getAttribute('#avatar', 'data-state');
  expect(finalState).toBe('listening');
  
  // Verify TTS was stopped
  const ttsStopped = await page.evaluate(() => !window.mockTTS?.interruptible);
  expect(ttsStopped).toBe(true);
});
```

---

## Phase 5: Tool Execution Testing

### 5.1 Weather Tool
**Test:** Weather tool executes and displays result

**Steps:**
1. Say: "What's the weather in New York?"
2. Monitor for:
   - Tool call notification (UI indicator)
   - Backend executes `weather_tools.py`
   - Result returned
   - LLM incorporates result in response
   - TTS speaks answer
3. Verify result accuracy:
   - Current temperature mentioned
   - City name correct
   - Conditions described

**Expected:** Tool executes, result integrated, user hears answer

**Report if:**
- Tool not called
- Tool fails (check error logs)
- Result not in response
- Response generic (tool result ignored)

**Automated Test Example:**
```javascript
test('should execute weather tool correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock weather API response
  await page.route('**/weather*', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        location: 'New York',
        temperature: '72°F',
        conditions: 'Sunny',
        humidity: '45%'
      })
    });
  });
  
  // Trigger weather query
  await voiceHelper.simulateSpeech('What is the weather in New York?');
  await voiceHelper.waitForState('processing');
  
  // Wait for tool execution
  await voiceHelper.waitForToolExecution('weather');
  
  // Verify response
  const conversation = await voiceHelper.getConversationHistory();
  const lastMessage = conversation[conversation.length - 1];
  expect(lastMessage).toContain('New York');
  expect(lastMessage).toContain('72°F');
  expect(lastMessage).toContain('Sunny');
});
```

---

### 5.2 Web Search Tool
**Test:** Web search returns relevant results

**Steps:**
1. Say: "Search the web for TypeScript best practices"
2. Monitor for:
   - Search tool called
   - Results returned (check count)
   - LLM summarizes findings
3. Verify:
   - Results relevant to query
   - Sources mentioned (if available)
   - Summary coherent

**Expected:** Search executes, results summarized

**Report if:**
- Search fails
- No results returned
- Results irrelevant
- LLM doesn't incorporate results

**Automated Test Example:**
```javascript
test('should execute web search tool correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock search API response
  await page.route('**/search*', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: 'TypeScript best practices',
        results: [
          {
            title: 'TypeScript Best Practices Guide',
            url: 'https://typescriptlang.org/docs/best-practices',
            snippet: 'Official TypeScript best practices and guidelines'
          },
          {
            title: 'Advanced TypeScript Patterns',
            url: 'https://advanced-typescript.com',
            snippet: 'Advanced patterns and techniques for TypeScript'
          }
        ]
      })
    });
  });
  
  // Trigger search query
  await voiceHelper.simulateSpeech('Search the web for TypeScript best practices');
  await voiceHelper.waitForState('processing');
  
  // Wait for search execution
  await voiceHelper.waitForToolExecution('web_search');
  
  // Verify response includes search results
  const conversation = await voiceHelper.getConversationHistory();
  const lastMessage = conversation[conversation.length - 1];
  expect(lastMessage).toContain('TypeScript');
  expect(lastMessage).toContain('best practices');
});
```

---

### 5.3 Knowledge Search Tool
**Test:** Local knowledge search works

**Steps:**
1. Say: "Search the knowledge base for Felix architecture"
2. Monitor for:
   - `knowledge_search()` tool called
   - Dataset queried (check which one)
   - Results returned
   - LLM uses results in answer
3. Verify:
   - Results from local mcpower datasets
   - Content relevant
   - No external API calls

**Expected:** Local search works, results accurate

**Report if:**
- Knowledge tool fails
- No datasets found
- Results irrelevant
- External search used instead

**Automated Test Example:**
```javascript
test('should execute knowledge search tool correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock knowledge search API response
  await page.route('**/knowledge-search*', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        query: 'Felix architecture',
        dataset: 'felix-docs',
        results: [
          {
            title: 'Felix Architecture Overview',
            content: 'Felix is a multi-modal local AI assistant with voice, image generation, and tool learning capabilities...',
            source: 'docs/ARCHITECTURE.md'
          }
        ]
      })
    });
  });
  
  // Trigger knowledge search
  await voiceHelper.simulateSpeech('Search the knowledge base for Felix architecture');
  await voiceHelper.waitForState('processing');
  
  // Wait for knowledge search execution
  await voiceHelper.waitForToolExecution('knowledge_search');
  
  // Verify response includes knowledge base content
  const conversation = await voiceHelper.getConversationHistory();
  const lastMessage = conversation[conversation.length - 1];
  expect(lastMessage).toContain('multi-modal');
  expect(lastMessage).toContain('local AI assistant');
});
```

---

### 5.4 Memory Tools (OpenMemory)
**Test:** Agent can store and recall memories

**Steps:**
1. Say: "Remember that my favorite color is blue"
2. Verify:
   - `remember()` tool called
   - Memory stored (check OpenMemory at `localhost:8080`)
3. In new conversation or after delay, say:
   - "What's my favorite color?"
4. Verify:
   - `recall()` tool called
   - Correct memory retrieved
   - Agent responds with "blue"

**Expected:** Memory persists, recall works

**Report if:**
- Memory not stored
- Recall fails
- Wrong memory returned
- OpenMemory service down

**Automated Test Example:**
```javascript
test('should store and recall memories correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock memory storage API
  await page.route('**/memory/add', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        memoryId: 'mem_123',
        content: 'favorite color is blue',
        tags: ['user-preference', 'color']
      })
    });
  });
  
  // Mock memory query API
  await page.route('**/memory/query', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        memories: [
          {
            id: 'mem_123',
            content: 'favorite color is blue',
            relevance: 0.95
          }
        ]
      })
    });
  });
  
  // Store memory
  await voiceHelper.simulateSpeech('Remember that my favorite color is blue');
  await voiceHelper.waitForState('processing');
  await voiceHelper.waitForToolExecution('remember');
  
  // Clear conversation (simulate new session)
  await page.click('[data-clear-conversation]');
  
  // Recall memory
  await voiceHelper.simulateSpeech('What is my favorite color?');
  await voiceHelper.waitForState('processing');
  await voiceHelper.waitForToolExecution('recall');
  
  // Verify response
  const conversation = await voiceHelper.getConversationHistory();
  const lastMessage = conversation[conversation.length - 1];
  expect(lastMessage).toContain('blue');
});
```

---

### 5.5 Music Player Tool (MPD)
**Test:** Music playback controls work

**Steps:**
1. Say: "Play some jazz music"
2. Verify:
   - `music_play()` tool called
   - MPD receives command
   - Music starts playing
   - Mini player widget updates (now playing info)
   - Avatar enters GROOVING state
3. Test controls:
   - "Pause music" → Should pause
   - "Next track" → Should skip
   - "Set volume to 50" → Should adjust
4. Verify volume ducking:
   - While music playing, trigger TTS
   - Music volume should drop to 20%
   - After TTS, restore to original volume

**Expected:** Music controls work, avatar grooves, volume ducks

**Report if:**
- Music tool fails
- MPD not responding
- Widget doesn't update
- Avatar doesn't groove
- Volume ducking broken

**Automated Test Example:**
```javascript
test('should control music playback correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock MPD API responses
  await page.route('**/mpd/**', route => {
    const url = route.request().url();
    if (url.includes('/play')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, track: 'Jazz in Paris' })
      });
    } else if (url.includes('/pause')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, status: 'paused' })
      });
    } else if (url.includes('/next')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, track: 'Smooth Jazz' })
      });
    } else if (url.includes('/volume')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, volume: 50 })
      });
    }
  });
  
  // Play music
  await voiceHelper.simulateSpeech('Play some jazz music');
  await voiceHelper.waitForState('processing');
  await voiceHelper.waitForToolExecution('music_play');
  
  // Verify avatar state
  const avatarState = await page.getAttribute('#avatar', 'data-state');
  expect(avatarState).toBe('grooving');
  
  // Verify widget updates
  await expect(page.locator('[data-now-playing]')).toContainText('Jazz in Paris');
  
  // Test pause
  await voiceHelper.simulateSpeech('Pause music');
  await voiceHelper.waitForToolExecution('music_pause');
  
  // Test next track
  await voiceHelper.simulateSpeech('Next track');
  await voiceHelper.waitForToolExecution('music_next');
  
  // Verify widget updated
  await expect(page.locator('[data-now-playing]')).toContainText('Smooth Jazz');
});
```

---

### 5.6 Image Generation Tool (ComfyUI)
**Test:** Image generation works

**Steps:**
1. Say: "Generate an image of a sunset over mountains"
2. Monitor for:
   - `generate_image()` tool called
   - ComfyUI service starts (if not running)
   - Workflow queued (port 8188)
   - Image generated
   - Flyout opens with image
3. Check image:
   - Matches prompt
   - Reasonable quality
   - Saved to `comfy/output/`
4. Test flyout:
   - Image displays
   - Can close flyout
   - Can download image

**Expected:** Image generates, displays in flyout

**Report if:**
- ComfyUI fails to start
- Image generation timeout
- Image not displayed
- Flyout doesn't open
- Error logs in ComfyUI

**Automated Test Example:**
```javascript
test('should generate images correctly', async ({ page }) => {
  const voiceHelper = new VoiceTestHelper(page);
  await voiceHelper.setupMicrophone();
  
  // Mock ComfyUI API responses
  await page.route('**/comfyui/**', route => {
    const url = route.request().url();
    if (url.includes('/queue')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          prompt_id: 'prompt_123',
          number: 1,
          queue_remaining: 0
        })
      });
    } else if (url.includes('/history')) {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          prompt_123: {
            prompt: {},
            outputs: {
              1: {
                images: [
                  {
                    filename: 'sunset_mountains.png',
                    subfolder: '',
                    type: 'output'
                  }
                ]
              }
            }
          }
        })
      });
    }
  });
  
  // Mock image response
  await page.route('**/comfy/output/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from('mock-image-data', 'utf-8')
    });
  });
  
  // Trigger image generation
  await voiceHelper.simulateSpeech('Generate an image of a sunset over mountains');
  await voiceHelper.waitForState('processing');
  await voiceHelper.waitForToolExecution('generate_image');
  
  // Wait for flyout to open
  await page.waitForSelector('[data-flyout="image"]', { timeout: 15000 });
  
  // Verify image displays
  await expect(page.locator('[data-flyout="image"] img')).toBeVisible();
  
  // Test flyout controls
  await page.click('[data-flyout-close]');
  await expect(page.locator('[data-flyout="image"]')).not.toBeVisible();
});
```

---

## Phase 6: UI Widget Testing

### 6.1 Conversation History
**Test:** Conversation displays correctly

**Steps:**
1. Have a 3-turn conversation
2. Verify each turn shows:
   - User message (STT transcript)
   - Agent response (LLM output)
   - Timestamp
   - Tool calls (if any)
3. Test scroll behavior:
   - Auto-scroll to latest message
   - Manual scroll up to see history
   - Smooth scrolling
4. Test clear conversation:
   - Find "Clear" button
   - Click to clear
   - Verify history erased

**Expected:** Clean display, auto-scroll, clear works

**Report if:**
- Messages don't appear
- Timestamps wrong
- No auto-scroll
- Clear doesn't work
- Tool calls not shown

---

### 6.2 Music Player Widget
**Test:** Mini player UI works

**Steps:**
1. Start music playback
2. Verify widget shows:
   - Track title
   - Artist name
   - Album art (if available)
   - Play/pause button
   - Previous/next buttons
   - Volume slider
3. Test controls from widget:
   - Click pause → Music pauses
   - Click next → Track skips
   - Drag volume slider → Volume changes
4. Verify real-time updates:
   - Track progress (if shown)
   - State changes (playing/paused)

**Expected:** Widget shows correct info, controls work

**Report if:**
- Widget doesn't appear
- Info incorrect
- Buttons don't work
- Volume slider broken
- No real-time updates

---

### 6.3 Flyout Panels
**Test:** Flyout panels (browser/code/terminal) work

**Steps:**
1. Trigger a tool that returns flyout:
   - Web search → browser flyout
   - Code snippet → code flyout
   - System command → terminal flyout
2. For each type, verify:
   - Panel slides in from right
   - Content displays correctly
   - Scroll works (if content long)
   - Close button works
   - Can interact with content (links clickable, code selectable)
3. Test multiple flyouts:
   - Open 2nd flyout while 1st open
   - Should replace, not stack

**Expected:** Flyouts open/close smoothly, content accessible

**Report if:**
- Flyout doesn't open
- Content not rendering
- Can't close
- Multiple flyouts stack
- Z-index issues

---

### 6.4 Notifications
**Test:** System notifications appear

**Steps:**
1. Trigger events that should notify:
   - Tool execution start
   - Tool execution complete
   - Errors
   - State changes (if notified)
2. Verify notification:
   - Appears in designated area (top-right?)
   - Shows clear message
   - Auto-dismisses after timeout
   - Can manually dismiss
3. Test notification queue:
   - Trigger multiple rapid events
   - Notifications should stack/queue properly

**Expected:** Notifications appear, readable, dismissible

**Report if:**
- Notifications don't appear
- Messages unclear
- Don't auto-dismiss
- Queue breaks
- Overlap other UI

---

## Phase 7: Error Handling & Edge Cases

### 7.1 Service Failure Scenarios
**Test:** Graceful degradation when services fail

**Steps:**
1. **Ollama Down:**
   - Stop Ollama: `pkill ollama`
   - Try voice interaction
   - Should show error: "LLM service unavailable"
2. **OpenMemory Down:**
   - Stop OpenMemory backend
   - Try memory tool
   - Should fail gracefully, not crash app
3. **MPD Down:**
   - Stop MPD service
   - Try music command
   - Should show error, offer troubleshooting
4. **ComfyUI Down:**
   - Try image generation when ComfyUI not started
   - Should show "Starting image service..."
   - If startup fails, clear error message

**Expected:** Clear error messages, app doesn't crash

**Report if:**
- App crashes
- Generic/unclear errors
- No user guidance
- Services don't recover when restarted

---

### 7.2 Network Interruption
**Test:** Behavior during network issues

**Steps:**
1. Start conversation
2. Simulate network interruption:
   - Disconnect WiFi mid-conversation OR
   - Block `localhost:8000` in browser
3. Verify:
   - WebSocket disconnect detected
   - Reconnection attempted
   - User notified of connection loss
4. Restore network:
   - Should reconnect automatically
   - Session should resume

**Expected:** Reconnection works, session persists

**Report if:**
- No reconnection attempt
- Session lost
- No user notification
- App freezes

---

### 7.3 Microphone Errors
**Test:** Handling microphone failures

**Steps:**
1. **No Microphone:**
   - Disable/unplug microphone
   - Try to start listening
   - Should show: "No microphone detected"
2. **Permission Denied:**
   - Deny mic permission
   - Should show: "Microphone access required"
   - Offer instructions to enable
3. **Microphone In Use:**
   - Open another app using mic (Zoom, etc.)
   - Try Felix
   - Should handle gracefully

**Expected:** Clear error messages, recovery instructions

**Report if:**
- Unclear errors
- App hangs
- No recovery path
- Infinite permission prompts

---

### 7.4 Long Conversations
**Test:** Performance over extended use

**Steps:**
1. Have 20+ turn conversation
2. Monitor for:
   - Memory leaks (check DevTools Memory)
   - Performance degradation
   - Conversation history size
   - WebSocket stability
3. Check specific metrics:
   - Response latency (should stay consistent)
   - UI responsiveness
   - Browser memory usage

**Expected:** Stable performance, no memory leaks

**Report if:**
- Progressively slower
- Memory usage growing unbounded
- UI becoming laggy
- WebSocket disconnects

---

### 7.5 Rapid Fire Interactions
**Test:** Handling quick successive commands

**Steps:**
1. Rapidly click mic button 10 times
2. Speak multiple commands in quick succession
3. Interrupt TTS multiple times rapidly
4. Monitor for:
   - State machine confusion
   - Audio buffer overflow
   - WebSocket congestion
   - UI responsiveness

**Expected:** Queue handled, no crashes

**Report if:**
- App freezes
- State stuck
- Commands lost
- Audio glitches

---

## Phase 8: Admin Dashboard Testing (if enabled)

### 8.1 Dashboard Access
**Test:** Admin panel loads and authenticates

**Steps:**
1. Navigate to `http://localhost:8000/admin.html`
2. If auth required:
   - Enter admin token
   - Verify access granted
3. Verify sections load:
   - Active Sessions
   - Event Logs
   - System Stats
   - Tool Usage

**Expected:** Dashboard loads, data displays

**Report if:**
- 404 or 403 errors
- Auth fails with correct token
- Sections empty/broken
- No data shown

---

### 8.2 Real-time Telemetry
**Test:** Dashboard updates in real-time

**Steps:**
1. Open admin dashboard
2. In another tab/window:
   - Start voice interaction
   - Execute tools
   - Trigger events
3. Verify admin dashboard:
   - Event logs update (new entries appear)
   - Active sessions show current state
   - Stats update (tool counts, etc.)
4. Check update frequency:
   - Should update within 2-5s of events

**Expected:** Real-time updates, accurate data

**Report if:**
- No updates
- Stale data
- Missing events
- Incorrect counts

---

### 8.3 Session Management
**Test:** Admin can view/manage sessions

**Steps:**
1. In admin dashboard → Active Sessions
2. Start conversation in main app
3. Verify session appears in list with:
   - Session ID
   - Current state
   - Last activity timestamp
   - User info (if multi-user)
4. Test actions (if available):
   - View session details
   - Terminate session
   - View conversation history

**Expected:** Session tracked, actions work

**Report if:**
- Session not listed
- Info incorrect
- Actions fail
- Permissions issues

---

## Phase 9: Multi-User & Auth Testing (if enabled)

### 9.1 User Registration/Login
**Test:** Multi-user authentication works

**Steps:**
1. Navigate to login page (if separate)
2. Test registration:
   - Create new account
   - Verify password requirements
   - Check for duplicate username prevention
3. Test login:
   - Login with credentials
   - Verify JWT/token issued
   - Check token stored (localStorage/cookie)
4. Test logout:
   - Logout action clears token
   - Redirects to login

**Expected:** Auth flow works, tokens secure

**Report if:**
- Registration fails
- Login doesn't work
- Token not stored
- Logout doesn't clear session

---

### 9.2 User Settings Persistence
**Test:** Each user has separate settings

**Steps:**
1. Login as User A
2. Change settings (theme, voice, model)
3. Logout
4. Login as User B
5. Verify User B has default/different settings
6. Login back as User A
7. Verify User A's settings persisted

**Expected:** Settings tied to user account

**Report if:**
- Settings shared across users
- Settings don't persist
- Settings reset on logout

---

### 9.3 Conversation History Isolation
**Test:** Users can't see each other's conversations

**Steps:**
1. Login as User A
2. Have conversation with specific content
3. Logout
4. Login as User B
5. Verify User B sees empty/own history
6. Login back as User A
7. Verify User A's history intact

**Expected:** Conversation history private per user

**Report if:**
- Users see each other's conversations
- History mixed
- Privacy leak

---

## Bug Reporting Template

When you find a bug, report using this structure:

```markdown
## Bug Report: [Short Title]

**Severity:** Critical / High / Medium / Low
**Phase:** [Which test phase]
**Test:** [Specific test that failed]
**Reproducibility:** Always / Sometimes / Rare

### Environment
- Browser: [Chrome/Firefox/Safari + version]
- OS: [Linux/Mac/Windows + version]
- Felix Version: [git commit or tag]
- Services: [Ollama, OpenMemory, MPD status]
- Network: [WiFi/Ethernet/Offline, Speed]

### Steps to Reproduce
1. [Exact step 1 with timing]
2. [Exact step 2 with timing]
3. [Exact step 3 with timing]

**Time to reproduce:** [How long it takes to reproduce]

### Expected Behavior
[What should happen in detail]

### Actual Behavior
[What actually happened with timestamps if relevant]

### Console Errors
```
[Paste relevant console errors with timestamps]
```

### Server Logs
```
[Paste relevant server terminal output]
```

### Screenshots/Videos
[Attach if applicable with timestamps]
- Screenshot 1: [Description]
- Screenshot 2: [Description]
- Video: [Description and duration]

### Playwright Script (if automated)
```javascript
// Script that reproduces the bug
import { test, expect } from '@playwright/test';

test('reproduce bug', async ({ page }) => {
  await page.goto('http://localhost:8000');
  await page.waitForSelector('#avatar');
  
  // Exact reproduction steps
  await page.click('#orb');
  await page.waitForTimeout(1000);
  // ... more steps
  
  // Assertion that fails
  await expect(page.locator('#expected-element')).toBeVisible();
});
```

### Network Analysis
- WebSocket messages: [Include message sequence]
- HTTP requests: [List failed/missing requests]
- Response times: [Measure and report]

### Performance Metrics
- Page load time: [ms]
- Tool execution time: [ms]
- Memory usage: [MB]
- CPU usage: [%]

### Additional Context
- Happens consistently? Yes/No/Sometimes
- Started after which change? [If known]
- Workaround exists? [If found]
- Affects multiple browsers? [List which ones]
- Affects multiple devices? [List which ones]

### Questions for Developer
1. [Question about expected behavior]
2. [Question about architecture/design]
3. [Question about fix approach]
4. [Question about potential root cause]
5. [Question about impact on other features]

### Related Issues
- GitHub Issues: [#123, #456]
- Similar bugs: [List if any]
- Dependencies: [List affected dependencies]
```

## Automated Bug Detection

### Console Error Monitoring
```javascript
// Automated error detection
export class ErrorMonitor {
  constructor(page) {
    this.errors = [];
    this.warnings = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        this.errors.push({
          text: msg.text(),
          location: msg.location(),
          timestamp: Date.now()
        });
      } else if (msg.type() === 'warning') {
        this.warnings.push({
          text: msg.text(),
          location: msg.location(),
          timestamp: Date.now()
        });
      }
    });
  }
  
  getErrors() { return this.errors; }
  getWarnings() { return this.warnings; }
  clear() { this.errors = []; this.warnings = []; }
}
```

### Performance Monitoring
```javascript
// Performance metrics collection
export class PerformanceMonitor {
  constructor(page) {
    this.metrics = {};
    
    page.on('response', response => {
      if (response.status() >= 400) {
        this.metrics.failedRequests = (this.metrics.failedRequests || 0) + 1;
      }
    });
  }
  
  async collectMetrics() {
    const perfData = await this.page.evaluate(() => {
      return {
        navigation: performance.getEntriesByType('navigation'),
        resource: performance.getEntriesByType('resource'),
        memory: performance.memory,
        timing: performance.timing
      };
    });
    
    this.metrics = { ...this.metrics, ...perfData };
    return this.metrics;
  }
}
```

---

## Questions to Ask Developer Before Fixing

For each bug found, include these questions in your report:

1. **Is this expected behavior?** - Confirm it's actually a bug, not a misunderstanding
2. **What's the root cause?** - Help understand the underlying issue
3. **Priority level?** - Should this block release or can it wait?
4. **Preferred fix approach?** - Get guidance before implementing
5. **Are there related issues?** - Might be symptom of larger problem
6. **Test coverage needed?** - Should this have an automated test?
7. **Documentation needed?** - Should this behavior be documented?

### Additional Developer Questions

8. **Which component is most likely causing this issue?** - Frontend, backend, or service integration
9. **Are there any recent changes that might have introduced this bug?** - Code commits, dependency updates
10. **What's the expected behavior in edge cases?** - Boundary conditions, error states
11. **Should we implement a temporary workaround?** - If fix will take time
12. **Which tests should we add to prevent regression?** - Unit, integration, or e2e tests
13. **Does this affect other environments?** - Staging, production, different browsers
14. **What monitoring/alerting should we add?** - For production detection
15. **Is this a known limitation or design decision?** - Sometimes what looks like a bug is intentional

---

## Testing Execution Tips

### For Playwright Automation

#### Complete Test Suite Structure
```javascript
// playwright.config.js
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 2,
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],
});
```

#### Comprehensive Test Suite
```javascript
// tests/voice-agent.spec.js
import { test, expect } from '@playwright/test';

test.describe('Felix Voice Agent', () => {
  let page;
  
  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    
    // Enable console logging
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    
    // Navigate to Felix
    await page.goto('http://localhost:8000');
    
    // Wait for initial load
    await page.waitForSelector('#avatar', { timeout: 10000 });
  });

  test('should load with correct initial state', async () => {
    // Check all UI elements are present
    await expect(page.locator('#avatar')).toBeVisible();
    await expect(page.locator('#orb')).toBeVisible();
    await expect(page.locator('[data-theme-selector]')).toBeVisible();
    await expect(page.locator('[data-settings]')).toBeVisible();
    
    // Check initial state
    const statusText = await page.textContent('#statusText');
    expect(statusText).toContain('Connecting');
  });

  test('should switch themes correctly', async () => {
    // Test theme switching
    await page.click('[data-theme-selector]');
    
    const themes = ['dark', 'light', 'ocean', 'sunset', 'forest'];
    for (const theme of themes) {
      await page.click(`[data-theme="${theme}"]`);
      await page.waitForTimeout(500); // Wait for transition
      
      const currentTheme = await page.getAttribute('html', 'data-theme');
      expect(currentTheme).toBe(theme);
      
      // Take screenshot
      await page.screenshot({ path: `screenshots/theme-${theme}.png` });
    }
  });

  test('should handle microphone permission', async () => {
    // Mock microphone permission
    await page.setPermissions(['microphone'], { origin: 'http://localhost:8000' });
    
    // Click microphone button
    await page.click('#orb');
    
    // Should show permission prompt or start listening
    await page.waitForTimeout(2000);
    
    // Check if avatar state changed
    const avatarState = await page.getAttribute('#avatar', 'data-state');
    expect(['listening', 'processing', 'speaking']).toContain(avatarState);
  });

  test('should execute weather tool', async () => {
    // Mock WebSocket messages
    await page.addInitScript(() => {
      const originalWebSocket = window.WebSocket;
      window.WebSocket = class extends originalWebSocket {
        constructor(url) {
          super(url);
          this.addEventListener('message', (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'tool_call') {
              // Mock tool call response
              this.dispatchEvent(new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'tool_result',
                  tool: 'weather',
                  result: 'The weather in New York is 72°F and sunny'
                })
              }));
            }
          });
        }
      };
    });

    // Start conversation
    await page.click('#orb');
    await page.fill('#transcript-input', 'What is the weather in New York?');
    await page.click('#send-button');
    
    // Wait for tool execution
    await page.waitForSelector('[data-tool-status="weather"]', { timeout: 10000 });
    
    // Check result
    const result = await page.textContent('[data-tool-result="weather"]');
    expect(result).toContain('New York');
  });

  test('should handle barge-in correctly', async () => {
    // Start TTS playback
    await page.evaluate(() => {
      // Simulate TTS state
      window.dispatchEvent(new CustomEvent('state-change', { detail: { state: 'speaking' } }));
    });

    // Wait for TTS to start
    await page.waitForTimeout(1000);
    
    // Interrupt with microphone
    await page.click('#orb');
    
    // Check state transition
    const state = await page.getAttribute('#avatar', 'data-state');
    expect(state).toBe('interrupted');
  });

  test('should handle service failures gracefully', async () => {
    // Block Ollama requests
    await page.route('http://localhost:11434/**', route => {
      route.abort('connectionrefused');
    });

    // Try voice interaction
    await page.click('#orb');
    await page.fill('#transcript-input', 'Hello');
    await page.click('#send-button');
    
    // Check error message
    await page.waitForSelector('[data-error="ollama"]', { timeout: 5000 });
    const errorMessage = await page.textContent('[data-error="ollama"]');
    expect(errorMessage).toContain('LLM service unavailable');
  });

  test('should maintain conversation history', async () => {
    // Have multiple turns
    const messages = [
      'Hello',
      'How are you?',
      'What can you do?'
    ];

    for (const message of messages) {
      await page.click('#orb');
      await page.fill('#transcript-input', message);
      await page.click('#send-button');
      await page.waitForTimeout(2000);
    }

    // Check history
    const historyItems = await page.$$('[data-conversation-item]');
    expect(historyItems.length).toBeGreaterThan(0);
  });

  test('should handle responsive design', async () => {
    const viewports = [
      { width: 1920, height: 1080 }, // Desktop
      { width: 1366, height: 768 },  // Laptop
      { width: 768, height: 1024 },  // Tablet
      { width: 375, height: 667 }    // Mobile
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      
      // Check no horizontal scroll
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = viewport.width;
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 10); // Allow small tolerance
      
      // Take screenshot
      await page.screenshot({ path: `screenshots/viewport-${viewport.width}x${viewport.height}.png` });
    }
  });
});
```

#### Voice Interaction Test Helper
```javascript
// tests/helpers/voice-test-helper.js
export class VoiceTestHelper {
  constructor(page) {
    this.page = page;
  }

  async setupMicrophone() {
    await this.page.setPermissions(['microphone'], { origin: 'http://localhost:8000' });
  }

  async simulateSpeech(text) {
    await this.page.evaluate((text) => {
      // Simulate speech recognition
      const event = new CustomEvent('speech-recognized', {
        detail: { transcript: text, isFinal: true }
      });
      window.dispatchEvent(event);
    }, text);
  }

  async waitForState(state) {
    await this.page.waitForFunction((expectedState) => {
      const avatar = document.getElementById('avatar');
      return avatar && avatar.getAttribute('data-state') === expectedState;
    }, state);
  }

  async waitForToolExecution(toolName) {
    await this.page.waitForSelector(`[data-tool-status="${toolName}"]`, { timeout: 15000 });
  }

  async getConversationHistory() {
    return await this.page.$$eval('[data-conversation-item]', elements => 
      elements.map(el => el.textContent)
    );
  }
}
```

#### Performance Testing
```javascript
// tests/performance.spec.js
test('should handle long conversations without memory leaks', async ({ page }) => {
  await page.goto('http://localhost:8000');
  await page.waitForSelector('#avatar');

  // Start memory monitoring
  const initialMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);

  // Simulate 20 conversation turns
  for (let i = 0; i < 20; i++) {
    await page.click('#orb');
    await page.fill('#transcript-input', `Message ${i}`);
    await page.click('#send-button');
    await page.waitForTimeout(1000);
  }

  // Check memory usage
  const finalMemory = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
  const memoryIncrease = finalMemory - initialMemory;
  
  // Memory increase should be reasonable (less than 50MB)
  expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
});
```

#### Accessibility Testing
```javascript
// tests/accessibility.spec.js
import { injectAxe, checkA11y } from 'axe-playwright';

test('should be accessible', async ({ page }) => {
  await page.goto('http://localhost:8000');
  await injectAxe(page);
  
  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: { html: true }
  });
});
```

### Manual Testing Checklist
- [ ] Start with clean browser (clear cache/localStorage)
- [ ] Test in multiple browsers (Chrome, Firefox, Safari)
- [ ] Use DevTools actively (Console, Network, Memory)
- [ ] Take screenshots of visual issues
- [ ] Record videos for complex interactions
- [ ] Note timing of issues (time of day, server load)
- [ ] Test on different hardware if available
- [ ] Test with different network conditions (slow 3G, offline)
- [ ] Test with different audio devices (headphones, speakers, different mics)
- [ ] Test accessibility features (screen reader, keyboard navigation)

### Automated Test Execution
```bash
# Install Playwright
npm install @playwright/test
npx playwright install

# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/voice-agent.spec.js

# Run tests in specific browser
npx playwright test --project=chromium

# Run tests with video recording
npx playwright test --video=on

# Run tests with trace viewer
npx playwright test --trace=on
npx playwright show-trace trace.zip

# Run performance tests
npx playwright test tests/performance.spec.js

# Run accessibility tests
npx playwright test tests/accessibility.spec.js

# Run tests in headless mode
npx playwright test --headless

# Generate HTML report
npx playwright test --reporter=html
npx playwright show-report
```

### Continuous Integration Setup
```yaml
# .github/workflows/playwright.yml
name: Playwright Tests
on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: 18
    - name: Install dependencies
      run: npm ci
    - name: Install Playwright Browsers
      run: npx playwright install
    - name: Start Felix Server
      run: |
        ./run.sh &
        sleep 30
        curl -f http://localhost:8000/ || exit 1
    - name: Run Playwright tests
      run: npx playwright test
    - name: Upload test results
      uses: actions/upload-artifact@v3
      if: failure()
      with:
        name: test-results
        path: test-results/
    - name: Upload traces
      uses: actions/upload-artifact@v3
      if: failure()
      with:
        name: traces
        path: trace.zip
```

### Systematic Approach
1. **Test in order** - Follow phases sequentially
2. **Document everything** - Even if it works, note it
3. **Isolate issues** - Test one thing at a time
4. **Reproduce 3x** - Confirm consistency
5. **Check logs** - Server terminal, browser console, service logs
6. **Compare expected** - Use documentation as source of truth

### Test Data Management
```javascript
// Test data factory
export const TestData = {
  users: {
    userA: { username: 'testuser1', password: 'TestPass123!' },
    userB: { username: 'testuser2', password: 'TestPass456!' }
  },
  conversations: {
    weather: 'What is the weather in San Francisco?',
    music: 'Play some jazz music',
    search: 'Search the web for React best practices',
    memory: 'Remember that I like pizza'
  },
  settings: {
    voice: { ttsVoice: 'Amy', volume: 80 },
    llm: { backend: 'Ollama', model: 'llama3.2' },
    theme: 'dark'
  }
};
```

### Test Environment Configuration
```javascript
// Environment-specific configurations
export const Environment = {
  development: {
    baseUrl: 'http://localhost:8000',
    services: {
      ollama: 'http://localhost:11434',
      openmemory: 'http://localhost:8080',
      mpd: 'localhost:6600'
    }
  },
  staging: {
    baseUrl: 'https://staging.felix.ai',
    services: {
      ollama: 'https://staging-ollama.felix.ai',
      openmemory: 'https://staging-memory.felix.ai',
      mpd: 'staging-mpd.felix.ai:6600'
    }
  }
};
```

---

## Success Criteria

A complete test run should:
- ✅ Execute all 9 phases
- ✅ Test all major features
- ✅ Identify bugs with reproduction steps
- ✅ Generate questions for developer
- ✅ Provide screenshots/logs as evidence
- ✅ Suggest potential fixes (with questions)
- ✅ Document edge cases discovered

**End Goal:** Developer receives actionable bug reports with clear reproduction steps and thoughtful questions about fix approaches.

## Test Metrics & Reporting

### Test Coverage Metrics
```javascript
// Coverage tracking
const coverage = {
  features: {
    voice_interaction: { tests: 15, passed: 12, failed: 3 },
    ui_components: { tests: 8, passed: 8, failed: 0 },
    tool_execution: { tests: 12, passed: 10, failed: 2 },
    error_handling: { tests: 6, passed: 5, failed: 1 },
    accessibility: { tests: 4, passed: 4, failed: 0 }
  },
  browsers: ['Chrome', 'Firefox', 'Safari'],
  devices: ['Desktop', 'Tablet', 'Mobile'],
  environments: ['Development', 'Staging']
};
```

### Automated Test Reports
```bash
# Generate comprehensive reports
npx playwright test --reporter=json --output=test-results.json
npx playwright test --reporter=html --output=html-report/

# Custom report generation
node scripts/generate-test-report.js
```

### Performance Benchmarks
```javascript
// Performance thresholds
const performanceThresholds = {
  page_load: 3000,        // ms
  voice_response: 5000,   // ms
  tool_execution: 10000,  // ms
  memory_usage: 100,      // MB
  cpu_usage: 80           // %
};
```

## Advanced Testing Scenarios

### Network Condition Testing
```javascript
// Simulate different network conditions
test('should work on slow network', async ({ page }) => {
  await page.setOffline(true);
  // Test offline behavior
  
  await page.emulateNetworkConditions({
    offline: false,
    downloadThroughput: 1.5 * 1024 * 1024 / 8, // 1.5 Mbps
    uploadThroughput: 750 * 1024 / 8,           // 750 Kbps
    latency: 40                   // ms
  });
  // Test slow network behavior
});
```

### Stress Testing
```javascript
test('should handle concurrent users', async ({ browser }) => {
  const users = [];
  
  // Simulate 5 concurrent users
  for (let i = 0; i < 5; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    users.push(page.goto('http://localhost:8000'));
  }
  
  await Promise.all(users);
  
  // Test concurrent interactions
  for (const page of users) {
    await page.click('#orb');
    await page.waitForTimeout(1000);
  }
});
```

### Security Testing
```javascript
test('should handle malicious input', async ({ page }) => {
  const maliciousInputs = [
    '<script>alert("xss")</script>',
    'SELECT * FROM users; DROP TABLE users;',
    'A'.repeat(10000), // Buffer overflow test
    'javascript:alert("xss")'
  ];
  
  for (const input of maliciousInputs) {
    await page.fill('#transcript-input', input);
    await page.click('#send-button');
    
    // Should not crash or execute malicious code
    await expect(page.locator('#error-message')).not.toBeVisible();
  }
});
```

## Integration with CI/CD

### Pre-commit Hooks
```json
// package.json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run test:unit && npm run test:integration"
    }
  }
}
```

### Deployment Gates
```yaml
# deployment-pipeline.yml
deploy:
  - test:unit
  - test:integration
  - test:e2e
  - test:performance
  - test:security
  - deploy:staging
  - test:smoke
  - deploy:production
```

## Troubleshooting Common Issues

### WebSocket Connection Problems
```javascript
// Debug WebSocket issues
page.on('websocket', ws => {
  console.log('WebSocket opened:', ws.url());
  ws.on('framesent', event => console.log('Sent:', event.payload));
  ws.on('framereceived', event => console.log('Received:', event.payload));
  ws.on('close', () => console.log('WebSocket closed'));
});
```

### Audio Testing Issues
```javascript
// Mock audio context for testing
await page.addInitScript(() => {
  window.AudioContext = class extends AudioContext {
    constructor() {
      super();
      this.createMediaStreamSource = () => ({
        connect: () => {},
        disconnect: () => {}
      });
    }
  };
});
```

### STT/TTS Testing
```javascript
// Mock speech recognition
await page.addInitScript(() => {
  window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  window.SpeechRecognition.prototype.start = function() {
    setTimeout(() => {
      this.onresult({ results: [[{ transcript: 'test transcript' }]] });
    }, 1000);
  };
});
```

## Test Maintenance

### Regular Test Review Schedule
- **Daily**: Check test results, fix flaky tests
- **Weekly**: Review test coverage, add new test cases
- **Monthly**: Update test data, review performance metrics
- **Quarterly**: Refactor test suite, update dependencies

### Test Documentation
```markdown
# Test Documentation Template

## Test Case: [Name]
**Purpose:** [What this test validates]
**Preconditions:** [Setup required]
**Test Steps:** [Detailed steps]
**Expected Results:** [What should happen]
**Actual Results:** [What actually happened]
**Test Data:** [Input data used]
**Environment:** [Browser, OS, version]
**Related Issues:** [Bug IDs, if any]
```

This enhanced Playwright Debug & Testing Plan provides a comprehensive framework for testing the Felix Voice Agent with both automated and manual testing approaches, ensuring high quality and reliability across all features and environments.
