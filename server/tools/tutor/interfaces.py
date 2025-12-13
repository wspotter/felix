"""
Tool Tutor Interfaces and Data Classes

Defines the abstract interface and shared data structures.
Any tutor implementation must follow the ToolTutorInterface contract.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from datetime import datetime
import uuid


@dataclass
class ToolCall:
    """Represents a parsed tool call from the LLM."""
    tool: str
    args: Dict[str, Any]
    confidence: float = 1.0
    raw_response: str = ""
    overridden: bool = False
    original_tool: Optional[str] = None  # If overridden, what LLM originally suggested


@dataclass
class VoteResult:
    """Result from the voting system."""
    winner: str
    confidence: float
    votes: Dict[str, float]  # {tool_name: aggregated_score}
    voter_breakdown: Dict[str, Dict[str, float]] = field(default_factory=dict)  # {voter_name: {tool: score}}


@dataclass
class Example:
    """A stored tool call example."""
    id: str
    query: str
    tool: str
    args: Dict[str, Any]
    success: bool = True
    timestamp: str = ""
    source: str = "manual"  # "manual", "auto", "correction"
    embedding: Optional[List[float]] = None
    
    def __post_init__(self):
        if not self.id:
            self.id = str(uuid.uuid4())
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat() + "Z"
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "query": self.query,
            "tool": self.tool,
            "args": self.args,
            "success": self.success,
            "timestamp": self.timestamp,
            "source": self.source,
            "embedding": self.embedding
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Example":
        """Create from dictionary."""
        return cls(
            id=data.get("id", ""),
            query=data["query"],
            tool=data["tool"],
            args=data.get("args", {}),
            success=data.get("success", True),
            timestamp=data.get("timestamp", ""),
            source=data.get("source", "manual"),
            embedding=data.get("embedding")
        )


class ToolTutorInterface(ABC):
    """
    Abstract interface for Tool Tutor implementations.
    
    Any tutor implementation must provide these 3 methods.
    This allows swapping implementations without changing Felix core.
    """
    
    @abstractmethod
    def prepare_prompt(self, query: str, system_prompt: str) -> str:
        """
        Prepare the prompt before sending to LLM.
        
        Implementations may inject few-shot examples, tool hints, etc.
        
        Args:
            query: The user's query
            system_prompt: The current system prompt
            
        Returns:
            Modified system prompt (or original if no changes)
        """
        pass
    
    @abstractmethod
    def process_tool_call(
        self, 
        query: str, 
        llm_response: str, 
        context: Optional[List[dict]] = None
    ) -> Optional[ToolCall]:
        """
        Process the LLM response, apply voting if uncertain.
        
        Args:
            query: The original user query
            llm_response: Raw response from the LLM
            context: Recent conversation messages (optional)
            
        Returns:
            ToolCall with final decision, or None if no tool call detected
        """
        pass
    
    @abstractmethod
    def record_result(
        self, 
        query: str, 
        tool_call: ToolCall, 
        success: bool,
        error: Optional[str] = None
    ) -> None:
        """
        Record the outcome of a tool call for learning.
        
        Args:
            query: The original user query
            tool_call: The tool call that was executed
            success: Whether the tool executed successfully
            error: Error message if failed
        """
        pass


class NoOpToolTutor(ToolTutorInterface):
    """
    No-op implementation that passes everything through unchanged.
    
    Use this when Tool Tutor is disabled - Felix works normally.
    """
    
    def prepare_prompt(self, query: str, system_prompt: str) -> str:
        return system_prompt
    
    def process_tool_call(
        self, 
        query: str, 
        llm_response: str, 
        context: Optional[List[dict]] = None
    ) -> Optional[ToolCall]:
        # Return None - let the normal parsing handle it
        return None
    
    def record_result(
        self, 
        query: str, 
        tool_call: ToolCall, 
        success: bool,
        error: Optional[str] = None
    ) -> None:
        pass  # Do nothing
