/**
 * Voice Agent - Avatar Management
 * Handles avatar states, emotions, and animations
 */

import { prefersReducedMotion } from './utils.js';

// Avatar state constants
export const AVATAR_STATES = {
    IDLE: 'idle',
    LISTENING: 'listening',
    THINKING: 'thinking',
    SPEAKING: 'speaking',
    GROOVING: 'grooving',  // Music playing state
};

// Avatar expression constants
export const AVATAR_EXPRESSIONS = {
    NEUTRAL: 'neutral',
    HAPPY: 'happy',
    CURIOUS: 'curious',
    CONFUSED: 'confused',
    EXCITED: 'excited',
    CALM: 'calm',
};

// Current state
let currentState = AVATAR_STATES.IDLE;
let currentExpression = AVATAR_EXPRESSIONS.NEUTRAL;
let avatarElement = null;
let idleAnimationTimer = null;

/**
 * Initialize avatar system
 * @param {HTMLElement} element - Avatar container element
 */
export function initAvatar(element = null) {
    avatarElement = element || document.getElementById('avatar');
    
    if (!avatarElement) {
        console.warn('Avatar element not found');
        return;
    }
    
    // Set initial state
    setAvatarState(AVATAR_STATES.IDLE);
    
    // Start idle animations if motion is allowed
    if (!prefersReducedMotion()) {
        startIdleAnimations();
    }
    
    // Listen for reduced motion changes
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
        if (e.matches) {
            stopIdleAnimations();
        } else {
            startIdleAnimations();
        }
    });
}

/**
 * Set avatar state (activity state)
 * @param {string} state - One of AVATAR_STATES
 */
export function setAvatarState(state) {
    if (!avatarElement) return;
    
    // Remove all state classes
    Object.values(AVATAR_STATES).forEach(s => {
        avatarElement.classList.remove(s);
    });
    
    // Add new state class
    avatarElement.classList.add(state);
    currentState = state;
    
    // Handle state-specific behavior
    switch (state) {
        case AVATAR_STATES.IDLE:
            startIdleAnimations();
            break;
        case AVATAR_STATES.GROOVING:
            // Keep some idle animations for grooving but with music vibe
            stopIdleAnimations();
            break;
        case AVATAR_STATES.LISTENING:
        case AVATAR_STATES.THINKING:
        case AVATAR_STATES.SPEAKING:
            stopIdleAnimations();
            break;
    }
}

/**
 * Set avatar expression (emotional overlay)
 * @param {string} expression - One of AVATAR_EXPRESSIONS
 */
export function setAvatarExpression(expression) {
    if (!avatarElement) return;
    
    // Remove all expression classes
    Object.values(AVATAR_EXPRESSIONS).forEach(e => {
        avatarElement.classList.remove(`expression-${e}`);
    });
    
    // Add new expression class
    if (expression !== AVATAR_EXPRESSIONS.NEUTRAL) {
        avatarElement.classList.add(`expression-${expression}`);
    }
    currentExpression = expression;
}

/**
 * Get current avatar state
 * @returns {string} Current state
 */
export function getAvatarState() {
    return currentState;
}

/**
 * Get current avatar expression
 * @returns {string} Current expression
 */
export function getAvatarExpression() {
    return currentExpression;
}

/**
 * Start idle animations (random blinking, looking around)
 */
function startIdleAnimations() {
    if (idleAnimationTimer || prefersReducedMotion()) return;
    
    const runIdleAnimation = () => {
        if (currentState !== AVATAR_STATES.IDLE) return;
        
        // Random blink every 3-6 seconds
        const blinkDelay = 3000 + Math.random() * 3000;
        
        idleAnimationTimer = setTimeout(() => {
            if (avatarElement && currentState === AVATAR_STATES.IDLE) {
                triggerBlink();
            }
            runIdleAnimation();
        }, blinkDelay);
    };
    
    runIdleAnimation();
}

/**
 * Stop idle animations
 */
function stopIdleAnimations() {
    if (idleAnimationTimer) {
        clearTimeout(idleAnimationTimer);
        idleAnimationTimer = null;
    }
}

/**
 * Trigger a blink animation
 */
function triggerBlink() {
    if (!avatarElement) return;
    
    avatarElement.classList.add('blinking');
    setTimeout(() => {
        avatarElement.classList.remove('blinking');
    }, 150);
}

/**
 * Trigger a look-around animation
 */
export function triggerLookAround() {
    if (!avatarElement || prefersReducedMotion()) return;
    
    avatarElement.classList.add('looking');
    setTimeout(() => {
        avatarElement.classList.remove('looking');
    }, 1000);
}

/**
 * Set avatar to indicate interrupted state
 */
export function setInterrupted() {
    setAvatarState(AVATAR_STATES.LISTENING);
    // Brief visual feedback for interruption
    if (avatarElement) {
        avatarElement.classList.add('interrupted');
        setTimeout(() => {
            avatarElement.classList.remove('interrupted');
        }, 300);
    }
}

/**
 * Clean up avatar resources
 */
export function destroyAvatar() {
    stopIdleAnimations();
    avatarElement = null;
}
