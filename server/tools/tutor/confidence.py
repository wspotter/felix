"""
Confidence Parser - Extract confidence from LLM responses.

Parses LLM output to extract:
- Tool name
- Arguments
- Confidence score (explicit or inferred)
"""

import re
import json
from typing import Optional, List, Tuple

from .interfaces import ToolCall

import structlog
logger = structlog.get_logger(__name__)


class ConfidenceParser:
    """
    Extracts tool calls and confidence from LLM responses.
    
    Supports multiple output formats:
    1. Explicit confidence: "CONFIDENCE: 0.85"
    2. JSON with confidence: {"tool": "x", "confidence": 0.85}
    3. Uncertainty phrases: "I think...", "maybe..."
    """
    
    def __init__(self):
        # Uncertainty phrases that reduce confidence
        self.uncertainty_phrases = [
            (r"\bi('m| am) not sure\b", -0.4),
            (r"\bmaybe\b", -0.3),
            (r"\bi think\b", -0.2),
            (r"\bperhaps\b", -0.25),
            (r"\bpossibly\b", -0.25),
            (r"\bcould be\b", -0.2),
            (r"\bmight be\b", -0.2),
            (r"\bnot certain\b", -0.35),
            (r"\bunsure\b", -0.35),
        ]
        
        # Confidence phrases that increase confidence
        self.confidence_phrases = [
            (r"\bdefinitely\b", 0.1),
            (r"\bcertainly\b", 0.1),
            (r"\bclearly\b", 0.05),
            (r"\bobviously\b", 0.05),
        ]
        
        # Compile patterns
        self.uncertainty_patterns = [
            (re.compile(p, re.IGNORECASE), adj) 
            for p, adj in self.uncertainty_phrases
        ]
        self.confidence_patterns = [
            (re.compile(p, re.IGNORECASE), adj) 
            for p, adj in self.confidence_phrases
        ]
    
    def parse(self, llm_response: str) -> Optional[ToolCall]:
        """
        Parse LLM response to extract tool call and confidence.
        
        Args:
            llm_response: Raw response from LLM
            
        Returns:
            ToolCall if found, None otherwise
        """
        # Try structured format first (TOOL: x, CONFIDENCE: y, ARGS: {})
        structured = self._parse_structured(llm_response)
        if structured:
            return structured
        
        # Try JSON format
        json_result = self._parse_json(llm_response)
        if json_result:
            return json_result
        
        # Try to extract just tool name and infer confidence
        basic = self._parse_basic(llm_response)
        if basic:
            return basic
        
        return None
    
    def _parse_structured(self, response: str) -> Optional[ToolCall]:
        """
        Parse structured format:
        TOOL: tool_name
        CONFIDENCE: 0.85
        ARGS: {"param": "value"}
        """
        tool_match = re.search(r"TOOL:\s*(\w+)", response, re.IGNORECASE)
        if not tool_match:
            return None
        
        tool = tool_match.group(1)
        
        # Extract confidence
        conf_match = re.search(r"CONFIDENCE:\s*([\d.]+)", response, re.IGNORECASE)
        if conf_match:
            confidence = float(conf_match.group(1))
            confidence = max(0.0, min(1.0, confidence))  # Clamp to 0-1
        else:
            confidence = self._infer_confidence(response)
        
        # Extract args
        args = {}
        args_match = re.search(r"ARGS:\s*(\{.*?\})", response, re.DOTALL)
        if args_match:
            try:
                args = json.loads(args_match.group(1))
            except json.JSONDecodeError:
                pass
        
        return ToolCall(
            tool=tool,
            args=args,
            confidence=confidence,
            raw_response=response
        )
    
    def _parse_json(self, response: str) -> Optional[ToolCall]:
        """
        Parse JSON format:
        {"tool": "tool_name", "confidence": 0.85, "args": {...}}
        
        Or tool_calls format:
        {"tool_calls": [{"function": {"name": "x", "arguments": {...}}}]}
        """
        # Find JSON in response
        json_match = re.search(r"\{.*\}", response, re.DOTALL)
        if not json_match:
            return None
        
        try:
            data = json.loads(json_match.group())
        except json.JSONDecodeError:
            return None
        
        # Format 1: Direct tool/args
        if "tool" in data:
            tool = data["tool"]
            args = data.get("args", data.get("arguments", {}))
            confidence = data.get("confidence", self._infer_confidence(response))
            
            return ToolCall(
                tool=tool,
                args=args if isinstance(args, dict) else {},
                confidence=confidence,
                raw_response=response
            )
        
        # Format 2: tool_calls array (OpenAI format)
        if "tool_calls" in data:
            tool_calls = data["tool_calls"]
            if tool_calls and len(tool_calls) > 0:
                call = tool_calls[0]
                func = call.get("function", {})
                tool = func.get("name", "")
                
                args = func.get("arguments", {})
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except json.JSONDecodeError:
                        args = {}
                
                return ToolCall(
                    tool=tool,
                    args=args,
                    confidence=self._infer_confidence(response),
                    raw_response=response
                )
        
        # Format 3: function/name format
        if "function" in data:
            func = data["function"]
            tool = func.get("name", "")
            args = func.get("arguments", {})
            
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            
            return ToolCall(
                tool=tool,
                args=args,
                confidence=self._infer_confidence(response),
                raw_response=response
            )
        
        return None
    
    def _parse_basic(self, response: str) -> Optional[ToolCall]:
        """
        Try to extract tool name from response text.
        
        Looks for common patterns like:
        - "I'll use the X tool"
        - "calling X"
        - "X(arguments)"
        """
        # Pattern: tool_name(args) or tool_name()
        func_match = re.search(r"\b(\w+)\s*\(([^)]*)\)", response)
        if func_match:
            tool = func_match.group(1)
            args_str = func_match.group(2)
            
            # Skip common false positives
            if tool.lower() in ["if", "for", "while", "print", "return", "def", "class"]:
                return None
            
            # Try to parse args
            args = {}
            if args_str:
                # Try JSON
                try:
                    args = json.loads("{" + args_str + "}")
                except:
                    # Try key=value pairs
                    for match in re.finditer(r"(\w+)\s*=\s*[\"']?([^,\"']+)[\"']?", args_str):
                        args[match.group(1)] = match.group(2)
            
            return ToolCall(
                tool=tool,
                args=args,
                confidence=self._infer_confidence(response),
                raw_response=response
            )
        
        # Pattern: "use the X tool" or "call X"
        use_match = re.search(r"(?:use|call|invoke|run)\s+(?:the\s+)?(\w+)", response, re.IGNORECASE)
        if use_match:
            tool = use_match.group(1)
            if tool.lower() not in ["a", "the", "this", "that"]:
                return ToolCall(
                    tool=tool,
                    args={},
                    confidence=self._infer_confidence(response) * 0.7,  # Lower confidence
                    raw_response=response
                )
        
        return None
    
    def _infer_confidence(self, response: str) -> float:
        """
        Infer confidence from response text.
        
        Starts at 0.8 (default) and adjusts based on
        uncertainty/confidence phrases.
        """
        confidence = 0.8  # Base confidence
        
        # Check for uncertainty
        for pattern, adjustment in self.uncertainty_patterns:
            if pattern.search(response):
                confidence += adjustment
        
        # Check for confidence boosters
        for pattern, adjustment in self.confidence_patterns:
            if pattern.search(response):
                confidence += adjustment
        
        # Clamp to 0-1
        return max(0.1, min(1.0, confidence))
    
    def get_candidates(self, response: str) -> List[str]:
        """
        Extract multiple tool candidates if LLM is unsure.
        
        Looks for patterns like "could be X or Y" or "X, Y, or Z".
        """
        candidates = []
        
        # Pattern: "X or Y"
        or_match = re.search(r"(\w+)\s+or\s+(\w+)", response)
        if or_match:
            candidates.extend([or_match.group(1), or_match.group(2)])
        
        # Pattern: "X, Y, or Z"
        list_match = re.search(r"(\w+),\s*(\w+),?\s*or\s+(\w+)", response)
        if list_match:
            candidates.extend([list_match.group(1), list_match.group(2), list_match.group(3)])
        
        return list(set(candidates))  # Dedupe
