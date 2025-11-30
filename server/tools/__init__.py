"""
Tools package.
"""

from .registry import tool_registry, Tool
from .executor import tool_executor, execute_tool, ToolResult

# Import builtin tools to register them
from . import builtin

__all__ = [
    "tool_registry",
    "Tool",
    "tool_executor",
    "execute_tool",
    "ToolResult",
]

# Convenience function
def list_tools():
    """List all registered tools."""
    return tool_registry.get_all_tools()
