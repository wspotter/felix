export class ErrorMonitor {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.errors = [];
    this.warnings = [];

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') this.errors.push(text);
      if (type === 'warning') this.warnings.push(text);
    });

    page.on('pageerror', (err) => {
      this.errors.push(`pageerror: ${err?.message || String(err)}`);
    });

    page.on('requestfailed', (req) => {
      const failure = req.failure();
      this.errors.push(`requestfailed: ${req.method()} ${req.url()} :: ${failure?.errorText || 'unknown error'}`);
    });
  }

  clear() {
    this.errors = [];
    this.warnings = [];
  }

  getErrors() {
    return this.errors;
  }

  getWarnings() {
    return this.warnings;
  }
}
