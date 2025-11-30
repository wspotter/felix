"""
Tool Registry System
Extensible tool registration and discovery.
"""
import asyncio
from dataclasses import dataclass, field
from typing import Callable, Any, Optional, get_type_hints
import inspect
import structlog

logger = structlog.get_logger()


@dataclass
class Tool:
    """Represents a registered tool."""
    name: str
    description: str
    handler: Callable
    parameters: dict  # JSON Schema
    category: str = "general"
    requires_confirmation: bool = False
    
    async def execute(self, **kwargs) -> Any:
        """Execute the tool with given arguments."""
        if asyncio.iscoroutinefunction(self.handler):
            return await self.handler(**kwargs)
        else:
            # Run sync functions in thread pool
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(None, lambda: self.handler(**kwargs))


class ToolRegistry:
    """
    Central registry for all available tools.
    Provides registration, discovery, and execution.
    """
    
    def __init__(self):
        self._tools: dict[str, Tool] = {}
        self._categories: dict[str, list[str]] = {}
    
    def register(
        self,
        name: str = None,
        description: str = None,
        parameters: dict = None,
        category: str = "general",
        requires_confirmation: bool = False,
    ) -> Callable:
        """
        Decorator to register a function as a tool.
        
        Usage:
            @registry.register(
                name="get_weather",
                description="Get current weather for a location",
                parameters={
                    "type": "object",
                    "properties": {
                        "location": {"type": "string", "description": "City name"}
                    },
                    "required": ["location"]
                }
            )
            async def get_weather(location: str) -> str:
                ...
        """
        def decorator(func: Callable) -> Callable:
            tool_name = name or func.__name__
            tool_desc = description or func.__doc__ or "No description"
            tool_params = parameters or self._infer_parameters(func)
            
            tool = Tool(
                name=tool_name,
                description=tool_desc,
                handler=func,
                parameters=tool_params,
                category=category,
                requires_confirmation=requires_confirmation,
            )
            
            self._tools[tool_name] = tool
            
            # Track by category
            if category not in self._categories:
                self._categories[category] = []
            self._categories[category].append(tool_name)
            
            logger.info("tool_registered", name=tool_name, category=category)
            
            return func
        
        return decorator
    
    def _infer_parameters(self, func: Callable) -> dict:
        """Infer JSON schema parameters from function signature."""
        sig = inspect.signature(func)
        hints = get_type_hints(func) if hasattr(func, '__annotations__') else {}
        
        properties = {}
        required = []
        
        for param_name, param in sig.parameters.items():
            if param_name in ('self', 'cls'):
                continue
            
            param_type = hints.get(param_name, str)
            json_type = self._python_type_to_json(param_type)
            
            properties[param_name] = {
                "type": json_type,
                "description": f"Parameter: {param_name}"
            }
            
            if param.default is inspect.Parameter.empty:
                required.append(param_name)
        
        return {
            "type": "object",
            "properties": properties,
            "required": required
        }
    
    def _python_type_to_json(self, python_type) -> str:
        """Convert Python type to JSON schema type."""
        type_map = {
            str: "string",
            int: "integer",
            float: "number",
            bool: "boolean",
            list: "array",
            dict: "object",
        }
        return type_map.get(python_type, "string")
    
    def get_tool(self, name: str) -> Optional[Tool]:
        """Get a tool by name."""
        return self._tools.get(name)
    
    def get_all_tools(self) -> list[Tool]:
        """Get all registered tools."""
        return list(self._tools.values())
    
    def list_tools(self) -> list[Tool]:
        """Alias for get_all_tools for convenience."""
        return self.get_all_tools()
    
    def get_tools_by_category(self, category: str) -> list[Tool]:
        """Get tools in a specific category."""
        tool_names = self._categories.get(category, [])
        return [self._tools[name] for name in tool_names]
    
    def get_tools_for_llm(self) -> list[dict]:
        """
        Get tool definitions formatted for LLM function calling.
        
        Returns:
            List of tool definitions in OpenAI/Ollama format
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters
                }
            }
            for tool in self._tools.values()
        ]
    
    async def execute(self, name: str, **kwargs) -> Any:
        """Execute a tool by name."""
        tool = self.get_tool(name)
        if not tool:
            raise ValueError(f"Unknown tool: {name}")
        
        logger.info("tool_executing", name=name, args=kwargs)
        
        try:
            result = await tool.execute(**kwargs)
            logger.info("tool_executed", name=name, result_length=len(str(result)))
            return result
        except Exception as e:
            logger.error("tool_execution_error", name=name, error=str(e))
            raise
    
    def clear(self) -> None:
        """Clear all registered tools."""
        self._tools.clear()
        self._categories.clear()


# Global tool registry
tool_registry = ToolRegistry()


def register_tool(
    name: str = None,
    description: str = None,
    parameters: dict = None,
    category: str = "general",
) -> Callable:
    """Convenience decorator using global registry."""
    return tool_registry.register(
        name=name,
        description=description,
        parameters=parameters,
        category=category,
    )
