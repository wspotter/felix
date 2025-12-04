"""
Conversation History Management
Maintains context for LLM interactions.
"""
from dataclasses import dataclass, field
from typing import Optional
from collections import deque
import time


@dataclass
class Message:
    """A single message in the conversation."""
    role: str  # "system", "user", "assistant", "tool"
    content: str
    timestamp: float = field(default_factory=time.time)
    name: Optional[str] = None  # For tool messages
    tool_call_id: Optional[str] = None  # For tool responses
    tool_calls: Optional[list] = None  # For assistant tool calls


class ConversationHistory:
    """
    Manages conversation history with context window management.
    """
    
    def __init__(
        self,
        system_prompt: str = None,
        max_messages: int = 50,
        max_tokens_estimate: int = 4000,
    ):
        """
        Initialize conversation history.
        
        Args:
            system_prompt: System message for the conversation
            max_messages: Maximum messages to keep
            max_tokens_estimate: Rough token limit for context
        """
        self.system_prompt = system_prompt or self._default_system_prompt()
        self.max_messages = max_messages
        self.max_tokens_estimate = max_tokens_estimate
        
        self._messages: deque[Message] = deque(maxlen=max_messages)
    
    def _default_system_prompt(self) -> str:
        return """You are a helpful voice assistant named Nova. Your responses will be spoken aloud.

RESPONSE RULES:
- Keep responses brief (1-3 sentences typically)
- Use natural speech patterns without markdown or special formatting
- Don't use abbreviations like "e.g." - say "for example" instead

TOOL USAGE INSTRUCTIONS:
- You have access to tools. USE THEM IMMEDIATELY when needed.
- DO NOT say "I will check..." or "I need to access...". JUST USE THE TOOL.
- To use a tool, output a JSON object: {"name": "tool_name", "arguments": {"arg": "value"}}

CRITICAL TOOL PRIORITY ORDER:
When you need to find information, ALWAYS try tools in this order:

1. FIRST: knowledge_search - Search local knowledge bases BEFORE web search!
   - Call: knowledge_search(query="your question")
   - Contains: test-facts, cherry-studio-docs, sample-docs
   - Has local documents with information you need
   - Example: knowledge_search(query="mayor of Willowbrook")

2. SECOND: If knowledge_search returns no results, THEN try web_search
   - Only use web_search as a fallback

3. For music: music_play, music_search, music_now_playing
   - Example: {"name": "music_play", "arguments": {"query": "jazz"}}

4. For time/date → get_current_time, get_current_date, calculate_date
5. For weather → get_weather, get_forecast
6. For system info → get_system_info, get_resource_usage

DISCOVERING TOOLS:
- Call list_available_tools() to see all available tools
- Call get_tool_help("tool_name") for detailed usage instructions

AFTER TOOL RESULTS:
- Summarize results naturally for speech
- Don't read raw JSON - interpret and explain

IMPORTANT: Use knowledge_search FIRST for any factual questions. It contains local information that web_search cannot find!"""
    
    def add_user_message(self, content: str) -> None:
        """Add a user message."""
        self._messages.append(Message(role="user", content=content))
    
    def add_assistant_message(
        self,
        content: str,
        tool_calls: list = None
    ) -> None:
        """Add an assistant message."""
        self._messages.append(Message(
            role="assistant",
            content=content,
            tool_calls=tool_calls
        ))
    
    def add_tool_result(
        self,
        tool_call_id: str,
        tool_name: str,
        result: str
    ) -> None:
        """Add a tool result message."""
        self._messages.append(Message(
            role="tool",
            content=result,
            name=tool_name,
            tool_call_id=tool_call_id
        ))
    
    def get_messages(self, include_system: bool = True) -> list[dict]:
        """
        Get messages formatted for LLM API.
        
        Args:
            include_system: Whether to include system message
            
        Returns:
            List of message dicts
        """
        messages = []
        
        if include_system:
            messages.append({
                "role": "system",
                "content": self.system_prompt
            })
        
        for msg in self._messages:
            msg_dict = {
                "role": msg.role,
                "content": msg.content
            }
            
            if msg.name:
                msg_dict["name"] = msg.name
            if msg.tool_call_id:
                msg_dict["tool_call_id"] = msg.tool_call_id
            if msg.tool_calls:
                msg_dict["tool_calls"] = msg.tool_calls
            
            messages.append(msg_dict)
        
        return messages
    
    def get_context_summary(self) -> str:
        """Get a brief summary of the conversation context."""
        if not self._messages:
            return "No conversation history."
        
        user_messages = [m for m in self._messages if m.role == "user"]
        assistant_messages = [m for m in self._messages if m.role == "assistant"]
        
        return (
            f"Conversation: {len(self._messages)} messages "
            f"({len(user_messages)} user, {len(assistant_messages)} assistant)"
        )
    
    def clear(self) -> None:
        """Clear conversation history."""
        self._messages.clear()
    
    def estimate_tokens(self) -> int:
        """Rough estimate of token count."""
        total_chars = len(self.system_prompt)
        for msg in self._messages:
            total_chars += len(msg.content)
        # Rough estimate: ~4 chars per token
        return total_chars // 4
    
    def trim_to_token_limit(self) -> None:
        """Remove oldest messages to fit within token limit."""
        while self.estimate_tokens() > self.max_tokens_estimate and len(self._messages) > 2:
            self._messages.popleft()
    
    @property
    def last_user_message(self) -> Optional[str]:
        """Get the last user message."""
        for msg in reversed(self._messages):
            if msg.role == "user":
                return msg.content
        return None
    
    @property
    def last_assistant_message(self) -> Optional[str]:
        """Get the last assistant message."""
        for msg in reversed(self._messages):
            if msg.role == "assistant":
                return msg.content
        return None
