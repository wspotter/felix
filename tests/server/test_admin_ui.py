"""
Basic E2E checks for the admin UI endpoints and static assets.
"""
from fastapi.testclient import TestClient
from server.main import app
from server.config import settings
from server.auth import get_auth_manager


def test_admin_static_files_available():
    client = TestClient(app)

    r = client.get('/admin.html')
    assert r.status_code == 200
    assert '<title>Voice Agent Admin</title>' in r.text

    r2 = client.get('/static/admin.js')
    assert r2.status_code == 200
    assert 'admin' in r2.text.lower()

    r3 = client.get('/sw.js')
    assert r3.status_code == 200

    r4 = client.get('/manifest.json')
    assert r4.status_code == 200
    assert 'name' in r4.json()


def test_admin_endpoint_requires_auth_when_disabled(monkeypatch):
    # Admin token mode (multi-user disabled)
    monkeypatch.setattr(settings, 'enable_auth', False)
    monkeypatch.setattr(settings, 'admin_token', 'env-token')

    client = TestClient(app)
    r = client.get('/api/admin/health')
    # No token - should be unauthorized
    assert r.status_code == 401

    # With the admin token - should succeed
    r2 = client.get('/api/admin/health', headers={'X-Admin-Token': 'env-token'})
    assert r2.status_code == 200


def test_admin_ui_loads_for_logged_in_user(monkeypatch):
    # Ensure multi-user auth enabled and token present
    monkeypatch.setattr(settings, 'enable_auth', True)
    auth_manager = get_auth_manager()
    token, msg = auth_manager.login('admin', 'felix2024')
    assert token

    client = TestClient(app)
    r = client.get('/admin.html', headers={'Authorization': f'Bearer {token}'})
    assert r.status_code == 200
