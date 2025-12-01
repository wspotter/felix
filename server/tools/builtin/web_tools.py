"""
Built-in web/search tools for the voice agent.
Uses DuckDuckGo for web search (no API key required).
"""
import httpx
import re
from typing import Optional
from dataclasses import dataclass

from ..registry import tool_registry


@dataclass
class FlyoutResult:
    """Result with optional flyout display."""
    text: str  # Text response for TTS
    flyout_type: Optional[str] = None  # "browser", "code", "terminal"
    flyout_content: Optional[str] = None  # URL or content to display


@tool_registry.register(
    description="FALLBACK: Search the web using DuckDuckGo. Only use this if knowledge_search returns no results.",
)
async def web_search(
    query: str,
    num_results: int = 5,
) -> str:
    """
    Search the web using DuckDuckGo.
    
    Args:
        query: Search query
        num_results: Maximum number of results to return (1-10)
        
    Returns:
        Search results summary
    """
    num_results = min(max(num_results, 1), 10)
    
    # DuckDuckGo HTML search (no API key needed)
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; VoiceAgent/1.0)"
            }
        )
        
        if response.status_code != 200:
            return f"Search failed with status {response.status_code}"
        
        html = response.text
    
    # Parse results (simple regex extraction)
    results = []
    
    # Find result blocks
    result_pattern = r'<a class="result__a" href="([^"]+)"[^>]*>([^<]+)</a>'
    snippet_pattern = r'<a class="result__snippet"[^>]*>([^<]+(?:<[^>]+>[^<]*)*)</a>'
    
    links = re.findall(result_pattern, html)
    snippets = re.findall(snippet_pattern, html)
    
    for i, (url, title) in enumerate(links[:num_results]):
        snippet = snippets[i] if i < len(snippets) else ""
        # Clean up snippet (remove HTML tags)
        snippet = re.sub(r'<[^>]+>', '', snippet).strip()
        
        results.append({
            "title": title.strip(),
            "snippet": snippet[:200],
        })
    
    if not results:
        return f"No results found for: {query}"
    
    # Format output
    lines = [f"Search results for '{query}':"]
    for i, r in enumerate(results, 1):
        lines.append(f"\n{i}. {r['title']}")
        if r['snippet']:
            lines.append(f"   {r['snippet']}")
    
    return "\n".join(lines)


@tool_registry.register(
    description="Get a quick answer or definition",
)
async def quick_answer(
    query: str,
) -> str:
    """
    Get a quick answer from DuckDuckGo Instant Answers.
    Good for definitions, calculations, and factual queries.
    
    Args:
        query: Question or term to look up
        
    Returns:
        Quick answer if available
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            "https://api.duckduckgo.com/",
            params={
                "q": query,
                "format": "json",
                "no_html": 1,
                "skip_disambig": 1,
            }
        )
        
        if response.status_code != 200:
            return f"Could not get answer for: {query}"
        
        data = response.json()
    
    # Check for instant answer
    answer = data.get("Answer", "")
    if answer:
        return answer
    
    # Check for abstract (Wikipedia-style)
    abstract = data.get("AbstractText", "")
    if abstract:
        source = data.get("AbstractSource", "")
        return f"{abstract[:500]}{'...' if len(abstract) > 500 else ''} (Source: {source})"
    
    # Check for definition
    definition = data.get("Definition", "")
    if definition:
        return definition
    
    # Check for related topics
    related = data.get("RelatedTopics", [])
    if related and len(related) > 0:
        first = related[0]
        if isinstance(first, dict) and "Text" in first:
            return first["Text"][:500]
    
    return f"No quick answer found for: {query}. Try a web search instead."


@tool_registry.register(
    description="Perform a calculation or unit conversion",
)
async def calculate(
    expression: str,
) -> str:
    """
    Perform a calculation or unit conversion.
    Uses DuckDuckGo's calculator.
    
    Args:
        expression: Math expression or conversion (e.g., "5 miles in km", "sqrt(144)")
        
    Returns:
        Calculation result
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            "https://api.duckduckgo.com/",
            params={
                "q": expression,
                "format": "json",
                "no_html": 1,
            }
        )
        
        if response.status_code != 200:
            return f"Calculation failed"
        
        data = response.json()
    
    answer = data.get("Answer", "")
    if answer:
        return answer
    
    # Try to evaluate simple expressions locally as fallback
    try:
        # Only allow safe operations
        allowed_chars = set("0123456789+-*/().^ ")
        clean_expr = expression.replace("^", "**")
        
        if all(c in allowed_chars for c in clean_expr):
            result = eval(clean_expr)
            return f"{expression} = {result}"
    except:
        pass
    
    return f"Could not calculate: {expression}"


@tool_registry.register(
    description="Open a URL in the browser flyout panel",
)
async def open_url(
    url: str,
    description: str = "",
) -> dict:
    """
    Open a URL in the browser flyout panel.
    Use this when the user asks to show, open, or display a website.
    
    Args:
        url: The URL to open (e.g., "https://example.com")
        description: Brief description of what you're showing
        
    Returns:
        Result with flyout data for the browser panel
    """
    # Ensure URL has protocol
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    return {
        "text": f"Opening {description or url} in the browser panel.",
        "flyout": {
            "type": "browser",
            "content": url
        }
    }


@tool_registry.register(
    description="Show code in the code editor flyout panel",
)
async def show_code(
    code: str,
    language: str = "python",
    description: str = "",
) -> dict:
    """
    Display code in the code editor flyout panel.
    Use this when showing code examples, snippets, or generated code.
    
    Args:
        code: The code to display
        language: Programming language for syntax highlighting
        description: Brief description of the code
        
    Returns:
        Result with flyout data for the code panel
    """
    return {
        "text": description or f"Here's the {language} code.",
        "flyout": {
            "type": "code",
            "content": code
        }
    }


@tool_registry.register(
    description="Run a command and show output in terminal flyout",
)
async def show_terminal(
    command: str,
    output: str,
) -> dict:
    """
    Display command output in the terminal flyout panel.
    Use this when showing command results or terminal output.
    
    Args:
        command: The command that was run
        output: The output to display
        
    Returns:
        Result with flyout data for the terminal panel
    """
    return {
        "text": f"Here's the output from running {command}.",
        "flyout": {
            "type": "terminal",
            "content": f"$ {command}\n{output}"
        }
    }
