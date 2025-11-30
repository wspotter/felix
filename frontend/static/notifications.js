/**
 * Voice Agent - Notification System
 * Toast notifications and error handling
 */

import { escapeHtml } from './utils.js';

// Notification container
let container = null;

// Active notifications
const activeNotifications = new Map();

// Auto-dismiss timers
const NOTIFICATION_DURATION = {
    info: 4000,
    success: 3000,
    warning: 5000,
    error: 6000,
};

/**
 * Initialize notification system
 */
export function initNotifications() {
    // Create container if it doesn't exist
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-label', 'Notifications');
        document.body.appendChild(container);
    }
}

/**
 * Show a notification
 * @param {string} message - Notification message
 * @param {string} type - Type: 'info', 'success', 'warning', 'error'
 * @param {object} options - Additional options
 * @returns {string} Notification ID
 */
export function showNotification(message, type = 'info', options = {}) {
    initNotifications();
    
    const id = `notif_${Date.now()}`;
    const duration = options.duration ?? NOTIFICATION_DURATION[type] ?? 4000;
    const dismissable = options.dismissable !== false;
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'alert');
    notification.id = id;
    
    // Icon based on type
    const icons = {
        info: '💬',
        success: '✓',
        warning: '⚠️',
        error: '✕',
    };
    
    notification.innerHTML = `
        <span class="notification-icon">${icons[type] || icons.info}</span>
        <span class="notification-message">${escapeHtml(message)}</span>
        ${dismissable ? '<button class="notification-close" aria-label="Dismiss">×</button>' : ''}
    `;
    
    // Add click to dismiss
    if (dismissable) {
        notification.querySelector('.notification-close').addEventListener('click', () => {
            dismissNotification(id);
        });
    }
    
    // Add to container
    container.appendChild(notification);
    activeNotifications.set(id, notification);
    
    // Trigger entrance animation
    requestAnimationFrame(() => {
        notification.classList.add('notification-visible');
    });
    
    // Auto-dismiss
    if (duration > 0) {
        setTimeout(() => {
            dismissNotification(id);
        }, duration);
    }
    
    return id;
}

/**
 * Dismiss a notification
 * @param {string} id - Notification ID
 */
export function dismissNotification(id) {
    const notification = activeNotifications.get(id);
    if (!notification) return;
    
    notification.classList.remove('notification-visible');
    notification.classList.add('notification-exiting');
    
    setTimeout(() => {
        notification.remove();
        activeNotifications.delete(id);
    }, 300);
}

/**
 * Dismiss all notifications
 */
export function dismissAllNotifications() {
    activeNotifications.forEach((_, id) => {
        dismissNotification(id);
    });
}

/**
 * Show an info notification
 */
export function showInfo(message, options = {}) {
    return showNotification(message, 'info', options);
}

/**
 * Show a success notification
 */
export function showSuccess(message, options = {}) {
    return showNotification(message, 'success', options);
}

/**
 * Show a warning notification
 */
export function showWarning(message, options = {}) {
    return showNotification(message, 'warning', options);
}

/**
 * Show an error notification
 */
export function showError(message, options = {}) {
    return showNotification(message, 'error', options);
}
