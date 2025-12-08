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

const CONVERSATION_STORAGE_KEY = 'felix-conversation-history';

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
        this.conversationHistory = this.loadConversationHistory();
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

        // Restore any locally saved conversation for this browser
        this.restoreConversationFromHistory();
        this.renderHistoryPanel();
        
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
            
            unloadOtherLLMs: document.getElementById('unloadOtherLLMs'),
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
            modelCustom: document.getElementById('modelCustom'),
            refreshModelsBtn: document.getElementById('refreshModelsBtn'),
            autoListen: document.getElementById('autoListen'),
            showTimestamps: document.getElementById('showTimestamps'),
            unloadOtherLLMs: document.getElementById('unloadOtherLLMs'),
            
            // Backend settings
            backendSelect: document.getElementById('backendSelect'),
            ollamaUrl: document.getElementById('ollamaUrl'),
            lmstudioUrl: document.getElementById('lmstudioUrl'),
            openaiUrl: document.getElementById('openaiUrl'),
            openrouterUrl: document.getElementById('openrouterUrl'),
            apiKeyInput: document.getElementById('apiKeyInput'),
            openrouterApiKeyInput: document.getElementById('openrouterApiKeyInput'),
            ollamaUrlSetting: document.getElementById('ollamaUrlSetting'),
            lmstudioUrlSetting: document.getElementById('lmstudioUrlSetting'),
            openaiUrlSetting: document.getElementById('openaiUrlSetting'),
            openrouterUrlSetting: document.getElementById('openrouterUrlSetting'),
            apiKeySetting: document.getElementById('apiKeySetting'),
            openrouterKeySetting: document.getElementById('openrouterKeySetting'),
            
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
            
            // Onboarding button
            startOnboardingBtn: document.getElementById('startOnboardingBtn'),
            
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
        
        // Onboarding button
        this.elements.startOnboardingBtn?.addEventListener('click', () => {
            this.closeModal();
            
            // Add message to conversation UI
            this.addMessage('user', 'start onboarding', true);
            
            // Send to server
            this.send({
                type: 'text_message',
                text: 'start onboarding',
                attachments: []
            });
        });
        
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
            this.fetchModels(e.target.value);
        });
        
        // Refresh models button
        this.elements.refreshModelsBtn?.addEventListener('click', () => {
            const backend = this.elements.backendSelect?.value || 'ollama';
            this.fetchModels(backend);
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
        if (this.elements.unloadOtherLLMs) {
            this.elements.unloadOtherLLMs.checked = settings.unloadOtherLLMs;
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
        if (this.elements.openrouterUrl) {
            this.elements.openrouterUrl.value = settings.openrouterUrl || 'https://openrouter.ai/api/v1';
        }
        if (this.elements.openrouterApiKeyInput) {
            this.elements.openrouterApiKeyInput.value = settings.openrouterApiKey || '';
        }
        this.updateBackendVisibility(settings.llmBackend || 'ollama');
        
        // Fetch available models for the current backend
        // Store the current model to restore after fetch
        this._pendingModel = settings.model;
        this.fetchModels(settings.llmBackend || 'ollama');
        
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
        this.elements.openrouterUrlSetting?.classList.add('hidden');
        this.elements.apiKeySetting?.classList.add('hidden');
        this.elements.openrouterKeySetting?.classList.add('hidden');
        
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
            case 'openrouter':
                this.elements.openrouterUrlSetting?.classList.remove('hidden');
                this.elements.openrouterKeySetting?.classList.remove('hidden');
                break;
        }
    }
    
    async fetchModels(backend = 'ollama') {
        // Get the URL for the current backend
        let url = '';
        let apiKey = '';
        
        switch (backend) {
            case 'ollama':
                url = this.elements.ollamaUrl?.value || 'http://localhost:11434';
                break;
            case 'lmstudio':
                url = this.elements.lmstudioUrl?.value || 'http://localhost:1234';
                break;
            case 'openai':
                url = this.elements.openaiUrl?.value || 'https://api.openai.com';
                apiKey = this.elements.apiKeyInput?.value || '';
                break;
            case 'openrouter':
                url = this.elements.openrouterUrl?.value || 'https://openrouter.ai/api/v1';
                apiKey = this.elements.openrouterApiKeyInput?.value || '';
                break;
        }
        
        // Show loading state
        const refreshBtn = this.elements.refreshModelsBtn;
        const modelSelect = this.elements.modelSelect;
        const currentModel = this._pendingModel || modelSelect?.value || getAllSettings().model;
        this._pendingModel = null;  // Clear pending model
        
        if (refreshBtn) {
            refreshBtn.classList.add('loading');
            refreshBtn.disabled = true;
        }
        
        if (modelSelect) {
            modelSelect.innerHTML = '<option value="">Loading...</option>';
            modelSelect.disabled = true;
        }
        
        try {
            // Build URL with query params
            const params = new URLSearchParams({ backend, url });
            if (apiKey) {
                params.append('api_key', apiKey);
            }
            
            const response = await fetch(`/api/models?${params.toString()}`);
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            const models = data.models || [];
            
            if (modelSelect) {
                modelSelect.innerHTML = '';
                
                if (models.length === 0) {
                    const option = document.createElement('option');
                    option.value = '';
                    option.textContent = 'No models found';
                    modelSelect.appendChild(option);
                } else {
                    models.forEach(model => {
                        const option = document.createElement('option');
                        option.value = model.name;
                        
                        // Format display name
                        let displayName = model.name;
                        if (model.size) {
                            const sizeGB = (model.size / (1024 * 1024 * 1024)).toFixed(1);
                            displayName += ` (${sizeGB}GB)`;
                        }
                        option.textContent = displayName;
                        modelSelect.appendChild(option);
                    });
                    
                    // Try to restore the previous selection
                    if (currentModel && models.some(m => m.name === currentModel)) {
                        modelSelect.value = currentModel;
                    } else if (models.length > 0) {
                        // Default to first model
                        modelSelect.value = models[0].name;
                    }
                }
                
                modelSelect.disabled = false;
            }
            
            console.log(`Loaded ${models.length} models for ${backend}`);
            
        } catch (error) {
            console.error('Failed to fetch models:', error);
            
            if (modelSelect) {
                modelSelect.innerHTML = '';
                const option = document.createElement('option');
                option.value = currentModel || 'llama3.2';
                option.textContent = currentModel || 'llama3.2';
                modelSelect.appendChild(option);
                modelSelect.disabled = false;
            }
            
            showError(`Could not load models: ${error.message}`);
        } finally {
            if (refreshBtn) {
                refreshBtn.classList.remove('loading');
                refreshBtn.disabled = false;
            }
        }
    }
    
    handleSaveSettings() {
        const newSettings = {
            voice: this.elements.voiceSelect?.value,
            model: this.elements.modelSelect?.value,
            autoListen: this.elements.autoListen?.checked,
            showTimestamps: this.elements.showTimestamps?.checked,
            unloadOtherLLMs: this.elements.unloadOtherLLMs?.checked,
            volume: parseInt(this.elements.volumeSlider?.value || 80),
            voiceSpeed: parseInt(this.elements.voiceSpeedSlider?.value || 100),
            // Backend settings
            llmBackend: this.elements.backendSelect?.value || 'ollama',
            ollamaUrl: (this.elements.ollamaUrl?.value || 'http://localhost:11434').trim(),
            lmstudioUrl: (this.elements.lmstudioUrl?.value || 'http://localhost:1234').trim(),
            openaiUrl: (this.elements.openaiUrl?.value || 'https://api.openai.com').trim(),
            openaiApiKey: (this.elements.apiKeyInput?.value || '').trim(),
            openrouterUrl: (this.elements.openrouterUrl?.value || 'https://openrouter.ai/api/v1').trim(),
            openrouterApiKey: (this.elements.openrouterApiKeyInput?.value || '').trim(),
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
                openrouterUrl: newSettings.openrouterUrl,
                openrouterApiKey: newSettings.openrouterApiKey,
                unloadOtherLLMs: newSettings.unloadOtherLLMs,
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
            this.ws.binaryType = 'arraybuffer';  // Ensure binary data is sent/received as ArrayBuffer
            
            this.ws.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
                this.updateStatus('connected', 'Ready');
                
                // Reset audio state on connect/reconnect to prevent stale isPlaying flag
                console.log('[Felix] WebSocket connected, resetting audio state. isPlaying was:', this.audioHandler.isPlaying);
                this.audioHandler.stopPlayback();
                console.log('[Felix] After stopPlayback, isPlaying is:', this.audioHandler.isPlaying);
                
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
                    openrouterUrl: settings.openrouterUrl,
                    openrouterApiKey: settings.openrouterApiKey,
                    unloadOtherLLMs: settings.unloadOtherLLMs,
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
                    // Start safety timeout in case playback doesn't complete normally
                    this.startPlaybackTimeout(30000);
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
        console.log('[Felix] Orb clicked! isListening:', this.isListening);
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }
    
    async startListening() {
        console.log('[Felix] startListening called, isConnected:', this.isConnected);
        if (!this.isConnected) {
            showError('Not connected to server');
            return;
        }
        
        try {
            console.log('[Felix] Starting audio recording...');
            await this.audioHandler.startRecording();
            this.isListening = true;
            
            this.elements.orb?.classList.add('active');
            console.log('[Felix] Sending start_listening to server');
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
        
        // Debug: log every audio send
        console.log('[Felix] sendAudio called:', 
            'dataSize=' + pcmData.length,
            'isListening=' + this.isListening, 
            'isConnected=' + this.isConnected,
            'wsState=' + (this.ws ? this.ws.readyState : 'null')
        );
        
        // Check connection
        if (!this.isConnected) {
            console.log('[Felix] Not connected, skipping audio');
            return;
        }
        
        // During TTS playback, always send audio for barge-in detection
        // Even if not "listening", the server needs audio to detect speech
        if (!this.isListening && !isPlaying) {
            console.log('[Felix] Not listening and not playing, skipping audio');
            return;
        }
        
        const isTTSPlaying = isPlaying ? 1 : 0;
        const packet = new Uint8Array(1 + pcmData.buffer.byteLength);
        packet[0] = isTTSPlaying;
        packet.set(new Uint8Array(pcmData.buffer), 1);
        
        console.log('[Felix] Sending audio packet, size=' + packet.length);
        this.ws.send(packet.buffer);
    }
    
    send(data) {
        if (!this.isConnected || !this.ws) return;
        this.ws.send(JSON.stringify(data));
    }
    
    handlePlaybackEnd() {
        // Always send playback_done when playback ends, regardless of current state
        // This prevents the server from getting stuck in SPEAKING state
        console.log('[playback] Audio playback ended, state:', this.currentState);
        this.send({ type: 'playback_done' });
        
        // Clear any pending playback timeout
        if (this._playbackTimeout) {
            clearTimeout(this._playbackTimeout);
            this._playbackTimeout = null;
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
    
    // Safety timeout - if playback doesn't end naturally, force send playback_done
    startPlaybackTimeout(durationMs = 30000) {
        if (this._playbackTimeout) {
            clearTimeout(this._playbackTimeout);
        }
        this._playbackTimeout = setTimeout(() => {
            console.warn('[playback] Safety timeout reached, sending playback_done');
            this.send({ type: 'playback_done' });
            this._playbackTimeout = null;
        }, durationMs);
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
    
    addMessage(role, text, isFinal = true, options = {}) {
        const { skipHistory = false } = options;
        const conversation = this.elements.conversation;
        if (!conversation) return;
        
        let messageEl = conversation.querySelector(`.message.${role}.interim`);
        
        if (messageEl && isFinal) {
            messageEl.classList.remove('interim');
            messageEl.querySelector('p').textContent = text;
            // Add action buttons for assistant and user messages
            if (!messageEl.querySelector('.message-actions')) {
                if (role === 'assistant') {
                    this.addMessageActions(messageEl, text, 'assistant');
                } else if (role === 'user') {
                    this.addMessageActions(messageEl, text, 'user');
                }
            }
            // Add to history when finalized
            if (!skipHistory && role !== 'system') {
                this.addToHistory(role, text);
            }
        } else if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = `message ${role}${isFinal ? '' : ' interim'}`;
            messageEl.innerHTML = `<p>${escapeHtml(text)}</p>`;
            conversation.appendChild(messageEl);
            // Add action buttons for assistant and user messages if final
            if (isFinal) {
                if (role === 'assistant') {
                    this.addMessageActions(messageEl, text, 'assistant');
                } else if (role === 'user') {
                    this.addMessageActions(messageEl, text, 'user');
                }
            }
            // Add to history if final and not system
            if (isFinal && !skipHistory && role !== 'system') {
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
            // Add action buttons
            this.addMessageActions(messageEl, cleanedText, 'assistant');
        } else {
            messageEl = document.createElement('div');
            messageEl.className = 'message assistant';
            messageEl.innerHTML = `<p>${escapeHtml(cleanedText)}</p>`;
            conversation.appendChild(messageEl);
            // Add action buttons
            this.addMessageActions(messageEl, cleanedText, 'assistant');
        }
        
        // Add to history
        if (cleanedText) {
            this.addToHistory('assistant', cleanedText);
        }
        
        conversation.scrollTop = conversation.scrollHeight;
    }
    
    addMessageActions(messageEl, text, role = 'assistant') {
        // Don't add if already has actions
        if (messageEl.querySelector('.message-actions')) return;
        
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        if (role === 'assistant') {
            // Assistant message actions: copy, speak, regenerate, save
            actionsDiv.innerHTML = `
                <button class="action-btn" data-action="copy" title="Copy to clipboard">
                    <svg viewBox="0 0 24 24">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                </button>
                <button class="action-btn" data-action="speak" title="Read aloud">
                    <svg viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                    </svg>
                </button>
                <button class="action-btn" data-action="regenerate" title="Regenerate response">
                    <svg viewBox="0 0 24 24">
                        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                    </svg>
                </button>
                <button class="action-btn" data-action="save" title="Save to memory">
                    <svg viewBox="0 0 24 24">
                        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                    </svg>
                </button>
            `;
        } else if (role === 'user') {
            // User message actions: copy, edit
            actionsDiv.innerHTML = `
                <button class="action-btn" data-action="copy" title="Copy to clipboard">
                    <svg viewBox="0 0 24 24">
                        <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                    </svg>
                </button>
                <button class="action-btn" data-action="edit" title="Edit and resubmit">
                    <svg viewBox="0 0 24 24">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                </button>
            `;
        }
        
        messageEl.appendChild(actionsDiv);
        
        // Add click handlers
        actionsDiv.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                this.handleMessageAction(action, text, messageEl, role);
            });
        });
    }
    
    async handleMessageAction(action, text, messageEl, role = 'assistant') {
        switch(action) {
            case 'copy':
                try {
                    // Clean the text by removing markdown and extra whitespace
                    const cleanText = text
                        .replace(/\*\*/g, '')  // Remove bold markers
                        .replace(/\*/g, '')    // Remove italic markers
                        .replace(/`([^`]+)`/g, '$1')  // Remove inline code markers
                        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Remove links, keep text
                        .trim();
                    
                    await navigator.clipboard.writeText(cleanText);
                    showSuccess('Copied to clipboard!', { duration: 1500 });
                } catch (err) {
                    console.error('Copy failed:', err);
                    showError('Failed to copy to clipboard');
                }
                break;
                
            case 'speak':
                try {
                    // Use test audio to read the message
                    this.send({ type: 'test_audio', text: text });
                    showInfo('Reading message...', { duration: 1500 });
                } catch (err) {
                    console.error('Speak failed:', err);
                    showError('Failed to read message');
                }
                break;
                
            case 'regenerate':
                try {
                    // Find the user message that prompted this response
                    const messages = this.elements.conversation.querySelectorAll('.message');
                    let userMessageText = null;
                    
                    // Find the user message before this assistant message
                    for (let i = 0; i < messages.length; i++) {
                        if (messages[i] === messageEl) {
                            // Look backwards for the last user message
                            for (let j = i - 1; j >= 0; j--) {
                                if (messages[j].classList.contains('user')) {
                                    userMessageText = messages[j].querySelector('p')?.textContent;
                                    break;
                                }
                            }
                            break;
                        }
                    }
                    
                    if (userMessageText) {
                        // Remove the current assistant response
                        messageEl.remove();
                        
                        // Resend the user message
                        this.send({
                            type: 'text_message',
                            text: userMessageText,
                            attachments: []
                        });
                        showInfo('Regenerating response...', { duration: 2000 });
                    } else {
                        showError('Could not find original message');
                    }
                } catch (err) {
                    console.error('Regenerate failed:', err);
                    showError('Failed to regenerate response');
                }
                break;
                
            case 'save':
                try {
                    // Save to memory using the remember tool
                    this.send({
                        type: 'text_message',
                        text: `remember this important information: ${text}`,
                        attachments: []
                    });
                    showSuccess('Saving to memory...', { duration: 2000 });
                } catch (err) {
                    console.error('Save failed:', err);
                    showError('Failed to save to memory');
                }
                break;
                
            case 'edit':
                try {
                    // Make the message editable inline
                    const messageContent = messageEl.querySelector('p');
                    const actionsDiv = messageEl.querySelector('.message-actions');
                    const originalText = messageContent.textContent;
                    
                    // Hide actions during edit
                    actionsDiv.style.display = 'none';
                    
                    // Create editable textarea
                    const textarea = document.createElement('textarea');
                    textarea.className = 'message-edit-input';
                    textarea.value = originalText;
                    textarea.style.cssText = `
                        width: 100%;
                        min-height: 60px;
                        padding: 0.5rem;
                        border: 2px solid var(--accent-primary);
                        border-radius: 8px;
                        background: var(--bg-glass);
                        color: var(--text-primary);
                        font-family: inherit;
                        font-size: inherit;
                        resize: vertical;
                        outline: none;
                    `;
                    
                    // Create button container
                    const btnContainer = document.createElement('div');
                    btnContainer.style.cssText = `
                        display: flex;
                        gap: 0.5rem;
                        margin-top: 0.5rem;
                        justify-content: flex-end;
                    `;
                    
                    // Create Save and Cancel buttons
                    const saveBtn = document.createElement('button');
                    saveBtn.textContent = 'Save & Resubmit';
                    saveBtn.className = 'input-btn send-btn';
                    saveBtn.style.cssText = `
                        padding: 0.5rem 1rem;
                        border-radius: 8px;
                        width: auto;
                        height: auto;
                    `;
                    
                    const cancelBtn = document.createElement('button');
                    cancelBtn.textContent = 'Cancel';
                    cancelBtn.className = 'input-btn';
                    cancelBtn.style.cssText = `
                        padding: 0.5rem 1rem;
                        border-radius: 8px;
                        width: auto;
                        height: auto;
                    `;
                    
                    btnContainer.appendChild(cancelBtn);
                    btnContainer.appendChild(saveBtn);
                    
                    // Replace message content with editor
                    messageContent.style.display = 'none';
                    messageEl.insertBefore(textarea, actionsDiv);
                    messageEl.insertBefore(btnContainer, actionsDiv);
                    
                    // Focus textarea
                    textarea.focus();
                    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
                    
                    // Cancel handler
                    cancelBtn.onclick = () => {
                        textarea.remove();
                        btnContainer.remove();
                        messageContent.style.display = '';
                        actionsDiv.style.display = '';
                    };
                    
                    // Save handler
                    saveBtn.onclick = () => {
                        const newText = textarea.value.trim();
                        if (!newText) {
                            showError('Message cannot be empty');
                            return;
                        }
                        
                        // Find and remove all messages after this one (user message + assistant responses)
                        const messages = this.elements.conversation.querySelectorAll('.message');
                        let foundCurrent = false;
                        const toRemove = [];
                        
                        for (let i = 0; i < messages.length; i++) {
                            if (messages[i] === messageEl) {
                                foundCurrent = true;
                                continue;
                            }
                            if (foundCurrent) {
                                toRemove.push(messages[i]);
                            }
                        }
                        
                        // Remove subsequent messages
                        toRemove.forEach(msg => msg.remove());
                        
                        // Update the current message with new text
                        messageContent.textContent = newText;
                        textarea.remove();
                        btnContainer.remove();
                        messageContent.style.display = '';
                        actionsDiv.style.display = '';
                        
                        // Resend the edited message
                        this.send({
                            type: 'text_message',
                            text: newText,
                            attachments: []
                        });
                        
                        showInfo('Message updated and resubmitted', { duration: 2000 });
                    };
                    
                    // Allow Enter to save (Shift+Enter for new line)
                    textarea.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            saveBtn.click();
                        }
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelBtn.click();
                        }
                    });
                    
                } catch (err) {
                    console.error('Edit failed:', err);
                    showError('Failed to edit message');
                }
                break;
                
            case 'resubmit':
                try {
                    // Resend the user message as-is
                    this.send({
                        type: 'text_message',
                        text: text,
                        attachments: []
                    });
                    showInfo('Resubmitting message...', { duration: 1500 });
                } catch (err) {
                    console.error('Resubmit failed:', err);
                    showError('Failed to resubmit message');
                }
                break;
        }
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
    
    loadConversationHistory() {
        try {
            const stored = localStorage.getItem(CONVERSATION_STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (err) {
            console.warn('Failed to load conversation history from localStorage', err);
            return [];
        }
    }

    saveConversationHistory() {
        try {
            localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(this.conversationHistory));
        } catch (err) {
            console.warn('Failed to save conversation history to localStorage', err);
        }
    }

    restoreConversationFromHistory() {
        if (!this.elements.conversation || this.conversationHistory.length === 0) return;
        this.elements.conversation.innerHTML = '';
        this.conversationHistory.forEach(entry => {
            this.addMessage(entry.role, entry.text, true, { skipHistory: true });
        });
    }

    addToHistory(role, text) {
        this.conversationHistory.push({
            role,
            text,
            timestamp: new Date().toISOString()
        });
        this.saveConversationHistory();
        
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
        this.saveConversationHistory();
        this.renderHistoryPanel();
        showInfo('History cleared');
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Felix] DOM loaded, initializing app...');
    window.app = new VoiceAgentApp();
    console.log('[Felix] App instance created:', window.app);
});
