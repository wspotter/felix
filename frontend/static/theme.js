/**
 * Voice Agent - Theme Management
 * Handles theme switching and persistence
 */

import { getSetting, setSetting, THEMES } from './settings.js';

// Current theme
let currentTheme = 'midnight';

/**
 * Initialize theme system
 * Loads saved theme and applies it
 */
export function initTheme() {
    currentTheme = getSetting('theme') || 'midnight';
    applyTheme(currentTheme);
    updateThemeSwatches();
    
    // Listen for system color scheme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        // Could auto-switch themes here if desired
    });
}

/**
 * Apply a theme to the document
 * @param {string} theme - Theme name
 */
export function applyTheme(theme) {
    // Validate theme
    if (!THEMES.includes(theme)) {
        console.warn(`Invalid theme: ${theme}, using midnight`);
        theme = 'midnight';
    }
    
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    
    // Save to settings
    setSetting('theme', theme);
    
    // Update meta theme-color for mobile browsers
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        const colors = getThemeColors(theme);
        metaTheme.setAttribute('content', colors.primary);
    }
}

/**
 * Get current theme
 * @returns {string} Current theme name
 */
export function getTheme() {
    return currentTheme;
}

/**
 * Cycle to next theme
 * @returns {string} New theme name
 */
export function nextTheme() {
    const currentIndex = THEMES.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % THEMES.length;
    applyTheme(THEMES[nextIndex]);
    updateThemeSwatches();
    return THEMES[nextIndex];
}

/**
 * Cycle to previous theme
 * @returns {string} New theme name
 */
export function prevTheme() {
    const currentIndex = THEMES.indexOf(currentTheme);
    const prevIndex = (currentIndex - 1 + THEMES.length) % THEMES.length;
    applyTheme(THEMES[prevIndex]);
    updateThemeSwatches();
    return THEMES[prevIndex];
}

/**
 * Update theme swatch UI elements
 */
export function updateThemeSwatches() {
    document.querySelectorAll('.theme-swatch').forEach(swatch => {
        swatch.classList.toggle('active', swatch.dataset.theme === currentTheme);
    });
}

/**
 * Get theme colors for a given theme
 * @param {string} theme - Theme name
 * @returns {object} Color values
 */
export function getThemeColors(theme) {
    const colors = {
        midnight: { primary: '#6366f1', secondary: '#8b5cf6' },
        redroom: { primary: '#b91c1c', secondary: '#dc2626' },
        pink: { primary: '#db2777', secondary: '#f472b6' },
        babyblue: { primary: '#60a5fa', secondary: '#93c5fd' },
        teal: { primary: '#0d9488', secondary: '#2dd4bf' },
        emerald: { primary: '#10b981', secondary: '#34d399' },
        sunset: { primary: '#f97316', secondary: '#fb923c' },
        cyberpunk: { primary: '#ec4899', secondary: '#8b5cf6' },
        ocean: { primary: '#0ea5e9', secondary: '#38bdf8' },
        rose: { primary: '#e11d48', secondary: '#fb7185' },
    };
    
    return colors[theme] || colors.midnight;
}

/**
 * Get all available themes
 * @returns {string[]} Array of theme names
 */
export function getAvailableThemes() {
    return [...THEMES];
}
