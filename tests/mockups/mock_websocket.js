// Test-only WebSocket mock helpers.
//
// IMPORTANT:
// - This is intentionally under `tests/mockups/` so no mock code is mistaken as production.
// - These helpers are meant to be injected with Playwright's `page.addInitScript()`.

/**
 * Installs a controllable `window.WebSocket` mock into the page.
 *
 * Contract:
 * - Captures created sockets in `window[globalName].instances`
 * - Each instance supports `.send(data)` (records outbound messages)
 * - Each instance supports `.emitMessage(payload)` where payload can be:
 *   - A JS object => will be JSON.stringified
 *   - A string
 *   - An ArrayBuffer / Uint8Array
 * - Each instance supports `.close()`
 */
export function installMockWebSocketInitScript({ globalName = '__FelixMockWebSocket' } = {}) {
  return ({ globalName: gn = globalName } = {}) => {
    if (window[gn]) return;

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      static instances = [];

      constructor(url) {
        this.url = url;
        this.readyState = MockWebSocket.OPEN;
        this.sent = [];

        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;

        MockWebSocket.instances.push(this);

        queueMicrotask(() => {
          try {
            this.onopen?.({ type: 'open' });
          } catch {}
        });
      }

      send(data) {
        this.sent.push(data);
        // Back-compat for existing tests that assert outbound messages.
        window.__felixMockWsSends = window.__felixMockWsSends || [];
        window.__felixMockWsSends.push(data);
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        try {
          this.onclose?.({ type: 'close' });
        } catch {}
      }

      emitMessage(payload) {
        let data = payload;
        if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && !(data instanceof Uint8Array)) {
          data = JSON.stringify(data);
        }

        const evt = { data };
        try {
          this.onmessage?.(evt);
        } catch {}
      }

      // Back-compat for older tests.
      __emitJson(obj) {
        this.emitMessage(obj);
      }
    }

    window.WebSocket = MockWebSocket;
    window[gn] = MockWebSocket;
  };
}

/**
 * Emits a JSON message on the most recent WS instance.
 */
export async function emitWsJson(page, msg, { globalName = '__FelixMockWebSocket', index = -1 } = {}) {
  await page.evaluate(
    ({ globalName, index, msg }) => {
      const MockWS = window[globalName];
      if (!MockWS?.instances?.length) throw new Error('No mock WebSocket instances available');
      const i = index < 0 ? MockWS.instances.length + index : index;
      const ws = MockWS.instances[i];
      if (!ws) throw new Error('Mock WebSocket instance not found');
      ws.emitMessage(msg);
    },
    { globalName, index, msg }
  );
}

/**
 * Waits until at least one WS instance exists.
 */
export async function waitForWsInstance(page, { globalName = '__FelixMockWebSocket', timeoutMs = 10_000 } = {}) {
  await page.waitForFunction(
    ({ globalName }) => (window[globalName]?.instances?.length || 0) > 0,
    { timeout: timeoutMs, arg: { globalName } }
  );
}
