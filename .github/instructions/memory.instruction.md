---
applyTo: '**'
---

# Project Memory

## Next Modules to Integrate

1. **CaviraOSS/OpenMemory** - https://github.com/CaviraOSS/OpenMemory
   - Priority: Next after current testing
   - Purpose: Long-term cognitive memory for AI agents (not just vector DB)
   - License: Apache 2.0
   
   ### Key Features:
   - Multi-sector memory (semantic, episodic, procedural, emotional, reflective)
   - Memory decay + salience + recency weighting
   - Temporal Knowledge Graph with time-bound facts
   - Waypoint graph for explainable recall paths
   - Works with Ollama embeddings (local-first)
   - MCP server integration
   - VS Code extension for coding activity memory
   
   ### Integration Options:
   - **Python SDK**: `pip install openmemory-py`
     ```python
     from openmemory import Memory
     mem = Memory()
     mem.add("User prefers dark mode", userId="user123")
     results = mem.query("preferences", filters={"user_id": "user123"})
     ```
   - **MCP Server**: `http://localhost:8080/mcp`
     - Tools: openmemory_query, openmemory_store, openmemory_list, openmemory_get, openmemory_reinforce
   
   ### Integration Plan for Felix:
   1. Add as tool in server/tools/builtin/memory_tools.py
   2. Store conversation memories with user context
   3. Enable cross-session recall (remember previous conversations)
   4. Use temporal facts for time-sensitive information
   5. Connect to MCP endpoint if running backend server

## Current Work in Progress

- Testing help_tools.py (LLM tool discovery)
- Testing improved tool calling with llama3.2 
- Knowledge search with test-facts dataset

## Completed Features

- Chat UI features: text input, mute button, history flyout, file attachments
- Help tools: list_available_tools, get_tool_help, suggest_tool
- Enhanced system prompt for tool usage
- Improved tool call argument parsing and fallback extraction

## Known Issues

- llama3.2 tool calling can return empty/fragmented arguments
- Added fallback text extraction to recover tool call arguments

## User Preferences

- Prefers concise communication
- Wants autonomous problem solving
- Using AMD MI50 GPUs via ROCm
