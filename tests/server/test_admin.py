"""
Tests for the admin endpoints and require_admin header handling.
"""
from fastapi.testclient import TestClient
from server.main import app
from server.config import settings
from server.auth import get_auth_manager


def test_admin_health_with_auth_token(monkeypatch):
    # Enable multi-user auth
    monkeypatch.setattr(settings, 'enable_auth', True)

    auth_manager = get_auth_manager()
    token, msg = auth_manager.login('admin', 'felix2024')
    assert token is not None

    client = TestClient(app)

    # Use Authorization: Bearer token header
    r = client.get('/api/admin/health', headers={'Authorization': f'Bearer {token}'})
    assert r.status_code == 200
    data = r.json()
    assert 'status' in data and data['status'] == 'ok'

    # Use X-Admin-Token header
    r2 = client.get('/api/admin/health', headers={'X-Admin-Token': token})
    assert r2.status_code == 200


def test_admin_health_with_admin_token_env(monkeypatch):
    # Disable multi-user auth and set admin token in env
    monkeypatch.setattr(settings, 'enable_auth', False)
    monkeypatch.setattr(settings, 'admin_token', 'super-secret-token')

    client = TestClient(app)

    r = client.get('/api/admin/health', headers={'X-Admin-Token': 'super-secret-token'})
    assert r.status_code == 200

    # Wrong token should fail
    r2 = client.get('/api/admin/health', headers={'X-Admin-Token': 'wrong'})
    assert r2.status_code == 401
