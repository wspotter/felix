#!/usr/bin/env python3
"""Test tool calling directly with Ollama"""
import asyncio
from server.llm.ollama import OllamaClient
from server.tools.registry import tool_registry

async def test():
    client = OllamaClient()
    
    # Only register knowledge_search
    for tool in tool_registry.list_tools():
        if tool.name == 'knowledge_search':
            client.register_tool(tool.name, tool.description, tool.parameters, tool.handler)
            print(f"Registered: {tool.name}")
            print(f"Description: {tool.description}")
            break
    
    messages = [
        {"role": "system", "content": "You are Nova. Use knowledge_search for Cherry Studio questions."},
        {"role": "user", "content": "What is Cherry Studio?"}
    ]
    
    print("\n=== Sending to Ollama ===")
    async for chunk in client.chat(messages):
        chunk_type = chunk.get('type', 'unknown')
        if chunk_type == 'tool_call':
            print(f"TOOL CALL: {chunk['name']}({chunk['arguments']})")
        elif chunk_type == 'tool_result':
            result = str(chunk.get('result', ''))[:300]
            print(f"TOOL RESULT: {result}...")
        elif chunk_type == 'text':
            print(f"TEXT: {chunk.get('content', '')}")
    
    await client.close()
    print("\n=== Done ===")

if __name__ == "__main__":
    asyncio.run(test())
