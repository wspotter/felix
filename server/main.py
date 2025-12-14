"""
Main FastAPI server for Voice Agent.
Production-ready with GPU acceleration.

⚠️ NOTE: If executing MERGE_INSTRUCTIONS_FOR_LLM.md, follow only that file.
Hardware-specific references in this file are for documentation only.
"""
import asyncio
import json
import os
import base64
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager
import threading

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
import time
from collections import deque
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import structlog

from .config import settings
from .session import Session, SessionState
from .audio.vad import create_vad, SileroVAD
from .stt.whisper import get_stt  # faster-whisper with CUDA
from .llm.ollama import get_llm_client, list_models_for_backend
from .tts.piper_tts import get_tts, list_voices  # Piper local TTS
from .tools import tool_registry, tool_executor
from .tools.tutor.tutor import create_tool_tutor
from .tracing import init_tracing, get_tracer, start_stt_span, start_llm_span, start_tool_span, start_tts_span
from .auth import get_auth_manager
from .storage.local_persistence import (
    load_user_settings as load_local_settings,
    save_user_settings as save_local_settings,
    load_history as load_local_history,
    save_history as save_local_history,
)
from .comfy_service import initialize_comfy_service, shutdown_comfy_service, get_comfy_service


# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Admin telemetry buffers
ADMIN_EVENT_LIMIT = 200
ADMIN_LOG_LIMIT = 200
admin_events: deque[dict] = deque(maxlen=ADMIN_EVENT_LIMIT)
admin_logs: deque[dict] = deque(maxlen=ADMIN_LOG_LIMIT)

# Tool Tutor (optional)
tool_tutor = None


def record_event(event_type: str, **payload) -> None:
    admin_events.append({
        "type": event_type,
        "timestamp": time.time(),
        **payload,
    })


def record_log(level: str, message: str, **payload) -> None:
    admin_logs.append({
        "level": level,
        "message": message,
        "timestamp": time.time(),
        **payload,
    })


def require_admin(
    token: str = Header(default=None, alias="X-Admin-Token"),
    authorization: Optional[str] = Header(default=None, alias="Authorization")
) -> None:
    # Mixed-mode admin protection. If multi-user auth is enabled, accept Bearer tokens
    if settings.enable_auth:
        # Try Authorization header (Bearer) first
        # FastAPI will pass Authorization header via Header param, but we read 'token' alias here for X-Admin-Token
        # So handle both: Authorization: Bearer <token> and X-Admin-Token header
        # Prefer Authorization header when provided
        if authorization:
            # Accept 'Bearer <token>' or bare token
            if authorization.lower().startswith("bearer "):
                auth_token = authorization.split(" ", 1)[1]
            else:
                auth_token = authorization
            # If explicit X-Admin-Token header not provided, use Authorization token
            if not token:
                token = auth_token
    # fallback; the header name is token alias X-Admin-Token passed via the parameter
        # Note: We cannot easily request Authorization header here in the signature because param name must be valid
        # So check token header first and fall back to env-based admin token
        if not token:
            raise HTTPException(status_code=401, detail="Authentication required")
        username = get_auth_manager().validate_token(token)
        if not username:
            raise HTTPException(status_code=401, detail="Invalid auth token")
        if not get_auth_manager().is_admin(username):
            raise HTTPException(status_code=403, detail="Admin privileges required")
        return
    else:
        if not settings.admin_token:
            raise HTTPException(status_code=401, detail="Admin access disabled")
        if token != settings.admin_token:
            raise HTTPException(status_code=401, detail="Invalid admin token")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management."""
    logger.info("Starting Voice Agent server...")
    record_event("startup")
    
    # Initialize STT (faster-whisper with CUDA)
    logger.info("Loading Whisper model on CUDA GPU...")
    await get_stt()
    logger.info("Whisper ready", model=settings.whisper_model)
    
    # Initialize TTS (Piper)
    logger.info("Initializing Piper TTS...")
    get_tts()
    voices = list_voices()
    logger.info("Piper ready", voices=[v["id"] for v in voices])
    
    # Log registered tools
    tools = tool_registry.list_tools()
    logger.info("Registered tools", count=len(tools), tools=[t.name for t in tools])
    
    # Initialize OpenTelemetry tracing
    logger.info("Initializing tracing...")
    init_tracing(service_name="voice-agent")
    
    # Initialize ComfyUI service
    logger.info("Initializing ComfyUI service...")
    comfy_service = await initialize_comfy_service(auto_start=False)  # Don't auto-start, start on-demand
    if comfy_service:
        logger.info("ComfyUI service initialized", url=comfy_service.base_url)
    else:
        logger.warning("ComfyUI service not available (image generation tools will be disabled)")

    # Initialize Tool Tutor if enabled
    global tool_tutor
    try:
        if settings.enable_tool_tutor:
            tool_tutor = create_tool_tutor(
                settings=None,
                enabled=settings.enable_tool_tutor,
                data_dir=settings.data_dir,
                confidence_threshold=settings.tool_confidence_threshold,
                example_count=3,
                learning_enabled=True,
            )
        else:
            tool_tutor = None
    except Exception as e:
        logger.error("Failed to initialize tool_tutor", error=str(e))
        tool_tutor = None
    # Restore persisted sessions from disk (best effort)
    try:
        load_sessions_from_disk()
        logger.info("Loaded persisted sessions from disk", path=str(_sessions_file_path()))
    except Exception:
        logger.exception("Failed to load persisted sessions from disk")
    
    # Start background session persistence worker if configured
    session_persistence_task = None
    try:
        interval = getattr(settings, 'session_save_interval', 0)
        if isinstance(interval, int) and interval > 0:
            async def _session_persistence_worker():
                while True:
                    await asyncio.sleep(interval)
                    try:
                        await save_sessions_to_disk()
                    except Exception:
                        logger.exception("Background session saver failed")
            session_persistence_task = asyncio.create_task(_session_persistence_worker())
            logger.info("Started background session persistence", interval=interval)
    except Exception:
        logger.exception("Failed to start background session persistence")
    
    yield
    
    logger.info("Shutting down Voice Agent server...")
    record_event("shutdown")
    
    # Shutdown ComfyUI service
    if comfy_service:
        logger.info("Shutting down ComfyUI service...")
        await shutdown_comfy_service()
    # Cancel background session persistence task
    if session_persistence_task:
        try:
            session_persistence_task.cancel()
            await asyncio.wait([session_persistence_task], timeout=1.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass

    # Persist sessions before exit
    try:
        await save_sessions_to_disk()
    except Exception:
        logger.exception("Failed to save sessions on shutdown")


# Create FastAPI app
app = FastAPI(
    title="Voice Agent",
    description="Real-time voice assistant with barge-in support",
    lifespan=lifespan,
)

# Mount static files
frontend_path = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=frontend_path / "static"), name="static")


@app.get("/")
async def index():
    """Serve the main page."""
    return FileResponse(frontend_path / "index.html")


@app.get("/admin.html")
async def admin() -> FileResponse:
    """Serve the admin dashboard."""
    return FileResponse(frontend_path / "admin.html")


@app.get("/manifest.json")
async def manifest():
    """Serve the PWA manifest."""
    return FileResponse(
        frontend_path / "manifest.json",
        media_type="application/manifest+json"
    )


@app.get("/sw.js")
async def service_worker():
    """Serve the service worker."""
    return FileResponse(
        frontend_path / "sw.js",
        media_type="application/javascript"
    )


@app.get("/health")
async def health():
    """Health check endpoint."""
    stt_backend = "faster-whisper"
    if settings.whisper_device:
        device_label = settings.whisper_device.upper()
        if settings.whisper_device == "cuda":
            device_label = f"CUDA (GPU {settings.whisper_gpu_device})"
        stt_backend = f"{stt_backend} ({device_label})"


    llm_backend = settings.llm_backend
    try:
        if llm_backend == "ollama" and settings.ollama_model:
            llm_backend = f"ollama ({settings.ollama_model})"
            # Only check Ollama if selected, and only log errors if selected
        elif llm_backend == "lmstudio":
            llm_backend = "lmstudio"
        elif llm_backend == "openai":
            llm_backend = "openai-compatible"
    except Exception as e:
        # Only log a warning if the selected backend is the one that failed
        if settings.llm_backend == "ollama":
            logger.warning("LLM backend unavailable or error during backend check", backend=llm_backend, error=str(e))
        # Otherwise, suppress the error entirely

    tts_backend = settings.tts_engine
    if tts_backend == "piper" and settings.tts_voice:
        tts_backend = f"piper ({settings.tts_voice})"
    elif tts_backend == "clone":
        tts_backend = "voice-clone"

    # Check ComfyUI status
    comfy_service = get_comfy_service()
    comfy_status = "not_available"
    if comfy_service:
        if comfy_service.is_running:
            comfy_status = "running"
        else:
            comfy_status = "stopped"

    return {
        "status": "ok",
        "stt": stt_backend,
        "tts": tts_backend,
        "llm": llm_backend,
        "tools_registered": len(tool_registry.list_tools()),
        "comfyui": comfy_status,
    }


def _session_snapshot(client_id: str, session: Session) -> dict:
    history = session.conversation_history
    messages = list(history._messages)
    return {
        "client_id": client_id,
        "state": session.state.name,
        "last_activity": session.last_activity,
        "speaking_timeout": session.check_speaking_timeout(),
        "history_counts": {
            "total": len(messages),
            "user": len([m for m in messages if m.role == "user"]),
            "assistant": len([m for m in messages if m.role == "assistant"]),
            "tool": len([m for m in messages if m.role == "tool"]),
        },
    }


@app.get("/api/admin/health")
async def admin_health(_: None = Depends(require_admin)):
    base_health = await health()
    return {
        **base_health,
        "active_connections": len(manager.active_connections),
        "active_sessions": len(manager.sessions),
        "events": len(admin_events),
        "logs": len(admin_logs),
    }


@app.get("/api/admin/sessions")
async def admin_sessions(_: None = Depends(require_admin)):
    return {
        "sessions": [_session_snapshot(cid, sess) for cid, sess in manager.sessions.items()]
    }


@app.get("/api/admin/events")
async def admin_events_feed(_: None = Depends(require_admin)):
    return {"events": list(admin_events)}


@app.get("/api/admin/logs")
async def admin_logs_feed(_: None = Depends(require_admin)):
    return {"logs": list(admin_logs)}


@app.post("/api/auth/login")
async def api_login(payload: dict):
    """Simple login endpoint that returns a session token.

    Request body: {"username": "user", "password": "pass"}
    """
    if not settings.enable_auth:
        raise HTTPException(status_code=400, detail="Multi-user auth disabled")
    username = payload.get("username")
    password = payload.get("password")
    if not username or not password:
        raise HTTPException(status_code=400, detail="username and password required")
    token, msg = get_auth_manager().login(username, password)
    if token is None:
        raise HTTPException(status_code=401, detail=msg)
    return {"token": token, "message": msg}


@app.post("/api/auth/logout")
async def api_logout(payload: dict):
    """Invalidate a token: {"token": "..."}"""
    if not settings.enable_auth:
        raise HTTPException(status_code=400, detail="Multi-user auth disabled")
    token = payload.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    success = get_auth_manager().logout(token)
    return {"success": success}


@app.get("/api/voices")
async def get_voices():
    """Get available TTS voices."""
    return {"voices": list_voices()}


@app.get("/api/models")
async def get_models(
    backend: str = "ollama",
    url: str = None,
    api_key: str = None
):
    """
    Get available LLM models for a backend.
    
    Args:
        backend: Backend type (ollama, lmstudio, openai)
        url: Backend URL (uses defaults if not provided)
        api_key: API key (for OpenAI-compatible backends)
    """
    # Default URLs for each backend
    default_urls = {
        "ollama": "http://localhost:11434",
        "lmstudio": "http://localhost:1234",
        "openai": "https://api.openai.com",
        "openrouter": "https://openrouter.ai",
    }
    
    # Validate backend
    if backend not in default_urls:
        return {"models": [], "error": f"Invalid backend: {backend}"}
    
    # Use provided URL or default
    backend_url = url or default_urls[backend]
    
    try:
        models = await list_models_for_backend(
            backend=backend,
            url=backend_url,
            api_key=api_key
        )
        return {"models": models, "backend": backend}
    except Exception as e:
        # Only log a warning if the user is actually requesting this backend
        if backend == settings.llm_backend:
            logger.warning("Failed to list models (backend may be down, skipping)", backend=backend, error=str(e))
        # Otherwise, suppress the error entirely
        return {"models": [], "error": f"Backend unavailable: {backend}. {str(e)}"}


class ConnectionManager:
    """Manages WebSocket connections and their sessions."""
    
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.sessions: dict[str, Session] = {}
    
    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.sessions[client_id] = Session()
        # Try to restore chat history for this client (best effort)
        try:
            saved_messages = load_local_history(client_id)
            if saved_messages:
                self.sessions[client_id].conversation_history.clear()
                for msg in saved_messages:
                    role = msg.get("role")
                    content = msg.get("content", "")
                    name = msg.get("name")
                    tool_call_id = msg.get("tool_call_id")
                    tool_calls = msg.get("tool_calls")
                    if role == "user":
                        self.sessions[client_id].conversation_history.add_user_message(content)
                    elif role == "assistant":
                        self.sessions[client_id].conversation_history.add_assistant_message(content, tool_calls=tool_calls)
                    elif role == "tool":
                        self.sessions[client_id].conversation_history.add_tool_result(tool_call_id or "", name or "", content)
        except Exception:
            logger.exception("Failed to restore local chat history", client_id=client_id)
        logger.info("Client connected", client_id=client_id)
        # Record admin event for new connection
        try:
            record_event("client_connected", client_id=client_id)
        except Exception:
            # Do not let telemetry failures block connection handling
            logger.exception("Failed to record client_connected event", client_id=client_id)
        # Persist sessions (best effort, non-blocking)
        try:
            asyncio.create_task(save_sessions_to_disk())
        except Exception:
            logger.exception("Failed to persist sessions after connect", client_id=client_id)
    
    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if client_id in self.sessions:
            del self.sessions[client_id]
        logger.info("Client disconnected", client_id=client_id)
        record_event("client_disconnected", client_id=client_id)
        # Persist sessions when a client disconnects (fire and forget)
        try:
            asyncio.create_task(save_sessions_to_disk())
        except Exception:
            logger.exception("Failed to persist sessions after disconnect", client_id=client_id)
    
    async def send_json(self, client_id: str, data: dict):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(data)
            except Exception as e:
                logger.error("Failed to send JSON", client_id=client_id, error=str(e))
    
    async def send_bytes(self, client_id: str, data: bytes):
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_bytes(data)
            except Exception as e:
                logger.error("Failed to send bytes", client_id=client_id, error=str(e))
    
    def get_session(self, client_id: str) -> Optional[Session]:
        return self.sessions.get(client_id)


manager = ConnectionManager()

# Global VAD instance (singleton to avoid repeated loading)
_global_vad: Optional[SileroVAD] = None
_vad_thread_lock = threading.Lock()


def _run_vad_process_chunk(vad: SileroVAD, audio_chunk: bytes):
    """Thread-safe wrapper around vad.process_chunk."""
    with _vad_thread_lock:
        return vad.process_chunk(audio_chunk)


def _run_vad_reset(vad: SileroVAD):
    """Thread-safe wrapper around vad.reset."""
    with _vad_thread_lock:
        vad.reset()

def get_vad() -> SileroVAD:
    """Get or create the global VAD instance."""
    global _global_vad
    if _global_vad is None:
        # IMPORTANT: VAD must use CPU to avoid CUDA library conflicts with faster-whisper
        # PyTorch (Silero) and CTranslate2 (faster-whisper) bundle different cuDNN versions
        # that crash when loaded together on CUDA. VAD is lightweight and runs fine on CPU.
        _global_vad = create_vad(
            vad_type="silero",
            threshold=settings.barge_in_threshold,
            sample_rate=settings.audio_sample_rate,
            min_speech_ms=settings.barge_in_min_speech_ms,
            device="cpu",
            use_onnx=False,
        )
    return _global_vad


def _sessions_file_path() -> Path:
    return Path(settings.data_dir).resolve() / "sessions.json"


def load_sessions_from_disk() -> None:
    """Load sessions from data/sessions.json and restore conversation history and state."""
    try:
        path = _sessions_file_path()
        if not path.exists():
            return
        with open(path, 'r') as f:
            data = json.load(f)
        for cid, sdata in data.items():
            try:
                sess = Session()
                # restore basic fields
                state_name = sdata.get('state')
                if state_name in SessionState.__members__:
                    sess.state = SessionState[state_name]
                sess.last_activity = sdata.get('last_activity', time.time())
                sess.speaking_started = sdata.get('speaking_started', 0.0)

                # restore conversation
                messages = sdata.get('messages', [])
                # Clear any defaults
                sess.conversation_history.clear()
                for msg in messages:
                    role = msg.get('role')
                    content = msg.get('content', '')
                    name = msg.get('name')
                    tool_call_id = msg.get('tool_call_id')
                    tool_calls = msg.get('tool_calls')
                    if role == 'user':
                        sess.conversation_history.add_user_message(content)
                    elif role == 'assistant':
                        sess.conversation_history.add_assistant_message(content, tool_calls=tool_calls)
                    elif role == 'tool':
                        sess.conversation_history.add_tool_result(tool_call_id or '', name or '', content)
                manager.sessions[cid] = sess
            except Exception:
                logger.exception("Failed to restore session", client_id=cid)
    except Exception:
        logger.exception("Failed to load sessions.json")


def _save_sessions_to_disk_sync() -> None:
    """Synchronous implementation of session persistence (called via asyncio.to_thread)."""
    try:
        path = _sessions_file_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        out = {}
        for cid, sess in manager.sessions.items():
            try:
                out[cid] = {
                    'state': sess.state.name,
                    'last_activity': sess.last_activity,
                    'speaking_started': sess.speaking_started,
                    'messages': sess.conversation_history.get_messages(include_system=True),
                }
            except Exception:
                logger.exception("Failed to serialize session", client_id=cid)
        # Write atomically: write to tmp then replace
        tmp_path = path.with_suffix('.tmp')
        with open(tmp_path, 'w') as f:
            json.dump(out, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, path)
    except Exception:
        logger.exception("Failed to save sessions.json")


async def save_sessions_to_disk() -> None:
    """Save simplified sessions to data/sessions.json (async, non-blocking via thread pool)."""
    await asyncio.to_thread(_save_sessions_to_disk_sync)


def _persist_history_for_client(client_id: str, session: Session) -> None:
    """Persist conversation history to per-client JSON file (best effort)."""
    try:
        messages = session.conversation_history.get_messages(include_system=False)
        save_local_history(client_id, messages)
    except Exception:
        logger.exception("Failed to persist local chat history", client_id=client_id)


async def process_audio_pipeline(
    client_id: str,
    audio_data: bytes,
    session: Session,
    voice: str,
    model: str,
    tts_playing: bool = False,
    voice_speed: float = 1.0,
):
    """Process audio through the full pipeline."""
    print(f"[DEBUG] process_audio_pipeline: state={session.state.name}, tts_playing={tts_playing}, audio_len={len(audio_data)}", flush=True)
    
    # Check for speaking timeout - auto-reset to IDLE if stuck
    if session.check_speaking_timeout():
        logger.warning("auto_reset_from_speaking_timeout", client_id=client_id)
        session.set_state(SessionState.IDLE)
        await manager.send_json(client_id, {
            "type": "state",
            "state": "idle"
        })
        # Don't return - let this audio be processed normally
        tts_playing = False
    
    try:
        # Get VAD instance
        vad = get_vad()
        
    # BARGE-IN: Check for interrupts when client reports TTS is playing
        if tts_playing:
            logger.debug("barge_in_audio_received", bytes=len(audio_data), state=session.state.name)
            
            # Run VAD to detect if user is speaking
            # SileroVAD returns (speech_probability, is_speaking, speech_ended)
            is_speech_frame, is_speaking, _ = await asyncio.to_thread(
                _run_vad_process_chunk, vad, audio_data
            )
            
            logger.debug("barge_in_vad_result", is_speech_frame=is_speech_frame, is_speaking=is_speaking)
            
            # If VAD detects speech while TTS is playing = INTERRUPT
            if is_speaking:
                logger.info("BARGE-IN DETECTED!", client_id=client_id)
                
                # Trigger interrupt
                session.interrupt()
                await manager.send_json(client_id, {
                    "type": "state", 
                    "state": "interrupted"
                })
                
                # Clear buffer and reset VAD for fresh start
                session.audio_buffer.clear()
                await asyncio.to_thread(_run_vad_reset, vad)
                
                # Go back to listening immediately
                session.set_state(SessionState.LISTENING)
                await manager.send_json(client_id, {
                    "type": "state",
                    "state": "listening"
                })
            return  # Don't buffer audio while TTS is playing
        
        # Don't buffer audio while processing either
        if session.state == SessionState.PROCESSING:
            return
        
        # Only process if listening
        if session.state != SessionState.LISTENING:
            return
        
        # Add audio to buffer
        session.audio_buffer.extend(audio_data)
        
    # Process through VAD to detect end of speech
    # SileroVAD returns (speech_probability, is_speaking, speech_ended)
        is_speech, is_speaking, speech_ended = await asyncio.to_thread(
            _run_vad_process_chunk, vad, audio_data
        )
        
        print(f"[DEBUG] VAD: is_speech={is_speech}, is_speaking={is_speaking}, speech_ended={speech_ended}, buffer={len(session.audio_buffer)}", flush=True)
        
        # Only process when speech has ended AND we have enough audio
        if not speech_ended:
            return
        
        print(f"[DEBUG] Speech ended. Buffer size: {len(session.audio_buffer)}", flush=True)

        # Need minimum audio
        if len(session.audio_buffer) < 16000 * 0.5:  # 0.5 second minimum
            logger.debug("not_enough_audio", bytes=len(session.audio_buffer))
            print(f"[DEBUG] Not enough audio: {len(session.audio_buffer)}", flush=True)
            return
        
        # Try to acquire lock - if already processing, skip
        if session._processing_lock.locked():
            logger.debug("pipeline_already_running", client_id=client_id)
            print("[DEBUG] Pipeline already running", flush=True)
            return
        
        print("[DEBUG] Acquiring lock...", flush=True)
        async with session._processing_lock:
            print(f"[DEBUG] Lock acquired. State: {session.state}", flush=True)
            # Double-check state after acquiring lock
            if session.state != SessionState.LISTENING:
                print(f"[DEBUG] State mismatch: {session.state}", flush=True)
                return
            
            if len(session.audio_buffer) < 16000:  # 0.5 sec at 16kHz, 16-bit
                print(f"[DEBUG] Buffer too small inside lock: {len(session.audio_buffer)}", flush=True)
                return
            
            logger.info("processing_audio", buffer_bytes=len(session.audio_buffer))
            print(f"[DEBUG] Processing audio! Bytes: {len(session.audio_buffer)}", flush=True)
            
            # Get audio and clear buffer
            audio_bytes = bytes(session.audio_buffer)
            session.audio_buffer.clear()
            
            # Reset VAD for next utterance
            await asyncio.to_thread(_run_vad_reset, vad)
            
            # Start pipeline trace
            tracer = get_tracer()
            with tracer.start_as_current_span("voice.pipeline") as pipeline_span:
                pipeline_span.set_attribute("client_id", client_id)
                pipeline_span.set_attribute("audio_bytes", len(audio_bytes))
                
                # Transcribe using whisper.cpp (device selected by settings)
                session.set_state(SessionState.PROCESSING)
                await manager.send_json(client_id, {"type": "state", "state": "processing"})
                
                with start_stt_span(len(audio_bytes)) as stt_span:
                    stt = await get_stt()
                    transcript = await stt.transcribe(audio_bytes)
                    stt_span.set_attribute("transcript_length", len(transcript) if transcript else 0)
                
                if not transcript or not transcript.strip():
                    session.set_state(SessionState.LISTENING)
                    await manager.send_json(client_id, {"type": "state", "state": "listening"})
                    return
                
                pipeline_span.set_attribute("transcript", transcript[:100])
                logger.info("Transcribed", text=transcript[:100], client_id=client_id)
                
                # Send transcript to client
                await manager.send_json(client_id, {
                    "type": "transcript",
                    "text": transcript,
                    "is_final": True
                })
                
                # Add to conversation history
                session.conversation_history.add_user_message(transcript)
                _persist_history_for_client(client_id, session)
                
                # Get LLM client (uses backend settings from client config)
                ollama = await get_llm_client()
                ollama.model = model  # Update model from client settings
                
                # Register tools for LLM function calling
                ollama.clear_tools()  # Clear any previously registered tools
                for tool in tool_registry.list_tools():
                    ollama.register_tool(
                        tool.name,
                        tool.description,
                        tool.parameters,
                        tool.handler
                    )
                
                full_response = ""
                
                try:
                    # Prepare prompt using Tool Tutor (if enabled) and send custom messages to LLM
                    messages = session.conversation_history.get_messages(include_system=False)
                    system_prompt = session.conversation_history.system_prompt
                    if tool_tutor:
                        try:
                            enhanced_prompt, _ = tool_tutor.prepare_prompt(transcript, system_prompt, context=messages)
                        except Exception:
                            # Backward-compatible call for older interface
                            enhanced_prompt = tool_tutor.prepare_prompt(transcript, system_prompt)
                    else:
                        enhanced_prompt = system_prompt

                    llm_messages = [{"role": "system", "content": enhanced_prompt}] + messages

                    with start_llm_span(model, len(session.conversation_history.get_messages()), bool(tool_registry.list_tools())) as llm_span:
                        async for chunk in ollama.chat(
                            llm_messages
                        ):
                            if chunk["type"] == "text":
                                full_response += chunk["content"]
                                await manager.send_json(client_id, {
                                    "type": "response_chunk",
                                    "text": full_response
                                })
                        
                            elif chunk["type"] == "tool_call":
                                tool_call_id = chunk.get("id", f"call_{chunk['name']}")
                                tool_name = chunk["name"]
                                arguments = chunk["arguments"]
                                # Let tutor process the tool call decision (may override tool or args)
                                tutor_decision = None
                                if tool_tutor:
                                    try:
                                        # Provide last user message as query and accumulated response as context
                                        tutor_decision = tool_tutor.process_tool_call(
                                            transcript,
                                            full_response,
                                            context=llm_messages
                                        )
                                    except Exception:
                                        tutor_decision = None
                                if tutor_decision:
                                    # Override if different
                                    if tutor_decision.tool and tutor_decision.tool != tool_name:
                                        logger.info("tool_call_overridden_by_tutor", original=tool_name, new=tutor_decision.tool)
                                        tool_name = tutor_decision.tool
                                    if tutor_decision.args:
                                        arguments = tutor_decision.args
                            
                                logger.info("tool_call_received", tool=tool_name, args=arguments)
                            
                                await manager.send_json(client_id, {
                                    "type": "tool_call",
                                    "tool": tool_name
                                })
                            
                                # Execute tool with tracing
                                with start_tool_span(tool_name, arguments) as tool_span:
                                    result = await tool_executor.execute(tool_name, arguments)
                                    tool_span.set_attribute("success", result.success)
                                    logger.info("tool_result_raw", success=result.success, result_type=type(result.result).__name__, result=str(result.result)[:500])
                            
                                # Handle structured results with flyout data
                                result_text = ""
                                if result.success:
                                    if isinstance(result.result, dict):
                                        # Structured result with potential flyout
                                        result_text = result.result.get("text", str(result.result))
                                        flyout_data = result.result.get("flyout")
                                        if flyout_data:
                                            await manager.send_json(client_id, {
                                                "type": "flyout",
                                                "flyout_type": flyout_data.get("type"),
                                                "content": flyout_data.get("content")
                                            })
                                    else:
                                        result_text = str(result.result)
                                else:
                                    result_text = result.error
                            
                                await manager.send_json(client_id, {
                                    "type": "tool_result",
                                    "tool": tool_name,
                                    "result": result_text
                                })
                            
                                # Continue conversation with tool result
                                if result.success:
                                    logger.info("tool_result_to_llm", tool=tool_name, result_text=result_text[:300])
                                    session.conversation_history.add_tool_result(
                                        tool_call_id, tool_name, result_text
                                    )
                                    _persist_history_for_client(client_id, session)
                                # Notify tutor about result for learning
                                if tool_tutor:
                                    try:
                                        # If tutor_decision is None, build a ToolCall record
                                        from server.tools.tutor.interfaces import ToolCall as TutorToolCall
                                        tc = tutor_decision if tutor_decision is not None else TutorToolCall(tool=tool_name, args=arguments, confidence=1.0, raw_response=str(arguments))
                                        tool_tutor.record_result(
                                            transcript,
                                            tc,
                                            result.success,
                                            None if result.success else getattr(result, 'error', None)
                                        )
                                    except Exception:
                                        pass
                    
                    llm_span.set_attribute("response_length", len(full_response))
            
                        # If no text response but tools were called, get follow-up response from LLM
                        # This lets the LLM generate a natural language response using the tool results
                    if not full_response and session.conversation_history.get_messages():
                            last_msg = session.conversation_history.get_messages()[-1]
                            if last_msg.get("role") == "tool":
                                logger.info("Getting follow-up response after tool execution")
                                with start_llm_span(model, len(session.conversation_history.get_messages()), False) as followup_span:
                                    followup_span.set_attribute("is_followup", True)
                                    async for chunk in ollama.chat(
                                        session.conversation_history.get_messages()
                                    ):
                                        if chunk["type"] == "text":
                                            full_response += chunk["content"]
                                            await manager.send_json(client_id, {
                                                "type": "response_chunk",
                                                "text": full_response
                                            })
                                    followup_span.set_attribute("response_length", len(full_response))
                
                except Exception as llm_error:
                    error_msg = str(llm_error)
                    logger.error("LLM error", error=error_msg, model=model)
                    
                    # Send user-friendly error
                    if "404" in error_msg or "not found" in error_msg.lower():
                        user_error = f"Model '{model}' not found. Please check Settings and use an available model like 'llama3.2'."
                    elif "500" in error_msg:
                        user_error = f"LLM server error. Make sure Ollama is running and the model '{model}' is pulled."
                    elif "connection" in error_msg.lower():
                        user_error = "Cannot connect to LLM server. Make sure Ollama is running."
                    else:
                        user_error = f"LLM error: {error_msg[:100]}"
                    
                    await manager.send_json(client_id, {
                        "type": "error",
                        "message": user_error
                    })
                    session.set_state(SessionState.LISTENING)
                    await manager.send_json(client_id, {"type": "state", "state": "listening"})
                    return
                
                if not full_response:
                    session.set_state(SessionState.LISTENING)
                    await manager.send_json(client_id, {"type": "state", "state": "listening"})
                    return
                
                pipeline_span.set_attribute("response", full_response[:200])
                
                # Add assistant response to history
                session.conversation_history.add_assistant_message(full_response)
                _persist_history_for_client(client_id, session)
                
                # Send final response
                await manager.send_json(client_id, {
                    "type": "response",
                    "text": full_response
                })
                
                # Synthesize speech using Piper (local)
                session.set_state(SessionState.SPEAKING)
                await manager.send_json(client_id, {"type": "state", "state": "speaking"})
                
                with start_tts_span(len(full_response), voice) as tts_span:
                    tts = get_tts(voice)
                    tts.speaking_rate = voice_speed  # Apply voice speed setting
                    
                    audio_chunks_sent = 0
                    async for audio_chunk in tts.synthesize_streaming(full_response):
                        # Check for interruption (barge-in)
                        if session.should_stop():
                            logger.info("TTS interrupted", client_id=client_id)
                            tts_span.set_attribute("interrupted", True)
                            tts.cancel()
                            break
                        
                        audio_chunks_sent += 1
                        # Send audio as base64
                        await manager.send_json(client_id, {
                            "type": "audio",
                            "data": base64.b64encode(audio_chunk).decode('utf-8')
                        })
                    
                    tts_span.set_attribute("audio_chunks", audio_chunks_sent)
                
                # Stay in SPEAKING state - client will send playback_done when finished
                # This allows interrupt detection while audio plays on client
                logger.info("Audio sent, waiting for playback", client_id=client_id)
                # Persist sessions after completing a spoken response (fire and forget)
                try:
                    asyncio.create_task(save_sessions_to_disk())
                except Exception:
                    logger.exception("Failed to persist sessions after pipeline")
        
    except Exception as e:
        logger.error("Pipeline error", error=str(e), client_id=client_id)
        await manager.send_json(client_id, {
            "type": "error",
            "message": str(e)
        })
        session.set_state(SessionState.IDLE)


async def process_text_message(
    client_id: str,
    text: str,
    session: Session,
    voice: str,
    model: str,
    voice_speed: float = 1.0,
):
    """Process text message through the LLM pipeline (same as audio but skips STT)."""
    try:
        async with session._processing_lock:
            logger.info("processing_text_message", text=text[:100], client_id=client_id)
            
            # Start pipeline trace
            tracer = get_tracer()
            with tracer.start_as_current_span("voice.text_pipeline") as pipeline_span:
                pipeline_span.set_attribute("client_id", client_id)
                pipeline_span.set_attribute("text_length", len(text))
                
                # Add to conversation history
                session.conversation_history.add_user_message(text)
                _persist_history_for_client(client_id, session)
                
                # Get LLM client
                ollama = await get_llm_client()
                ollama.model = model
                
                # Register tools
                ollama.clear_tools()
                for tool in tool_registry.list_tools():
                    ollama.register_tool(
                        tool.name,
                        tool.description,
                        tool.parameters,
                        tool.handler
                    )
                
                full_response = ""
                
                try:
                    messages = session.conversation_history.get_messages(include_system=False)
                    system_prompt = session.conversation_history.system_prompt
                    if tool_tutor:
                        try:
                            enhanced_prompt, _ = tool_tutor.prepare_prompt(text, system_prompt, context=messages)
                        except Exception:
                            enhanced_prompt = tool_tutor.prepare_prompt(text, system_prompt)
                    else:
                        enhanced_prompt = system_prompt

                    llm_messages = [{"role": "system", "content": enhanced_prompt}] + messages

                    with start_llm_span(model, len(session.conversation_history.get_messages()), bool(tool_registry.list_tools())) as llm_span:
                        async for chunk in ollama.chat(
                            llm_messages
                        ):
                            if chunk["type"] == "text":
                                full_response += chunk["content"]
                                await manager.send_json(client_id, {
                                    "type": "response_chunk",
                                    "text": full_response
                                })
                            
                            elif chunk["type"] == "tool_call":
                                tool_call_id = chunk.get("id", f"call_{chunk['name']}")
                                tool_name = chunk["name"]
                                arguments = chunk["arguments"]
                                # Let tutor process the tool call decision (may override tool or args)
                                tutor_decision = None
                                if tool_tutor:
                                    try:
                                        tutor_decision = tool_tutor.process_tool_call(
                                            text,
                                            full_response,
                                            context=llm_messages
                                        )
                                    except Exception:
                                        tutor_decision = None
                                if tutor_decision:
                                    if tutor_decision.tool and tutor_decision.tool != tool_name:
                                        logger.info("tool_call_overridden_by_tutor", original=tool_name, new=tutor_decision.tool)
                                        tool_name = tutor_decision.tool
                                    if tutor_decision.args:
                                        arguments = tutor_decision.args

                                logger.info("tool_call_received", tool=tool_name, args=arguments)

                                await manager.send_json(client_id, {
                                    "type": "tool_call",
                                    "tool": tool_name
                                })

                                # Execute tool with tracing
                                with start_tool_span(tool_name, arguments) as tool_span:
                                    result = await tool_executor.execute(tool_name, arguments)
                                    tool_span.set_attribute("success", result.success)
                                
                                # Handle structured results with flyout data
                                result_text = ""
                                if result.success:
                                    if isinstance(result.result, dict):
                                        result_text = result.result.get("text", str(result.result))
                                        flyout_data = result.result.get("flyout")
                                        if flyout_data:
                                            await manager.send_json(client_id, {
                                                "type": "flyout",
                                                "flyout_type": flyout_data.get("type"),
                                                "content": flyout_data.get("content")
                                            })
                                    else:
                                        result_text = str(result.result)
                                else:
                                    result_text = result.error
                                
                                await manager.send_json(client_id, {
                                    "type": "tool_result",
                                    "tool": tool_name,
                                    "result": result_text
                                })
                                
                                if result.success:
                                    session.conversation_history.add_tool_result(
                                        tool_call_id, tool_name, result_text
                                    )
                                    _persist_history_for_client(client_id, session)
                                # Notify tutor about result
                                if tool_tutor:
                                    try:
                                        from server.tools.tutor.interfaces import ToolCall as TutorToolCall
                                        tc = tutor_decision if tutor_decision is not None else TutorToolCall(tool=tool_name, args=arguments, confidence=1.0, raw_response=str(arguments))
                                        tool_tutor.record_result(
                                            text,
                                            tc,
                                            result.success,
                                            None if result.success else getattr(result, 'error', None)
                                        )
                                    except Exception:
                                        pass
                        
                        llm_span.set_attribute("response_length", len(full_response))
                        
                        # Get follow-up response after tool execution if needed
                        if not full_response and session.conversation_history.get_messages():
                            last_msg = session.conversation_history.get_messages()[-1]
                            if last_msg.get("role") == "tool":
                                async for chunk in ollama.chat(
                                    session.conversation_history.get_messages()
                                ):
                                    if chunk["type"] == "text":
                                        full_response += chunk["content"]
                                        await manager.send_json(client_id, {
                                            "type": "response_chunk",
                                            "text": full_response
                                        })
                
                except Exception as llm_error:
                    error_msg = str(llm_error)
                    logger.error("LLM error", error=error_msg, model=model)
                    await manager.send_json(client_id, {
                        "type": "error",
                        "message": f"LLM error: {error_msg[:100]}"
                    })
                    session.set_state(SessionState.LISTENING)
                    await manager.send_json(client_id, {"type": "state", "state": "listening"})
                    return
                
                if not full_response:
                    session.set_state(SessionState.LISTENING)
                    await manager.send_json(client_id, {"type": "state", "state": "listening"})
                    return
                
                # Add assistant response to history
                session.conversation_history.add_assistant_message(full_response)
                _persist_history_for_client(client_id, session)
                
                # Send final response
                await manager.send_json(client_id, {
                    "type": "response",
                    "text": full_response
                })
                
                # Synthesize speech using Piper (local)
                session.set_state(SessionState.SPEAKING)
                await manager.send_json(client_id, {"type": "state", "state": "speaking"})
                
                with start_tts_span(len(full_response), voice) as tts_span:
                    tts = get_tts(voice)
                    tts.speaking_rate = voice_speed
                    
                    audio_chunks_sent = 0
                    async for audio_chunk in tts.synthesize_streaming(full_response):
                        if session.should_stop():
                            logger.info("TTS interrupted", client_id=client_id)
                            tts_span.set_attribute("interrupted", True)
                            tts.cancel()
                            break
                        
                        audio_chunks_sent += 1
                        await manager.send_json(client_id, {
                            "type": "audio",
                            "data": base64.b64encode(audio_chunk).decode('utf-8')
                        })
                    
                    tts_span.set_attribute("audio_chunks", audio_chunks_sent)
                
                logger.info("Text message processed, audio sent", client_id=client_id)
        
    except Exception as e:
        logger.error("Text pipeline error", error=str(e), client_id=client_id)
        await manager.send_json(client_id, {
            "type": "error",
            "message": str(e)
        })
        session.set_state(SessionState.IDLE)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time audio communication."""
    import uuid
    client_id = str(uuid.uuid4())[:8]
    
    await manager.connect(websocket, client_id)
    
    # Client settings (read from actual settings)
    voice = settings.tts_voice if hasattr(settings, 'tts_voice') else 'amy'
    model = settings.ollama_model  # Read from .env properly
    voice_speed = 1.0  # Default speaking rate multiplier
    llm_backend = "ollama"
    llm_url = None
    llm_api_key = None

    # Restore locally persisted settings for this client (if any)
    try:
        saved_settings = load_local_settings(client_id)
        if saved_settings:
            voice = saved_settings.get("voice", voice)
            model = saved_settings.get("model", model)
            voice_speed = max(0.5, min(2.0, float(saved_settings.get("voiceSpeed", voice_speed))))
            llm_backend = saved_settings.get("llmBackend", "ollama")
            llm_url = saved_settings.get("llmUrl")
            llm_api_key = saved_settings.get("llmApiKey")
            # Apply backend config to LLM client on reconnect
            try:
                llm_client = await get_llm_client()
                llm_client.update_config(
                    backend=llm_backend,
                    base_url=llm_url,
                    model=model,
                    api_key=llm_api_key,
                )
            except Exception:
                logger.exception("Failed to apply persisted LLM settings", client_id=client_id)
    except Exception:
        logger.exception("Failed to load persisted settings", client_id=client_id)
    
    try:
        while True:
            # Receive message
            message = await websocket.receive()
            print(f"[DEBUG] Received message keys: {message.keys()}", flush=True)
            session = manager.get_session(client_id)
            
            if not session:
                print(f"[DEBUG] No session for {client_id}", flush=True)
                continue
            
            if "bytes" in message:
                print(f"[DEBUG] Got bytes: {len(message['bytes'])}", flush=True)
                # Binary audio data with TTS flag
                # Format: [1 byte flag][audio data]
                raw_bytes = message["bytes"]
                
                logger.info("audio_received", bytes=len(raw_bytes), state=session.state.name)
                
                # Parse TTS playing flag (first byte)
                tts_playing = raw_bytes[0] == 1 if len(raw_bytes) > 0 else False
                audio_data = raw_bytes[1:] if len(raw_bytes) > 1 else raw_bytes
                
                # Process in background to not block
                asyncio.create_task(
                    process_audio_pipeline(
                        client_id, audio_data, session, voice, model, tts_playing, voice_speed
                    )
                )
            
            elif "text" in message:
                # JSON control message
                try:
                    data = json.loads(message["text"])
                    msg_type = data.get("type")
                    print(f"[DEBUG] JSON message received: type={msg_type}", flush=True)
                    logger.info("control_message", type=msg_type, client_id=client_id)
                    
                    if msg_type == "start_listening":
                        print("[DEBUG] START_LISTENING - setting state to LISTENING", flush=True)
                        session.set_state(SessionState.LISTENING)
                        session.audio_buffer.clear()
                        await manager.send_json(client_id, {
                            "type": "state",
                            "state": "listening"
                        })
                    
                    elif msg_type == "stop_listening":
                        session.set_state(SessionState.IDLE)
                        await manager.send_json(client_id, {
                            "type": "state",
                            "state": "idle"
                        })
                    
                    elif msg_type == "settings":
                        # Valid Piper voices
                        valid_voices = ['amy', 'lessac', 'ryan']
                        # Valid LLM backends
                        valid_backends = ['ollama', 'lmstudio', 'openai', 'openrouter']
                        
                        if "voice" in data:
                            new_voice = data["voice"]
                            if new_voice in valid_voices:
                                voice = new_voice
                            else:
                                logger.warning(
                                    "Invalid voice, using default",
                                    requested=new_voice,
                                    using='amy'
                                )
                                voice = 'amy'
                        if "model" in data:
                            model = data["model"]
                        if "voiceSpeed" in data:
                            # Voice speed multiplier (0.5 to 2.0)
                            voice_speed = max(0.5, min(2.0, float(data["voiceSpeed"])))
                        
                        # Handle backend settings
                        llm_backend = data.get("llmBackend", "ollama")
                        if llm_backend not in valid_backends:
                            llm_backend = "ollama"
                        
                        # Get the URL for the selected backend
                        llm_url = None
                        llm_api_key = None
                        if llm_backend == "ollama":
                            llm_url = data.get("ollamaUrl", "http://localhost:11434")
                        elif llm_backend == "lmstudio":
                            llm_url = data.get("lmstudioUrl", "http://localhost:1234")
                        elif llm_backend == "openai":
                            llm_url = data.get("openaiUrl", "https://api.openai.com")
                            llm_api_key = data.get("openaiApiKey", "")
                        elif llm_backend == "openrouter":
                            llm_url = data.get("openrouterUrl", "https://openrouter.ai")
                            llm_api_key = data.get("openrouterApiKey", "")
                        
                        # Update the LLM client configuration
                        llm_client = await get_llm_client()
                        llm_client.update_config(
                            backend=llm_backend,
                            base_url=llm_url,
                            model=model,
                            api_key=llm_api_key
                        )

                        # If using Ollama, ensure the requested model exists; fall back if missing
                        if llm_backend == "ollama":
                            try:
                                available = await llm_client.list_models()
                                names = set()
                                for m in available:
                                    for key in ("name", "model", "id"):
                                        val = m.get(key)
                                        if val:
                                            names.add(val)
                                if model not in names:
                                    fallback_model = settings.ollama_model
                                    logger.warning(
                                        "ollama_model_missing_fallback",
                                        requested=model,
                                        fallback=fallback_model,
                                    )
                                    model = fallback_model
                                    llm_client.model = fallback_model
                                    await manager.send_json(client_id, {
                                        "type": "settings_warning",
                                        "message": f"Model '{model}' not found on Ollama. Switched to '{fallback_model}'."
                                    })
                            except Exception:
                                logger.exception("ollama_model_check_failed", client_id=client_id)

                        # Persist settings locally for this client
                        save_local_settings(client_id, {
                            "voice": voice,
                            "model": model,
                            "voiceSpeed": voice_speed,
                            "llmBackend": llm_backend,
                            "llmUrl": llm_url,
                            "llmApiKey": llm_api_key,
                        })
                        
                        logger.info(
                            "Settings updated",
                            client_id=client_id,
                            voice=voice,
                            model=model,
                            voice_speed=voice_speed,
                            llm_backend=llm_backend,
                            llm_url=llm_url
                        )
                        await manager.send_json(client_id, {
                            "type": "settings_updated",
                            "voice": voice,
                            "model": model,
                            "voiceSpeed": voice_speed,
                            "llmBackend": llm_backend
                        })
                    
                    elif msg_type == "interrupt":
                        session.interrupt()
                        await manager.send_json(client_id, {
                            "type": "state",
                            "state": "interrupted"
                        })
                    
                    elif msg_type == "playback_done":
                        # Client finished playing audio, go back to listening
                        if session.state == SessionState.SPEAKING:
                            session.set_state(SessionState.LISTENING)
                            await manager.send_json(client_id, {
                                "type": "state",
                                "state": "listening"
                            })
                    
                    elif msg_type == "test_audio":
                        # Test audio output with TTS sample
                        test_voice = data.get("voice", voice)
                        if test_voice not in ['amy', 'lessac', 'ryan']:
                            test_voice = 'amy'
                        
                        try:
                            tts = get_tts(test_voice)
                            test_text = "Hello! This is a test of the text to speech system. I hope you can hear me clearly."
                            
                            async for audio_chunk in tts.synthesize_streaming(test_text):
                                await manager.send_json(client_id, {
                                    "type": "audio",
                                    "data": base64.b64encode(audio_chunk).decode('utf-8')
                                })
                            
                            logger.info("Test audio sent", voice=test_voice, client_id=client_id)
                        except Exception as e:
                            logger.error("Test audio failed", error=str(e))
                            await manager.send_json(client_id, {
                                "type": "error",
                                "message": f"Test audio failed: {str(e)}"
                            })
                    
                    elif msg_type == "clear_conversation":
                        # Clear conversation history
                        session.conversation_history.clear()
                        logger.info("Conversation cleared", client_id=client_id)
                    
                    elif msg_type == "text_message":
                        # Handle text input from chat box
                        text = data.get("text", "").strip()
                        if text:
                            logger.info("text_message_received", text=text[:100], client_id=client_id)
                            
                            # Set state to processing
                            session.set_state(SessionState.PROCESSING)
                            await manager.send_json(client_id, {
                                "type": "state",
                                "state": "processing"
                            })
                            
                            # Process the text message through LLM pipeline
                            asyncio.create_task(
                                process_text_message(
                                    client_id, text, session,
                                    voice, model, voice_speed
                                )
                            )
                    
                    elif msg_type == "music_command":
                        # Handle direct music commands from UI
                        command = data.get("command", "")
                        params = data.get("params", {})
                        
                        if command and command.startswith("music_"):
                            try:
                                # Execute the music tool directly
                                from server.tools.registry import tool_registry
                                
                                tool = tool_registry.get_tool(command)
                                if tool:
                                    result = await tool["function"](**params)
                                    
                                    # Send music state update back
                                    if isinstance(result, dict):
                                        await manager.send_json(client_id, {
                                            "type": "music_state",
                                            **result
                                        })
                                    elif isinstance(result, str):
                                        # Parse status string if needed
                                        await manager.send_json(client_id, {
                                            "type": "music_state",
                                            "text": result
                                        })
                            except Exception as e:
                                logger.error("music_command_error", error=str(e), command=command)
                    
                except json.JSONDecodeError:
                    logger.warning("Invalid JSON", client_id=client_id)
    
    except WebSocketDisconnect:
        manager.disconnect(client_id)
    except Exception as e:
        logger.error("WebSocket error", error=str(e), client_id=client_id)
        manager.disconnect(client_id)


def main():
    """Run the server."""
    try:
        import importlib
        uvicorn = importlib.import_module("uvicorn")
    except ImportError as exc:  # pragma: no cover - optional dependency
        raise RuntimeError(
            "uvicorn must be installed to run the Voice Agent server"
        ) from exc
    
    uvicorn.run(
        "server.main:app",
        host=getattr(settings, 'host', '0.0.0.0'),
        port=getattr(settings, 'port', 8000),
        reload=getattr(settings, 'debug', False),
        log_level="info",
    )


if __name__ == "__main__":
    main()
