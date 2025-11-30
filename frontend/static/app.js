/**
 * Voice Agent - Main Application v2.0
 * Modern UI with flyout panels
 */

class VoiceAgentApp {
    constructor() {
        // WebSocket
        this.ws = null;
        this.wsUrl = `ws://${window.location.host}/ws`;
        
        // Audio handler
        this.audioHandler = new AudioHandler();
        
        // State
        this.isConnected = false;
        this.isListening = false;
        this.currentState = 'idle';
        
        // Settings
        this.settings = {
            voice: 'amy',
            model: 'mistral:7b-instruct-q4_0',
            autoListen: true,
            theme: 'midnight',
        };
        
        // DOM elements
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
            flyoutBrowser: document.getElementById('flyoutBrowser'),
            flyoutUrl: document.getElementById('flyoutUrl'),
            flyoutUrlBar: document.getElementById('flyoutUrlBar'),
            
            // Settings modal
            settingsModal: document.getElementById('settingsModal'),
            closeSettings: document.getElementById('closeSettings'),
            saveSettings: document.getElementById('saveSettings'),
            voiceSelect: document.getElementById('voiceSelect'),
            modelSelect: document.getElementById('modelSelect'),
            autoListen: document.getElementById('autoListen'),
        };
        
        // Waveform canvas
        this.canvasCtx = this.elements.waveformCanvas.getContext('2d');
        
        // Flyout state
        this.currentFlyout = null;
        
        // Bind methods
        this.handleOrbClick = this.handleOrbClick.bind(this);
        this.handleWsMessage = this.handleWsMessage.bind(this);
        this.drawWaveform = this.drawWaveform.bind(this);
        
        // Initialize
        this.loadSettings();
        this.setupEventListeners();
        this.connect();
    }
    
    setupEventListeners() {
        // Orb click
        this.elements.orb.addEventListener('click', this.handleOrbClick);
        
        // Clear button
        this.elements.clearBtn.addEventListener('click', () => this.clearConversation());
        
        // Settings
        this.elements.settingsBtn.addEventListener('click', () => this.openModal());
        this.elements.closeSettings.addEventListener('click', () => this.closeModal());
        this.elements.saveSettings.addEventListener('click', () => {
            this.saveSettings();
            this.closeModal();
        });
        
        // Theme swatches
        document.querySelectorAll('.theme-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => {
                const theme = swatch.dataset.theme;
                this.applyTheme(theme);
                this.updateThemeSwatches();
            });
        });
        
        // Close modal on backdrop click
        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.closeModal();
            }
        });
        
        // Flyout tabs
        document.querySelectorAll('.flyout-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const flyoutType = tab.dataset.flyout;
                this.toggleFlyout(flyoutType);
            });
        });
        
        // Flyout close
        this.elements.flyoutClose.addEventListener('click', () => this.closeFlyout());
        
        // URL bar enter key
        this.elements.flyoutUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.loadUrl(this.elements.flyoutUrl.value);
            }
        });
        
        // Audio callbacks
        this.audioHandler.onAudioData = (pcmData) => {
            this.sendAudio(pcmData);
        };
        
        this.audioHandler.onVisualizationData = (data) => {
            this.drawWaveform(data);
        };
        
        this.audioHandler.onPlaybackEnd = () => {
            if (this.currentState === 'speaking') {
                this.send({ type: 'playback_done' });
            }
            
            if (this.settings.autoListen && this.currentState === 'speaking') {
                setTimeout(() => {
                    if (!this.isListening) {
                        this.startListening();
                    }
                }, 500);
            }
        };
        
        // Keyboard shortcut (spacebar)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.handleOrbClick();
            }
            // Escape to close flyout
            if (e.code === 'Escape') {
                if (this.currentFlyout) {
                    this.closeFlyout();
                } else if (this.elements.settingsModal.classList.contains('visible')) {
                    this.closeModal();
                }
            }
        });
    }
    
    // ========================================
    // Flyout Panel System
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
        
        // Update UI
        this.elements.flyoutContainer.classList.add('open');
        this.elements.mainContent.classList.add('flyout-open');
        
        // Update active tab
        document.querySelectorAll('.flyout-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.flyout === type);
        });
        
        // Configure flyout based on type
        const configs = {
            browser: {
                title: 'Browser',
                icon: 'browser',
                showUrlBar: true,
            },
            knowledge: {
                title: 'Knowledge Base',
                icon: 'knowledge',
                showUrlBar: false,
            },
            code: {
                title: 'Code Editor',
                icon: 'code',
                showUrlBar: false,
            },
            terminal: {
                title: 'Terminal',
                icon: 'terminal',
                showUrlBar: false,
            },
            preview: {
                title: 'Preview',
                icon: 'preview',
                showUrlBar: true,
            },
        };
        
        const config = configs[type];
        this.elements.flyoutTitle.textContent = config.title;
        this.elements.flyoutIcon.className = `flyout-title-icon ${config.icon}`;
        this.elements.flyoutUrlBar.style.display = config.showUrlBar ? 'flex' : 'none';
        
        // Set content based on type
        this.setFlyoutContent(type);
    }
    
    closeFlyout() {
        this.currentFlyout = null;
        this.elements.flyoutContainer.classList.remove('open');
        this.elements.mainContent.classList.remove('flyout-open');
        
        document.querySelectorAll('.flyout-tab').forEach(tab => {
            tab.classList.remove('active');
        });
    }
    
    setFlyoutContent(type) {
        const content = this.elements.flyoutContent;
        
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
                        <div><span class="line-number">3</span></div>
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
    
    // Public method to show content in flyout (called from server)
    showInFlyout(type, content) {
        this.openFlyout(type);
        
        setTimeout(() => {
            switch (type) {
                case 'browser':
                case 'preview':
                    this.elements.flyoutUrl.value = content;
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
                        termEl.innerHTML += `<div><span class="prompt">$</span> <span class="output">${this.escapeHtml(content)}</span></div>`;
                        termEl.scrollTop = termEl.scrollHeight;
                    }
                    break;
            }
        }, 100);
    }
    
    formatCode(code) {
        const lines = code.split('\n');
        return lines.map((line, i) => 
            `<div><span class="line-number">${i + 1}</span>${this.escapeHtml(line)}</div>`
        ).join('');
    }
    
    // ========================================
    // Settings
    // ========================================
    
    loadSettings() {
        const validVoices = ['amy', 'lessac', 'ryan'];
        const validThemes = ['midnight', 'redroom', 'pink', 'babyblue', 'teal', 'emerald', 'sunset', 'cyberpunk', 'ocean', 'rose'];
        
        try {
            const saved = localStorage.getItem('voiceAgentSettings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.voice && !validVoices.includes(parsed.voice)) {
                    parsed.voice = 'amy';
                }
                if (parsed.theme && !validThemes.includes(parsed.theme)) {
                    parsed.theme = 'midnight';
                }
                this.settings = { ...this.settings, ...parsed };
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
        
        if (!validVoices.includes(this.settings.voice)) {
            this.settings.voice = 'amy';
        }
        if (!validThemes.includes(this.settings.theme)) {
            this.settings.theme = 'midnight';
        }
        
        // Update UI
        this.elements.voiceSelect.value = this.settings.voice;
        this.elements.modelSelect.value = this.settings.model;
        this.elements.autoListen.checked = this.settings.autoListen;
        this.elements.modelName.textContent = this.settings.model.split(':')[0];
        
        // Apply theme
        this.applyTheme(this.settings.theme);
        this.updateThemeSwatches();
        
        localStorage.setItem('voiceAgentSettings', JSON.stringify(this.settings));
    }
    
    saveSettings() {
        this.settings.voice = this.elements.voiceSelect.value;
        this.settings.model = this.elements.modelSelect.value;
        this.settings.autoListen = this.elements.autoListen.checked;
        
        localStorage.setItem('voiceAgentSettings', JSON.stringify(this.settings));
        this.elements.modelName.textContent = this.settings.model.split(':')[0];
        
        if (this.isConnected) {
            this.send({
                type: 'settings',
                voice: this.settings.voice,
                model: this.settings.model,
            });
        }
    }
    
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        this.settings.theme = theme;
        localStorage.setItem('voiceAgentSettings', JSON.stringify(this.settings));
    }
    
    updateThemeSwatches() {
        document.querySelectorAll('.theme-swatch').forEach(swatch => {
            swatch.classList.toggle('active', swatch.dataset.theme === this.settings.theme);
        });
    }
    
    openModal() {
        this.elements.settingsModal.classList.add('visible');
        this.updateThemeSwatches();
    }
    
    closeModal() {
        this.elements.settingsModal.classList.remove('visible');
    }
    
    // ========================================
    // WebSocket & Communication
    // ========================================
    
    connect() {
        this.updateStatus('connecting', 'Connecting...');
        
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.onopen = () => {
            this.isConnected = true;
            this.updateStatus('connected', 'Ready');
            
            this.send({
                type: 'settings',
                voice: this.settings.voice,
                model: this.settings.model,
            });
        };
        
        this.ws.onclose = () => {
            this.isConnected = false;
            this.updateStatus('disconnected', 'Disconnected');
            this.stopListening();
            
            setTimeout(() => this.connect(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('error', 'Connection error');
        };
        
        this.ws.onmessage = this.handleWsMessage;
    }
    
    handleWsMessage(event) {
        try {
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
                    break;
                    
                case 'flyout':
                    this.showInFlyout(message.flyout_type, message.content);
                    break;
                    
                case 'error':
                    this.showError(message.message);
                    break;
                    
                case 'audio':
                    const audioData = this.base64ToArrayBuffer(message.data);
                    this.audioHandler.playAudio(audioData);
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    }
    
    handleStateChange(state) {
        this.currentState = state;
        const orb = this.elements.orb;
        const avatar = document.getElementById('avatar');
        
        // Remove all state classes
        orb.classList.remove('active', 'processing', 'speaking');
        avatar.classList.remove('idle', 'listening', 'thinking', 'speaking', 'happy');
        
        switch (state) {
            case 'idle':
                this.updateStatus('connected', 'Ready');
                avatar.classList.add('idle');
                break;
            case 'listening':
                this.updateStatus('listening', 'Listening...');
                orb.classList.add('active');
                avatar.classList.add('listening');
                break;
            case 'processing':
                this.updateStatus('processing', 'Thinking...');
                orb.classList.add('processing');
                avatar.classList.add('thinking');
                // Keep recording for seamless barge-in transition
                break;
            case 'speaking':
                this.updateStatus('speaking', 'Speaking...');
                orb.classList.add('speaking');
                avatar.classList.add('speaking');
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
                orb.classList.add('active');
                avatar.classList.add('listening');
                break;
        }
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
        if (!this.isConnected) return;
        
        try {
            await this.audioHandler.startRecording();
            this.isListening = true;
            
            this.elements.orb.classList.add('active');
            this.send({ type: 'start_listening' });
            this.startVisualization();
        } catch (error) {
            console.error('Failed to start listening:', error);
            this.showError('Could not access microphone. Make sure you\'re using localhost.');
        }
    }
    
    stopListening() {
        this.audioHandler.stopRecording();
        this.isListening = false;
        
        this.elements.orb.classList.remove('active');
        this.send({ type: 'stop_listening' });
        this.stopVisualization();
    }
    
    sendAudio(pcmData) {
        const isPlaying = this.audioHandler.isPlaying;
        const isRecording = this.audioHandler.isRecording;
        
        // Debug: log barge-in status periodically
        if (isPlaying && Math.random() < 0.1) {
            console.log('Barge-in check:', { isPlaying, isRecording, isListening: this.isListening, isConnected: this.isConnected });
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
        if (!this.isConnected) return;
        this.ws.send(JSON.stringify(data));
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
        const ctx = this.canvasCtx;
        const width = canvas.width;
        const height = canvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = 100;
        
        ctx.clearRect(0, 0, width, height);
        
        // Draw circular waveform
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
        const ctx = this.canvasCtx;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    
    // ========================================
    // Conversation UI
    // ========================================
    
    addMessage(role, text, isFinal = true) {
        const conversation = this.elements.conversation;
        
        let messageEl = conversation.querySelector(`.message.${role}.interim`);
        
        if (messageEl && isFinal) {
            messageEl.classList.remove('interim');
            messageEl.querySelector('p').textContent = text;
        } else if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = `message ${role}${isFinal ? '' : ' interim'}`;
            messageEl.innerHTML = `<p>${this.escapeHtml(text)}</p>`;
            conversation.appendChild(messageEl);
        } else {
            messageEl.querySelector('p').textContent = text;
        }
        
        conversation.scrollTop = conversation.scrollHeight;
    }
    
    updateAssistantMessage(text) {
        const conversation = this.elements.conversation;
        let messageEl = conversation.querySelector('.message.assistant.streaming');
        
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = 'message assistant streaming';
            messageEl.innerHTML = '<p></p>';
            conversation.appendChild(messageEl);
        }
        
        messageEl.querySelector('p').textContent = text;
        conversation.scrollTop = conversation.scrollHeight;
    }
    
    finalizeAssistantMessage(text) {
        const conversation = this.elements.conversation;
        let messageEl = conversation.querySelector('.message.assistant.streaming');
        
        if (messageEl) {
            // Finalize the streaming message
            messageEl.classList.remove('streaming');
            messageEl.querySelector('p').textContent = text;
        } else {
            // No streaming message exists, create final one
            messageEl = document.createElement('div');
            messageEl.className = 'message assistant';
            messageEl.innerHTML = `<p>${this.escapeHtml(text)}</p>`;
            conversation.appendChild(messageEl);
        }
        
        conversation.scrollTop = conversation.scrollHeight;
    }
    
    clearConversation() {
        this.elements.conversation.innerHTML = `
            <div class="message system">
                <p>Conversation cleared. Click the orb to start talking.</p>
            </div>
        `;
        this.send({ type: 'clear_conversation' });
    }
    
    // ========================================
    // UI Helpers
    // ========================================
    
    showToolIndicator(toolName) {
        this.elements.toolName.textContent = toolName;
        this.elements.toolsIndicator.classList.remove('hidden');
    }
    
    hideToolIndicator() {
        this.elements.toolsIndicator.classList.add('hidden');
    }
    
    showError(message) {
        console.error('Error:', message);
        this.addMessage('system', `⚠️ ${message}`, true);
    }
    
    updateStatus(status, text) {
        this.elements.statusDot.className = `status-dot ${status}`;
        this.elements.statusText.textContent = text;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    window.app = new VoiceAgentApp();
});
