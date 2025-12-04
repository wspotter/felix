/**
 * Voice Agent - Audio Handler
 * Manages microphone capture, audio playback, and WebSocket audio streaming
 * ES6 Module version
 */

export class AudioHandler {
    constructor() {
        this.audioContext = null;
        this.playbackContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.analyser = null;
        this.isRecording = false;
        this.playbackQueue = [];
        this.isPlaying = false;
        this.currentSource = null;
        this.gainNode = null;  // For volume control
        
        // Audio settings
        this.inputSampleRate = 16000;
        this.outputSampleRate = 22050;
        this.sampleRate = 16000;
        this.channels = 1;
        this.bufferSize = 4096;
        this.volume = 1.0;  // 0.0 to 1.0
        
        // Callbacks
        this.onAudioData = null;
        this.onVisualizationData = null;
        this.onPlaybackEnd = null;
        this.isMuted = false;
    }
    
    /**
     * Set playback volume
     * @param {number} volume - Volume 0.0 to 1.0
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        if (this.gainNode && !this.isMuted) {
            this.gainNode.gain.value = this.volume;
        }
    }
    
    /**
     * Set muted state
     * @param {boolean} muted - Whether audio is muted
     */
    setMuted(muted) {
        this.isMuted = muted;
        if (this.gainNode) {
            this.gainNode.gain.value = muted ? 0 : this.volume;
        }
    }
    
    async initialize() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate,
            });
            
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: this.sampleRate,
                    channelCount: this.channels,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                }
            });
            
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
        if (this.isRecording) return;
        
        if (!this.audioContext || !this.mediaStream) {
            const success = await this.initialize();
            if (!success) {
                throw new Error('Failed to initialize audio');
            }
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
        
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        source.connect(this.analyser);
        
        this.processor = this.audioContext.createScriptProcessor(this.bufferSize, 1, 1);
        
        this.processor.onaudioprocess = (event) => {
            if (!this.isRecording) return;
            
            const inputData = event.inputBuffer.getChannelData(0);
            const pcm16 = this.float32ToInt16(inputData);
            
            if (this.onAudioData) {
                this.onAudioData(pcm16);
            }
            
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
        if (!this.playbackContext) {
            this.playbackContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.outputSampleRate,
            });
            
            // Create gain node for volume control
            this.gainNode = this.playbackContext.createGain();
            this.gainNode.gain.value = this.volume;
            this.gainNode.connect(this.playbackContext.destination);
        }
        
        if (this.playbackContext.state === 'suspended') {
            await this.playbackContext.resume();
        }
        
        this.playbackQueue = [];
        this.playbackQueue.push(audioData);
        
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
            let audioBuffer;
            
            if (audioData instanceof ArrayBuffer) {
                try {
                    audioBuffer = await this.playbackContext.decodeAudioData(audioData.slice(0));
                } catch {
                    // Decode failed, try PCM conversion
                    audioBuffer = this.pcmToAudioBuffer(new Int16Array(audioData));
                }
            } else if (audioData instanceof Int16Array) {
                audioBuffer = this.pcmToAudioBuffer(audioData);
            } else {
                console.error('Unknown audio data format');
                this.processPlaybackQueue();
                return;
            }
            
            const source = this.playbackContext.createBufferSource();
            source.buffer = audioBuffer;
            
            // Connect through gain node for volume control
            source.connect(this.gainNode);
            
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
        const wasPlaying = this.isPlaying;
        this.isPlaying = false;
        
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch {
                // Already stopped
            }
            this.currentSource = null;
        }
        
        // Notify that playback ended (important for state management)
        if (wasPlaying && this.onPlaybackEnd) {
            this.onPlaybackEnd();
        }
    }
    
    pcmToAudioBuffer(pcm16Data) {
        const audioBuffer = this.playbackContext.createBuffer(
            1,
            pcm16Data.length,
            this.outputSampleRate
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
