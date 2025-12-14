"""
Lightweight local persistence for per-user settings and chat history.
Stores plain JSON files under data/users/<user_id>/.
Intended for single-machine installs; no external database required.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..config import settings


def _user_dir(user_id: str, base_dir: Optional[Path] = None) -> Path:
    """Return directory for a given user's persisted data."""
    root = Path(base_dir) if base_dir else Path(settings.data_dir)
    return root.resolve() / "users" / user_id


def settings_path(user_id: str, base_dir: Optional[Path] = None) -> Path:
    return _user_dir(user_id, base_dir) / "settings.json"


def history_path(user_id: str, base_dir: Optional[Path] = None) -> Path:
    return _user_dir(user_id, base_dir) / "history.json"


def load_json(path: Path) -> Any:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.flush()
    tmp.replace(path)


# ---------- Settings ----------


def load_user_settings(user_id: str, base_dir: Optional[Path] = None) -> Dict[str, Any]:
    data = load_json(settings_path(user_id, base_dir))
    return data if isinstance(data, dict) else {}


def save_user_settings(user_id: str, settings_data: Dict[str, Any], base_dir: Optional[Path] = None) -> None:
    atomic_write_json(settings_path(user_id, base_dir), settings_data)


# ---------- Chat history ----------


def load_history(user_id: str, base_dir: Optional[Path] = None) -> List[Dict[str, Any]]:
    data = load_json(history_path(user_id, base_dir))
    return data if isinstance(data, list) else []


def save_history(user_id: str, messages: List[Dict[str, Any]], base_dir: Optional[Path] = None) -> None:
    atomic_write_json(history_path(user_id, base_dir), messages)
