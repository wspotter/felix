"""
Async Tool Executor
Handles tool execution with timeout, retries, and parallel execution.
"""
import asyncio
from typing import Any, Optional
from dataclasses import dataclass
import structlog

from .registry import tool_registry, Tool

logger = structlog.get_logger()


@dataclass
class ToolResult:
    """Result of a tool execution."""
    tool_name: str
    success: bool
    result: Any
    error: Optional[str] = None
    execution_time: float = 0.0
    flyout: Optional[dict] = None  # {"type": "browser|code|terminal", "content": str}


class ToolExecutor:
    """
    Executes tools with proper error handling, timeouts, and concurrency.
    """
    
    def __init__(
        self,
        default_timeout: float = 30.0,
        max_concurrent: int = 5,
    ):
        """
        Initialize tool executor.
        
        Args:
            default_timeout: Default timeout for tool execution
            max_concurrent: Maximum concurrent tool executions
        """
        self.default_timeout = default_timeout
        self._semaphore = asyncio.Semaphore(max_concurrent)
    
    async def execute(
        self,
        tool_name: str,
        arguments: dict,
        timeout: float = None,
    ) -> ToolResult:
        """
        Execute a single tool.
        
        Args:
            tool_name: Name of the tool to execute
            arguments: Arguments to pass to the tool
            timeout: Optional timeout override
            
        Returns:
            ToolResult with execution details
        """
        timeout = timeout or self.default_timeout
        
        async with self._semaphore:
            import time
            start_time = time.time()
            
            try:
                # Get the tool
                tool = tool_registry.get_tool(tool_name)
                if not tool:
                    return ToolResult(
                        tool_name=tool_name,
                        success=False,
                        result=None,
                        error=f"Unknown tool: {tool_name}"
                    )
                
                # Execute with timeout
                result = await asyncio.wait_for(
                    tool.execute(**arguments),
                    timeout=timeout
                )
                
                execution_time = time.time() - start_time
                
                return ToolResult(
                    tool_name=tool_name,
                    success=True,
                    result=result,
                    execution_time=execution_time
                )
                
            except asyncio.TimeoutError:
                logger.warning("tool_timeout", tool=tool_name, timeout=timeout)
                return ToolResult(
                    tool_name=tool_name,
                    success=False,
                    result=None,
                    error=f"Tool execution timed out after {timeout}s",
                    execution_time=timeout
                )
                
            except Exception as e:
                execution_time = time.time() - start_time
                logger.error("tool_error", tool=tool_name, error=str(e))
                return ToolResult(
                    tool_name=tool_name,
                    success=False,
                    result=None,
                    error=str(e),
                    execution_time=execution_time
                )
    
    async def execute_many(
        self,
        tool_calls: list[dict],
        timeout: float = None,
    ) -> list[ToolResult]:
        """
        Execute multiple tools concurrently.
        
        Args:
            tool_calls: List of {"name": str, "arguments": dict}
            timeout: Optional timeout for each tool
            
        Returns:
            List of ToolResults in order
        """
        tasks = [
            self.execute(
                call["name"],
                call.get("arguments", {}),
                timeout=timeout
            )
            for call in tool_calls
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Convert exceptions to ToolResults
        final_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                final_results.append(ToolResult(
                    tool_name=tool_calls[i]["name"],
                    success=False,
                    result=None,
                    error=str(result)
                ))
            else:
                final_results.append(result)
        
        return final_results


# Global executor instance
tool_executor = ToolExecutor()


async def execute_tool(tool_name: str, arguments: dict) -> ToolResult:
    """Convenience function for tool execution."""
    return await tool_executor.execute(tool_name, arguments)
