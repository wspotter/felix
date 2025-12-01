"""
Help & Introspection Tools
Provides the LLM with information about available tools and how to use them.
"""
from ..registry import tool_registry
import structlog

logger = structlog.get_logger()


@tool_registry.register(
    description="List all available tools and their descriptions. Call this first if you're unsure what tools you have or how to accomplish a task.",
    category="help",
    parameters={
        "type": "object",
        "properties": {
            "category": {
                "type": "string",
                "description": "Optional: filter by category (knowledge, general, weather, web, system, help)"
            }
        },
        "required": []
    }
)
async def list_available_tools(category: str = "") -> dict:
    """
    List all tools available to the assistant.
    
    Args:
        category: Optional category filter
        
    Returns:
        Dictionary with tool names, descriptions, and usage hints
    """
    tools = tool_registry.list_tools()
    
    # Filter by category if specified
    if category:
        category = category.lower().strip()
        tools = [t for t in tools if t.category.lower() == category]
    
    # Format tool information
    tool_list = []
    for tool in tools:
        tool_info = {
            "name": tool.name,
            "description": tool.description,
            "category": tool.category,
        }
        
        # Add parameter hints
        if tool.parameters and "properties" in tool.parameters:
            params = tool.parameters["properties"]
            required = tool.parameters.get("required", [])
            param_hints = []
            for param_name, param_info in params.items():
                req = "(required)" if param_name in required else "(optional)"
                param_hints.append(f"  - {param_name} {req}: {param_info.get('description', 'No description')}")
            if param_hints:
                tool_info["parameters"] = param_hints
        
        tool_list.append(tool_info)
    
    # Group by category
    categories = {}
    for t in tool_list:
        cat = t["category"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(t)
    
    # Build response text
    if not tool_list:
        return {"text": "No tools available.", "tools": []}
    
    lines = [f"You have {len(tool_list)} tools available:"]
    for cat, cat_tools in sorted(categories.items()):
        lines.append(f"\n## {cat.upper()} ({len(cat_tools)} tools)")
        for t in cat_tools:
            lines.append(f"- **{t['name']}**: {t['description']}")
    
    return {
        "text": "\n".join(lines),
        "tools": tool_list,
        "categories": list(categories.keys())
    }


@tool_registry.register(
    description="Get detailed help on how to use a specific tool, including all parameters and examples.",
    category="help",
    parameters={
        "type": "object",
        "properties": {
            "tool_name": {
                "type": "string",
                "description": "Name of the tool to get help for"
            }
        },
        "required": ["tool_name"]
    }
)
async def get_tool_help(tool_name: str) -> dict:
    """
    Get detailed help for a specific tool.
    
    Args:
        tool_name: Name of the tool
        
    Returns:
        Detailed tool documentation
    """
    tools = tool_registry.list_tools()
    tool = next((t for t in tools if t.name.lower() == tool_name.lower()), None)
    
    if not tool:
        # Try partial match
        matches = [t for t in tools if tool_name.lower() in t.name.lower()]
        if matches:
            suggestions = ", ".join(t.name for t in matches[:5])
            return {
                "text": f"Tool '{tool_name}' not found. Did you mean: {suggestions}?",
                "error": "not_found",
                "suggestions": [t.name for t in matches[:5]]
            }
        return {
            "text": f"Tool '{tool_name}' not found. Use list_available_tools to see all available tools.",
            "error": "not_found"
        }
    
    # Build detailed help
    lines = [
        f"# {tool.name}",
        f"Category: {tool.category}",
        f"\n{tool.description}",
        "\n## Parameters:"
    ]
    
    if tool.parameters and "properties" in tool.parameters:
        required = tool.parameters.get("required", [])
        for param_name, param_info in tool.parameters["properties"].items():
            req_str = "REQUIRED" if param_name in required else "optional"
            param_type = param_info.get("type", "any")
            desc = param_info.get("description", "No description")
            lines.append(f"- **{param_name}** ({param_type}, {req_str}): {desc}")
    else:
        lines.append("No parameters required.")
    
    # Add usage examples based on tool type
    lines.append("\n## Usage Examples:")
    examples = _get_tool_examples(tool.name)
    for ex in examples:
        lines.append(f"- {ex}")
    
    return {
        "text": "\n".join(lines),
        "tool": {
            "name": tool.name,
            "description": tool.description,
            "category": tool.category,
            "parameters": tool.parameters
        }
    }


def _get_tool_examples(tool_name: str) -> list[str]:
    """Get usage examples for common tools."""
    examples = {
        "knowledge_search": [
            'knowledge_search(query="how to configure Cherry Studio")',
            'knowledge_search(query="what is Felix mascot", dataset="test-facts")',
            'Use for ANY question about Cherry Studio, Felix, or local documentation'
        ],
        "list_knowledge_datasets": [
            'list_knowledge_datasets() - shows available knowledge bases',
            'Call this to see what datasets you can search'
        ],
        "get_weather": [
            'get_weather(location="San Francisco")',
            'get_weather(location="Paris, France")'
        ],
        "web_search": [
            'web_search(query="latest news about AI")',
            'web_search(query="python asyncio tutorial")'
        ],
        "get_current_time": [
            'get_current_time() - returns current time',
            'get_current_time(timezone="America/New_York")'
        ],
        "calculate": [
            'calculate(expression="2 + 2 * 3")',
            'calculate(expression="sqrt(144) + 10")'
        ],
        "list_available_tools": [
            'list_available_tools() - see all tools',
            'list_available_tools(category="knowledge") - filter by category'
        ],
    }
    
    return examples.get(tool_name, [
        f"Call {tool_name}() with the required parameters",
        "Check parameter descriptions above for details"
    ])


@tool_registry.register(
    description="Get guidance on which tool to use for a specific task. Describe what you want to do and get tool recommendations.",
    category="help",
    parameters={
        "type": "object",
        "properties": {
            "task": {
                "type": "string",
                "description": "Description of what you want to accomplish"
            }
        },
        "required": ["task"]
    }
)
async def suggest_tool(task: str) -> dict:
    """
    Suggest which tool to use for a given task.
    
    Args:
        task: Description of the task
        
    Returns:
        Tool recommendations with explanations
    """
    task_lower = task.lower()
    suggestions = []
    
    # Knowledge/documentation queries
    if any(word in task_lower for word in ["cherry studio", "documentation", "docs", "guide", "how to", "felix", "knowledge", "search knowledge"]):
        suggestions.append({
            "tool": "knowledge_search",
            "reason": "Search local knowledge bases for documentation and guides",
            "priority": "high"
        })
    
    # Time-related
    if any(word in task_lower for word in ["time", "date", "day", "when", "schedule", "calendar"]):
        suggestions.append({
            "tool": "get_current_time",
            "reason": "Get current time information",
            "priority": "high"
        })
        suggestions.append({
            "tool": "get_current_date",
            "reason": "Get current date",
            "priority": "medium"
        })
    
    # Weather
    if any(word in task_lower for word in ["weather", "temperature", "forecast", "rain", "sunny", "cold", "hot"]):
        suggestions.append({
            "tool": "get_weather",
            "reason": "Get current weather conditions",
            "priority": "high"
        })
        suggestions.append({
            "tool": "get_forecast",
            "reason": "Get weather forecast",
            "priority": "medium"
        })
    
    # Web search
    if any(word in task_lower for word in ["search", "find", "look up", "google", "internet", "web", "online"]):
        suggestions.append({
            "tool": "web_search",
            "reason": "Search the web for information",
            "priority": "high"
        })
    
    # Math/calculation
    if any(word in task_lower for word in ["calculate", "math", "compute", "add", "subtract", "multiply", "divide", "sum"]):
        suggestions.append({
            "tool": "calculate",
            "reason": "Perform mathematical calculations",
            "priority": "high"
        })
    
    # System info
    if any(word in task_lower for word in ["system", "computer", "memory", "cpu", "disk", "uptime", "resources"]):
        suggestions.append({
            "tool": "get_system_info",
            "reason": "Get system information",
            "priority": "high"
        })
    
    # Tools/help
    if any(word in task_lower for word in ["tool", "help", "what can you do", "capabilities", "available"]):
        suggestions.append({
            "tool": "list_available_tools",
            "reason": "See all available tools and capabilities",
            "priority": "high"
        })
    
    if not suggestions:
        # Default suggestions
        suggestions = [
            {"tool": "list_available_tools", "reason": "See all available tools to find what you need", "priority": "high"},
            {"tool": "knowledge_search", "reason": "Search local knowledge bases", "priority": "medium"},
            {"tool": "web_search", "reason": "Search the web for information", "priority": "medium"}
        ]
    
    # Sort by priority
    priority_order = {"high": 0, "medium": 1, "low": 2}
    suggestions.sort(key=lambda x: priority_order.get(x["priority"], 99))
    
    # Build response
    lines = [f"For task: '{task}'", "\nRecommended tools:"]
    for i, sug in enumerate(suggestions[:3], 1):
        lines.append(f"{i}. **{sug['tool']}** - {sug['reason']}")
    
    return {
        "text": "\n".join(lines),
        "suggestions": suggestions,
        "task": task
    }
