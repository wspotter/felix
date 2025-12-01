"""
LLM Client
Supports Ollama, LM Studio, and OpenAI-compatible APIs.
Streaming responses with function/tool calling support.
"""
import asyncio
import json
import re
from typing import AsyncGenerator, Optional, Any, Literal
import httpx
import structlog

from ..config import settings
from .conversation import ConversationHistory

logger = structlog.get_logger()

# Backend types
BackendType = Literal["ollama", "lmstudio", "openai"]


def extract_json_tool_calls(text: str) -> list[dict]:
    """
    Extract tool calls from text that may contain JSON tool call syntax.
    Handles models that output tool calls as text instead of using the API.
    
    Returns list of dicts with 'name' and 'arguments' keys.
    """
    tool_calls = []
    
    # Pattern 1: {"name": "tool_name", "arguments": {...}} - flexible nested braces
    # This handles cases where arguments might have nested objects
    json_pattern = r'\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"(?:arguments|parameters)"\s*:\s*(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})\s*\}'
    
    for match in re.finditer(json_pattern, text, re.DOTALL):
        try:
            name = match.group(1)
            args_str = match.group(2)
            args = json.loads(args_str)
            tool_calls.append({"name": name, "arguments": args})
            logger.debug("extracted_tool_call_pattern1", name=name, args=args)
        except json.JSONDecodeError as e:
            logger.debug("tool_call_parse_failed_pattern1", error=str(e))
            continue
    
    # Pattern 2: Try to find and parse any JSON object with name and arguments/parameters
    if not tool_calls:
        # More aggressive pattern - find any JSON-like structure
        json_block_pattern = r'\{[^{}]*"name"[^{}]*\}'
        for match in re.finditer(json_block_pattern, text):
            try:
                parsed = json.loads(match.group(0))
                if "name" in parsed and ("arguments" in parsed or "parameters" in parsed):
                    args = parsed.get("arguments", parsed.get("parameters", {}))
                    tool_calls.append({"name": parsed["name"], "arguments": args})
                    logger.debug("extracted_tool_call_pattern2", name=parsed["name"])
            except json.JSONDecodeError:
                continue
    
    # Pattern 3: Look for JSON blocks in code fences
    if not tool_calls:
        code_block_pattern = r'```(?:json)?\s*(\{[^`]+\})\s*```'
        for match in re.finditer(code_block_pattern, text, re.DOTALL):
            try:
                parsed = json.loads(match.group(1))
                if "name" in parsed and ("arguments" in parsed or "parameters" in parsed):
                    args = parsed.get("arguments", parsed.get("parameters", {}))
                    tool_calls.append({"name": parsed["name"], "arguments": args})
                    logger.debug("extracted_tool_call_pattern3", name=parsed["name"])
            except json.JSONDecodeError:
                continue
    
    # Pattern 4: Try to reconstruct from fragmented JSON (llama3.2 specific)
    # Look for patterns like: {"name": "web_search", "arguments": {"query": "..."}}
    if not tool_calls and '"name"' in text and ('"arguments"' in text or '"parameters"' in text):
        # Try to extract the whole thing as one JSON
        try:
            # Find the start and end of what looks like a tool call
            start_idx = text.find('{')
            if start_idx >= 0:
                # Count braces to find matching end
                depth = 0
                end_idx = start_idx
                for i, c in enumerate(text[start_idx:], start_idx):
                    if c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                        if depth == 0:
                            end_idx = i + 1
                            break
                
                if end_idx > start_idx:
                    json_str = text[start_idx:end_idx]
                    parsed = json.loads(json_str)
                    if "name" in parsed and ("arguments" in parsed or "parameters" in parsed):
                        args = parsed.get("arguments", parsed.get("parameters", {}))
                        tool_calls.append({"name": parsed["name"], "arguments": args})
                        logger.debug("extracted_tool_call_pattern4", name=parsed["name"])
        except (json.JSONDecodeError, ValueError) as e:
            logger.debug("tool_call_parse_failed_pattern4", error=str(e))
    
    return tool_calls


def _clean_tool_artifacts(text: str) -> str:
    """
    Remove tool call JSON artifacts from text.
    llama3.2 sometimes outputs partial JSON when making tool calls.
    """
    if not text:
        return text
    
    # Remove various JSON-like patterns
    patterns = [
        # Full tool call objects
        r'\{"name"\s*:\s*"[^"]+"\s*,\s*"(?:arguments|parameters)"\s*:\s*\{[^}]*\}\s*\}',
        # Array wrappers
        r'\[\s*\{"name"[^]]*\}\s*\]',
        # Partial JSON fragments - leading quote/comma patterns
        r'^["\s,]*"(?:parameters|arguments)"\s*:\s*\{[^}]*\}\s*\}?\s*\]?',
        r'",\s*"(?:parameters|arguments)"\s*:\s*\{[^}]*\}\s*\]?',
        # Trailing brackets and braces
        r'^\s*\}\s*\]?\s*$',
        r'^\s*\]\s*$',
        # Generic partial JSON
        r'\{\s*"name"\s*:\s*"[^"]*"[^}]*\}',
        # Function call patterns
        r'\{"function"\s*:\s*\{[^}]*\}\}',
        # Code fence wrappers
        r'```(?:json)?\s*\{[^`]*\}\s*```',
        # Full line that's just JSON
        r'^\s*[\[\{].*[\]\}]\s*$',
        # Isolated JSON syntax chars with optional whitespace
        r'^\s*["\[\]\{\},:\s]+\s*$',
    ]
    
    result = text
    for pattern in patterns:
        result = re.sub(pattern, '', result, flags=re.DOTALL | re.IGNORECASE | re.MULTILINE)
    
    # Clean up whitespace
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = result.strip()
    
    return result


class LLMClient:
    """
    Async LLM client with streaming and tool support.
    Supports Ollama, LM Studio, and OpenAI-compatible APIs.
    """
    
    def __init__(
        self,
        backend: BackendType = None,
        base_url: str = None,
        model: str = None,
        temperature: float = None,
        max_tokens: int = None,
        api_key: str = None,
    ):
        """
        Initialize LLM client.
        
        Args:
            backend: Backend type (ollama, lmstudio, openai)
            base_url: API URL (auto-detected from backend if not provided)
            model: Model name
            temperature: Generation temperature
            max_tokens: Maximum response tokens
            api_key: API key (for OpenAI-compatible backends)
        """
        self.backend = backend or getattr(settings, 'llm_backend', 'ollama')
        
        # Set default URL based on backend if not provided
        if base_url:
            self.base_url = base_url.rstrip("/")
        else:
            if self.backend == "lmstudio":
                self.base_url = getattr(settings, 'lmstudio_url', 'http://localhost:1234')
            elif self.backend == "openai":
                self.base_url = getattr(settings, 'openai_url', 'https://api.openai.com')
            else:  # ollama
                self.base_url = getattr(settings, 'ollama_url', 'http://localhost:11434')
            self.base_url = self.base_url.rstrip("/")
        
        self.model = model or settings.ollama_model
        self.temperature = temperature if temperature is not None else settings.ollama_temperature
        self.max_tokens = max_tokens or settings.ollama_max_tokens
        self.api_key = api_key or getattr(settings, 'openai_api_key', '')
        
        self._client: Optional[httpx.AsyncClient] = None
        self._tools: list[dict] = []
        self._tool_handlers: dict[str, callable] = {}
        
        logger.info(
            "llm_client_config",
            backend=self.backend,
            url=self.base_url,
            model=self.model,
            temperature=self.temperature
        )
    
    def update_config(
        self,
        backend: BackendType = None,
        base_url: str = None,
        model: str = None,
        api_key: str = None,
    ) -> None:
        """
        Update client configuration.
        Closes existing client connection to force reconnection.
        """
        if backend:
            self.backend = backend
        if base_url:
            self.base_url = base_url.rstrip("/")
        if model:
            self.model = model
        if api_key is not None:
            self.api_key = api_key
        
        # Close existing client so it reconnects with new config
        if self._client:
            asyncio.create_task(self._client.aclose())
            self._client = None
        
        logger.info(
            "llm_client_reconfigured",
            backend=self.backend,
            url=self.base_url,
            model=self.model
        )
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if self._client is None:
            headers = {}
            # Add API key for OpenAI-compatible backends
            if self.api_key and self.backend in ("openai", "lmstudio"):
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=httpx.Timeout(60.0, connect=10.0)
            )
        return self._client
    
    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
    
    def register_tool(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: callable
    ) -> None:
        """
        Register a tool for function calling.
        
        Args:
            name: Tool name
            description: Tool description
            parameters: JSON schema for parameters
            handler: Async function to handle tool calls
        """
        tool_def = {
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters
            }
        }
        self._tools.append(tool_def)
        self._tool_handlers[name] = handler
        
        logger.info("tool_registered", name=name)
    
    def clear_tools(self) -> None:
        """Clear all registered tools."""
        self._tools.clear()
        self._tool_handlers.clear()
    
    def _get_api_endpoint(self) -> str:
        """Get the correct API endpoint for the current backend."""
        if self.backend == "ollama":
            return "/api/chat"
        else:
            # LM Studio and OpenAI use /v1/chat/completions
            return "/v1/chat/completions"
    
    def _build_request_body(self, messages: list[dict], stream: bool) -> dict:
        """Build request body for the current backend."""
        if self.backend == "ollama":
            # Ollama format
            request_body = {
                "model": self.model,
                "messages": messages,
                "stream": stream,
                "options": {
                    "temperature": self.temperature,
                    "num_predict": self.max_tokens,
                }
            }
            if self._tools:
                request_body["tools"] = self._tools
        else:
            # OpenAI/LM Studio format
            request_body = {
                "model": self.model,
                "messages": messages,
                "stream": stream,
                "temperature": self.temperature,
                "max_tokens": self.max_tokens,
            }
            if self._tools:
                request_body["tools"] = self._tools
        
        return request_body
    
    async def chat(
        self,
        messages: list[dict],
        stream: bool = True,
    ) -> AsyncGenerator[dict, None]:
        """
        Send a chat completion request with streaming.
        
        Args:
            messages: Conversation messages
            stream: Whether to stream the response
            
        Yields:
            Response chunks with type: "text", "tool_call", or "tool_result"
        """
        client = await self._get_client()
        endpoint = self._get_api_endpoint()
        request_body = self._build_request_body(messages, stream)
        
        logger.info(
            "chat_request_start", 
            backend=self.backend, 
            base_url=self.base_url,
            endpoint=endpoint,
            model=self.model, 
            messages_count=len(messages)
        )
        
        try:
            if stream:
                async for chunk in self._stream_chat(client, request_body, endpoint):
                    yield chunk
            else:
                response = await client.post(endpoint, json=request_body)
                response.raise_for_status()
                data = response.json()
                
                # Handle response based on backend format
                if self.backend == "ollama" and "message" in data:
                    content = data["message"].get("content", "")
                    if content:
                        yield {"type": "text", "content": content}
                    tool_calls = data["message"].get("tool_calls", [])
                    for tool_call in tool_calls:
                        yield {"type": "tool_call", **tool_call}
                elif "choices" in data:  # OpenAI format
                    for choice in data.get("choices", []):
                        message = choice.get("message", {})
                        content = message.get("content", "")
                        if content:
                            yield {"type": "text", "content": content}
                        # Handle tool calls in OpenAI format
                        tool_calls = message.get("tool_calls", [])
                        for tool_call in tool_calls:
                            yield {"type": "tool_call", **tool_call}
                        
        except httpx.HTTPError as e:
            logger.error("chat_error", error=str(e), backend=self.backend)
            raise
    
    async def _stream_chat(
        self,
        client: httpx.AsyncClient,
        request_body: dict,
        endpoint: str
    ) -> AsyncGenerator[dict, None]:
        """Stream chat completion responses."""
        
        accumulated_content = ""
        pending_chunks = []  # Buffer chunks until we know if there are tool calls
        tool_calls = []
        has_yielded_text = False
        
        # Repetition detection
        recent_phrases = []
        repetition_threshold = 4  # Stop if same phrase repeated 4+ times
        
        async with client.stream("POST", endpoint, json=request_body) as response:
            response.raise_for_status()
            
            async for line in response.aiter_lines():
                if not line:
                    continue
                
                # Handle SSE format for OpenAI-compatible APIs
                if line.startswith("data: "):
                    line = line[6:]  # Remove "data: " prefix
                if line == "[DONE]":
                    break
                
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                
                # Handle streaming content based on backend format
                if self.backend == "ollama" and "message" in data:
                    message = data["message"]
                    
                    # Log raw message for debugging tool call issues
                    if "tool_calls" in message or logger.isEnabledFor(10):  # DEBUG level
                        logger.debug("ollama_raw_message", message=message, done=data.get("done", False))
                    
                    # Text content - buffer it first
                    content = message.get("content", "")
                    if content:
                        accumulated_content += content
                        pending_chunks.append(content)
                    
                    # Tool calls (usually in final message)
                    if "tool_calls" in message:
                        raw_tool_calls = message["tool_calls"]
                        logger.info("ollama_tool_calls_received", count=len(raw_tool_calls), tool_calls=raw_tool_calls)
                        tool_calls.extend(raw_tool_calls)
                    
                    # Check if done (Ollama format)
                    if data.get("done", False):
                        logger.info("ollama_stream_done", accumulated_content_length=len(accumulated_content), tool_calls_count=len(tool_calls))
                        break
                        
                elif "choices" in data:
                    # OpenAI/LM Studio format
                    repetition_detected = False
                    for choice in data.get("choices", []):
                        delta = choice.get("delta", {})
                        
                        # Text content
                        content = delta.get("content", "")
                        if content:
                            accumulated_content += content
                            pending_chunks.append(content)
                        
                            # Repetition detection - check for loops
                            # Look for repeated short phrases (like "I'm ready.")
                            if len(accumulated_content) > 50:
                                # Check last 200 chars for repetition patterns
                                check_text = accumulated_content[-200:]
                                # Common loop patterns
                                for pattern in ["I'm ready", "I am ready", "Ready.", "...", "I'm here"]:
                                    count = check_text.lower().count(pattern.lower())
                                    if count >= repetition_threshold:
                                        logger.warning("repetition_detected", pattern=pattern, count=count)
                                        # Truncate to before repetition started
                                        first_idx = accumulated_content.lower().find(pattern.lower())
                                        if first_idx > 0:
                                            accumulated_content = accumulated_content[:first_idx].strip()
                                        else:
                                            accumulated_content = "I apologize, I had trouble responding. Could you please rephrase your question?"
                                        repetition_detected = True
                                        break
                            
                            # Also check for excessive length (likely stuck)
                            if len(accumulated_content) > 2000:
                                logger.warning("response_too_long", length=len(accumulated_content))
                                accumulated_content = accumulated_content[:1500] + "..."
                                repetition_detected = True
                        
                        # Tool calls
                        if "tool_calls" in delta:
                            tool_calls.extend(delta["tool_calls"])
                        
                        # Check finish reason
                        if choice.get("finish_reason"):
                            break
                    
                    if repetition_detected:
                        break  # Exit the line iteration loop
        
        # After streaming completes, decide what to yield
        # If we got tool calls via API, DON'T yield the text content
        # (llama3.2 sometimes outputs partial JSON in content when using tools)
        
        # Check if any API tool calls have empty/invalid arguments
        # If so, try to extract from text content instead
        valid_tool_calls = []
        needs_text_extraction = False
        fragmented_json_parts = []  # Collect JSON fragments from malformed tool calls
        main_tool_name = None  # Track the tool name from the first valid-looking call
        
        for tc in tool_calls:
            func = tc.get("function", {})
            tool_name = func.get("name", "")
            args = func.get("arguments", {})
            
            # If this looks like a real tool name, remember it
            if tool_name and tool_name in self._tool_handlers:
                main_tool_name = tool_name
            
            # Check if arguments are actually useful
            if isinstance(args, str) and args.strip():
                try:
                    parsed = json.loads(args)
                    if parsed:  # Non-empty dict
                        valid_tool_calls.append(tc)
                        continue
                except json.JSONDecodeError:
                    # This might be a JSON fragment - collect it
                    fragmented_json_parts.append(args)
            elif isinstance(args, dict) and args:  # Non-empty dict
                valid_tool_calls.append(tc)
                continue
            else:
                # Empty args - this is a fragment, collect the args string if any
                if isinstance(args, str):
                    fragmented_json_parts.append(args)
                    
            # If we get here, tool call has empty/invalid args
            needs_text_extraction = True
            logger.debug("tool_call_empty_args", tool=tool_name, args=args)
        
        # Try to reconstruct tool call from fragments
        if needs_text_extraction and fragmented_json_parts and main_tool_name:
            reconstructed = "".join(fragmented_json_parts)
            logger.info("attempting_fragment_reconstruction", tool=main_tool_name, fragments=len(fragmented_json_parts), reconstructed=reconstructed[:200])
            
            # Try to parse the reconstructed JSON
            try:
                parsed_args = json.loads(reconstructed)
                if parsed_args:
                    valid_tool_calls = [{"function": {"name": main_tool_name, "arguments": parsed_args}}]
                    logger.info("reconstructed_tool_call", tool=main_tool_name, args=parsed_args)
                    needs_text_extraction = False
            except json.JSONDecodeError as e:
                # Try to fix common issues with incomplete JSON
                fixed = reconstructed
                
                # Remove trailing incomplete key-value pairs like ', "key": }' or ', "key": }'
                import re
                # Pattern: comma followed by incomplete field (key with no value or empty value)
                fixed = re.sub(r',\s*"[^"]+"\s*:\s*\}$', '}', fixed)
                fixed = re.sub(r',\s*"[^"]+"\s*:\s*$', '', fixed)
                
                # Try to close unclosed braces
                open_braces = fixed.count('{') - fixed.count('}')
                if open_braces > 0:
                    fixed = fixed.rstrip() + '}' * open_braces
                
                logger.debug("attempting_json_fix", original=reconstructed[:100], fixed=fixed[:100])
                
                try:
                    parsed_args = json.loads(fixed)
                    if parsed_args:
                        valid_tool_calls = [{"function": {"name": main_tool_name, "arguments": parsed_args}}]
                        logger.info("reconstructed_tool_call_fixed", tool=main_tool_name, args=parsed_args)
                        needs_text_extraction = False
                except json.JSONDecodeError as e2:
                    logger.warning("fragment_reconstruction_failed", error=str(e), reconstructed=reconstructed[:200])
        
        # If any tool calls had empty args, try text extraction from accumulated content
        if needs_text_extraction and accumulated_content and self._tools:
            logger.info("trying_text_extraction", content_length=len(accumulated_content), content_preview=accumulated_content[:200])
            text_tool_calls = extract_json_tool_calls(accumulated_content)
            if text_tool_calls:
                valid_tool_calls = [{"function": {"name": tc["name"], "arguments": tc.get("arguments", {})}} for tc in text_tool_calls]
                logger.info("text_tool_calls_extracted_fallback", count=len(valid_tool_calls))
        
        tool_calls = valid_tool_calls
        
        if not tool_calls:
            # No API tool calls - yield the accumulated text
            # First check if it looks like tool call JSON that we should parse
            if accumulated_content and self._tools:
                text_tool_calls = extract_json_tool_calls(accumulated_content)
                if text_tool_calls:
                    tool_calls = [{"function": {"name": tc["name"], "arguments": tc.get("arguments", {})}} for tc in text_tool_calls]
                    logger.info("text_tool_calls_extracted", count=len(tool_calls))
            
            # If still no tool calls, yield the text content
            if not tool_calls and accumulated_content:
                # Clean any remaining JSON fragments
                cleaned = _clean_tool_artifacts(accumulated_content)
                if cleaned.strip():
                    yield {"type": "text", "content": cleaned}
                    has_yielded_text = True
        
        # Process API-based tool calls first
        for tool_call in tool_calls:
            func = tool_call.get("function", {})
            tool_name = func.get("name", "")
            tool_args = func.get("arguments", {})
            tool_call_id = tool_call.get("id", f"call_{tool_name}")
            
            # Skip invalid tool calls (empty name or not a recognized tool)
            if not tool_name or tool_name not in self._tool_handlers:
                logger.debug("skipping_invalid_tool_call", name=tool_name, has_handler=tool_name in self._tool_handlers)
                continue
            
            # Parse arguments if they're a JSON string (common with Qwen3, LM Studio)
            if isinstance(tool_args, str):
                try:
                    tool_args = json.loads(tool_args)
                    logger.debug("parsed_string_tool_args", tool=tool_name, args=tool_args)
                except json.JSONDecodeError as e:
                    logger.warning("tool_args_parse_error", tool=tool_name, args=tool_args, error=str(e))
                    # Try to use text extraction as fallback for this specific tool
                    if accumulated_content:
                        text_calls = extract_json_tool_calls(accumulated_content)
                        for tc in text_calls:
                            if tc.get("name") == tool_name:
                                tool_args = tc.get("arguments", {})
                                logger.info("recovered_args_from_text", tool=tool_name, args=tool_args)
                                break
                        else:
                            tool_args = {}
                    else:
                        tool_args = {}
            
            # Skip if still no valid arguments for tools that require them
            if not tool_args:
                # Check if the tool has required parameters
                tool = None
                for t in self._tools:
                    if t.get("function", {}).get("name") == tool_name:
                        tool = t
                        break
                
                if tool:
                    params = tool.get("function", {}).get("parameters", {})
                    required = params.get("required", [])
                    if required:
                        logger.warning("skipping_tool_missing_required_args", tool=tool_name, required=required)
                        continue
            
            logger.info("executing_tool_call", tool=tool_name, args=tool_args)
            
            yield {
                "type": "tool_call",
                "id": tool_call_id,
                "name": tool_name,
                "arguments": tool_args
            }
            
            # Execute tool
            try:
                handler = self._tool_handlers[tool_name]
                if asyncio.iscoroutinefunction(handler):
                    result = await handler(**tool_args)
                else:
                    result = handler(**tool_args)
                
                yield {
                    "type": "tool_result",
                    "name": tool_name,
                    "result": str(result)
                }
            except Exception as e:
                logger.error("tool_execution_error", tool=tool_name, error=str(e))
                yield {
                    "type": "tool_result",
                    "name": tool_name,
                    "result": f"Error: {str(e)}"
                }
        
    async def generate_response(
        self,
        user_input: str,
        conversation: ConversationHistory,
        auto_execute_tools: bool = True,
    ) -> AsyncGenerator[dict, None]:
        """
        Generate a response with full conversation context.
        
        Args:
            user_input: User's message
            conversation: Conversation history
            auto_execute_tools: Whether to automatically execute tool calls
            
        Yields:
            Response chunks
        """
        # Add user message to history
        conversation.add_user_message(user_input)
        
        # Get messages for API
        messages = conversation.get_messages()
        
        # Generate response
        full_response = ""
        tool_calls = []
        
        async for chunk in self.chat(messages):
            if chunk["type"] == "text":
                full_response += chunk["content"]
                yield chunk
            elif chunk["type"] == "tool_call":
                tool_calls.append(chunk)
                yield chunk
            elif chunk["type"] == "tool_result":
                yield chunk
        
        # Add assistant response to history
        conversation.add_assistant_message(
            full_response,
            tool_calls=tool_calls if tool_calls else None
        )
    
    async def health_check(self) -> bool:
        """Check if Ollama is reachable."""
        try:
            client = await self._get_client()
            response = await client.get("/api/tags")
            return response.status_code == 200
        except Exception as e:
            logger.error("health_check_failed", error=str(e))
            return False


# Backward compatibility alias
OllamaClient = LLMClient


# Global LLM client instance
_llm_client: Optional[LLMClient] = None


async def get_llm_client() -> LLMClient:
    """Get or create the global LLM client."""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client

