"""
Voters - Different strategies for tool selection voting.

Each voter provides tool suggestions based on different signals:
- KeywordVoter: Fast regex/keyword matching
- EmbeddingVoter: Semantic similarity to past examples
- HistoryVoter: User's personal usage patterns
- ContextVoter: Recent conversation context
"""

import re
import json
from pathlib import Path
from typing import Dict, List, Optional, Any
from collections import defaultdict

from .examples import ExampleStore

import structlog
logger = structlog.get_logger(__name__)


class KeywordVoter:
    """
    Fast keyword/regex matching for tool selection.
    
    Uses predefined patterns to quickly identify likely tools.
    Low latency, good for obvious cases.
    """
    
    def __init__(self):
        # Patterns for each tool - order matters (first match wins within tool)
        # Scores are base confidence when pattern matches
        self.patterns: Dict[str, List[tuple]] = {
            # Music tools
            "music_play": [
                (r"\bplay\b.*\b(music|song|track|album|artist)", 0.9),
                (r"\bplay\b\s+\w+", 0.8),  # "play X"
                (r"\bput on\b.*\b(music|song)", 0.85),
                (r"\blisten to\b", 0.85),
                (r"\bqueue\b.*\b(song|music)", 0.7),
                (r"\bwant to hear\b", 0.8),
            ],
            "music_pause": [
                (r"\bpause\b.*\b(music|song|it)?", 0.9),
                (r"\bpause\b$", 0.85),
            ],
            "music_stop": [
                (r"\bstop\b.*\b(music|song|playing)", 0.9),
                (r"\bstop\b$", 0.7),  # Just "stop" - could be other things
            ],
            "music_next": [
                (r"\bnext\b.*\b(song|track)", 0.95),
                (r"\bskip\b.*\b(this|song|track)?", 0.9),
                (r"\bnext\b$", 0.8),
            ],
            "music_previous": [
                (r"\bprevious\b.*\b(song|track)?", 0.9),
                (r"\bgo back\b.*\b(song|track)", 0.85),
                (r"\blast song\b", 0.85),
            ],
            "music_volume": [
                (r"\bvolume\b.*\b(\d+|up|down)", 0.95),
                (r"\b(louder|quieter)\b", 0.9),
                (r"\bturn (it )?(up|down)\b", 0.85),
                (r"\bvolume\b", 0.8),
            ],
            "music_now_playing": [
                (r"\bwhat('s| is).*\bplaying\b", 0.95),
                (r"\bwhat song\b", 0.9),
                (r"\bcurrent (song|track)\b", 0.9),
                (r"\bnow playing\b", 0.95),
            ],
            
            # Weather
            "get_weather": [
                (r"\bweather\b", 0.95),
                (r"\btemperature\b", 0.9),
                (r"\btemp\b\s*(outside|today)?", 0.85),
                (r"\bforecast\b", 0.9),
                (r"\brain\b.*\b(today|tomorrow)?", 0.7),
                (r"\bhot\b.*\boutside\b", 0.7),
                (r"\bcold\b.*\boutside\b", 0.7),
            ],
            
            # Web search
            "web_search": [
                (r"\bsearch\b.*\b(for|the web|google|internet)", 0.9),
                (r"\bgoogle\b", 0.9),
                (r"\blook up\b", 0.85),
                (r"\bfind\b.*\b(information|info|out)\b", 0.8),
                (r"\bsearch\b", 0.7),
            ],
            
            # Memory - remember
            "remember": [
                (r"\bremember\b.*\b(that|this)\b", 0.9),
                (r"\bsave\b.*\b(this|that|memory)\b", 0.85),
                (r"\bdon't forget\b", 0.85),
                (r"\bstore\b.*\b(this|that)\b", 0.8),
                (r"\badd\b.*\bmemor", 0.85),
            ],
            
            # Memory - recall
            "recall": [
                (r"\bdo you remember\b", 0.9),
                (r"\bwhat did i\b.*\b(say|tell|mention)\b", 0.9),
                (r"\brecall\b", 0.9),
                (r"\byesterday\b.*\b(said|told|mentioned)\b", 0.85),
                (r"\bmy memor(y|ies)\b", 0.8),
                (r"\bfrom (last|yesterday|before)\b", 0.7),
            ],
            
            # Time
            "get_current_time": [
                (r"\bwhat time\b", 0.95),
                (r"\bcurrent time\b", 0.95),
                (r"\bwhat('s| is) the time\b", 0.95),
                (r"\btoday's date\b", 0.9),
                (r"\bwhat day\b", 0.85),
                (r"\btime zone\b", 0.8),
            ],
            
            # Jokes
            "tell_joke": [
                (r"\btell\b.*\bjoke\b", 0.95),
                (r"\bjoke\b", 0.85),
                (r"\bmake me laugh\b", 0.9),
                (r"\bsomething funny\b", 0.85),
                (r"\bfunny\b", 0.6),
            ],
            
            # Knowledge search
            "knowledge_search": [
                (r"\bknowledge base\b", 0.95),
                (r"\bwhat do you know about\b", 0.85),
                (r"\bsearch.*\b(local|knowledge)\b", 0.9),
                (r"\bwillowbrook\b", 0.8),  # Known dataset
            ],
        }
        
        # Compile patterns
        self.compiled_patterns: Dict[str, List[tuple]] = {}
        for tool, patterns in self.patterns.items():
            self.compiled_patterns[tool] = [
                (re.compile(pattern, re.IGNORECASE), score)
                for pattern, score in patterns
            ]
    
    def vote(self, query: str) -> Dict[str, float]:
        """
        Vote on tools based on keyword matching.
        
        Args:
            query: User's query
            
        Returns:
            Dictionary of {tool_name: confidence_score}
        """
        votes = {}
        
        for tool, patterns in self.compiled_patterns.items():
            max_score = 0.0
            for pattern, score in patterns:
                if pattern.search(query):
                    max_score = max(max_score, score)
            
            if max_score > 0:
                votes[tool] = max_score
        
        return votes


class EmbeddingVoter:
    """
    Semantic similarity voting based on past examples.
    
    Uses sentence embeddings to find similar past queries
    and votes for the tools that worked for those.
    """
    
    def __init__(self, example_store: ExampleStore):
        self.example_store = example_store
    
    def vote(
        self, 
        query: str, 
        top_k: int = 5,
        min_similarity: float = 0.4
    ) -> Dict[str, float]:
        """
        Vote based on similar examples.
        
        Args:
            query: User's query
            top_k: Number of similar examples to consider
            min_similarity: Minimum similarity threshold
            
        Returns:
            Dictionary of {tool_name: confidence_score}
        """
        similar = self.example_store.find_similar(
            query, 
            limit=top_k, 
            min_similarity=min_similarity,
            success_only=True
        )
        
        if not similar:
            return {}
        
        # Aggregate votes by tool
        tool_scores = defaultdict(list)
        for example, similarity in similar:
            tool_scores[example.tool].append(similarity)
        
        # Take max similarity per tool
        votes = {}
        for tool, scores in tool_scores.items():
            votes[tool] = max(scores)
        
        return votes


class HistoryVoter:
    """
    User history-based voting.
    
    Tracks which tools a user frequently uses and
    votes based on usage patterns.
    """
    
    def __init__(self, data_path: str):
        self.data_path = Path(data_path)
        self.history: Dict[str, Dict[str, int]] = {}  # {user_id: {tool: count}}
        self._load()
    
    def _load(self):
        """Load history from disk."""
        if self.data_path.exists():
            try:
                with open(self.data_path, 'r') as f:
                    self.history = json.load(f)
            except Exception as e:
                logger.error("history_load_failed", error=str(e))
                self.history = {}
    
    def _save(self):
        """Save history to disk."""
        try:
            self.data_path.parent.mkdir(parents=True, exist_ok=True)
            with open(self.data_path, 'w') as f:
                json.dump(self.history, f, indent=2)
        except Exception as e:
            logger.error("history_save_failed", error=str(e))
    
    def record(self, tool: str, user_id: str = "default"):
        """Record a tool usage."""
        if user_id not in self.history:
            self.history[user_id] = {}
        
        self.history[user_id][tool] = self.history[user_id].get(tool, 0) + 1
        self._save()
    
    def vote(self, query: str, user_id: str = "default") -> Dict[str, float]:
        """
        Vote based on user's tool usage history.
        
        More frequently used tools get higher scores.
        
        Args:
            query: User's query (not used, but kept for interface consistency)
            user_id: User identifier
            
        Returns:
            Dictionary of {tool_name: confidence_score}
        """
        if user_id not in self.history:
            return {}
        
        user_history = self.history[user_id]
        if not user_history:
            return {}
        
        # Normalize to 0-1 range based on max usage
        max_count = max(user_history.values())
        
        votes = {}
        for tool, count in user_history.items():
            # Scale from 0.3 to 0.8 based on usage
            # Even rarely used tools get some weight
            votes[tool] = 0.3 + (0.5 * count / max_count)
        
        return votes
    
    def get_stats(self, user_id: str = "default") -> Dict[str, int]:
        """Get usage stats for a user."""
        return self.history.get(user_id, {})


class ContextVoter:
    """
    Conversation context-based voting.
    
    Analyzes recent messages to identify likely tools
    based on conversation flow and topic continuity.
    """
    
    def __init__(self):
        # Keywords that suggest continuation
        self.continuation_words = {
            "it", "that", "this", "more", "another", "again", "also"
        }
        
        # Topic to tool mapping
        self.topic_tools = {
            "music": ["music_play", "music_pause", "music_stop", "music_next", 
                     "music_previous", "music_volume", "music_now_playing"],
            "weather": ["get_weather"],
            "search": ["web_search", "knowledge_search"],
            "memory": ["remember", "recall"],
            "time": ["get_current_time"],
        }
    
    def vote(
        self, 
        query: str, 
        recent_messages: Optional[List[dict]] = None
    ) -> Dict[str, float]:
        """
        Vote based on conversation context.
        
        Args:
            query: Current user query
            recent_messages: Recent conversation history
            
        Returns:
            Dictionary of {tool_name: confidence_score}
        """
        votes = {}
        
        if not recent_messages:
            return votes
        
        # Check for continuation words in query
        query_words = set(query.lower().split())
        has_continuation = bool(query_words & self.continuation_words)
        
        # Analyze recent messages for topics and tools
        recent_tools = []
        recent_topics = []
        
        for msg in recent_messages[-5:]:  # Last 5 messages
            content = msg.get("content", "").lower()
            
            # Check for tool mentions
            if "tool" in msg:
                recent_tools.append(msg["tool"])
            
            # Identify topics
            for topic, tools in self.topic_tools.items():
                if topic in content:
                    recent_topics.append(topic)
        
        # If continuation and recent tool, vote for it
        if has_continuation and recent_tools:
            last_tool = recent_tools[-1]
            votes[last_tool] = 0.7
            
            # Also vote for related tools (same category)
            for topic, tools in self.topic_tools.items():
                if last_tool in tools:
                    for tool in tools:
                        if tool != last_tool:
                            votes[tool] = votes.get(tool, 0) + 0.3
        
        # Vote for tools related to recent topics
        for topic in recent_topics:
            for tool in self.topic_tools.get(topic, []):
                votes[tool] = votes.get(tool, 0) + 0.2
        
        # Cap all votes at 1.0
        return {tool: min(score, 1.0) for tool, score in votes.items()}
