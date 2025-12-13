"""
Tests for session management.
"""
import asyncio


class TestSessionState:
    """Test SessionState enum."""
    
    def test_session_states_exist(self):
        """Test that all session states are defined."""
        from server.session import SessionState
        
        assert hasattr(SessionState, 'IDLE')
        assert hasattr(SessionState, 'LISTENING')
        assert hasattr(SessionState, 'PROCESSING')
        assert hasattr(SessionState, 'SPEAKING')
        assert hasattr(SessionState, 'INTERRUPTED')
    
    def test_session_state_are_unique(self):
        """Test session states have unique values."""
        from server.session import SessionState
        
        values = [s.value for s in SessionState]
        assert len(values) == len(set(values))


class TestSession:
    """Test Session class."""
    
    def test_session_creation(self):
        """Test creating a new session."""
        from server.session import Session
        
        # Session is a dataclass, created without websocket
        session = Session()
        
        assert session is not None
    
    def test_session_initial_state(self):
        """Test session starts in IDLE state."""
        from server.session import Session, SessionState
        
        session = Session()
        
        assert session.state == SessionState.IDLE
    
    def test_session_set_state(self):
        """Test changing session state."""
        from server.session import Session, SessionState
        
        session = Session()
        
        session.set_state(SessionState.LISTENING)
        assert session.state == SessionState.LISTENING
        
        session.set_state(SessionState.PROCESSING)
        assert session.state == SessionState.PROCESSING
    
    def test_session_has_conversation_history(self):
        """Test session has conversation history."""
        from server.session import Session
        
        session = Session()
        
        # Should have a conversation_history attribute
        assert hasattr(session, 'conversation_history')
    
    def test_session_should_stop(self):
        """Test should_stop flag for interruption."""
        from server.session import Session
        
        session = Session()
        
        # Check that should_stop method exists and works
        assert hasattr(session, 'should_stop')
        assert not session.should_stop()
    
    def test_session_interrupt(self):
        """Test interrupt functionality."""
        from server.session import Session, SessionState
        
        session = Session()
        session.set_state(SessionState.SPEAKING)
        
        session.interrupt()
        
        assert session.should_stop()
        assert session.state == SessionState.INTERRUPTED
    
    def test_session_has_lock(self):
        """Test session has processing lock."""
        from server.session import Session
        
        session = Session()
        
        # Should have a lock for thread safety
        assert hasattr(session, '_processing_lock')
        assert isinstance(session._processing_lock, asyncio.Lock)


class TestSessionStateTransitions:
    """Test valid state transitions."""
    
    def test_idle_to_listening(self):
        """Test transition from IDLE to LISTENING."""
        from server.session import Session, SessionState
        
        session = Session()
        
        assert session.state == SessionState.IDLE
        session.set_state(SessionState.LISTENING)
        assert session.state == SessionState.LISTENING
    
    def test_listening_to_processing(self):
        """Test transition from LISTENING to PROCESSING."""
        from server.session import Session, SessionState
        
        session = Session()
        
        session.set_state(SessionState.LISTENING)
        session.set_state(SessionState.PROCESSING)
        assert session.state == SessionState.PROCESSING
    
    def test_processing_to_speaking(self):
        """Test transition from PROCESSING to SPEAKING."""
        from server.session import Session, SessionState
        
        session = Session()
        
        session.set_state(SessionState.PROCESSING)
        session.set_state(SessionState.SPEAKING)
        assert session.state == SessionState.SPEAKING
    
    def test_speaking_to_interrupted(self):
        """Test transition from SPEAKING to INTERRUPTED (barge-in)."""
        from server.session import Session, SessionState
        
        session = Session()
        
        session.set_state(SessionState.SPEAKING)
        session.set_state(SessionState.INTERRUPTED)
        assert session.state == SessionState.INTERRUPTED
    
    def test_reset_stop_flag(self):
        """Test that reset_stop_flag works."""
        from server.session import Session
        
        session = Session()
        session.interrupt()
        
        assert session.should_stop()
        
        session.reset_stop_flag()
        
        assert not session.should_stop()


def test_session_persistence_roundtrip(tmp_path, monkeypatch):
    """Test that sessions saved to disk are restored on load."""
    from server.main import manager, save_sessions_to_disk, load_sessions_from_disk
    from server.session import Session, SessionState
    from server.config import settings

    # Use a clean test data directory
    monkeypatch.setattr(settings, 'data_dir', str(tmp_path))

    # Ensure a fresh starting state
    manager.sessions.clear()

    # Create a session and populate with messages
    s = Session()
    s.set_state(SessionState.LISTENING)
    s.conversation_history.add_user_message("Hello from test")
    # Add to manager sessions
    manager.sessions['testclient'] = s

    # Persist to disk
    save_sessions_to_disk()

    # Clear in-memory sessions
    manager.sessions.clear()

    # Load from disk and verify
    load_sessions_from_disk()
    assert 'testclient' in manager.sessions
    restored = manager.sessions['testclient']
    assert restored.state == SessionState.LISTENING
    msgs = restored.conversation_history.get_messages()
    assert any(m['role'] == 'user' and 'Hello from test' in m['content'] for m in msgs)
