/**
 * Voice Agent - Settings Management
 * Handles user preferences and persistence
 */

// Default settings
const DEFAULT_SETTINGS = {
    // Appearance
    theme: 'midnight',
    reducedMotion: false,
    
    // Audio
    volume: 80,
    voiceSpeed: 100,  // 100 = 1.0x, 50 = 0.5x, 200 = 2.0x
    
    // Voice
    voice: 'amy',
    model: 'llama3.2',
    
    // Backend
    llmBackend: 'ollama',  // ollama, lmstudio, openai, openrouter
    ollamaUrl: 'http://localhost:11434',
    lmstudioUrl: 'http://localhost:1234',
    openaiUrl: 'https://api.openai.com',
    openrouterUrl: 'https://openrouter.ai/api/v1',
    openaiApiKey: '',
    
    // Behavior
    autoListen: true,
    showTimestamps: false,
    pushToTalkKey: 'Space',
};

// Valid options for validation
const VALID_OPTIONS = {
    theme: ['midnight', 'redroom', 'pink', 'babyblue', 'teal', 'emerald', 'sunset', 'cyberpunk', 'ocean', 'rose'],
    voice: ['amy', 'lessac', 'ryan'],
    llmBackend: ['ollama', 'lmstudio', 'openai', 'openrouter'],
};

const STORAGE_KEY = 'voiceAgentSettings';

// Current settings (in memory)
let currentSettings = { ...DEFAULT_SETTINGS };

/**
 * Load settings from localStorage
 * @returns {object} Loaded settings
 */
export function loadSettings() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with defaults and validate
            currentSettings = validateSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
        currentSettings = { ...DEFAULT_SETTINGS };
    }
    return currentSettings;
}

/**
 * Save all settings to localStorage
 * @param {object} settings - Settings object to save
 */
export function saveSettings(settings) {
    currentSettings = validateSettings({ ...currentSettings, ...settings });
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
    return currentSettings;
}

/**
 * Get a single setting value
 * @param {string} key - Setting key
 * @returns {any} Setting value
 */
export function getSetting(key) {
    return currentSettings[key] ?? DEFAULT_SETTINGS[key];
}

/**
 * Set a single setting value
 * @param {string} key - Setting key
 * @param {any} value - Setting value
 */
export function setSetting(key, value) {
    currentSettings[key] = value;
    saveSettings(currentSettings);
    return currentSettings[key];
}

/**
 * Get all current settings
 * @returns {object} All settings
 */
export function getAllSettings() {
    return { ...currentSettings };
}

/**
 * Reset settings to defaults
 */
export function resetSettings() {
    currentSettings = { ...DEFAULT_SETTINGS };
    saveSettings(currentSettings);
    return currentSettings;
}

/**
 * Validate settings object
 * @param {object} settings - Settings to validate
 * @returns {object} Validated settings
 */
function validateSettings(settings) {
    const validated = { ...settings };
    
    // Validate theme
    if (!VALID_OPTIONS.theme.includes(validated.theme)) {
        validated.theme = DEFAULT_SETTINGS.theme;
    }
    
    // Validate voice
    if (!VALID_OPTIONS.voice.includes(validated.voice)) {
        validated.voice = DEFAULT_SETTINGS.voice;
    }
    
    // Validate LLM backend
    if (!VALID_OPTIONS.llmBackend.includes(validated.llmBackend)) {
        validated.llmBackend = DEFAULT_SETTINGS.llmBackend;
    }
    
    // Validate URLs (basic check)
    if (typeof validated.ollamaUrl !== 'string' || !validated.ollamaUrl.startsWith('http')) {
        validated.ollamaUrl = DEFAULT_SETTINGS.ollamaUrl;
    }
    if (typeof validated.lmstudioUrl !== 'string' || !validated.lmstudioUrl.startsWith('http')) {
        validated.lmstudioUrl = DEFAULT_SETTINGS.lmstudioUrl;
    }
    if (typeof validated.openaiUrl !== 'string' || !validated.openaiUrl.startsWith('http')) {
        validated.openaiUrl = DEFAULT_SETTINGS.openaiUrl;
    }
    
    // Clamp numeric values
    validated.volume = Math.min(100, Math.max(0, Number(validated.volume) || DEFAULT_SETTINGS.volume));
    validated.voiceSpeed = Math.min(200, Math.max(50, Number(validated.voiceSpeed) || DEFAULT_SETTINGS.voiceSpeed));
    
    // Ensure booleans
    validated.autoListen = Boolean(validated.autoListen);
    validated.showTimestamps = Boolean(validated.showTimestamps);
    validated.reducedMotion = Boolean(validated.reducedMotion);
    
    return validated;
}

/**
 * Get volume as a 0-1 float for audio API
 * @returns {number} Volume 0-1
 */
export function getVolumeFloat() {
    return currentSettings.volume / 100;
}

/**
 * Get voice speed as a multiplier (0.5 to 2.0)
 * @returns {number} Speed multiplier
 */
export function getVoiceSpeedMultiplier() {
    return currentSettings.voiceSpeed / 100;
}

/**
 * Export valid themes for use by theme module
 */
export const THEMES = VALID_OPTIONS.theme;

/**
 * Export valid voices
 */
export const VOICES = VALID_OPTIONS.voice;

/**
 * Export valid LLM backends
 */
export const LLM_BACKENDS = VALID_OPTIONS.llmBackend;

/**
 * Get the active API URL based on current backend setting
 * @returns {string} The active API URL
 */
export function getActiveApiUrl() {
    const backend = currentSettings.llmBackend;
    switch (backend) {
        case 'lmstudio':
            return currentSettings.lmstudioUrl;
        case 'openai':
            return currentSettings.openaiUrl;
        case 'ollama':
        default:
            return currentSettings.ollamaUrl;
    }
}
