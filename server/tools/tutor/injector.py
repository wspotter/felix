"""
Example Injector - Add few-shot examples to prompts.

Retrieves relevant examples from the store and injects
them into the system prompt for few-shot learning.
"""

from typing import List, Optional
import json

from .examples import ExampleStore, Example

import structlog
logger = structlog.get_logger(__name__)


class ExampleInjector:
    """
    Injects relevant tool examples into prompts.
    
    Uses semantic similarity to find examples most relevant
    to the current query and formats them for few-shot learning.
    """
    
    def __init__(self, example_store: ExampleStore):
        self.example_store = example_store
    
    def inject(
        self, 
        query: str, 
        system_prompt: str,
        count: int = 3,
        min_similarity: float = 0.3
    ) -> str:
        """
        Inject relevant examples into the system prompt.
        
        Args:
            query: User's query
            system_prompt: Original system prompt
            count: Number of examples to inject
            min_similarity: Minimum similarity threshold
            
        Returns:
            Modified system prompt with examples
        """
        # Find similar examples
        similar = self.example_store.find_similar(
            query,
            limit=count,
            min_similarity=min_similarity,
            success_only=True
        )
        
        if not similar:
            logger.debug("no_examples_found", query=query[:50])
            return system_prompt
        
        # Format examples
        example_text = self._format_examples([ex for ex, _ in similar])
        
        # Inject into prompt
        return system_prompt + "\n\n" + example_text
    
    def _format_examples(self, examples: List[Example]) -> str:
        """
        Format examples for injection into prompt.
        
        Uses a clear format that shows the pattern:
        User query -> Tool call
        """
        lines = [
            "Here are examples of how to use tools for similar queries:",
            ""
        ]
        
        for i, ex in enumerate(examples, 1):
            # Format args nicely
            if ex.args:
                args_str = json.dumps(ex.args)
            else:
                args_str = "{}"
            
            lines.extend([
                f"Example {i}:",
                f"  User: \"{ex.query}\"",
                f"  Tool: {ex.tool}",
                f"  Args: {args_str}",
                ""
            ])
        
        lines.append("Follow the same pattern for the current query.")
        
        return "\n".join(lines)
    
    def get_examples_for_tool(
        self, 
        tool: str, 
        count: int = 3
    ) -> str:
        """
        Get formatted examples for a specific tool.
        
        Useful when we know which tool will be used and
        want to show usage patterns.
        """
        examples = self.example_store.get_by_tool(tool, limit=count)
        
        if not examples:
            return ""
        
        return self._format_examples(examples)
    
    def get_compact_examples(
        self,
        query: str,
        count: int = 3
    ) -> str:
        """
        Get compact one-line examples.
        
        For when context is tight and we want minimal token usage.
        """
        similar = self.example_store.find_similar(
            query,
            limit=count,
            min_similarity=0.3,
            success_only=True
        )
        
        if not similar:
            return ""
        
        lines = ["Examples:"]
        for ex, _ in similar:
            args_str = json.dumps(ex.args) if ex.args else "{}"
            lines.append(f"- \"{ex.query}\" → {ex.tool}({args_str})")
        
        return "\n".join(lines)
