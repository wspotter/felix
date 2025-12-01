/**
 * Voice Agent - Main Application v3.0
 * Modular architecture with ES6 modules
 */

import { AudioHandler } from './audio.module.js';
import { escapeHtml, base64ToArrayBuffer, cleanToolCallText } from './utils.js';
import { loadSettings, saveSettings, getSetting, getAllSettings } from './settings.js';
import { initTheme, applyTheme, nextTheme, prevTheme, updateThemeSwatches } from './theme.js';
import { initAvatar, setAvatarState, setInterrupted, AVATAR_STATES } from './avatar.js';
import { initNotifications, showError, showSuccess, showInfo } from './notifications.js';
import { initRadialMenu } from './radial-menu.js';
import { 
    initMusicPlayer, 
    updateMusicState, 
    handleMusicToolResult, 
    duckVolume, 
    restoreVolume,
    isMusicPlaying,
    startStatusPolling 
} from './music.js';

class VoiceAgentApp {
    constructor() {
        // WebSocket
        this.ws = null;
        this.wsUrl = `ws://${window.location.host}/ws`;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000;
        
        // Audio handler
        this.audioHandler = new AudioHandler();
        
        // State
        this.isConnected = false;
        this.isListening = false;
        this.currentState = 'idle';
        this.isMuted = false;
        
        // DOM elements cache
        this.elements = {};
        
        // Flyout state
        this.currentFlyout = null;
        
        // Visualization
        this.visualizationFrame = null;
        this.canvasCtx = null;
        
        // Conversation history
        this.conversationHistory = [];
        this.attachedFiles = [];
        
        // Initialize
        this.init();
    }
    
    async init() {
        // Load settings first
        loadSettings();
        
        // Cache DOM elements
        this.cacheElements();
        
        // Initialize subsystems
        initNotifications();
        initTheme();
        initAvatar(document.getElementById('avatar'));
        initMusicPlayer((data) => this.send(data));  // Pass WebSocket send function
        initRadialMenu((data) => this.send(data));   // Pass WebSocket send function
        
        // Setup canvas
        if (this.elements.waveformCanvas) {
            this.canvasCtx = this.elements.waveformCanvas.getContext('2d');
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Update UI from settings
        this.updateUIFromSettings();
        
        // Connect to server
        this.connect();
    }
    
    cacheElements() {
        this.elements = {
            // Status
            statusDot: document.getElementById('statusDot'),
            statusText: document.getElementById('statusText'),
            modelName: document.getElementById('modelName'),
            
            // Main orb
            orb: document.getElementById('orb'),
            waveformCanvas: document.getElementById('waveformCanvas'),
            mainContent: document.getElementById('mainContent'),
            
            // Conversation
            conversation: document.getElementById('conversation'),
            
            // Controls
            clearBtn: document.getElementById('clearBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            
            // Tools
            toolsIndicator: document.getElementById('toolsIndicator'),
            toolName: document.getElementById('toolName'),
            
            // Flyout
            flyoutContainer: document.getElementById('flyoutContainer'),
            flyoutTabs: document.getElementById('flyoutTabs'),
            flyoutClose: document.getElementById('flyoutClose'),
            flyoutTitle: document.getElementById('flyoutTitle'),
            flyoutIcon: document.getElementById('flyoutIcon'),
            flyoutContent: document.getElementById('flyoutContent'),
            flyoutUrl: document.getElementById('flyoutUrl'),
            flyoutUrlBar: document.getElementById('flyoutUrlBar'),
            
            // Settings modal
            settingsModal: document.getElementById('settingsModal'),
            closeSettings: document.getElementById('closeSettings'),
            saveSettings: document.getElementById('saveSettings'),
            voiceSelect: document.getElementById('voiceSelect'),
            modelSelect: document.getElementById('modelSelect'),
            autoListen: document.getElementById('autoListen'),
            showTimestamps: document.getElementById('showTimestamps'),
            
            // Backend settings
            backendSelect: document.getElementById('backendSelect'),
            ollamaUrl: document.getElementById('ollamaUrl'),
            lmstudioUrl: document.getElementById('lmstudioUrl'),
            openaiUrl: document.getElementById('openaiUrl'),
            apiKeyInput: document.getElementById('apiKeyInput'),
            ollamaUrlSetting: document.getElementById('ollamaUrlSetting'),
            lmstudioUrlSetting: document.getElementById('lmstudioUrlSetting'),
            openaiUrlSetting: document.getElementById('openaiUrlSetting'),
            apiKeySetting: document.getElementById('apiKeySetting'),
            
            // Volume and speed sliders
            volumeSlider: document.getElementById('volumeSlider'),
            volumeValue: document.getElementById('volumeValue'),
            voiceSpeedSlider: document.getElementById('voiceSpeedSlider'),
            voiceSpeedValue: document.getElementById('voiceSpeedValue'),
            
            // Shortcuts modal
            shortcutsModal: document.getElementById('shortcutsModal'),
            closeShortcuts: document.getElementById('closeShortcuts'),
            
            // Test audio button
            testAudioBtn: document.getElementById('testAudioBtn'),
            
            // Chat input elements
            textInput: document.getElementById('textInput'),
            sendBtn: document.getElementById('sendBtn'),
            attachmentBtn: document.getElementById('attachmentBtn'),
            fileInput: document.getElementById('fileInput'),
            charCounter: document.getElementById('charCounter'),
            muteBtn: document.getElementById('muteBtn'),
            
            // History flyout
            historyPanel: document.getElementById('historyPanel'),
            historyList: document.getElementById('historyList'),
            exportHistory: document.getElementById('exportHistory'),
            clearHistoryBtn: document.getElementById('clearHistory'),
        };
    }
    
    setupEventListeners() {
        // Orb click
        this.elements.orb?.addEventListener('click', () => this.handleOrbClick());
        
        // Clear button
        this.elements.clearBtn?.addEventListener('click', () => this.clearConversation());
        
        // Settings modal
        this.elements.settingsBtn?.addEventListener('click', () => this.openModal());
        this.elements.closeSettings?.addEventListener('click', () => this.closeModal());
        this.elements.saveSettings?.addEventListener('click', () => {
            this.handleSaveSettings();
            this.closeModal();
        });
        
        // Theme swatches
        document.querySelectorAll('.theme-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const theme = swatch.dataset.theme;
                applyTheme(theme);
                updateThemeSwatches();
                showInfo(`Theme: ${theme}`, { duration: 1500 });
            });
        });
        
        // Close modal on backdrop click
        this.elements.settingsModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.closeModal();
            }
        });
        
        // Shortcuts modal
        this.elements.closeShortcuts?.addEventListener('click', () => this.closeShortcutsModal());
        this.elements.shortcutsModal?.addEventListener('click', (e) => {
            if (e.target === this.elements.shortcutsModal) {
                this.closeShortcutsModal();
            }
        });
        
        // Test audio button
        this.elements.testAudioBtn?.addEventListener('click', () => this.testAudio());
        
        // Flyout tabs
        document.querySelectorAll('.flyout-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.toggleFlyout(tab.dataset.flyout);
            });
        });
        
        // Flyout close
        this.elements.flyoutClose?.addEventListener('click', () => this.closeFlyout());
        
        // URL bar
        this.elements.flyoutUrl?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadUrl(this.elements.flyoutUrl.value);
            }
        });
        
        // Volume slider
        this.elements.volumeSlider?.addEventListener('input', (e) => {
            const value = e.target.value;
            if (this.elements.volumeValue) {
                this.elements.volumeValue.textContent = `${value}%`;
            }
            // Apply volume to audio handler immediately
            this.audioHandler.setVolume(value / 100);
        });
        
        // Voice speed slider
        this.elements.voiceSpeedSlider?.addEventListener('input', (e) => {
            const value = e.target.value;
            const speed = (value / 100).toFixed(1);
            if (this.elements.voiceSpeedValue) {
                this.elements.voiceSpeedValue.textContent = `${speed}x`;
            }
        });
        
        // Backend selection change
        this.elements.backendSelect?.addEventListener('change', (e) => {
            this.updateBackendVisibility(e.target.value);
        });
        
        // Text input handling
        this.elements.textInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendTextMessage();
            }
        });
        
        this.elements.textInput?.addEventListener('input', () => {
            this.updateCharCounter();
            this.autoResizeTextInput();
        });
        
        this.elements.sendBtn?.addEventListener('click', () => this.sendTextMessage());
        
        // Attachment handling
        this.elements.attachmentBtn?.addEventListener('click', () => {
            this.elements.fileInput?.click();
        });
        
        this.elements.fileInput?.addEventListener('change', (e) => {
            this.handleFileAttachment(e.target.files);
        });
        
        // Mute button
        this.elements.muteBtn?.addEventListener('click', () => this.toggleMute());
        
        // History flyout buttons
        this.elements.exportHistory?.addEventListener('click', () => this.exportConversationHistory());
        this.elements.clearHistoryBtn?.addEventListener('click', () => this.clearConversationHistory());
        
        // Audio callbacks
        this.audioHandler.onAudioData = (pcmData) => this.sendAudio(pcmData);
        this.audioHandler.onVisualizationData = (data) => this.drawWaveform(data);
        this.audioHandler.onPlaybackEnd = () => this.handlePlaybackEnd();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeydown(e));
    }
    
    handleKeydown(e) {
        // Ignore when typing in inputs
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.handleOrbClick();
                break;
            case 'Escape':
                if (this.elements.shortcutsModal?.classList.contains('visible')) {
                    this.closeShortcutsModal();
                } else if (this.currentFlyout) {
                    this.closeFlyout();
                } else if (this.elements.settingsModal?.classList.contains('visible')) {
                    this.closeModal();
                } else if (this.isListening) {
                    this.stopListening();
                }
                break;
            case 'KeyT':
                if (!e.ctrlKey && !e.metaKey) {
                    const newTheme = e.shiftKey ? prevTheme() : nextTheme();
                    showInfo(`Theme: ${newTheme}`, { duration: 1500 });
                }
                break;
            case 'Slash':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.toggleSettings();
                } else if (e.shiftKey) {
                    // ? key (Shift + /)
                    e.preventDefault();
                    this.toggleShortcutsModal();
                }
                break;
        }
    }
    
    toggleSettings() {
        if (this.elements.settingsModal?.classList.contains('visible')) {
            this.closeModal();
        } else {
            this.openModal();
        }
    }
    
    updateUIFromSettings() {
        const settings = getAllSettings();
        
        if (this.elements.voiceSelect) {
            this.elements.voiceSelect.value = settings.voice;
        }
        if (this.elements.modelSelect) {
            this.elements.modelSelect.value = settings.model;
        }
        if (this.elements.autoListen) {
            this.elements.autoListen.checked = settings.autoListen;
        }
        if (this.elements.showTimestamps) {
            this.elements.showTimestamps.checked = settings.showTimestamps;
        }
        if (this.elements.modelName) {
            this.elements.modelName.textContent = settings.model.split(':')[0];
        }
        
        // Backend settings
        if (this.elements.backendSelect) {
            this.elements.backendSelect.value = settings.llmBackend || 'ollama';
        }
        if (this.elements.ollamaUrl) {
            this.elements.ollamaUrl.value = settings.ollamaUrl || 'http://localhost:11434';
        }
        if (this.elements.lmstudioUrl) {
            this.elements.lmstudioUrl.value = settings.lmstudioUrl || 'http://localhost:1234';
        }
        if (this.elements.openaiUrl) {
            this.elements.openaiUrl.value = settings.openaiUrl || 'https://api.openai.com';
        }
        if (this.elements.apiKeyInput) {
            this.elements.apiKeyInput.value = settings.openaiApiKey || '';
        }
        this.updateBackendVisibility(settings.llmBackend || 'ollama');
        
        // Volume slider
        if (this.elements.volumeSlider) {
            this.elements.volumeSlider.value = settings.volume;
        }
        if (this.elements.volumeValue) {
            this.elements.volumeValue.textContent = `${settings.volume}%`;
        }
        
        // Voice speed slider
        if (this.elements.voiceSpeedSlider) {
            this.elements.voiceSpeedSlider.value = settings.voiceSpeed;
        }
        if (this.elements.voiceSpeedValue) {
            this.elements.voiceSpeedValue.textContent = `${(settings.voiceSpeed / 100).toFixed(1)}x`;
        }
        
        // Apply volume to audio handler
        this.audioHandler.setVolume(settings.volume / 100);
        
        // Apply timestamps setting to conversation
        if (settings.showTimestamps) {
            this.elements.conversation?.classList.add('show-timestamps');
        } else {
            this.elements.conversation?.classList.remove('show-timestamps');
        }
    }
    
    updateBackendVisibility(backend) {
        // Hide all backend-specific settings first
        this.elements.ollamaUrlSetting?.classList.add('hidden');
        this.elements.lmstudioUrlSetting?.classList.add('hidden');
        this.elements.openaiUrlSetting?.classList.add('hidden');
        this.elements.apiKeySetting?.classList.add('hidden');
        
        // Show relevant settings based on backend
        switch (backend) {
            case 'ollama':
                this.elements.ollamaUrlSetting?.classList.remove('hidden');
                break;
            case 'lmstudio':
                this.elements.lmstudioUrlSetting?.classList.remove('hidden');
                break;
            case 'openai':
                this.elements.openaiUrlSetting?.classList.remove('hidden');
                this.elements.apiKeySetting?.classList.remove('hidden');
                break;
        }
    }
    
    handleSaveSettings() {
        const newSettings = {
            voice: this.elements.voiceSelect?.value,
            model: this.elements.modelSelect?.value,
            autoListen: this.elements.autoListen?.checked,
            showTimestamps: this.elements.showTimestamps?.checked,
            volume: parseInt(this.elements.volumeSlider?.value || 80),
            voiceSpeed: parseInt(this.elements.voiceSpeedSlider?.value || 100),
            // Backend settings
            llmBackend: this.elements.backendSelect?.value || 'ollama',
            ollamaUrl: this.elements.ollamaUrl?.value || 'http://localhost:11434',
            lmstudioUrl: this.elements.lmstudioUrl?.value || 'http://localhost:1234',
            openaiUrl: this.elements.openaiUrl?.value || 'https://api.openai.com',
            openaiApiKey: this.elements.apiKeyInput?.value || '',
        };
        
        saveSettings(newSettings);
        
        if (this.elements.modelName) {
            this.elements.modelName.textContent = newSettings.model.split(':')[0];
        }
        
        // Apply timestamps setting
        if (newSettings.showTimestamps) {
            this.elements.conversation?.classList.add('show-timestamps');
        } else {
            this.elements.conversation?.classList.remove('show-timestamps');
        }
        
        // Send to server
        if (this.isConnected) {
            this.send({
                type: 'settings',
                voice: newSettings.voice,
                model: newSettings.model,
                voiceSpeed: newSettings.voiceSpeed / 100,  // Send as multiplier
                // Backend settings
                llmBackend: newSettings.llmBackend,
                ollamaUrl: newSettings.ollamaUrl,
                lmstudioUrl: newSettings.lmstudioUrl,
                openaiUrl: newSettings.openaiUrl,
                openaiApiKey: newSettings.openaiApiKey,
            });
        }
        
        showSuccess('Settings saved');
    }
    
    // ========================================
    // WebSocket & Connection
    // ========================================
    
    connect() {
        this.updateStatus('connecting', 'Connecting...');
        
        try {
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.updateStatus('connected', 'Ready');
                
                // Send initial settings (including backend config)
                const settings = getAllSettings();
                this.send({
                    type: 'settings',
                    voice: settings.voice,
                    model: settings.model,
                    voiceSpeed: settings.voiceSpeed / 100,  // Send as multiplier
                    llmBackend: settings.llmBackend,
                    ollamaUrl: settings.ollamaUrl,
                    lmstudioUrl: settings.lmstudioUrl,
                    openaiUrl: settings.openaiUrl,
                    openaiApiKey: settings.openaiApiKey,
                });
                
                // Start music status polling
                startStatusPolling(5000);
            };
            
            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateStatus('disconnected', 'Disconnected');
                this.stopListening();
                this.scheduleReconnect();
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateStatus('error', 'Connection error');
            };
            
            this.ws.onmessage = (event) => this.handleWsMessage(event);
            
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this.scheduleReconnect();
        }
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.updateStatus('error', 'Connection failed');
            showError('Unable to connect to server. Please refresh the page.');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        
        this.updateStatus('disconnected', `Reconnecting in ${Math.round(delay / 1000)}s...`);
        
        setTimeout(() => this.connect(), delay);
    }
    
    handleWsMessage(event) {
        try {
            // Binary audio data
            if (event.data instanceof Blob) {
                event.data.arrayBuffer().then(buffer => {
                    this.audioHandler.playAudio(buffer);
                });
                return;
            }
            
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'state':
                    this.handleStateChange(message.state);
                    break;
                case 'transcript':
                    this.addMessage('user', message.text, message.is_final);
                    break;
                case 'response':
                    this.finalizeAssistantMessage(message.text);
                    break;
                case 'response_chunk':
                    this.updateAssistantMessage(message.text);
                    break;
                case 'tool_call':
                    this.showToolIndicator(message.tool);
                    break;
                case 'tool_result':
                    this.hideToolIndicator();
                    // Check if this is a music tool result
                    if (message.tool && message.tool.startsWith('music_')) {
                        handleMusicToolResult(message.result);
                    }
                    break;
                case 'music_state':
                    // Handle music state updates from server
                    updateMusicState(message);
                    break;
                case 'flyout':
                    this.showInFlyout(message.flyout_type, message.content);
                    break;
                case 'error':
                    this.handleError(message.message);
                    break;
                case 'audio':
                    const audioData = base64ToArrayBuffer(message.data);
                    this.audioHandler.playAudio(audioData);
                    break;
                case 'settings_updated':
                    // Server confirmed settings change
                    if (message.llmBackend && message.model) {
                        const backendLabel = message.llmBackend === 'lmstudio' ? 'LM Studio' : 
                                            message.llmBackend === 'openai' ? 'OpenAI' : 'Ollama';
                        showSuccess(`Using ${backendLabel}: ${message.model}`);
                        if (this.elements.modelName) {
                            this.elements.modelName.textContent = message.model.split(':')[0];
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }
    
    handleStateChange(state) {
        this.currentState = state;
        const orb = this.elements.orb;
        
        // Remove all orb state classes
        orb?.classList.remove('active', 'processing', 'speaking');
        
        switch (state) {
            case 'idle':
                this.updateStatus('connected', 'Ready');
                // Restore music volume when returning to idle
                if (isMusicPlaying()) {
                    restoreVolume();
                    setAvatarState(AVATAR_STATES.GROOVING);
                } else {
                    setAvatarState(AVATAR_STATES.IDLE);
                }
                break;
            case 'listening':
                this.updateStatus('listening', 'Listening...');
                orb?.classList.add('active');
                setAvatarState(AVATAR_STATES.LISTENING);
                break;
            case 'processing':
                this.updateStatus('processing', 'Thinking...');
                orb?.classList.add('processing');
                setAvatarState(AVATAR_STATES.THINKING);
                // Keep recording for seamless barge-in transition
                break;
            case 'speaking':
                this.updateStatus('speaking', 'Speaking...');
                orb?.classList.add('speaking');
                setAvatarState(AVATAR_STATES.SPEAKING);
                // Duck music volume when Felix speaks
                if (isMusicPlaying()) {
                    duckVolume(20);  // Duck to 20%
                }
                // BARGE-IN: Ensure recording continues during TTS playback
                // so we can detect user interrupts
                if (!this.audioHandler.isRecording) {
                    console.log('Restarting recording for barge-in detection');
                    this.audioHandler.startRecording().catch(e => 
                        console.error('Failed to restart recording:', e)
                    );
                }
                break;
            case 'interrupted':
                this.updateStatus('listening', 'Interrupted');
                this.audioHandler.stopPlayback();
                orb?.classList.add('active');
                setInterrupted();
                // Restore music volume on interrupt
                if (isMusicPlaying()) {
                    restoreVolume();
                }
                break;
        }
    }
    
    handleError(message) {
        console.error('Server error:', message);
        showError(message);
        this.addMessage('system', `⚠️ ${message}`, true);
    }
    
    // ========================================
    // Audio & Recording
    // ========================================
    
    handleOrbClick() {
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }
    
    async startListening() {
        if (!this.isConnected) {
            showError('Not connected to server');
            return;
        }
        
        try {
            await this.audioHandler.startRecording();
            this.isListening = true;
            
            this.elements.orb?.classList.add('active');
            this.send({ type: 'start_listening' });
            this.startVisualization();
        } catch (error) {
            console.error('Failed to start listening:', error);
            showError('Could not access microphone. Make sure you\'re using localhost.');
        }
    }
    
    stopListening() {
        this.audioHandler.stopRecording();
        this.isListening = false;
        
        this.elements.orb?.classList.remove('active');
        this.send({ type: 'stop_listening' });
        this.stopVisualization();
    }
    
    sendAudio(pcmData) {
        const isPlaying = this.audioHandler.isPlaying;
        const isRecording = this.audioHandler.isRecording;
        
        // Debug: log barge-in status periodically
        if (isPlaying && Math.random() < 0.05) {
            console.log('Barge-in check:', 
                'playing=' + isPlaying, 
                'recording=' + isRecording, 
                'listening=' + this.isListening, 
                'connected=' + this.isConnected,
                'dataSize=' + pcmData.length
            );
        }
        
        // Check connection
        if (!this.isConnected) {
            return;
        }
        
        // During TTS playback, always send audio for barge-in detection
        // Even if not "listening", the server needs audio to detect speech
        if (!this.isListening && !isPlaying) {
            return;
        }
        
        const isTTSPlaying = isPlaying ? 1 : 0;
        const packet = new Uint8Array(1 + pcmData.buffer.byteLength);
        packet[0] = isTTSPlaying;
        packet.set(new Uint8Array(pcmData.buffer), 1);
        
        this.ws.send(packet.buffer);
    }
    
    send(data) {
        if (!this.isConnected || !this.ws) return;
        this.ws.send(JSON.stringify(data));
    }
    
    handlePlaybackEnd() {
        if (this.currentState === 'speaking') {
            this.send({ type: 'playback_done' });
        }
        
        const autoListen = getSetting('autoListen');
        if (autoListen && this.currentState === 'speaking') {
            setTimeout(() => {
                if (!this.isListening) {
                    this.startListening();
                }
            }, 500);
        }
    }
    
    // ========================================
    // Visualization
    // ========================================
    
    startVisualization() {
        if (this.visualizationFrame) return;
        
        const draw = () => {
            const data = this.audioHandler.getVisualizationData();
            if (data) {
                this.drawWaveform(data);
            }
            this.visualizationFrame = requestAnimationFrame(draw);
        };
        
        draw();
    }
    
    stopVisualization() {
        if (this.visualizationFrame) {
            cancelAnimationFrame(this.visualizationFrame);
            this.visualizationFrame = null;
        }
        this.clearWaveform();
    }
    
    drawWaveform(dataArray) {
        const canvas = this.elements.waveformCanvas;
        if (!canvas || !this.canvasCtx) return;
        
        const ctx = this.canvasCtx;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 100;
        
        ctx.clearRect(0, 0, width, height);
        
        ctx.beginPath();
        ctx.strokeStyle = this.isListening ? 'rgba(99, 102, 241, 0.6)' : 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 3;
        
        const points = 64;
        for (let i = 0; i <= points; i++) {
            const angle = (i / points) * Math.PI * 2 - Math.PI / 2;
            const dataIndex = Math.floor((i / points) * dataArray.length);
            const amplitude = (dataArray[dataIndex] - 128) / 128;
            const r = radius + amplitude * 30;
            
            const x = centerX + Math.cos(angle) * r;
            const y = centerY + Math.sin(angle) * r;
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.closePath();
        ctx.stroke();
    }
    
    clearWaveform() {
        const canvas = this.elements.waveformCanvas;
        if (!canvas || !this.canvasCtx) return;
        this.canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // ========================================
    // Conversation UI
    // ========================================
    
    addMessage(role, text, isFinal = true) {
        const conversation = this.elements.conversation;
        if (!conversation) return;
        
        let messageEl = conversation.querySelector(`.message.${role}.interim`);
        
        if (messageEl && isFinal) {
            messageEl.classList.remove('interim');
            messageEl.querySelector('p').textContent = text;
            // Add to history when finalized
            if (role !== 'system') {
                this.addToHistory(role, text);
            }
        } else if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = `message ${role}${isFinal ? '' : ' interim'}`;
            messageEl.innerHTML = `<p>${escapeHtml(text)}</p>`;
            conversation.appendChild(messageEl);
            // Add to history if final and not system
            if (isFinal && role !== 'system') {
                this.addToHistory(role, text);
            }
        } else {
            messageEl.querySelector('p').textContent = text;
        }
        
        conversation.scrollTop = conversation.scrollHeight;
    }
    
    updateAssistantMessage(text) {
        const conversation = this.elements.conversation;
        if (!conversation) return;
        
        // Clean any tool call JSON from the text
        const cleanedText = cleanToolCallText(text);
        
        let messageEl = conversation.querySelector('.message.assistant.streaming');
        
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = 'message assistant streaming';
            messageEl.innerHTML = '<p></p>';
            conversation.appendChild(messageEl);
        }
        
        messageEl.querySelector('p').textContent = cleanedText;
        conversation.scrollTop = conversation.scrollHeight;
    }
    
    finalizeAssistantMessage(text) {
        const conversation = this.elements.conversation;
        if (!conversation) return;
        
        // Clean any tool call JSON from the text
        const cleanedText = cleanToolCallText(text);
        
        let messageEl = conversation.querySelector('.message.assistant.streaming');
        
        if (messageEl) {
            messageEl.classList.remove('streaming');
            messageEl.querySelector('p').textContent = cleanedText;
        } else {
            messageEl = document.createElement('div');
            messageEl.className = 'message assistant';
            messageEl.innerHTML = `<p>${escapeHtml(cleanedText)}</p>`;
            conversation.appendChild(messageEl);
        }
        
        // Add to history
        if (cleanedText) {
            this.addToHistory('assistant', cleanedText);
        }
        
        conversation.scrollTop = conversation.scrollHeight;
    }
    
    clearConversation() {
        if (!this.elements.conversation) return;
        
        this.elements.conversation.innerHTML = `
            <div class="message system">
                <p>Conversation cleared. Click the orb to start talking.</p>
            </div>
        `;
        this.send({ type: 'clear_conversation' });
        showInfo('Conversation cleared');
    }
    
    // ========================================
    // Flyout Panel
    // ========================================
    
    toggleFlyout(type) {
        if (this.currentFlyout === type) {
            this.closeFlyout();
        } else {
            this.openFlyout(type);
        }
    }
    
    openFlyout(type) {
        this.currentFlyout = type;
        
        this.elements.flyoutContainer?.classList.add('open');
        this.elements.mainContent?.classList.add('flyout-open');
        
        document.querySelectorAll('.flyout-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.flyout === type);
        });
        
        const configs = {
            browser: { title: 'Browser', icon: 'browser', showUrlBar: true },
            knowledge: { title: 'Knowledge Base', icon: 'knowledge', showUrlBar: false },
            code: { title: 'Code Editor', icon: 'code', showUrlBar: false },
            terminal: { title: 'Terminal', icon: 'terminal', showUrlBar: false },
            preview: { title: 'Preview', icon: 'preview', showUrlBar: true },
            history: { title: 'Conversation History', icon: 'history', showUrlBar: false },
        };
        
        const config = configs[type];
        if (config) {
            if (this.elements.flyoutTitle) this.elements.flyoutTitle.textContent = config.title;
            if (this.elements.flyoutIcon) this.elements.flyoutIcon.className = `flyout-title-icon ${config.icon}`;
            if (this.elements.flyoutUrlBar) this.elements.flyoutUrlBar.style.display = config.showUrlBar ? 'flex' : 'none';
        }
        
        this.setFlyoutContent(type);
    }
    
    closeFlyout() {
        this.currentFlyout = null;
        this.elements.flyoutContainer?.classList.remove('open');
        this.elements.mainContent?.classList.remove('flyout-open');
        
        document.querySelectorAll('.flyout-tab').forEach(tab => {
            tab.classList.remove('active');
        });
    }
    
    setFlyoutContent(type) {
        const content = this.elements.flyoutContent;
        if (!content) return;
        
        // Hide history panel by default
        const historyPanel = document.getElementById('historyPanel');
        if (historyPanel) historyPanel.style.display = 'none';
        
        // Hide iframe by default
        const iframe = content.querySelector('iframe');
        if (iframe) iframe.style.display = 'none';
        
        switch (type) {
            case 'browser':
            case 'preview':
                content.innerHTML = '<iframe class="flyout-browser" id="flyoutBrowser" src="about:blank"></iframe>';
                break;
            case 'knowledge':
                content.innerHTML = '<iframe class="flyout-browser" id="flyoutKnowledge" src="http://127.0.0.1:4173"></iframe>';
                break;
            case 'code':
                content.innerHTML = `
                    <div class="flyout-code" id="flyoutCode">
                        <div><span class="line-number">1</span><span style="color:#89b4fa">// Code editor ready</span></div>
                        <div><span class="line-number">2</span><span style="color:#cdd6f4">// AI-generated code will appear here</span></div>
                    </div>
                `;
                break;
            case 'terminal':
                content.innerHTML = `
                    <div class="flyout-terminal" id="flyoutTerminal">
                        <div><span class="prompt">$</span> <span class="output">Terminal ready...</span></div>
                    </div>
                `;
                break;
            case 'history':
                // Use the existing history panel from HTML
                if (historyPanel) {
                    historyPanel.style.display = 'block';
                    this.renderHistoryPanel();
                }
                break;
        }
    }
    
    loadUrl(url) {
        if (!url.startsWith('http')) {
            url = 'https://' + url;
        }
        const iframe = document.querySelector('.flyout-browser');
        if (iframe) {
            iframe.src = url;
        }
    }
    
    showInFlyout(type, content) {
        this.openFlyout(type);
        
        setTimeout(() => {
            switch (type) {
                case 'browser':
                case 'preview':
                    if (this.elements.flyoutUrl) this.elements.flyoutUrl.value = content;
                    this.loadUrl(content);
                    break;
                case 'code':
                    const codeEl = document.getElementById('flyoutCode');
                    if (codeEl) {
                        codeEl.innerHTML = this.formatCode(content);
                    }
                    break;
                case 'terminal':
                    const termEl = document.getElementById('flyoutTerminal');
                    if (termEl) {
                        termEl.innerHTML += `<div><span class="prompt">$</span> <span class="output">${escapeHtml(content)}</span></div>`;
                        termEl.scrollTop = termEl.scrollHeight;
                    }
                    break;
            }
        }, 100);
    }
    
    formatCode(code) {
        const lines = code.split('\n');
        return lines.map((line, i) => 
            `<div><span class="line-number">${i + 1}</span>${escapeHtml(line)}</div>`
        ).join('');
    }
    
    // ========================================
    // UI Helpers
    // ========================================
    
    showToolIndicator(toolName) {
        if (this.elements.toolName) this.elements.toolName.textContent = toolName;
        this.elements.toolsIndicator?.classList.remove('hidden');
    }
    
    hideToolIndicator() {
        this.elements.toolsIndicator?.classList.add('hidden');
    }
    
    updateStatus(status, text) {
        if (this.elements.statusDot) {
            this.elements.statusDot.className = `status-dot ${status}`;
        }
        if (this.elements.statusText) {
            this.elements.statusText.textContent = text;
        }
    }
    
    openModal() {
        this.elements.settingsModal?.classList.add('visible');
        updateThemeSwatches();
    }
    
    closeModal() {
        this.elements.settingsModal?.classList.remove('visible');
    }
    
    // Shortcuts modal
    openShortcutsModal() {
        this.elements.shortcutsModal?.classList.add('visible');
    }
    
    closeShortcutsModal() {
        this.elements.shortcutsModal?.classList.remove('visible');
    }
    
    toggleShortcutsModal() {
        if (this.elements.shortcutsModal?.classList.contains('visible')) {
            this.closeShortcutsModal();
        } else {
            this.openShortcutsModal();
        }
    }
    
    // Test audio - sends request to server for TTS test
    testAudio() {
        if (!this.isConnected) {
            showError('Not connected to server');
            return;
        }
        
        this.send({
            type: 'test_audio',
            voice: this.elements.voiceSelect?.value || 'amy',
        });
        
        showInfo('Playing test audio...', { duration: 2000 });
    }
    
    // ========================================
    // Text Input & Chat Features
    // ========================================
    
    sendTextMessage() {
        const text = this.elements.textInput?.value?.trim();
        if (!text || !this.isConnected) return;
        
        // Add to conversation UI (also adds to history)
        this.addMessage('user', text, true);
        
        // Send to server
        this.send({
            type: 'text_message',
            text: text,
            attachments: this.attachedFiles.map(f => ({
                name: f.name,
                type: f.type,
                data: f.data
            }))
        });
        
        // Clear input and attachments
        if (this.elements.textInput) {
            this.elements.textInput.value = '';
            this.autoResizeTextInput();
        }
        this.clearAttachments();
        this.updateCharCounter();
    }
    
    updateCharCounter() {
        const text = this.elements.textInput?.value || '';
        const count = text.length;
        const maxLength = 2000;
        
        if (this.elements.charCounter) {
            this.elements.charCounter.textContent = `${count}/${maxLength}`;
            this.elements.charCounter.classList.toggle('warning', count > maxLength * 0.8);
            this.elements.charCounter.classList.toggle('danger', count > maxLength * 0.95);
        }
        
        // Disable send button if empty
        if (this.elements.sendBtn) {
            this.elements.sendBtn.disabled = count === 0;
        }
    }
    
    autoResizeTextInput() {
        const textarea = this.elements.textInput;
        if (!textarea) return;
        
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }
    
    // ========================================
    // File Attachments
    // ========================================
    
    handleFileAttachment(files) {
        if (!files || files.length === 0) return;
        
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                this.attachedFiles.push({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    data: e.target.result.split(',')[1] // Base64 data
                });
                this.renderAttachments();
                showInfo(`Attached: ${file.name}`, { duration: 2000 });
            };
            reader.readAsDataURL(file);
        });
        
        // Clear file input
        if (this.elements.fileInput) {
            this.elements.fileInput.value = '';
        }
    }
    
    renderAttachments() {
        // Create or get attachment preview area
        let preview = document.querySelector('.attachment-preview');
        if (!preview && this.attachedFiles.length > 0) {
            preview = document.createElement('div');
            preview.className = 'attachment-preview';
            const chatInputArea = document.querySelector('.chat-input-area');
            chatInputArea?.parentNode?.insertBefore(preview, chatInputArea.nextSibling);
        }
        
        if (preview) {
            if (this.attachedFiles.length === 0) {
                preview.remove();
                return;
            }
            
            preview.innerHTML = this.attachedFiles.map((file, i) => `
                <div class="attachment-item" data-index="${i}">
                    <span>${escapeHtml(file.name)}</span>
                    <span class="remove-attachment" onclick="app.removeAttachment(${i})">×</span>
                </div>
            `).join('');
        }
    }
    
    removeAttachment(index) {
        this.attachedFiles.splice(index, 1);
        this.renderAttachments();
    }
    
    clearAttachments() {
        this.attachedFiles = [];
        this.renderAttachments();
    }
    
    // ========================================
    // Mute Toggle
    // ========================================
    
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.elements.muteBtn?.classList.toggle('muted', this.isMuted);
        
        // Mute/unmute TTS audio
        this.audioHandler.setMuted?.(this.isMuted);
        
        showInfo(this.isMuted ? 'Audio muted' : 'Audio unmuted', { duration: 1500 });
    }
    
    // ========================================
    // Conversation History
    // ========================================
    
    addToHistory(role, text) {
        this.conversationHistory.push({
            role,
            text,
            timestamp: new Date().toISOString()
        });
        
        // Update history panel if open
        if (this.currentFlyout === 'history') {
            this.renderHistoryPanel();
        }
    }
    
    renderHistoryPanel() {
        const historyList = this.elements.historyList;
        if (!historyList) return;
        
        if (this.conversationHistory.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty">
                    <svg viewBox="0 0 24 24">
                        <path fill="currentColor" d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
                    </svg>
                    <p>No conversation history yet</p>
                    <span>Start talking to see your conversation here</span>
                </div>
            `;
            return;
        }
        
        historyList.innerHTML = this.conversationHistory.map(entry => {
            const time = new Date(entry.timestamp).toLocaleTimeString();
            return `
                <div class="history-entry ${entry.role}">
                    <div class="history-entry-header">
                        <span class="history-entry-role">${entry.role}</span>
                        <span class="history-entry-time">${time}</span>
                    </div>
                    <div class="history-entry-text">${escapeHtml(entry.text)}</div>
                </div>
            `;
        }).join('');
        
        historyList.scrollTop = historyList.scrollHeight;
    }
    
    exportConversationHistory() {
        if (this.conversationHistory.length === 0) {
            showInfo('No conversation to export');
            return;
        }
        
        const content = this.conversationHistory.map(entry => {
            const time = new Date(entry.timestamp).toLocaleString();
            return `[${time}] ${entry.role.toUpperCase()}: ${entry.text}`;
        }).join('\n\n');
        
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `conversation-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        
        showSuccess('Conversation exported');
    }
    
    clearConversationHistory() {
        this.conversationHistory = [];
        this.renderHistoryPanel();
        showInfo('History cleared');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VoiceAgentApp();
});
