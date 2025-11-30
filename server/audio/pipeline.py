"""
Main Audio Pipeline
Orchestrates audio flow: Input → VAD → STT → LLM → TTS → Output
"""
import asyncio
from typing import Optional, AsyncGenerator, Callable
import structlog
import time

from .buffer import ChunkedAudioBuffer, AudioBuffer, apply_fade
from .vad import SileroVAD, create_vad
from ..session import Session, SessionState
from ..config import settings

logger = structlog.get_logger()


class AudioPipeline:
    """
    Main audio processing pipeline.
    Handles the flow from microphone input to speaker output.
    """
    
    def __init__(
        self,
        session: Session,
        stt_handler: Callable,
        llm_handler: Callable,
        tts_handler: Callable,
    ):
        """
        Initialize audio pipeline.
        
        Args:
            session: Voice session for state management
            stt_handler: Async function to handle STT (audio -> text)
            llm_handler: Async function to handle LLM (text -> text)
            tts_handler: Async function to handle TTS (text -> audio)
        """
        self.session = session
        self.stt_handler = stt_handler
        self.llm_handler = llm_handler
        self.tts_handler = tts_handler
        
        # Audio buffers
        self.input_buffer = ChunkedAudioBuffer(
            chunk_ms=settings.audio_chunk_ms,
            sample_rate=settings.audio_sample_rate
        )
        self.speech_buffer = AudioBuffer(
            max_seconds=30.0,
            sample_rate=settings.audio_sample_rate
        )
        
        # VAD
        self.vad = create_vad(
            vad_type="silero",
            threshold=settings.barge_in_threshold,
            sample_rate=settings.audio_sample_rate,
            min_speech_ms=settings.barge_in_min_speech_ms
        )
        
        # Output callback (set by WebSocket handler)
        self._audio_output_callback: Optional[Callable] = None
        self._message_callback: Optional[Callable] = None
        
        # Processing tasks
        self._input_task: Optional[asyncio.Task] = None
        self._processing_task: Optional[asyncio.Task] = None
        
        # State
        self._running = False
        self._pending_audio_queue = asyncio.Queue()
        
        logger.info("pipeline_initialized", session_id=session.session_id)
    
    def set_callbacks(
        self,
        audio_output: Callable,
        message_output: Callable
    ) -> None:
        """Set output callbacks."""
        self._audio_output_callback = audio_output
        self._message_callback = message_output
    
    async def start(self) -> None:
        """Start the audio pipeline."""
        self._running = True
        self._input_task = asyncio.create_task(self._input_processor())
        logger.info("pipeline_started", session_id=self.session.session_id)
    
    async def stop(self) -> None:
        """Stop the audio pipeline."""
        self._running = False
        
        if self._input_task:
            self._input_task.cancel()
            try:
                await self._input_task
            except asyncio.CancelledError:
                pass
        
        if self._processing_task:
            self._processing_task.cancel()
            try:
                await self._processing_task
            except asyncio.CancelledError:
                pass
        
        logger.info("pipeline_stopped", session_id=self.session.session_id)
    
    async def process_audio_input(self, audio_data: bytes) -> None:
        """
        Process incoming audio from microphone.
        Called by WebSocket handler for each audio chunk.
        """
        await self._pending_audio_queue.put(audio_data)
    
    async def _input_processor(self) -> None:
        """Background task to process incoming audio."""
        while self._running:
            try:
                # Get audio with timeout to allow checking _running
                try:
                    audio_data = await asyncio.wait_for(
                        self._pending_audio_queue.get(),
                        timeout=0.1
                    )
                except asyncio.TimeoutError:
                    continue
                
                # Add to input buffer
                self.input_buffer.write(audio_data)
                
                # Process VAD on each chunk
                chunks = self.input_buffer.read_all_chunks()
                for chunk in chunks:
                    await self._process_vad_chunk(chunk)
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("input_processor_error", error=str(e))
    
    async def _process_vad_chunk(self, chunk: bytes) -> None:
        """Process a chunk through VAD and handle state transitions."""
        speech_prob, is_speaking, speech_ended = self.vad.process_chunk(chunk)
        
        current_state = self.session.state
        
        # Always buffer audio during potential speech
        if is_speaking or self.vad._triggered:
            self.speech_buffer.write(chunk)
        
        # State transitions based on VAD
        if current_state == SessionState.IDLE:
            if is_speaking:
                await self.session.set_state(SessionState.LISTENING)
                await self._send_message("status", {"state": "listening"})
                
        elif current_state == SessionState.LISTENING:
            if speech_ended:
                # User finished speaking - process their input
                await self.session.set_state(SessionState.PROCESSING)
                await self._send_message("status", {"state": "processing"})
                
                # Get buffered speech and process
                speech_audio = self.speech_buffer.read_bytes()
                self.speech_buffer.clear()
                self.vad.reset()
                
                # Start processing in background
                self._processing_task = asyncio.create_task(
                    self._process_speech(speech_audio)
                )
                
        elif current_state == SessionState.SPEAKING:
            # Check for barge-in
            if settings.barge_in_enabled and is_speaking:
                await self._handle_barge_in()
                
        elif current_state == SessionState.INTERRUPTED:
            # After interrupt, immediately go to listening
            if not is_speaking and speech_ended:
                # Brief silence after interrupt - they may continue
                pass
            elif is_speaking:
                await self.session.set_state(SessionState.LISTENING)
    
    async def _handle_barge_in(self) -> None:
        """Handle user interrupting the agent."""
        logger.info("barge_in", session_id=self.session.session_id)
        
        # Signal TTS to stop
        was_interrupted = await self.session.interrupt()
        
        if was_interrupted:
            # Send interrupt message to client
            await self._send_message("interrupt", {
                "reason": "user_speech"
            })
            
            # Clear speech buffer and restart listening
            self.speech_buffer.clear()
            await self.session.set_state(SessionState.LISTENING)
    
    async def _process_speech(self, audio_data: bytes) -> None:
        """Process speech through STT → LLM → TTS pipeline."""
        try:
            # STT: Audio → Text
            transcript = await self.stt_handler(audio_data)
            
            if not transcript or not transcript.strip():
                logger.debug("empty_transcript")
                await self.session.set_state(SessionState.IDLE)
                await self._send_message("status", {"state": "idle"})
                return
            
            logger.info("transcript", text=transcript)
            await self._send_message("transcript", {"text": transcript, "final": True})
            
            # Add to conversation history
            self.session.add_user_turn(transcript)
            
            # LLM: Generate response
            response_text = ""
            tool_calls = []
            
            async for chunk in self.llm_handler(
                transcript,
                self.session.get_conversation_context()
            ):
                if chunk.get("type") == "text":
                    response_text += chunk["content"]
                    await self._send_message("response", {
                        "text": chunk["content"],
                        "partial": True
                    })
                elif chunk.get("type") == "tool_call":
                    tool_calls.append(chunk)
                    await self._send_message("tool_call", chunk)
                elif chunk.get("type") == "tool_result":
                    await self._send_message("tool_result", chunk)
            
            if not response_text:
                logger.warning("empty_llm_response")
                await self.session.set_state(SessionState.IDLE)
                return
            
            logger.info("response", text=response_text[:100])
            await self._send_message("response", {"text": response_text, "partial": False})
            
            # Add to history
            self.session.add_assistant_turn(response_text, tool_calls)
            
            # TTS: Text → Audio
            await self.session.set_state(SessionState.SPEAKING)
            await self._send_message("status", {"state": "speaking"})
            self.session.reset_tts_cancel()
            
            async for audio_chunk in self.tts_handler(
                response_text,
                self.session.tts_cancel_event
            ):
                # Check if interrupted
                if self.session.tts_cancel_event.is_set():
                    logger.info("tts_interrupted")
                    break
                
                # Send audio to client
                if self._audio_output_callback:
                    await self._audio_output_callback(audio_chunk)
            
            # Done speaking (if not interrupted)
            if self.session.state == SessionState.SPEAKING:
                await self.session.set_state(SessionState.IDLE)
                await self._send_message("status", {"state": "idle"})
                
        except asyncio.CancelledError:
            logger.info("speech_processing_cancelled")
            raise
        except Exception as e:
            logger.error("speech_processing_error", error=str(e))
            await self.session.set_state(SessionState.IDLE)
            await self._send_message("error", {"message": str(e)})
    
    async def _send_message(self, msg_type: str, data: dict) -> None:
        """Send a message to the client."""
        if self._message_callback:
            await self._message_callback({
                "type": msg_type,
                "data": data,
                "timestamp": time.time()
            })
