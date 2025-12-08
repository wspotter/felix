"""
Tool Tutor Module

A modular system to help LLMs reliably use tools through:
- Confidence-based voting
- Few-shot example injection
- Learning from outcomes

Usage:
    from server.tools.tutor import create_tool_tutor, ToolTutorInterface
    
    # Create tutor (returns NoOpToolTutor if disabled)
    tutor = create_tool_tutor(enabled=True)
    
    # Before LLM call - inject examples
    prompt = tutor.prepare_prompt(query, system_prompt)
    
    # After LLM responds - process and vote if uncertain
    tool_call = tutor.process_tool_call(query, llm_response, context)
    
    # After tool executes - learn from outcome
    tutor.record_result(query, tool_call, success=True)
"""

from .interfaces import ToolTutorInterface, ToolCall, VoteResult, Example, NoOpToolTutor
from .tutor import ToolTutor, create_tool_tutor
from .examples import ExampleStore
from .voting import VotingSystem
from .confidence import ConfidenceParser
from .injector import ExampleInjector
from .learning import LearningModule

__all__ = [
    # Main interface
    "ToolTutorInterface",
    "ToolTutor",
    "create_tool_tutor",
    "NoOpToolTutor",
    
    # Data classes
    "ToolCall",
    "VoteResult", 
    "Example",
    
    # Components (for advanced usage)
    "ExampleStore",
    "VotingSystem",
    "ConfidenceParser",
    "ExampleInjector",
    "LearningModule",
]
