/**
 * Voice Agent - Radial Menu Module
 * Inspired by CodePen: https://codepen.io/gzuzkstro/pen/oemMyN
 * Circular navigation with animated bubbles around the orb
 */

// Menu configuration
const CONFIG = {
    radius: 160,          // Distance from center to items
    itemSize: 56,         // Size of menu items
    animDuration: 400,    // Animation duration in ms
    staggerDelay: 50,     // Delay between each item animation
};

// Menu actions configuration
const MENU_ACTIONS = [
    { 
        id: 'music', 
        icon: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
        label: 'Play Music',
        action: () => sendCommand('Play some music')
    },
    { 
        id: 'weather', 
        icon: 'M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z',
        label: 'Weather',
        action: () => sendCommand("What's the weather like?")
    },
    { 
        id: 'search', 
        icon: 'M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
        label: 'Web Search',
        action: () => promptSearch()
    },
    { 
        id: 'memory', 
        icon: 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z',
        label: 'Memory',
        action: () => sendCommand('What do you remember about me?')
    },
    { 
        id: 'time', 
        icon: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
        label: 'Time & Date',
        action: () => sendCommand('What time is it?')
    },
    { 
        id: 'joke', 
        icon: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z',
        label: 'Tell a Joke',
        action: () => sendCommand('Tell me a joke')
    }
];

// State
let isOpen = false;
let menuEl = null;
let toggleEl = null;
let pointerEl = null;
let sendMessageFn = null;
let activeItem = null;

/**
 * Initialize the radial menu
 * @param {Function} sendMessage - Function to send messages via WebSocket
 */
export function initRadialMenu(sendMessage) {
    sendMessageFn = sendMessage;
    
    // Cache elements
    menuEl = document.getElementById('radialMenu');
    toggleEl = document.getElementById('radialToggle');
    pointerEl = document.getElementById('radialPointer');
    
    if (!menuEl || !toggleEl) {
        console.warn('Radial menu elements not found');
        return;
    }
    
    // Position items in a circle and store their positions
    positionItems();
    
    // Setup event listeners
    setupEventListeners();
    
    // Add ripple effect to items
    addRippleEffects();
    
    console.log('Radial menu initialized');
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    // Toggle button
    toggleEl.addEventListener('change', (e) => {
        isOpen = e.target.checked;
        if (isOpen) {
            animateOpen();
        } else {
            animateClose();
        }
    });
    
    // Menu items
    const items = document.querySelectorAll('.radial-item');
    items.forEach((item) => {
        item.addEventListener('click', (e) => handleItemClick(e));
        
        // Hover effect - move pointer toward item
        item.addEventListener('mouseenter', () => {
            if (isOpen) {
                movePointerToItem(item);
            }
        });
        
        // Add keyboard support
        item.setAttribute('tabindex', '0');
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleItemClick(e);
            }
        });
    });
    
    // Close on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            closeMenu();
        }
    });
    
    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (isOpen && !menuEl.contains(e.target)) {
            closeMenu();
        }
    });
}

/**
 * Position items in a circle and store coordinates
 */
function positionItems() {
    const items = document.querySelectorAll('.radial-item');
    const count = items.length;
    const startAngle = -90; // Start from top
    const angleStep = 360 / count;
    
    items.forEach((item, index) => {
        const angle = startAngle + (index * angleStep);
        const radian = (angle * Math.PI) / 180;
        
        // Calculate position
        const x = Math.cos(radian) * CONFIG.radius;
        const y = Math.sin(radian) * CONFIG.radius;
        
        // Store coordinates for pointer animation
        item.dataset.x = x;
        item.dataset.y = y;
        item.dataset.angle = angle;
    });
}

/**
 * Move pointer indicator toward an item on hover
 */
function movePointerToItem(item) {
    if (!pointerEl) return;
    
    const x = parseFloat(item.dataset.x) || 0;
    const y = parseFloat(item.dataset.y) || 0;
    
    // Move pointer 75% of the way toward the item
    const pointerRatio = 0.7;
    pointerEl.style.transform = `translate(calc(-50% + ${x * pointerRatio}px), calc(-50% + ${y * pointerRatio}px))`;
}

/**
 * Reset pointer to center
 */
function resetPointer() {
    if (pointerEl) {
        pointerEl.style.transform = 'translate(-50%, -50%)';
    }
}

/**
 * Handle menu item click
 */
function handleItemClick(e) {
    e.stopPropagation();
    
    const item = e.currentTarget;
    const action = item.dataset.action;
    
    // Visual feedback
    setActiveItem(item);
    
    // Find and execute action
    const menuAction = MENU_ACTIONS.find(a => a.id === action);
    if (menuAction && menuAction.action) {
        // Add pulse animation
        item.classList.add('activated');
        setTimeout(() => item.classList.remove('activated'), 300);
        
        // Execute action after brief delay for visual feedback
        setTimeout(() => {
            menuAction.action();
            closeMenu();
        }, 150);
    }
}

/**
 * Set active item visual state
 */
function setActiveItem(item) {
    // Remove previous active state
    if (activeItem) {
        activeItem.classList.remove('active');
    }
    
    activeItem = item;
    item.classList.add('active');
}

/**
 * Animate menu open with staggered effect
 */
function animateOpen() {
    menuEl.classList.add('open');
    
    const items = document.querySelectorAll('.radial-item');
    items.forEach((item, index) => {
        // Reset and animate
        item.style.transitionDelay = `${index * CONFIG.staggerDelay}ms`;
    });
}

/**
 * Animate menu close with reverse stagger
 */
function animateClose() {
    const items = document.querySelectorAll('.radial-item');
    const count = items.length;
    
    items.forEach((item, index) => {
        // Reverse stagger
        item.style.transitionDelay = `${(count - 1 - index) * CONFIG.staggerDelay}ms`;
    });
    
    menuEl.classList.remove('open');
    
    // Reset pointer to center
    resetPointer();
    
    // Clear active item
    if (activeItem) {
        activeItem.classList.remove('active');
        activeItem = null;
    }
}

/**
 * Close the menu
 */
export function closeMenu() {
    if (toggleEl) {
        toggleEl.checked = false;
        isOpen = false;
        animateClose();
    }
}

/**
 * Open the menu
 */
export function openMenu() {
    if (toggleEl) {
        toggleEl.checked = true;
        isOpen = true;
        animateOpen();
    }
}

/**
 * Toggle the menu
 */
export function toggleMenu() {
    if (isOpen) {
        closeMenu();
    } else {
        openMenu();
    }
}

/**
 * Add ripple effect to menu items
 */
function addRippleEffects() {
    const items = document.querySelectorAll('.radial-item');
    
    items.forEach(item => {
        item.addEventListener('mousedown', (e) => {
            const rect = item.getBoundingClientRect();
            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.left = `${e.clientX - rect.left}px`;
            ripple.style.top = `${e.clientY - rect.top}px`;
            item.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });
}

/**
 * Send a command/message
 */
function sendCommand(text) {
    if (sendMessageFn) {
        sendMessageFn({
            type: 'text_message',
            text: text
        });
        
        // Also add to conversation UI
        addUserMessage(text);
    }
}

/**
 * Add user message to conversation (if available)
 */
function addUserMessage(text) {
    const conversation = document.getElementById('conversation');
    if (!conversation) return;
    
    const msgEl = document.createElement('div');
    msgEl.className = 'message user';
    msgEl.innerHTML = `<p>${escapeHtml(text)}</p>`;
    conversation.appendChild(msgEl);
    conversation.scrollTop = conversation.scrollHeight;
}

/**
 * Prompt for search query
 */
function promptSearch() {
    const query = prompt('What would you like to search for?');
    if (query && query.trim()) {
        sendCommand(`Search the web for: ${query.trim()}`);
    }
}

/**
 * Escape HTML for safe display
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Check if menu is currently open
 */
export function isMenuOpen() {
    return isOpen;
}
