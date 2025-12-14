import json
from pathlib import Path

from server.storage.local_persistence import (
    load_user_settings,
    save_user_settings,
    load_history,
    save_history,
)


def test_settings_roundtrip(tmp_path: Path):
    user = "testuser"
    data = {"voice": "amy", "model": "llama3.2", "llmBackend": "ollama"}
    save_user_settings(user, data, base_dir=tmp_path)
    loaded = load_user_settings(user, base_dir=tmp_path)
    assert loaded == data
    # Ensure file written as JSON
    contents = json.loads((tmp_path / "users" / user / "settings.json").read_text())
    assert contents["voice"] == "amy"


def test_history_roundtrip(tmp_path: Path):
    user = "testuser"
    msgs = [
        {"role": "user", "content": "hi"},
        {"role": "assistant", "content": "hello"},
    ]
    save_history(user, msgs, base_dir=tmp_path)
    loaded = load_history(user, base_dir=tmp_path)
    assert loaded == msgs
    path = tmp_path / "users" / user / "history.json"
    assert path.exists()
