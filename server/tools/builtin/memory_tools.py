# server/tools/builtin/memory_tools.py
"""
Long-term memory tools using OpenMemory.

These tools provide Felix with persistent memory across conversations:
- Remember facts, preferences, and important information about the user
- Recall relevant memories based on context
- Manage memory lifecycle (add, query, delete)

OpenMemory backend must be running at http://localhost:8080
"""

import logging
import httpx
from typing import Optional
from ..registry import tool_registry

logger = logging.getLogger(__name__)

# OpenMemory backend configuration
OPENMEMORY_URL = "http://localhost:8080"
OPENMEMORY_API_KEY = "dev-key-123"  # Match .env setting


async def _call_openmemory(endpoint: str, method: str = "GET", json_data: dict = None) -> dict:
    """Make an async request to the OpenMemory backend."""
    headers = {
        "Content-Type": "application/json",
        "X-API-Key": OPENMEMORY_API_KEY
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        url = f"{OPENMEMORY_URL}{endpoint}"
        
        if method == "GET":
            response = await client.get(url, headers=headers, params=json_data)
        elif method == "POST":
            response = await client.post(url, headers=headers, json=json_data)
        elif method == "DELETE":
            response = await client.delete(url, headers=headers)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        response.raise_for_status()
        return response.json()


@tool_registry.register(
    description="Remember something important about the user or conversation. Use this to store facts, preferences, personal details, or anything you might need to recall later. Examples: 'User's name is Sarah', 'User prefers dark mode', 'User is working on a Django project'."
)
async def remember(
    content: str,
    tags: Optional[str] = None,
    importance: Optional[str] = "normal"
) -> str:
    """
    Store a memory in long-term storage.
    
    Args:
        content: The information to remember (be specific and descriptive)
        tags: Comma-separated tags to categorize the memory (e.g., "preference,ui,settings")
        importance: Priority level - "low", "normal", or "high" (affects decay rate)
    
    Returns:
        Confirmation that the memory was stored
    """
    try:
        # Parse tags
        tag_list = [t.strip() for t in tags.split(",")] if tags else []
        
        payload = {
            "content": content,
            "tags": tag_list,
            "metadata": {"importance": importance}
        }
        
        result = await _call_openmemory("/memory/add", method="POST", json_data=payload)
        
        memory_id = result.get("id", "unknown")
        sector = result.get("primary_sector", "unknown")
        
        logger.info("memory_stored", content_preview=content[:50], id=memory_id, sector=sector)
        
        return f"Remembered: '{content}' (stored in {sector} memory, ID: {memory_id})"
        
    except httpx.HTTPStatusError as e:
        logger.error("memory_store_failed", error=str(e), status=e.response.status_code)
        return f"Failed to store memory: {e.response.status_code}"
    except httpx.ConnectError:
        logger.error("memory_store_failed", error="OpenMemory backend not reachable")
        return "Memory system unavailable - OpenMemory backend is not running"
    except Exception as e:
        logger.error("memory_store_failed", error=str(e))
        return f"Failed to store memory: {str(e)}"


@tool_registry.register(
    description="Recall memories relevant to a topic or question. Use this to retrieve previously stored information about the user, their preferences, past conversations, or any facts you've been asked to remember."
)
async def recall(
    query: str,
    limit: Optional[int] = 5,
    min_relevance: Optional[float] = 0.3
) -> str:
    """
    Search for relevant memories.
    
    Args:
        query: What to search for (describe what you're looking for)
        limit: Maximum number of memories to return (default 5)
        min_relevance: Minimum relevance score 0.0-1.0 (default 0.3)
    
    Returns:
        Relevant memories with their content and metadata
    """
    try:
        payload = {
            "query": query,
            "k": min(limit, 20),  # Cap at 20
            "filters": {
                "min_score": max(0.0, min(1.0, min_relevance))
            }
        }
        
        result = await _call_openmemory("/memory/query", method="POST", json_data=payload)
        
        memories = result.get("matches", [])
        
        if not memories:
            logger.info("memory_recall_empty", query=query)
            return f"No memories found for: '{query}'"
        
        # Format results
        output_lines = [f"Found {len(memories)} relevant memories:"]
        for i, mem in enumerate(memories, 1):
            content = mem.get("content", "")
            score = mem.get("score", 0)
            sector = mem.get("primary_sector", "unknown")
            salience = mem.get("salience", 0)
            mem_id = mem.get("id", "unknown")
            
            output_lines.append(f"\n{i}. [{sector}] (relevance: {score:.2f}, salience: {salience:.2f})")
            output_lines.append(f"   ID: {mem_id}")
            output_lines.append(f"   {content}")
        
        logger.info("memory_recalled", query=query, count=len(memories))
        return "\n".join(output_lines)
        
    except httpx.HTTPStatusError as e:
        logger.error("memory_recall_failed", error=str(e), status=e.response.status_code)
        return f"Failed to recall memories: {e.response.status_code}"
    except httpx.ConnectError:
        logger.error("memory_recall_failed", error="OpenMemory backend not reachable")
        return "Memory system unavailable - OpenMemory backend is not running"
    except Exception as e:
        logger.error("memory_recall_failed", error=str(e))
        return f"Failed to recall memories: {str(e)}"


@tool_registry.register(
    description="Forget a specific memory by its ID. Use this when asked to forget something or when a memory is no longer relevant."
)
async def forget(memory_id: str) -> str:
    """
    Delete a memory by its ID.
    
    Args:
        memory_id: The ID of the memory to delete (get this from recall results)
    
    Returns:
        Confirmation that the memory was deleted
    """
    try:
        await _call_openmemory(f"/memory/{memory_id}", method="DELETE")
        
        logger.info("memory_deleted", id=memory_id)
        return f"Memory {memory_id} has been forgotten."
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            return f"Memory {memory_id} not found - it may have already been forgotten."
        logger.error("memory_delete_failed", error=str(e), status=e.response.status_code)
        return f"Failed to forget memory: {e.response.status_code}"
    except httpx.ConnectError:
        logger.error("memory_delete_failed", error="OpenMemory backend not reachable")
        return "Memory system unavailable - OpenMemory backend is not running"
    except Exception as e:
        logger.error("memory_delete_failed", error=str(e))
        return f"Failed to forget memory: {str(e)}"


@tool_registry.register(
    description="Get an overview of all stored memories, optionally filtered by cognitive sector. Sectors: episodic (events/experiences), semantic (facts/knowledge), procedural (how-to/skills), emotional (feelings/reactions), reflective (insights/patterns)."
)
async def memory_status(
    sector: Optional[str] = None,
    limit: Optional[int] = 10
) -> str:
    """
    Get memory status and list stored memories.
    
    Args:
        sector: Filter by cognitive sector (episodic, semantic, procedural, emotional, reflective)
        limit: Maximum number of memories to list (default 10)
    
    Returns:
        Memory statistics and recent memories
    """
    try:
        # Get health/stats first
        health = await _call_openmemory("/health", method="GET")
        
        # Get memories - use query params
        params = {"l": min(limit, 50)}
        if sector:
            params["sector"] = sector
        
        result = await _call_openmemory("/memory/all", method="GET", json_data=params)
        memories = result.get("items", []) if isinstance(result, dict) else result
        
        # Format output
        tier = health.get("tier", "unknown")
        embedding_provider = health.get("embedding", {}).get("provider", "unknown")
        
        output_lines = [
            "📊 Memory System Status",
            f"   Tier: {tier}",
            f"   Embeddings: {embedding_provider}",
            f"   Memories shown: {len(memories)}",
            ""
        ]
        
        if sector:
            output_lines.append(f"📁 Memories in {sector} sector:")
        else:
            output_lines.append("📁 Recent memories:")
        
        if not memories:
            output_lines.append("   (no memories stored)")
        else:
            for mem in memories[:limit]:
                content = mem.get("content", "")[:60]
                sector_name = mem.get("primary_sector", "?")
                salience = mem.get("salience", 0)
                mem_id = mem.get("id", "?")[:8]
                output_lines.append(f"   • [{sector_name}] {content}{'...' if len(mem.get('content', '')) > 60 else ''} (salience: {salience:.2f}, id: {mem_id}...)")
        
        logger.info("memory_status_retrieved", count=len(memories), sector=sector)
        return "\n".join(output_lines)
        
    except httpx.ConnectError:
        logger.error("memory_status_failed", error="OpenMemory backend not reachable")
        return "Memory system unavailable - OpenMemory backend is not running at http://localhost:8080"
    except Exception as e:
        logger.error("memory_status_failed", error=str(e))
        return f"Failed to get memory status: {str(e)}"
