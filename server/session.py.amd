"""
Session State Management
Handles the state machine for voice conversations.
"""
import asyncio
import time
from enum import Enum, auto
from dataclasses import dataclass, field
import structlog

from .llm.conversation import ConversationHistory

logger = structlog.get_logger()

# Timeout for SPEAKING state (seconds) - auto-reset if playback_done not received
SPEAKING_TIMEOUT = 30.0


class SessionState(Enum):
    """Voice session states."""
    IDLE = auto()          # Waiting for user
    LISTENING = auto()     # User is speaking
    PROCESSING = auto()    # Processing user input (STT → LLM)
    SPEAKING = auto()      # Agent is speaking (TTS playing)
    INTERRUPTED = auto()   # User interrupted agent


@dataclass
class Session:
    """
    Voice session state and context.
    Simplified session for WebSocket connection.
    """
    state: SessionState = SessionState.IDLE
    
    # Audio buffer for accumulating audio data
    audio_buffer: bytearray = field(default_factory=bytearray)
    
    # Conversation history
    conversation_history: ConversationHistory = field(default_factory=ConversationHistory)
    
    # Control flags
    _stop_requested: bool = False
    
    # Processing lock - prevents multiple simultaneous pipeline runs
    _processing_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    
    # Timing
    last_activity: float = field(default_factory=time.time)
    speaking_started: float = 0.0  # When SPEAKING state began
    
    def set_state(self, new_state: SessionState) -> None:
        """Update session state."""
        old_state = self.state
        self.state = new_state
        self._stop_requested = False
        self.last_activity = time.time()
        
        # Track when speaking started for timeout
        if new_state == SessionState.SPEAKING:
            self.speaking_started = time.time()
        
        logger.info("state_change", old=old_state.name, new=new_state.name)
    
    def check_speaking_timeout(self) -> bool:
        """
        Check if SPEAKING state has timed out.
        Returns True if we should auto-reset to IDLE.
        """
        if self.state == SessionState.SPEAKING:
            elapsed = time.time() - self.speaking_started
            if elapsed > SPEAKING_TIMEOUT:
                logger.warning("speaking_timeout", elapsed=elapsed, timeout=SPEAKING_TIMEOUT)
                return True
        return False
    
    def interrupt(self) -> None:
        """Signal to interrupt current operation (barge-in)."""
        self._stop_requested = True
        if self.state == SessionState.SPEAKING:
            self.state = SessionState.INTERRUPTED
        logger.info("interrupt_requested")
    
    def should_stop(self) -> bool:
        """Check if current operation should stop."""
        return self._stop_requested
    
    def reset_stop_flag(self) -> None:
        """Reset the stop flag."""
        self._stop_requested = False
