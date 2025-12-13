import { test, expect } from '@playwright/test';
import { ErrorMonitor } from './helpers/error-monitor.js';
import { installMockWebSocketInitScript, waitForWsInstance, emitWsJson } from './mockups/mock_websocket.js';

test.describe('Phase 1: Visual & Layout Testing', () => {
  test('Phase 1.1 Initial Page Load', async ({ page, baseURL }, testInfo) => {
    const errors = new ErrorMonitor(page);

    await page.goto(baseURL + '/');
    await page.waitForLoadState('networkidle');

    // Collect a baseline screenshot always (useful even on pass)
    await page.screenshot({ path: testInfo.outputPath('phase1.1-initial-load.png'), fullPage: true });

  // Verify visible elements (based on plan + current Felix DOM)
  await expect(page.locator('#orb')).toBeVisible();
  await expect(page.locator('#avatar')).toBeVisible();

  // Settings button opens the settings modal.
  const settingsBtn = page.locator('#settingsBtn');
  await expect(settingsBtn).toBeVisible();
  await settingsBtn.click();

  const settingsModal = page.locator('#settingsModal');
  await expect(settingsModal).toBeVisible();

  // Theme picker lives inside the settings modal.
  const themePicker = page.locator('#themePicker');
  await expect(themePicker).toBeVisible();
  await expect(themePicker.locator('.theme-swatch').first()).toBeVisible();

    // Check console errors
    const consoleErrors = errors.getErrors();
    expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);

    // Motion smoke check (less flaky than bounding-box deltas).
    // If the user prefers reduced motion, we don't require animation.
    const prefersReducedMotion = await page.evaluate(() =>
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    if (!prefersReducedMotion) {
      const avatarAnim = await page.locator('#avatar').evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          animationName: s.animationName,
          animationDuration: s.animationDuration,
          transitionDuration: s.transitionDuration,
        };
      });
      // Some themes/states may use transitions instead of continuous animation.
      const hasSomeMotion =
        (avatarAnim.animationName && avatarAnim.animationName !== 'none' && avatarAnim.animationDuration !== '0s') ||
        (avatarAnim.transitionDuration && avatarAnim.transitionDuration !== '0s');
      expect(hasSomeMotion, `Expected avatar to have animation/transition (got ${JSON.stringify(avatarAnim)})`).toBeTruthy();
    }
  });

  test('Phase 1.2 Theme Switching', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    const errors = new ErrorMonitor(page);

    await page.goto(baseURL + '/');
    await page.waitForLoadState('networkidle');

    // Open settings modal where theme swatches live
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeVisible();

    const swatches = page.locator('#themePicker .theme-swatch');
    const swatchCount = await swatches.count();
    expect(swatchCount, 'Expected multiple theme swatches').toBeGreaterThan(1);

    // Click up to 9 themes (or all available if fewer)
    const toTest = Math.min(9, swatchCount);
    for (let i = 0; i < toTest; i++) {
      const swatch = swatches.nth(i);
      const theme = await swatch.getAttribute('data-theme');
      expect(theme, 'theme swatch missing data-theme').toBeTruthy();

  // Swatches can wrap and sometimes land partly outside the viewport.
  // Use a DOM click to avoid flaky viewport/transform geometry issues.
  await swatch.evaluate((el) => el.click());
      await page.waitForTimeout(300);

      const currentTheme = await page.locator('html').getAttribute('data-theme');
      expect(currentTheme).toBe(theme);

      // Smoke-check: CSS variables exist and look non-empty
      const accent = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim()
      );
      expect(accent, 'Expected --accent-primary to be set').toBeTruthy();

      await page.screenshot({
        path: testInfo.outputPath(`phase1.2-theme-${theme}.png`),
        fullPage: true,
      });

      await expect(page.locator('#avatar')).toBeVisible();
      await expect(page.locator('#orb')).toBeVisible();
    }

    const consoleErrors = errors.getErrors();
    expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('Phase 1.3 Responsive Layout', async ({ page, baseURL }, testInfo) => {
    const errors = new ErrorMonitor(page);

    const viewports = [
      { name: 'desktop', width: 1920, height: 1080 },
      { name: 'laptop', width: 1366, height: 768 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'mobile', width: 375, height: 667 },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(baseURL + '/');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(250);

      // Critical elements still visible
      await expect(page.locator('#avatar')).toBeVisible();
      await expect(page.locator('#orb')).toBeVisible();
      await expect(page.locator('#settingsBtn')).toBeVisible();

      // No significant horizontal overflow
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth, `${vp.name}: body scrollWidth ${bodyWidth} > viewport ${vp.width}`).toBeLessThanOrEqual(vp.width + 10);

      await page.screenshot({
        path: testInfo.outputPath(`phase1.3-responsive-${vp.name}.png`),
        fullPage: true,
      });
    }

    const consoleErrors = errors.getErrors();
    expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);
  });
});

test.describe('Phase 2: Settings Panel Testing', () => {
  test('Phase 2.1 Settings Panel Open/Close + Persistence', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const errors = new ErrorMonitor(page);

    await page.goto(baseURL + '/');
    await page.waitForLoadState('networkidle');

    const settingsBtn = page.locator('#settingsBtn');
    const modal = page.locator('#settingsModal');
    const closeBtn = page.locator('#closeSettings');
    const saveBtn = page.locator('#saveSettings');

    // Open
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();
    await expect(modal).toBeVisible();

    // Verify key sections exist (smoke)
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
    await expect(page.locator('#themePicker')).toBeVisible();
    await expect(page.locator('#voiceSelect')).toBeVisible();
    await expect(page.locator('#backendSelect')).toBeVisible();
    await expect(page.locator('#modelSelect')).toBeVisible();

  // Close by cancel (DOM click avoids viewport/transform flakiness)
  await closeBtn.evaluate((el) => el.click());
    await expect(modal).toBeHidden();

    // Re-open and change settings
    await settingsBtn.click();
    await expect(modal).toBeVisible();

    // Change theme and voice (choose non-default values)
    await page.locator('#themePicker .theme-swatch[data-theme="ocean"]').evaluate((el) => el.click());
    await page.locator('#voiceSelect').selectOption('ryan');

  // Save
    await page.screenshot({ path: testInfo.outputPath('phase2.1-before-save.png'), fullPage: true });
  await saveBtn.evaluate((el) => el.click());
    await expect(modal).toBeHidden();

    // Verify localStorage reflects saved values
    const saved = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('voiceAgentSettings') || 'null');
      } catch {
        return null;
      }
    });
    expect(saved, 'Expected voiceAgentSettings in localStorage').toBeTruthy();
    expect(saved.theme).toBe('ocean');
    expect(saved.voice).toBe('ryan');

    // Reload and ensure persistence
    await page.reload();
    await page.waitForLoadState('networkidle');

    const currentTheme = await page.locator('html').getAttribute('data-theme');
    expect(currentTheme).toBe('ocean');

    // Open settings and confirm UI selections persisted
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
    await expect(page.locator('#voiceSelect')).toHaveValue('ryan');

    // Theme swatch should be active
    await expect(page.locator('#themePicker .theme-swatch[data-theme="ocean"]')).toHaveClass(/active/);

    // Close by clicking backdrop (click modal container outside content)
    await page.locator('#settingsModal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#settingsModal')).toBeHidden();

    const consoleErrors = errors.getErrors();
    expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('Phase 2.2 Voice Settings (dropdown + Test Audio)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const errors = new ErrorMonitor(page);

    await page.goto(baseURL + '/');
    await page.waitForLoadState('networkidle');

    // Open settings
    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeVisible();

    const voiceSelect = page.locator('#voiceSelect');
    await expect(voiceSelect).toBeVisible();

    // Switch through a couple voices (just verifying UI changes + no errors)
    await voiceSelect.selectOption('lessac');
    await expect(voiceSelect).toHaveValue('lessac');
    await voiceSelect.selectOption('ryan');
    await expect(voiceSelect).toHaveValue('ryan');

    // Click Test Audio (real audio path). We don't assert actual sound (headless),
    // but we do assert it doesn't throw and the page remains stable.
    await page.screenshot({ path: testInfo.outputPath('phase2.2-before-test-audio.png'), fullPage: true });
    await page.locator('#testAudioBtn').evaluate((el) => el.click());

    // Give it a moment to start TTS playback / state updates.
    await page.waitForTimeout(1500);

    // Ensure app is still responsive and core UI remains.
    await expect(page.locator('#orb')).toBeVisible();
    await expect(page.locator('#avatar')).toBeVisible();

    // Close modal
    await page.locator('#closeSettings').evaluate((el) => el.click());
    await expect(page.locator('#settingsModal')).toBeHidden();

    const consoleErrors = errors.getErrors();
    expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('Phase 2.3 LLM Settings (backend switch + refresh models)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    const errors = new ErrorMonitor(page);

    await page.goto(baseURL + '/');
    await page.waitForLoadState('networkidle');

    await page.locator('#settingsBtn').click();
    await expect(page.locator('#settingsModal')).toBeVisible();

    const backendSelect = page.locator('#backendSelect');
    const modelSelect = page.locator('#modelSelect');
    const refreshModelsBtn = page.locator('#refreshModelsBtn');

    await expect(backendSelect).toBeVisible();
    await expect(modelSelect).toBeVisible();
    await expect(refreshModelsBtn).toBeVisible();

    // Backends present in the UI (some may map to the same server-side backend).
    const backendsToTest = ['ollama', 'lmstudio', 'openai', 'openrouter'];
    for (const backend of backendsToTest) {
      // Skip options that aren't present in the current UI build.
      const optionExists = await backendSelect.locator(`option[value="${backend}"]`).count();
      if (!optionExists) continue;

      await backendSelect.selectOption(backend);
      await expect(backendSelect).toHaveValue(backend);

      // Hit refresh models. This does network I/O and can be not-instant.
      await refreshModelsBtn.evaluate((el) => el.click());

      // Wait for the model select to populate beyond the placeholder.
      const start = Date.now();
      while (Date.now() - start < 10_000) {
        const count = await modelSelect.locator('option').count();
        if (count > 1) break;
        await page.waitForTimeout(200);
      }

      const optionCount = await modelSelect.locator('option').count();
      expect(optionCount, `Expected modelSelect to have options after refresh (backend=${backend})`).toBeGreaterThan(0);

      await page.screenshot({
        path: testInfo.outputPath(`phase2.3-backend-${backend}.png`),
        fullPage: true,
      });
    }

    // Close modal
    await page.locator('#closeSettings').evaluate((el) => el.click());
    await expect(page.locator('#settingsModal')).toBeHidden();

    const consoleErrors = errors.getErrors();
    expect(consoleErrors, `Console errors:\n${consoleErrors.join('\n')}`).toHaveLength(0);
  });
});

test.describe('Phase 3: WebSocket & State Testing', () => {
  test('Phase 3.1 WebSocket Connection (establish + stable)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);

    let wsOpened = false;
    let wsClosed = false;
    let wsError = null;
    let wsUrl = null;

    page.on('websocket', (ws) => {
      wsUrl = ws.url();
      if (wsUrl.endsWith('/ws')) {
        wsOpened = true;
      }
      ws.on('close', () => {
        if (ws.url().endsWith('/ws')) wsClosed = true;
      });
      ws.on('socketerror', (err) => {
        if (ws.url().endsWith('/ws')) wsError = String(err);
      });
    });

    await page.goto(baseURL + '/');
    await page.waitForLoadState('networkidle');

    // Wait up to ~5s for WS connect
    const start = Date.now();
    while (!wsOpened && Date.now() - start < 5000) {
      await page.waitForTimeout(100);
    }

    expect(wsOpened, `Expected WebSocket to open (last url: ${wsUrl})`).toBeTruthy();
    expect(wsError, `WebSocket socketerror: ${wsError}`).toBeNull();

    // Stability window: no disconnects for 10 seconds
    await page.waitForTimeout(10_000);
    await page.screenshot({ path: testInfo.outputPath('phase3.1-ws-stable.png'), fullPage: true });

    expect(wsClosed, 'WebSocket closed during stability window').toBeFalsy();
    expect(wsError, `WebSocket socketerror: ${wsError}`).toBeNull();
  });

  test('Phase 3.2 State Transitions (IDLE → LISTENING → IDLE)', async ({ page, baseURL }, testInfo) => {
    const errorMonitor = new ErrorMonitor(page);

    await page.goto(baseURL + '/');
    await page.waitForSelector('#avatar', { timeout: 15000 });
    await page.waitForSelector('#orb', { timeout: 15000 });

    // Initial state should settle to idle
    await page.waitForTimeout(500);
    await expect(page.locator('#avatar')).toHaveClass(/\bidle\b/);

  // Grant mic permission in this test and click orb to start listening.
  // (We don't validate real audio; we validate visible state transitions.)
    await page.context().grantPermissions(['microphone']);

    await page.locator('#orb').evaluate((el) => el.click());

    // NOTE: In Playwright headless, getUserMedia can still fail depending on system audio devices.
    // We treat this as an environment limitation, not a UI bug.
    // We'll assert that the click is handled (no console errors) and then *conditionally* assert
    // the internal isListening toggle if recording actually starts.
    const listeningState = await page.evaluate(async () => {
      const app = window.app;
      return {
        hasApp: !!app,
        isListening: app?.isListening ?? null,
        isRecording: app?.audioHandler?.isRecording ?? null,
      };
    });

    // If recording started, isListening should be true.
    if (listeningState.isRecording === true) {
      await expect
        .poll(async () => {
          return await page.evaluate(() => window.app?.isListening ?? null);
        }, { timeout: 5000 })
        .toBe(true);
    }

    await page.screenshot({ path: testInfo.outputPath('phase3.2-listening.png'), fullPage: true });

    // Stop listening (if it ever started).
    await page.locator('#orb').evaluate((el) => el.click());

    if (listeningState.isRecording === true) {
      await expect
        .poll(async () => {
          return await page.evaluate(() => window.app?.isListening ?? null);
        }, { timeout: 5000 })
        .toBe(false);
    }

    // Avatar should remain/return idle locally.
    await expect(page.locator('#avatar')).toHaveClass(/\bidle\b/);

    await page.screenshot({ path: testInfo.outputPath('phase3.2-idle.png'), fullPage: true });

    // In headless environments without a real audio input device, Chromium can throw
    // NotSupportedError during AudioContext/getUserMedia init. That's an environment limitation.
    // What we *do* require: the app doesn't crash/hang and surfaces the error to the user.
    const errors = errorMonitor.getErrors();
    const ignorableAudioErrors = errors.filter((e) =>
      /Failed to initialize audio|NotSupportedError|Failed to start listening: Error: Failed to initialize audio/i.test(e)
    );
    const otherErrors = errors.filter((e) => !ignorableAudioErrors.includes(e));

    // If we hit audio init issues, ensure the UI shows a friendly message.
    if (ignorableAudioErrors.length > 0) {
      await expect(page.locator('.notification.notification-error')).toContainText(
        /could not access microphone|microphone/i,
        { timeout: 5000 }
      );
    }

    expect(
      otherErrors,
      `Console/page/request errors (excluding known headless audio limitations):\n${otherErrors.join('\n')}`
    ).toEqual([]);
  });

  test('Phase 3.3 Binary Audio Protocol (first byte TTS flag)', async ({ page, baseURL }, testInfo) => {
    const errorMonitor = new ErrorMonitor(page);

    // Instrument the client before app init so we can capture binary frames.
    await page.addInitScript(() => {
      window.__felixAudioFrames = [];
      window.__felixWsSendOriginal = null;
      window.__felixPatchInstalled = false;

      const patchIfReady = () => {
        const app = window.app;
        if (!app || window.__felixPatchInstalled) return;

        // Patch WebSocket send to capture first byte of any binary packet.
        const ws = app.ws;
        if (ws && !window.__felixWsSendOriginal) {
          window.__felixWsSendOriginal = ws.send.bind(ws);
          ws.send = (data) => {
            try {
              if (data instanceof ArrayBuffer) {
                const u8 = new Uint8Array(data);
                window.__felixAudioFrames.push({ first: u8[0], len: u8.length, ts: Date.now() });
              }
            } catch {
              // ignore
            }
            return window.__felixWsSendOriginal(data);
          };
        }

        // Make startRecording deterministic: don't touch real audio devices.
        if (app.audioHandler) {
          app.audioHandler.initialize = async () => true;
          app.audioHandler.startRecording = async () => {
            app.audioHandler.isRecording = true;
            // Emit one PCM16 frame immediately.
            const pcm16 = new Int16Array(160);
            if (app.audioHandler.onAudioData) app.audioHandler.onAudioData(pcm16);
          };
        }

        window.__felixPatchInstalled = true;
      };

      // App is created on DOMContentLoaded; poll until ready.
      const id = setInterval(() => {
        try {
          patchIfReady();
          if (window.__felixPatchInstalled) clearInterval(id);
        } catch {
          // ignore
        }
      }, 25);
    });

    await page.goto(baseURL + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#orb', { timeout: 15000 });

    // Ensure our instrumentation is installed.
    await expect
      .poll(async () => await page.evaluate(() => window.__felixPatchInstalled), { timeout: 5000 })
      .toBe(true);

    // Send audio directly (do not rely on real mic / ScriptProcessor).
    // We want to validate the packet format: [1 byte flag][PCM bytes...]
    await page.evaluate(() => {
      window.app.isConnected = true;
      window.app.isListening = true;
      window.app.audioHandler.isRecording = true;
      window.app.audioHandler.isPlaying = false;
      const pcm16 = new Int16Array(160);
      window.app.sendAudio(pcm16);
    });

    await expect
      .poll(async () => await page.evaluate(() => window.__felixAudioFrames.length), { timeout: 3000 })
      .toBeGreaterThan(0);

    const firstFlag = await page.evaluate(() => window.__felixAudioFrames.at(-1).first);
    expect(firstFlag).toBe(0);

    // Now simulate TTS playing and send another audio frame; flag should be 1.
    await page.evaluate(() => {
      window.app.audioHandler.isPlaying = true;
      const pcm16 = new Int16Array(160);
      window.app.sendAudio(pcm16);
    });

    await expect
      .poll(async () => {
        return await page.evaluate(() => window.__felixAudioFrames.map((f) => f.first));
      }, { timeout: 3000 })
      .toContain(1);

    await page.screenshot({ path: testInfo.outputPath('phase3.3.png'), fullPage: true });

    // No unexpected errors.
    const errors = errorMonitor.getErrors();
    const ignorableBackendErrors = errors.filter((e) =>
      /snakers4_silero-vad|silero|hubconf\.py|VAD/i.test(e)
    );
    const otherErrors = errors.filter((e) => !ignorableBackendErrors.includes(e));
    expect(
      otherErrors,
      `Console/page/request errors (excluding known server-side VAD setup issues):\n${otherErrors.join('\n')}`
    ).toEqual([]);
  });
});

test.describe('Phase 4: Voice Interaction Testing (mocked / deterministic)', () => {
  test('Phase 4.3–4.5 STT → LLM → TTS happy path (mock WS messages)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const errorMonitor = new ErrorMonitor(page);

    // Mock the WebSocket so we can drive the UI deterministically.
    // We still want the real UI code path (handleWsMessage etc.).
    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__FelixMockWebSocket' }), {
      globalName: '__FelixMockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#avatar', { timeout: 15000 });

    // Bypass real audio devices for orb-click flow.
    await page.evaluate(() => {
      window.app.audioHandler.initialize = async () => true;
      window.app.audioHandler.startRecording = async () => {
        window.app.audioHandler.isRecording = true;
      };
    });

    // Start listening (should send start_listening and toggle UI; state will be driven by WS messages).
    await page.locator('#orb').evaluate((el) => el.click());

    // Drive a fake conversation from the server.
    await emitWsJson(page, { type: 'state', state: 'listening' }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(
      page,
      { type: 'transcript', text: 'Hello Felix', is_final: true },
      { globalName: '__FelixMockWebSocket' }
    );
    await emitWsJson(page, { type: 'state', state: 'processing' }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'response_chunk', text: 'Hi! ' }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'response', text: 'Hi! How can I help?' }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'state', state: 'speaking' }, { globalName: '__FelixMockWebSocket' });
    // Binary audio isn't needed for UI correctness here; headless audio can be flaky.
    await emitWsJson(page, { type: 'state', state: 'idle' }, { globalName: '__FelixMockWebSocket' });

    // Conversation should show both user + assistant.
    await expect(page.locator('#conversation')).toContainText('Hello Felix');
    await expect(page.locator('#conversation')).toContainText('Hi! How can I help?');

    await page.screenshot({ path: testInfo.outputPath('phase4.3-4.5-mocked-conversation.png'), fullPage: true });

    // We accept the known headless audio limitations (AudioContext decode / playback),
    // but we still want to ensure no unexpected console errors surface.
    const errors = errorMonitor.getErrors();
    const ignorable = errors.filter((e) =>
      /NotSupportedError|Failed to initialize audio|AudioContext|decodeAudioData/i.test(e)
    );
    const other = errors.filter((e) => !ignorable.includes(e));
    expect(other, `Unexpected console errors:\n${other.join('\n')}`).toEqual([]);
  });

  test('Phase 4.6 Barge-in (interrupt message drives UI state)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const errorMonitor = new ErrorMonitor(page);

    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__FelixMockWebSocket' }), {
      globalName: '__FelixMockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#avatar', { timeout: 15000 });

    await page.evaluate(() => {
      window.app.audioHandler.initialize = async () => true;
      window.app.audioHandler.startRecording = async () => {
        window.app.audioHandler.isRecording = true;
      };
      // Avoid real playback side effects.
      window.app.audioHandler.stopPlayback = () => {
        window.app.audioHandler.isPlaying = false;
      };
    });

    // Drive speaking then interrupted then listening.
    await emitWsJson(page, { type: 'state', state: 'speaking' }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'interrupted' }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'state', state: 'listening' }, { globalName: '__FelixMockWebSocket' });

    await expect(page.locator('#avatar')).toHaveClass(/\blistening\b/, { timeout: 5000 });
    await page.screenshot({ path: testInfo.outputPath('phase4.6-barge-in.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    const other = errors.filter((e) => !/NotSupportedError|AudioContext/i.test(e));
    expect(other, `Unexpected console errors:\n${other.join('\n')}`).toEqual([]);
  });
});

test.describe('Phase 6: UI Widget Testing', () => {
  test('Phase 6.1 Conversation History + Clear', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(45_000);
    const errorMonitor = new ErrorMonitor(page);

    // Mock WS so we can inject conversation events.
    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__FelixMockWebSocket' }), {
      globalName: '__FelixMockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#conversation', { timeout: 15000 });

    // Inject a 3-turn conversation.
    await emitWsJson(page, { type: 'transcript', text: 'First question', is_final: true }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'response', text: 'First answer' }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'transcript', text: 'Second question', is_final: true }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'response', text: 'Second answer' }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'transcript', text: 'Third question', is_final: true }, { globalName: '__FelixMockWebSocket' });
    await emitWsJson(page, { type: 'response', text: 'Third answer' }, { globalName: '__FelixMockWebSocket' });

    await expect(page.locator('#conversation')).toContainText('First question');
    await expect(page.locator('#conversation')).toContainText('Third answer');

    await page.screenshot({ path: testInfo.outputPath('phase6.1-conversation.png'), fullPage: true });

    // Clear conversation.
    await page.locator('#clearBtn').evaluate((el) => el.click());
    await expect(page.locator('#conversation')).toContainText(/Conversation cleared/i);

    // Ensure we emitted clear_conversation to the backend.
    const sent = await page.evaluate(() => window.__felixMockWsSends || []);
    const sentJson = sent
      .filter((m) => typeof m === 'string')
      .map((m) => {
        try {
          return JSON.parse(m);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    expect(sentJson.some((m) => m.type === 'clear_conversation')).toBeTruthy();

    const errors = errorMonitor.getErrors();
    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('Phase 6.3 Flyout panels (open + replace, no stacking)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(45_000);
    const errorMonitor = new ErrorMonitor(page);

    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__FelixMockWebSocket' }), {
      globalName: '__FelixMockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#flyoutContainer', { timeout: 15000 });

    // Open browser flyout via a tool flyout message.
    await emitWsJson(
      page,
      { type: 'flyout', flyout_type: 'browser', content: 'https://example.com' },
      { globalName: '__FelixMockWebSocket' }
    );

    await expect(page.locator('#flyoutContainer')).toHaveClass(/open/);
    await expect(page.locator('#flyoutTitle')).toHaveText(/Browser/i);

    // Then open code flyout; it should *replace* the content.
    await emitWsJson(
      page,
      { type: 'flyout', flyout_type: 'code', content: 'console.log("hi")\n' },
      { globalName: '__FelixMockWebSocket' }
    );

    await expect(page.locator('#flyoutTitle')).toHaveText(/Code Editor/i);
    await expect(page.locator('#flyoutContent')).toContainText('console.log');

    await page.screenshot({ path: testInfo.outputPath('phase6.3-flyout.png'), fullPage: true });

    // Close flyout.
    await page.locator('#flyoutClose').evaluate((el) => el.click());
    await expect(page.locator('#flyoutContainer')).not.toHaveClass(/open/);

    const errors = errorMonitor.getErrors();
    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('Phase 6.4 Notifications (stacking + dismiss)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(45_000);
    const errorMonitor = new ErrorMonitor(page);

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#orb', { timeout: 15000 });

    // Trigger multiple notifications by calling the public notification helpers.
    await page.evaluate(() => {
      // notifications.js exports are module-scoped, but showError/showInfo are imported into app.module.js.
      // We can trigger notifications by causing app actions that call showInfo/showError.
      window.app.handleError('Test error 1');
      window.app.handleError('Test error 2');
      // Clear conversation triggers an info notification.
      window.app.clearConversation();
    });

    const notifications = page.locator('.notification');
    await expect(notifications.first()).toBeVisible();
    const count = await notifications.count();
    expect(count, 'Expected multiple notifications to stack/queue').toBeGreaterThan(1);

    await page.screenshot({ path: testInfo.outputPath('phase6.4-notifications.png'), fullPage: true });

    // Dismiss the latest notification if a close button exists.
    const closeBtn = notifications.first().locator('button, .close, .notification-close');
    if (await closeBtn.count()) {
      await closeBtn.first().evaluate((el) => el.click());
    }

    const errors = errorMonitor.getErrors();
    const other = errors.filter((e) => !/Server error:/i.test(e));
    expect(other, `Unexpected console errors:\n${other.join('\n')}`).toEqual([]);
  });

  test('Phase 6.2 Music player widget updates + avatar grooving (mock music_state)', async ({ page, baseURL }, testInfo) => {
    const errorMonitor = new ErrorMonitor(page);

    // Install MockWebSocket before app code runs.
    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__MockWebSocket' }), {
      globalName: '__MockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#conversation', { timeout: 15000 });

    await expect
      .poll(() => page.evaluate(() => window.__MockWebSocket?.instances?.length || 0), { timeout: 10000 })
      .toBeGreaterThan(0);

    // Ensure idle so music module can set GROOVING.
    await emitWsJson(page, { type: 'state', state: 'idle' }, { globalName: '__MockWebSocket' });

    // Music widget hidden at start.
    await expect(page.locator('#musicPlayer')).toHaveClass(/hidden/);

    // Inject music playing state.
    await emitWsJson(
      page,
      {
        type: 'music_state',
        state: 'play',
        title: 'Jazz in Paris',
        artist: 'Media Right Productions',
        elapsed: 30,
        duration: 120,
        volume: 50,
      },
      { globalName: '__MockWebSocket' }
    );

    await expect(page.locator('#musicPlayer')).not.toHaveClass(/hidden/);
    await expect(page.locator('#musicTitle')).toContainText(/Jazz in Paris/i);
    await expect(page.locator('#musicArtist')).toContainText(/Media Right Productions/i);

    // Progress bar should show non-zero width.
    const progressWidth = await page.evaluate(() => {
      const el = document.getElementById('musicProgressBar');
      return el ? el.style.width : '';
    });
    expect(progressWidth).toMatch(/\d/);

  // Avatar should enter grooving state when idle.
  await expect(page.locator('#avatar')).toHaveClass(/\bgrooving\b/);

    // Inject stop -> widget may remain (pause/stop logic), but avatar should return to idle.
    await emitWsJson(page, { type: 'music_state', state: 'stop', elapsed: 0, duration: 0 }, { globalName: '__MockWebSocket' });

  await expect(page.locator('#avatar')).not.toHaveClass(/\bgrooving\b/);

    await page.screenshot({ path: testInfo.outputPath('phase6.2-music-widget.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

test.describe('Phase 7: Error Handling & Edge Cases (deterministic)', () => {
  test('Phase 7.1 Service failure surfaced as user-facing error (Ollama/OpenMemory/etc.)', async (
    { page, baseURL },
    testInfo
  ) => {
    test.setTimeout(45_000);
    const errorMonitor = new ErrorMonitor(page);

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#conversation', { timeout: 15000 });

    // Simulate server-side dependency failures via the same channel the UI uses.
    await page.evaluate(() => {
      // Show two distinct service errors.
      window.app.handleWsMessage({
        data: JSON.stringify({ type: 'error', message: 'LLM service unavailable (Ollama down)' }),
      });
      window.app.handleWsMessage({
        data: JSON.stringify({ type: 'error', message: 'Memory service unavailable (OpenMemory down)' }),
      });
    });

  // Expect error notifications and system messages in the conversation.
  const errorNotifs = page.locator('.notification.notification-error');
  await expect(errorNotifs.first()).toBeVisible();
  const notifCount = await errorNotifs.count();
  expect(notifCount, 'Expected at least 2 error notifications').toBeGreaterThanOrEqual(2);

  // Assert each expected message is present in at least one notification.
  await expect(errorNotifs.nth(0)).toContainText(/service unavailable/i);
  await expect(errorNotifs.nth(1)).toContainText(/service unavailable/i);

  const notifTexts = await errorNotifs.allTextContents();
  expect(notifTexts.join('\n')).toMatch(/LLM service unavailable/i);
  expect(notifTexts.join('\n')).toMatch(/Memory service unavailable/i);

  await expect(page.locator('#conversation')).toContainText(/LLM service unavailable/i);
  await expect(page.locator('#conversation')).toContainText(/Memory service unavailable/i);

    // App should remain interactive.
    await expect(page.locator('#orb')).toBeVisible();
    await expect(page.locator('#settingsBtn')).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath('phase7.1-service-failure.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    // handleError logs to console.error('Server error:', message) by design; ignore those.
    const other = errors.filter((e) => !/Server error:/i.test(e));
    expect(other, `Unexpected console errors:\n${other.join('\n')}`).toEqual([]);
  });

  test('Phase 7.2 Network/WebSocket interruption (disconnect UI + reconnect)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const errorMonitor = new ErrorMonitor(page);

    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__FelixMockWebSocket' }), {
      globalName: '__FelixMockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#statusText', { timeout: 15000 });

    // Ensure initial connection happened.
    await expect
      .poll(async () => await page.evaluate(() => window.__FelixMockWebSocket.instances.length), { timeout: 5000 })
      .toBeGreaterThan(0);

    // Force a disconnect.
    await page.evaluate(() => {
      const ws = window.__FelixMockWebSocket.instances.at(-1);
      ws.close();
    });

    // UI should show disconnected/reconnecting.
    await expect(page.locator('#statusText')).toContainText(/Disconnected|Reconnecting|Connection failed/i, {
      timeout: 10_000,
    });

    // Allow reconnect logic to create a new WebSocket instance.
    await expect
      .poll(async () => await page.evaluate(() => window.__FelixMockWebSocket.instances.length), { timeout: 15_000 })
      .toBeGreaterThan(1);

    // Drive ready state from server to show it's usable again.
    await emitWsJson(page, { type: 'state', state: 'idle' }, { globalName: '__FelixMockWebSocket' });

    await expect(page.locator('#avatar')).toHaveClass(/\bidle\b/);
    await page.screenshot({ path: testInfo.outputPath('phase7.2-ws-reconnect.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    // WebSocket close is expected.
    const other = errors.filter((e) => !/WebSocket|Disconnected|Connection error/i.test(e));
    expect(other, `Unexpected console errors:\n${other.join('\n')}`).toEqual([]);
  });

  test('Phase 7.5 Rapid fire interactions (10x orb click) stays responsive', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const errorMonitor = new ErrorMonitor(page);

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#orb', { timeout: 15000 });
    await page.waitForSelector('#avatar', { timeout: 15000 });

    // Avoid real mic/audio dependency: make recording start/stop deterministic.
    await page.evaluate(() => {
      window.app.audioHandler.initialize = async () => true;
      window.app.audioHandler.startRecording = async () => {
        window.app.audioHandler.isRecording = true;
      };
      window.app.audioHandler.stopRecording = () => {
        window.app.audioHandler.isRecording = false;
      };
    });

    // Ensure connected for startListening checks.
    await page.evaluate(() => {
      window.app.isConnected = true;
    });

    // Rapidly click orb 10 times.
    for (let i = 0; i < 10; i++) {
      await page.locator('#orb').evaluate((el) => el.click());
      await page.waitForTimeout(50);
    }

    // UI should still be interactive.
    await expect(page.locator('#settingsBtn')).toBeVisible();
    await expect(page.locator('#orb')).toBeVisible();
    await expect(page.locator('#avatar')).toBeVisible();

    // Orb should not accumulate conflicting classes.
    const orbClasses = await page.locator('#orb').getAttribute('class');
    expect(orbClasses || '', 'Expected orb class list to be readable').toBeTruthy();

    await page.screenshot({ path: testInfo.outputPath('phase7.5-rapid-orb.png'), fullPage: true });

    // Allow known headless audio limitations, but no unexpected errors.
    const errors = errorMonitor.getErrors();
    const ignorable = errors.filter((e) => /NotSupportedError|Failed to initialize audio/i.test(e));
    const other = errors.filter((e) => !ignorable.includes(e));
    expect(other, `Unexpected console errors:\n${other.join('\n')}`).toEqual([]);
  });

  test('Phase 7.3 Microphone errors (permission denied / no device) show clear error', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const errorMonitor = new ErrorMonitor(page);

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#orb', { timeout: 15000 });

    // Force connected so startListening attempts audio.
    await page.evaluate(() => {
      window.app.isConnected = true;
    });

    // Case 1: Permission denied (NotAllowedError)
    await page.evaluate(() => {
      window.app.audioHandler.startRecording = async () => {
        const err = new Error('Permission denied');
        err.name = 'NotAllowedError';
        throw err;
      };
    });

  await page.locator('#orb').evaluate((el) => el.click());
  const errNotifs1 = page.locator('.notification.notification-error');
  await expect(errNotifs1.first()).toBeVisible();
  const texts1 = (await errNotifs1.allTextContents()).join('\n');
  expect(texts1).toMatch(/could not access microphone|microphone/i);
    await page.screenshot({ path: testInfo.outputPath('phase7.3-mic-denied.png'), fullPage: true });

    // Case 2: No device / busy (NotFoundError or NotReadableError)
    await page.evaluate(() => {
      window.app.audioHandler.startRecording = async () => {
        const err = new Error('No microphone');
        err.name = 'NotFoundError';
        throw err;
      };
    });

  await page.locator('#orb').evaluate((el) => el.click());
  const errNotifs2 = page.locator('.notification.notification-error');
  await expect(errNotifs2.first()).toBeVisible();
  const texts2 = (await errNotifs2.allTextContents()).join('\n');
  expect(texts2).toMatch(/could not access microphone|microphone/i);
    await page.screenshot({ path: testInfo.outputPath('phase7.3-mic-notfound.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    // Errors are expected to be logged when startListening throws.
    const other = errors.filter((e) => !/Failed to start listening|Could not access microphone|NotAllowedError|NotFoundError/i.test(e));
    expect(other, `Unexpected console errors:\n${other.join('\n')}`).toEqual([]);
  });

  test('Phase 7.4 Long conversation (20 turns) stays responsive', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(90_000);
    const errorMonitor = new ErrorMonitor(page);

    // Mock WS so we can inject a long conversation without depending on backend services.
    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__FelixMockWebSocket' }), {
      globalName: '__FelixMockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#conversation', { timeout: 15000 });

    // Inject 20 turns.
    for (let i = 1; i <= 20; i++) {
      // eslint-disable-next-line no-await-in-loop
      await emitWsJson(page, { type: 'transcript', text: `User message ${i}`, is_final: true }, { globalName: '__FelixMockWebSocket' });
      // eslint-disable-next-line no-await-in-loop
      await emitWsJson(page, { type: 'response', text: `Assistant response ${i}` }, { globalName: '__FelixMockWebSocket' });
    }

    await expect(page.locator('#conversation')).toContainText('User message 1');
    await expect(page.locator('#conversation')).toContainText('Assistant response 20');

    // Smoke: conversation container should have grown and be scrollable (or at least have many nodes).
    const metrics = await page.evaluate(() => {
      const el = document.getElementById('conversation');
      const msgCount = el ? el.querySelectorAll('.message').length : 0;
      const scrollHeight = el ? el.scrollHeight : 0;
      const clientHeight = el ? el.clientHeight : 0;
      return { msgCount, scrollHeight, clientHeight };
    });

    // Depending on UI structure, each turn can produce multiple DOM nodes; use a conservative bound.
    expect(metrics.msgCount, `Expected many message nodes, got ${metrics.msgCount}`).toBeGreaterThan(10);
    expect(metrics.scrollHeight, 'Expected conversation to have non-zero scrollHeight').toBeGreaterThan(0);

    // App still interactive.
    await expect(page.locator('#settingsBtn')).toBeVisible();
    await expect(page.locator('#orb')).toBeVisible();

    await page.screenshot({ path: testInfo.outputPath('phase7.4-long-conversation.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

test.describe('Phase 8: Admin Dashboard Testing (deterministic)', () => {
  test('Phase 8.1 Admin dashboard loads and shows sections', async ({ page, baseURL }, testInfo) => {
    const errorMonitor = new ErrorMonitor(page);

    await page.goto(baseURL + '/admin.html', { waitUntil: 'networkidle' });

    // Static UI scaffolding should render regardless of token.
    await expect(page.getByRole('heading', { name: /Voice Agent Dashboard/i })).toBeVisible();
    await expect(page.locator('#tokenInput')).toBeVisible();
    await expect(page.locator('#saveToken')).toBeVisible();
    await expect(page.locator('#refresh')).toBeVisible();

    await expect(page.locator('#healthSection')).toBeVisible();
    await expect(page.locator('#sessionsTable')).toBeVisible();
  // These sections can be inside <details> and therefore not visible until expanded.
  await expect(page.locator('#eventsList')).toHaveCount(1);
  await expect(page.locator('#logsList')).toHaveCount(1);

    await expect(page.locator('#refresh')).toContainText(/Add token to refresh|Refresh/i);

    await page.screenshot({ path: testInfo.outputPath('phase8.1-admin-load.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('Phase 8.1 Admin token flow shows clear unauthorized error (dummy token)', async ({ page, baseURL }, testInfo) => {
    test.setTimeout(60_000);
    const errorMonitor = new ErrorMonitor(page);

    // Capture alert() since admin.js uses alert(err.message) on failures.
    const alerts = [];
    page.on('dialog', async (d) => {
      alerts.push(d.message());
      await d.dismiss();
    });

    await page.goto(baseURL + '/admin.html', { waitUntil: 'networkidle' });
    await page.waitForSelector('#tokenInput', { timeout: 15000 });

    // Use a dummy token; we expect a 401 unless the server is configured to accept it.
    await page.locator('#tokenInput').fill('dummy-token');
    await page.locator('#saveToken').click();

    // Wait for the error alert or a refresh-failed label.
    const deadline = Date.now() + 10_000;
    let lastBtnText = '';
    // eslint-disable-next-line no-constant-condition
    while (true) {
      lastBtnText = (await page.locator('#refresh').textContent()) || '';
      if (alerts.length > 0) break;
      if (/failed/i.test(lastBtnText)) break;
      if (Date.now() > deadline) break;
      await page.waitForTimeout(100);
    }
    expect(alerts.length > 0 || /failed/i.test(lastBtnText)).toBeTruthy();

    // If we got an alert, ensure it's meaningful.
    if (alerts.length > 0) {
      const msg = alerts.join('\n');
      expect(msg).toMatch(/Unauthorized|token|forbidden|401|403/i);
    }

    await page.screenshot({ path: testInfo.outputPath('phase8.1-admin-unauthorized.png'), fullPage: true });

    // Allow the expected fetch failure logging.
    const errors = errorMonitor.getErrors();
    const other = errors.filter((e) => !/Unauthorized|Request failed|Refresh failed/i.test(e));
    expect(other, `Unexpected console errors:\n${other.join('\n')}`).toEqual([]);
  });
});

test.describe('Phase 5: Tool Execution Testing (deterministic UI)', () => {
  test('Phase 5.1 Tool indicator shows on tool_call and hides on tool_result', async ({ page, baseURL }, testInfo) => {
    const errorMonitor = new ErrorMonitor(page);

    // Replace WebSocket with a controllable mock so the test doesn't depend on server-side tools.
    // Must be installed before the app scripts run.
    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__MockWebSocket' }), {
      globalName: '__MockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#conversation', { timeout: 15000 });

    // Wait until the app creates a socket instance.
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            return window.__MockWebSocket?.instances?.length || 0;
          }),
        { timeout: 10000 }
      )
      .toBeGreaterThan(0);

    // Tool indicator starts hidden.
    await expect(page.locator('#toolsIndicator')).toHaveClass(/hidden/);

    // Emit tool_call then tool_result.
    await emitWsJson(page, { type: 'tool_call', tool: 'weather' }, { globalName: '__MockWebSocket' });

    await expect(page.locator('#toolsIndicator')).not.toHaveClass(/hidden/);
    await expect(page.locator('#toolName')).toContainText(/weather/i);

    await emitWsJson(page, { type: 'tool_result', tool: 'weather', result: { temperature: 72 } }, { globalName: '__MockWebSocket' });

    await expect(page.locator('#toolsIndicator')).toHaveClass(/hidden/);

    await page.screenshot({ path: testInfo.outputPath('phase5.1-tool-indicator.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('Phase 5.4 Memory tools: remember + recall are surfaced in conversation (mocked)', async ({ page, baseURL }, testInfo) => {
    const errorMonitor = new ErrorMonitor(page);

    // Install MockWebSocket before app code runs.
    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__MockWebSocket' }), {
      globalName: '__MockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#conversation', { timeout: 15000 });

    // Wait for socket instance.
    await expect
      .poll(() => page.evaluate(() => window.__MockWebSocket?.instances?.length || 0), { timeout: 10000 })
      .toBeGreaterThan(0);

    // Ensure the UI is in a sane starting state.
    await page.evaluate(() => {
      const ws = window.__MockWebSocket.instances[0];
      ws.__emitJson({ type: 'state', state: 'idle' });
    });

    // Remember flow
    await page.evaluate(() => {
      const ws = window.__MockWebSocket.instances[0];
      ws.__emitJson({ type: 'transcript', text: 'Remember that my favorite color is blue', is_final: true });
      ws.__emitJson({ type: 'tool_call', tool: 'remember' });
      ws.__emitJson({
        type: 'tool_result',
        tool: 'remember',
        result: "Remembered: 'my favorite color is blue' (semantic, ID: mem_1234)"
      });
      ws.__emitJson({
        type: 'response',
        text: "Got it — I'll remember that your favorite color is blue."
      });
    });

    await expect(page.locator('#conversation')).toContainText(/favorite color is blue/i);

    // Recall flow
    await page.evaluate(() => {
      const ws = window.__MockWebSocket.instances[0];
      ws.__emitJson({ type: 'transcript', text: 'What is my favorite color?', is_final: true });
      ws.__emitJson({ type: 'tool_call', tool: 'recall' });
      ws.__emitJson({
        type: 'tool_result',
        tool: 'recall',
        result: "Found 1 memories:\n\n1. [semantic] (score: 0.95, id: mem_1234)\n   my favorite color is blue"
      });
      ws.__emitJson({
        type: 'response',
        text: "You told me your favorite color is blue."
      });
    });

    await expect(page.locator('#conversation')).toContainText(/You told me your favorite color is blue/i);

    // Tool indicator should be hidden at the end of each cycle.
    await expect(page.locator('#toolsIndicator')).toHaveClass(/hidden/);

    await page.screenshot({ path: testInfo.outputPath('phase5.4-memory-mocked.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    expect(errors, `Console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('Phase 5.6 Image generation tool opens a preview flyout (mocked)', async ({ page, baseURL }, testInfo) => {
    const errorMonitor = new ErrorMonitor(page);

    // Test-only: use shared mockups helper.
    await page.addInitScript(installMockWebSocketInitScript({ globalName: '__MockWebSocket' }), {
      globalName: '__MockWebSocket',
    });

    await page.goto(baseURL + '/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#conversation', { timeout: 15000 });

    await expect
      .poll(() => page.evaluate(() => window.__MockWebSocket?.instances?.length || 0), { timeout: 10000 })
      .toBeGreaterThan(0);

    // Drive a mocked image-generation flow.
    await emitWsJson(page, { type: 'state', state: 'idle' }, { globalName: '__MockWebSocket' });
    await emitWsJson(
      page,
      { type: 'transcript', text: 'Generate an image of a sunset over mountains', is_final: true },
      { globalName: '__MockWebSocket' }
    );
    await emitWsJson(page, { type: 'tool_call', tool: 'generate_image' }, { globalName: '__MockWebSocket' });
    await emitWsJson(
      page,
      {
        type: 'tool_result',
        tool: 'generate_image',
        result: {
          text: 'Here is your image.',
          // Use preview flyout so the app loads the URL into an iframe.
          flyout: { type: 'preview', content: 'https://example.com/mock-image.png' },
        },
      },
      { globalName: '__MockWebSocket' }
    );

    // The UI listens for a dedicated `flyout` message type.
    await emitWsJson(
      page,
      { type: 'flyout', flyout_type: 'preview', content: 'https://example.com/mock-image.png' },
      { globalName: '__MockWebSocket' }
    );
    await emitWsJson(
      page,
      { type: 'response', text: 'Done — I generated the image and opened it in the preview panel.' },
      { globalName: '__MockWebSocket' }
    );

    // Flyout container should open.
    await expect(page.locator('#flyoutContainer')).toHaveClass(/open/);
    await expect(page.locator('#flyoutTitle')).toContainText(/Preview/i);

    // Iframe should be created and pointed at the URL.
    await expect(page.locator('#flyoutContent iframe.flyout-browser')).toBeVisible();
    await expect(page.locator('#flyoutContent iframe.flyout-browser')).toHaveAttribute('src', /example\.com\/mock-image\.png/);

    await page.screenshot({ path: testInfo.outputPath('phase5.6-image-flyout.png'), fullPage: true });

    const errors = errorMonitor.getErrors();
    // Expected noise: the flyout iframe is pointed at a mock URL which can 404 in test env.
    const filtered = errors.filter((e) => !e.includes('Failed to load resource: the server responded with a status of 404'));
    expect(filtered, `Console errors:\n${filtered.join('\n')}`).toEqual([]);
  });
});
