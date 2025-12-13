"""
Learning Module - Learn from tool call outcomes.

Records successful and failed tool calls to improve
future predictions and example quality.
"""

from typing import Optional, Dict, Any
from datetime import datetime
import json
from pathlib import Path

from .interfaces import ToolCall
from .examples import ExampleStore
from .voters import HistoryVoter

import structlog
logger = structlog.get_logger(__name__)


class LearningModule:
    """
    Learns from tool call outcomes.
    
    Records:
    - Successful calls → become new examples
    - Failed calls → tracked for analysis
    - Corrections → high-value training data
    """
    
    def __init__(
        self,
        example_store: ExampleStore,
        history_voter: HistoryVoter,
        stats_path: Optional[str] = None
    ):
        self.example_store = example_store
        self.history_voter = history_voter
        self.stats_path = Path(stats_path) if stats_path else None
        
        self.stats = {
            "total_calls": 0,
            "successes": 0,
            "failures": 0,
            "overrides": 0,
            "override_correct": 0,
            "by_tool": {}
        }
        
        self._load_stats()
    
    def _load_stats(self):
        """Load stats from disk."""
        if self.stats_path and self.stats_path.exists():
            try:
                with open(self.stats_path, 'r') as f:
                    self.stats = json.load(f)
            except Exception as e:
                logger.error("stats_load_failed", error=str(e))
    
    def _save_stats(self):
        """Save stats to disk."""
        if self.stats_path:
            try:
                self.stats_path.parent.mkdir(parents=True, exist_ok=True)
                with open(self.stats_path, 'w') as f:
                    json.dump(self.stats, f, indent=2)
            except Exception as e:
                logger.error("stats_save_failed", error=str(e))
    
    def record_success(
        self,
        query: str,
        tool_call: ToolCall,
        user_id: str = "default"
    ):
        """
        Record a successful tool call.
        
        Args:
            query: Original user query
            tool_call: The tool call that succeeded
            user_id: User identifier
        """
        # Update stats
        self.stats["total_calls"] += 1
        self.stats["successes"] += 1
        
        tool = tool_call.tool
        if tool not in self.stats["by_tool"]:
            self.stats["by_tool"][tool] = {"success": 0, "failure": 0}
        self.stats["by_tool"][tool]["success"] += 1
        
        # Track override accuracy
        if tool_call.overridden:
            self.stats["overrides"] += 1
            self.stats["override_correct"] += 1
        
        # Add as example (with some filtering to avoid duplicates)
        if self._should_add_example(query, tool_call):
            source = "correction" if tool_call.overridden else "auto"
            self.example_store.add(
                query=query,
                tool=tool,
                args=tool_call.args,
                success=True,
                source=source
            )
        
        # Update history
        self.history_voter.record(tool, user_id)
        
        self._save_stats()
        
        logger.info(
            "success_recorded",
            tool=tool,
            overridden=tool_call.overridden
        )
    
    def record_failure(
        self,
        query: str,
        tool_call: ToolCall,
        error: Optional[str] = None,
        user_id: str = "default"
    ):
        """
        Record a failed tool call.
        
        Args:
            query: Original user query
            tool_call: The tool call that failed
            error: Error message
            user_id: User identifier
        """
        # Update stats
        self.stats["total_calls"] += 1
        self.stats["failures"] += 1
        
        tool = tool_call.tool
        if tool not in self.stats["by_tool"]:
            self.stats["by_tool"][tool] = {"success": 0, "failure": 0}
        self.stats["by_tool"][tool]["failure"] += 1
        
        # Track override accuracy (override was wrong)
        if tool_call.overridden:
            self.stats["overrides"] += 1
            # Don't increment override_correct
        
        # Store as failed example for analysis
        self.example_store.add(
            query=query,
            tool=tool,
            args=tool_call.args,
            success=False,
            source="auto"
        )
        
        self._save_stats()
        
        logger.warning(
            "failure_recorded",
            tool=tool,
            error=error[:100] if error else None
        )
    
    def record_correction(
        self,
        query: str,
        wrong_tool: str,
        correct_tool: str,
        args: Dict[str, Any],
        user_id: str = "default"
    ):
        """
        Record a user correction.
        
        This is high-value training data - the user explicitly
        told us what the right tool was.
        
        Args:
            query: Original user query
            wrong_tool: Tool that was incorrectly selected
            correct_tool: Tool the user said was correct
            args: Arguments for the correct tool
            user_id: User identifier
        """
        # Store wrong answer as failure
        self.example_store.add(
            query=query,
            tool=wrong_tool,
            args={},
            success=False,
            source="correction"
        )
        
        # Store correct answer as success
        self.example_store.add(
            query=query,
            tool=correct_tool,
            args=args,
            success=True,
            source="correction"
        )
        
        # Update history with correct tool
        self.history_voter.record(correct_tool, user_id)
        
        logger.info(
            "correction_recorded",
            wrong=wrong_tool,
            correct=correct_tool
        )
    
    def _should_add_example(self, query: str, tool_call: ToolCall) -> bool:
        """
        Decide if we should add this as a new example.
        
        Avoids adding too many similar examples.
        """
        # Always add corrections (overridden calls)
        if tool_call.overridden:
            return True
        
        # Check for similar existing examples
        similar = self.example_store.find_similar(
            query,
            limit=1,
            min_similarity=0.95,  # Very similar
            tool_filter=tool_call.tool
        )
        
        # Don't add if we have a very similar example already
        if similar:
            return False
        
        return True
    
    def get_stats(self) -> Dict[str, Any]:
        """Get learning statistics."""
        stats = self.stats.copy()
        
        # Calculate accuracy
        if stats["total_calls"] > 0:
            stats["accuracy"] = stats["successes"] / stats["total_calls"]
        else:
            stats["accuracy"] = 0.0
        
        # Calculate override accuracy
        if stats["overrides"] > 0:
            stats["override_accuracy"] = stats["override_correct"] / stats["overrides"]
        else:
            stats["override_accuracy"] = 0.0
        
        return stats
    
    def get_problem_tools(self, min_failure_rate: float = 0.3) -> list:
        """
        Get tools with high failure rates.
        
        Args:
            min_failure_rate: Minimum failure rate to flag
            
        Returns:
            List of (tool, failure_rate) tuples
        """
        problems = []
        
        for tool, counts in self.stats.get("by_tool", {}).items():
            total = counts["success"] + counts["failure"]
            if total >= 5:  # Minimum sample size
                failure_rate = counts["failure"] / total
                if failure_rate >= min_failure_rate:
                    problems.append((tool, failure_rate))
        
        return sorted(problems, key=lambda x: x[1], reverse=True)
