/**
 * Voice Agent - Utility Functions
 * Shared helpers used across modules
 */

/**
 * Debounce function calls
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in ms
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Throttle function calls
 * @param {Function} fn - Function to throttle
 * @param {number} limit - Minimum time between calls in ms
 * @returns {Function} Throttled function
 */
export function throttle(fn, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Generate a unique ID
 * @param {string} prefix - Optional prefix
 * @returns {string} Unique ID
 */
export function generateId(prefix = 'id') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format timestamp for display
 * @param {Date|number} date - Date object or timestamp
 * @returns {string} Formatted time string
 */
export function formatTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format duration in seconds to readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration
 */
export function formatDuration(seconds) {
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Raw text
 * @returns {string} Escaped HTML
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Convert base64 string to ArrayBuffer
 * @param {string} base64 - Base64 encoded string
 * @returns {ArrayBuffer} Decoded buffer
 */
export function base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Convert ArrayBuffer to base64 string
 * @param {ArrayBuffer} buffer - Buffer to encode
 * @returns {string} Base64 encoded string
 */
export function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Sleep for specified duration
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise} Resolves after duration
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Clamp a number between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Check if reduced motion is preferred
 * @returns {boolean} True if reduced motion preferred
 */
export function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Check if on mobile device
 * @returns {boolean} True if mobile
 */
export function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Clean tool call JSON patterns from response text
 * Removes JSON tool calls that models sometimes output as text
 * @param {string} text - Response text that may contain tool call JSON
 * @returns {string} Cleaned text
 */
export function cleanToolCallText(text) {
    if (!text) return text;
    
    let cleaned = text;
    
    // Pattern 1: Full tool call arrays [{"name": "...", ...}]
    cleaned = cleaned.replace(
        /\[\s*\{[^[\]]*"name"\s*:[^[\]]*\}\s*\]/gs,
        ''
    );
    
    // Pattern 2: Individual tool call objects {"name": "...", "parameters": {...}}
    cleaned = cleaned.replace(
        /\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"(?:parameters|arguments)"\s*:\s*\{[^{}]*\}\s*\}/g,
        ''
    );
    
    // Pattern 3: Partial JSON fragments like ", "parameters": {}]" or similar
    cleaned = cleaned.replace(
        /[,\s]*"(?:parameters|arguments)"\s*:\s*\{[^{}]*\}[\s\]},]*/g,
        ''
    );
    
    // Pattern 4: Leading/trailing JSON array brackets with commas
    cleaned = cleaned.replace(/^\s*\[\s*,?\s*/g, '');
    cleaned = cleaned.replace(/\s*,?\s*\]\s*$/g, '');
    
    // Pattern 5: ```json ... ``` code blocks containing tool calls
    cleaned = cleaned.replace(
        /```(?:json)?\s*\[?\s*\{[^`]*"name"\s*:[^`]*\}[^`]*\]?\s*```/gs,
        ''
    );
    
    // Pattern 6: Tool call syntax like [TOOL_CALL: name(args)]
    cleaned = cleaned.replace(
        /\[TOOL_CALL:\s*\w+\([^\]]*\)\]/g,
        ''
    );
    
    // Pattern 7: Leftover JSON fragments - quoted strings with colons
    cleaned = cleaned.replace(
        /"\s*,\s*"[^"]+"\s*:\s*(?:\{[^{}]*\}|"[^"]*"|\d+|true|false|null)\s*[}\]]/g,
        ''
    );
    
    // Pattern 8: Remove any remaining isolated JSON-like fragments
    cleaned = cleaned.replace(/^\s*[{[\]},:"]+\s*$/gm, '');
    
    // Clean up extra whitespace and newlines left behind
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    cleaned = cleaned.replace(/^\s+|\s+$/g, '');
    
    return cleaned;
}
