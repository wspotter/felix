"""
OpenTelemetry tracing setup for Voice Agent.

Traces the full voice pipeline: STT → LLM → Tool Execution → TTS
"""

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.trace import Status, StatusCode
from functools import wraps
import structlog
import os

logger = structlog.get_logger(__name__)

# Global tracer instance
_tracer: trace.Tracer | None = None
_tracing_enabled: bool = False


def init_tracing(
    service_name: str = "voice-agent",
    otlp_endpoint: str = None
) -> trace.Tracer:
    """
    Initialize OpenTelemetry tracing.
    
    Args:
        service_name: Name of the service for traces
        otlp_endpoint: OTLP HTTP endpoint (AI Toolkit default: localhost:4318)
    
    Returns:
        Configured tracer instance
    """
    global _tracer, _tracing_enabled
    
    if _tracer is not None:
        return _tracer
    
    # Check if tracing is enabled via environment or config
    from .config import settings
    _tracing_enabled = settings.otel_enabled
    
    if not _tracing_enabled:
        logger.info("tracing_disabled", reason="OTEL_ENABLED=false")
        # Return a no-op tracer
        _tracer = trace.get_tracer(__name__)
        return _tracer
    
    # Use endpoint from settings if not provided
    if otlp_endpoint is None:
        otlp_endpoint = settings.otel_endpoint
    
    # Create resource with service info
    resource = Resource.create({
        "service.name": service_name,
        "service.version": "1.0.0",
        "deployment.environment": "development",
    })
    
    # Create tracer provider
    provider = TracerProvider(resource=resource)
    
    # Add OTLP exporter
    otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
    provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
    
    # Set as global provider
    trace.set_tracer_provider(provider)
    
    # Instrument httpx for LLM calls
    HTTPXClientInstrumentor().instrument()
    
    # Get tracer
    _tracer = trace.get_tracer(__name__)
    
    logger.info("tracing_initialized", endpoint=otlp_endpoint)
    
    return _tracer


def get_tracer() -> trace.Tracer:
    """Get the global tracer instance, initializing if needed."""
    global _tracer
    if _tracer is None:
        _tracer = init_tracing()
    return _tracer


def trace_span(name: str, attributes: dict = None):
    """
    Decorator to trace a function as a span.
    
    Usage:
        @trace_span("stt.transcribe")
        async def transcribe(audio: bytes) -> str:
            ...
    """
    def decorator(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(name) as span:
                if attributes:
                    for key, value in attributes.items():
                        span.set_attribute(key, value)
                try:
                    result = await func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            tracer = get_tracer()
            with tracer.start_as_current_span(name) as span:
                if attributes:
                    for key, value in attributes.items():
                        span.set_attribute(key, value)
                try:
                    result = func(*args, **kwargs)
                    span.set_status(Status(StatusCode.OK))
                    return result
                except Exception as e:
                    span.set_status(Status(StatusCode.ERROR, str(e)))
                    span.record_exception(e)
                    raise
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper
    
    return decorator


class SpanContext:
    """Context manager for creating traced spans with attributes."""
    
    def __init__(self, name: str, **attributes):
        self.name = name
        self.attributes = attributes
        self.span = None
    
    def __enter__(self):
        tracer = get_tracer()
        self.span = tracer.start_span(self.name)
        self.span.__enter__()
        for key, value in self.attributes.items():
            if value is not None:
                self.span.set_attribute(key, value)
        return self.span
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.span.set_status(Status(StatusCode.ERROR, str(exc_val)))
            self.span.record_exception(exc_val)
        else:
            self.span.set_status(Status(StatusCode.OK))
        self.span.__exit__(exc_type, exc_val, exc_tb)
        return False


# Convenience functions for common span types
def start_pipeline_span(client_id: str, transcript: str = None):
    """Start a span for the full voice pipeline."""
    return SpanContext(
        "voice.pipeline",
        client_id=client_id,
        transcript=transcript
    )


def start_stt_span(audio_bytes: int, model: str = None):
    """Start a span for STT transcription."""
    return SpanContext(
        "stt.transcribe",
        audio_bytes=audio_bytes,
        model=model or "whisper-large-v3-turbo"
    )


def start_llm_span(model: str, messages_count: int, has_tools: bool = False):
    """Start a span for LLM generation."""
    return SpanContext(
        "llm.generate",
        model=model,
        messages_count=messages_count,
        has_tools=has_tools
    )


def start_tool_span(tool_name: str, arguments: dict = None):
    """Start a span for tool execution."""
    return SpanContext(
        f"tool.{tool_name}",
        tool_name=tool_name,
        arguments=str(arguments) if arguments else None
    )


def start_tts_span(text_length: int, voice: str):
    """Start a span for TTS synthesis."""
    return SpanContext(
        "tts.synthesize",
        text_length=text_length,
        voice=voice
    )
