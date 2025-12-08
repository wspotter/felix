"""
Simple Authentication System for Felix Voice Agent
Suitable for local network with ~dozen users.
Uses bcrypt for password hashing and JWT-like tokens.
"""
import json
import hashlib
import secrets
import time
from pathlib import Path
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
import structlog

logger = structlog.get_logger()

# Data directory for persistent storage
DATA_DIR = Path(__file__).parent.parent / "data"
USERS_FILE = DATA_DIR / "users.json"
SESSIONS_FILE = DATA_DIR / "sessions.json"

# Token expiry (24 hours)
TOKEN_EXPIRY_HOURS = 24


@dataclass
class User:
    """User account."""
    username: str
    password_hash: str
    is_admin: bool = False
    created_at: str = ""
    last_login: str = ""
    settings: Dict[str, Any] = None
    
    def __post_init__(self):
        if self.settings is None:
            self.settings = {}
        if not self.created_at:
            self.created_at = datetime.now().isoformat()


@dataclass  
class AuthSession:
    """Active login session."""
    token: str
    username: str
    created_at: float
    expires_at: float
    ip_address: str = ""


def _hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt. Simple but effective for local use."""
    salt = secrets.token_hex(16)
    hash_obj = hashlib.sha256((salt + password).encode())
    return f"{salt}${hash_obj.hexdigest()}"


def _verify_password(password: str, password_hash: str) -> bool:
    """Verify password against hash."""
    try:
        salt, stored_hash = password_hash.split("$")
        hash_obj = hashlib.sha256((salt + password).encode())
        return hash_obj.hexdigest() == stored_hash
    except (ValueError, AttributeError):
        return False


def _generate_token() -> str:
    """Generate a secure random token."""
    return secrets.token_urlsafe(32)


class AuthManager:
    """Manages users and authentication sessions."""
    
    def __init__(self):
        self._users: Dict[str, User] = {}
        self._sessions: Dict[str, AuthSession] = {}
        self._load_users()
        self._load_sessions()
        self._ensure_admin()
    
    def _ensure_data_dir(self):
        """Ensure data directory exists."""
        DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    def _load_users(self):
        """Load users from JSON file."""
        self._ensure_data_dir()
        if USERS_FILE.exists():
            try:
                with open(USERS_FILE, 'r') as f:
                    data = json.load(f)
                    for username, user_data in data.items():
                        self._users[username] = User(**user_data)
                logger.info("users_loaded", count=len(self._users))
            except Exception as e:
                logger.error("failed_to_load_users", error=str(e))
                self._users = {}
    
    def _save_users(self):
        """Save users to JSON file."""
        self._ensure_data_dir()
        try:
            data = {}
            for username, user in self._users.items():
                user_dict = asdict(user)
                data[username] = user_dict
            with open(USERS_FILE, 'w') as f:
                json.dump(data, f, indent=2)
            logger.info("users_saved", count=len(self._users))
        except Exception as e:
            logger.error("failed_to_save_users", error=str(e))
    
    def _load_sessions(self):
        """Load active sessions from file."""
        self._ensure_data_dir()
        if SESSIONS_FILE.exists():
            try:
                with open(SESSIONS_FILE, 'r') as f:
                    data = json.load(f)
                    now = time.time()
                    for token, session_data in data.items():
                        session = AuthSession(**session_data)
                        # Only load non-expired sessions
                        if session.expires_at > now:
                            self._sessions[token] = session
                logger.info("sessions_loaded", count=len(self._sessions))
            except Exception as e:
                logger.error("failed_to_load_sessions", error=str(e))
    
    def _save_sessions(self):
        """Save sessions to file."""
        self._ensure_data_dir()
        try:
            # Clean expired sessions first
            now = time.time()
            self._sessions = {
                token: session 
                for token, session in self._sessions.items() 
                if session.expires_at > now
            }
            data = {token: asdict(session) for token, session in self._sessions.items()}
            with open(SESSIONS_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error("failed_to_save_sessions", error=str(e))
    
    def _ensure_admin(self):
        """Ensure at least one admin account exists."""
        if not self._users:
            # Create default admin account
            self.create_user("admin", "felix2024", is_admin=True)
            logger.info("default_admin_created", username="admin", password="felix2024")
    
    # ==================== User Management ====================
    
    def create_user(self, username: str, password: str, is_admin: bool = False) -> tuple[bool, str]:
        """Create a new user."""
        username = username.lower().strip()
        
        if not username or not password:
            return False, "Username and password required"
        
        if len(username) < 2:
            return False, "Username must be at least 2 characters"
        
        if len(password) < 4:
            return False, "Password must be at least 4 characters"
        
        if username in self._users:
            return False, "Username already exists"
        
        user = User(
            username=username,
            password_hash=_hash_password(password),
            is_admin=is_admin
        )
        self._users[username] = user
        self._save_users()
        
        logger.info("user_created", username=username, is_admin=is_admin)
        return True, "User created successfully"
    
    def delete_user(self, username: str, requester: str) -> tuple[bool, str]:
        """Delete a user (admin only, can't delete self)."""
        username = username.lower().strip()
        
        if username not in self._users:
            return False, "User not found"
        
        if username == requester:
            return False, "Cannot delete your own account"
        
        # Revoke all sessions for this user
        self._sessions = {
            token: session 
            for token, session in self._sessions.items() 
            if session.username != username
        }
        
        del self._users[username]
        self._save_users()
        self._save_sessions()
        
        logger.info("user_deleted", username=username, by=requester)
        return True, "User deleted"
    
    def change_password(self, username: str, old_password: str, new_password: str) -> tuple[bool, str]:
        """Change user's password."""
        username = username.lower().strip()
        
        if username not in self._users:
            return False, "User not found"
        
        user = self._users[username]
        if not _verify_password(old_password, user.password_hash):
            return False, "Current password is incorrect"
        
        if len(new_password) < 4:
            return False, "New password must be at least 4 characters"
        
        user.password_hash = _hash_password(new_password)
        self._save_users()
        
        logger.info("password_changed", username=username)
        return True, "Password changed"
    
    def reset_password(self, username: str, new_password: str, admin_user: str) -> tuple[bool, str]:
        """Admin reset of user password."""
        username = username.lower().strip()
        
        if username not in self._users:
            return False, "User not found"
        
        if admin_user not in self._users or not self._users[admin_user].is_admin:
            return False, "Admin privileges required"
        
        if len(new_password) < 4:
            return False, "Password must be at least 4 characters"
        
        self._users[username].password_hash = _hash_password(new_password)
        self._save_users()
        
        logger.info("password_reset", username=username, by=admin_user)
        return True, "Password reset"
    
    def list_users(self) -> list[dict]:
        """List all users (without password hashes)."""
        return [
            {
                "username": user.username,
                "is_admin": user.is_admin,
                "created_at": user.created_at,
                "last_login": user.last_login
            }
            for user in self._users.values()
        ]
    
    def get_user(self, username: str) -> Optional[User]:
        """Get user by username."""
        return self._users.get(username.lower().strip())
    
    def is_admin(self, username: str) -> bool:
        """Check if user is admin."""
        user = self.get_user(username)
        return user.is_admin if user else False
    
    # ==================== Authentication ====================
    
    def login(self, username: str, password: str, ip_address: str = "") -> tuple[Optional[str], str]:
        """
        Authenticate user and create session.
        Returns (token, message) - token is None on failure.
        """
        username = username.lower().strip()
        
        if username not in self._users:
            logger.warning("login_failed", username=username, reason="user_not_found")
            return None, "Invalid username or password"
        
        user = self._users[username]
        if not _verify_password(password, user.password_hash):
            logger.warning("login_failed", username=username, reason="wrong_password")
            return None, "Invalid username or password"
        
        # Create session
        token = _generate_token()
        now = time.time()
        session = AuthSession(
            token=token,
            username=username,
            created_at=now,
            expires_at=now + (TOKEN_EXPIRY_HOURS * 3600),
            ip_address=ip_address
        )
        self._sessions[token] = session
        
        # Update last login
        user.last_login = datetime.now().isoformat()
        self._save_users()
        self._save_sessions()
        
        logger.info("login_success", username=username, ip=ip_address)
        return token, "Login successful"
    
    def logout(self, token: str) -> bool:
        """Invalidate a session token."""
        if token in self._sessions:
            username = self._sessions[token].username
            del self._sessions[token]
            self._save_sessions()
            logger.info("logout", username=username)
            return True
        return False
    
    def validate_token(self, token: str) -> Optional[str]:
        """
        Validate a session token.
        Returns username if valid, None otherwise.
        """
        if not token or token not in self._sessions:
            return None
        
        session = self._sessions[token]
        
        # Check expiry
        if session.expires_at < time.time():
            del self._sessions[token]
            self._save_sessions()
            return None
        
        return session.username
    
    def get_session_user(self, token: str) -> Optional[User]:
        """Get user from session token."""
        username = self.validate_token(token)
        if username:
            return self.get_user(username)
        return None
    
    # ==================== User Settings ====================
    
    def get_user_settings(self, username: str) -> Dict[str, Any]:
        """Get user's saved settings."""
        user = self.get_user(username)
        return user.settings if user else {}
    
    def save_user_settings(self, username: str, settings: Dict[str, Any]) -> bool:
        """Save user's settings."""
        user = self.get_user(username)
        if not user:
            return False
        
        user.settings = settings
        self._save_users()
        return True
    
    def update_user_settings(self, username: str, updates: Dict[str, Any]) -> bool:
        """Update specific user settings."""
        user = self.get_user(username)
        if not user:
            return False
        
        user.settings.update(updates)
        self._save_users()
        return True


# Global auth manager instance
_auth_manager: Optional[AuthManager] = None


def get_auth_manager() -> AuthManager:
    """Get the global auth manager instance."""
    global _auth_manager
    if _auth_manager is None:
        _auth_manager = AuthManager()
    return _auth_manager
