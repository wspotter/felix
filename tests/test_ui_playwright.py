import os
import pytest

E2E_ENABLED = os.getenv("E2E_UI") == "1"
BASE_URL = os.getenv("FELIX_BASE_URL", "http://localhost:8000")

if E2E_ENABLED:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout
else:
    pytest.skip("E2E_UI not enabled", allow_module_level=True)


@pytest.mark.skipif(not E2E_ENABLED, reason="Set E2E_UI=1 to run Playwright UI tests against a running server")
def test_settings_persist_across_reload():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL, wait_until="networkidle")

        page.click("#settingsBtn")
        page.wait_for_selector(".modal.visible")

        page.select_option("#voiceSelect", "lessac")
        page.select_option("#backendSelect", "openrouter")
        page.fill("#openrouterUrl", "https://openrouter.ai/api/v1")
        page.fill("#openrouterApiKeyInput", "sk-test-key")

        auto_listen = page.locator("#autoListen")
        if not auto_listen.is_checked():
            auto_listen.check()
        show_timestamps = page.locator("#showTimestamps")
        if not show_timestamps.is_checked():
            show_timestamps.check()

        page.click("#saveSettings")
        page.wait_for_selector(".modal.visible", state="hidden")

        page.reload(wait_until="networkidle")
        page.click("#settingsBtn")
        page.wait_for_selector(".modal.visible")

        assert page.input_value("#voiceSelect") == "lessac"
        assert page.input_value("#backendSelect") == "openrouter"
        assert page.input_value("#openrouterUrl") == "https://openrouter.ai/api/v1"
        assert page.locator("#autoListen").is_checked()
        assert page.locator("#showTimestamps").is_checked()

        browser.close()


@pytest.mark.skipif(not E2E_ENABLED, reason="Set E2E_UI=1 to run Playwright UI tests against a running server")
def test_chat_renders_user_message():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE_URL, wait_until="networkidle")

        page.fill("#textInput", "hi from playwright")
        page.click("#sendBtn")

        try:
            page.wait_for_selector("#conversation :text('hi from playwright')", timeout=5000)
        except PlaywrightTimeout:
            browser.close()
            raise AssertionError("User message did not render in conversation")

        browser.close()
