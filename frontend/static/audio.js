/**
 * Audio handling for voice agent
 * Manages microphone capture, audio playback, and WebSocket audio streaming
 */

class AudioHandler {
    constructor() {
        this.audioContext = null;
        this.playbackContext = null;  // Separate context for playback at different sample rate
        this.mediaStream = null;
        this.processor = null;
        this.analyser = null;
        this.isRecording = false;
        this.playbackQueue = [];
        this.isPlaying = false;
        this.currentSource = null;  // Track current audio source for stopping
        
        // Audio settings
        this.inputSampleRate = 16000;   // For microphone input (what server expects)
        this.outputSampleRate = 22050;  // For playback (Piper TTS outputs 22050Hz)
        this.sampleRate = 16000;        // Keep for backwards compat
        this.channels = 1;
        this.bufferSize = 4096;
        
        // Callbacks
        this.onAudioData = null;
        this.onVisualizationData = null;
        this.onPlaybackEnd = null;
    }
    
    async initialize() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate,
            });
            
            // Request microphone permission
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.sampleRate,
                    channelCount: this.channels,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            
            // Create analyser for visualization
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            
            console.log('Audio initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize audio:', error);
            return false;
        }
    }
    
    async startRecording() {
        console.log('startRecording called, isRecording:', this.isRecording);
        if (this.isRecording) return;
        
        if (!this.audioContext || !this.mediaStream) {
            console.log('Initializing audio...');
            const success = await this.initialize();
            if (!success) {
                throw new Error('Failed to initialize audio');
            }
        }
        
        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        // Create source from microphone
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Connect to analyser for visualization
        source.connect(this.analyser);
        
        // Create script processor for audio data
        this.processor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
        
        this.processor.onaudioprocess = (event) => {
            if (!this.isRecording) return;
            
            const inputData = event.inputBuffer.getChannelData(0);
            
            // Convert float32 to int16
            const pcm16 = this.float32ToInt16(inputData);
            
            // Send audio data
            if (this.onAudioData) {
                this.onAudioData(pcm16);
            }
            
            // Update visualization
            if (this.onVisualizationData) {
                const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
                this.analyser.getByteTimeDomainData(dataArray);
                this.onVisualizationData(dataArray);
            }
        };
        
        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        
        this.isRecording = true;
        console.log('Recording started');
    }
    
    stopRecording() {
        if (!this.isRecording) return;
        
        this.isRecording = false;
        
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        
        console.log('Recording stopped');
    }
    
    async playAudio(audioData) {
        // Create playback context at correct sample rate if needed
        if (!this.playbackContext) {
            this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.outputSampleRate,  // 22050Hz for Piper TTS
            });
        }
        
        // Resume audio context if suspended
        if (this.playbackContext.state === 'suspended') {
            await this.playbackContext.resume();
        }
        
        // Clear any pending audio - only play the latest
        this.playbackQueue = [];
        
        // Add to queue
        this.playbackQueue.push(audioData);
        
        // Start playing if not already
        if (!this.isPlaying) {
            this.processPlaybackQueue();
        }
    }
    
    async processPlaybackQueue() {
        if (this.playbackQueue.length === 0) {
            this.isPlaying = false;
            if (this.onPlaybackEnd) {
                this.onPlaybackEnd();
            }
            return;
        }
        
        this.isPlaying = true;
        const audioData = this.playbackQueue.shift();
        
        try {
            // Decode audio data using playback context (22050Hz)
            let audioBuffer;
            
            if (audioData instanceof ArrayBuffer) {
                // Try to decode as WAV (includes header with sample rate)
                try {
                    audioBuffer = await this.playbackContext.decodeAudioData(audioData.slice(0));
                } catch {
                    // Raw PCM data - convert at playback sample rate
                    audioBuffer = this.pcmToAudioBuffer(new Int16Array(audioData));
                }
            } else if (audioData instanceof Int16Array) {
                audioBuffer = this.pcmToAudioBuffer(audioData);
            } else {
                console.error('Unknown audio data format');
                this.processPlaybackQueue();
                return;
            }
            
            // Create source and play using playback context
            const source = this.playbackContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.playbackContext.destination);
            
            // Track current source for interruption
            this.currentSource = source;
            
            source.onended = () => {
                this.currentSource = null;
                this.processPlaybackQueue();
            };
            
            source.start();
        } catch (error) {
            console.error('Error playing audio:', error);
            this.processPlaybackQueue();
        }
    }
    
    stopPlayback() {
        this.playbackQueue = [];
        this.isPlaying = false;
        
        // Stop currently playing audio immediately
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch {
                // Already stopped
            }
            this.currentSource = null;
        }
    }
    
    pcmToAudioBuffer(pcm16Data) {
        // Use playback context with correct sample rate (22050Hz for Piper TTS)
        const audioBuffer = this.playbackContext.createBuffer(
            1,
            pcm16Data.length,
            this.outputSampleRate  // 22050Hz
        );
        
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < pcm16Data.length; i++) {
            channelData[i] = pcm16Data[i] / 32768;
        }
        
        return audioBuffer;
    }
    
    float32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array;
    }
    
    int16ToFloat32(int16Array) {
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768;
        }
        return float32Array;
    }
    
    getVisualizationData() {
        if (!this.analyser) return null;
        
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(dataArray);
        return dataArray;
    }
    
    close() {
        this.stopRecording();
        this.stopPlayback();
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}

// Export for use in app.js
window.AudioHandler = AudioHandler;
