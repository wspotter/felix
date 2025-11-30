// API base URL
const API_BASE = 'http://localhost:3000/api';

// State
let allTools = [];
let currentCategory = 'all';
let searchQuery = '';

// DOM Elements
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const uptimeEl = document.getElementById('uptime');
const toolCallsEl = document.getElementById('toolCalls');
const toolsGrid = document.getElementById('toolsGrid');
const searchInput = document.getElementById('searchTools');
const toolCount = document.getElementById('toolCount');
const currentCategoryEl = document.getElementById('currentCategory');
const testPanel = document.getElementById('testPanel');
const closePanel = document.getElementById('closePanel');
const testToolForm = document.getElementById('testToolForm');
const testResult = document.getElementById('testResult');
const activityLog = document.getElementById('activityLog');
const clearLogBtn = document.getElementById('clearLog');

// Category navigation
const navItems = document.querySelectorAll('.nav-item');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    fetchStatus();
    fetchTools();
    setupEventListeners();
    
    // Poll for updates every 2 seconds
    setInterval(fetchStatus, 2000);
});

// Setup event listeners
function setupEventListeners() {
    // Category navigation
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const category = item.dataset.category;
            selectCategory(category);
        });
    });
    
    // Search
    searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        filterAndDisplayTools();
    });
    
    // Test panel
    closePanel.addEventListener('click', () => {
        testPanel.classList.remove('open');
    });
    
    // Test form
    testToolForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await executeTest();
    });
    
    // Clear log
    clearLogBtn.addEventListener('click', () => {
        activityLog.innerHTML = '<div class="log-entry">Log cleared</div>';
    });
}

// Fetch server status
async function fetchStatus() {
    try {
        const response = await fetch(`${API_BASE}/status`);
        const data = await response.json();
        
        statusText.textContent = data.status.charAt(0).toUpperCase() + data.status.slice(1);
        statusDot.style.background = 'var(--success-color)';
        
        // Format uptime
        const uptimeSeconds = Math.floor(data.uptime / 1000);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);
        uptimeEl.textContent = `${hours}h ${minutes}m`;
        
        toolCallsEl.textContent = data.toolCalls;
    } catch (error) {
        statusText.textContent = 'Offline';
        statusDot.style.background = 'var(--danger-color)';
        console.error('Failed to fetch status:', error);
    }
}

// Fetch available tools
async function fetchTools() {
    try {
        const response = await fetch(`${API_BASE}/tools`);
        const data = await response.json();
        
        allTools = data.tools;
        
        // Update category counts
        if (data.categories) {
            Object.entries(data.categories).forEach(([category, count]) => {
                const countEl = document.getElementById(`count-${getCategoryId(category)}`);
                if (countEl) countEl.textContent = count;
            });
            
            // Update "All" count
            const totalCount = Object.values(data.categories).reduce((sum, count) => sum + count, 0);
            const allCountEl = document.getElementById('count-all');
            if (allCountEl) allCountEl.textContent = totalCount;
        }
        
        filterAndDisplayTools();
        logActivity('Loaded ' + allTools.length + ' tools');
    } catch (error) {
        console.error('Failed to fetch tools:', error);
        toolsGrid.innerHTML = '<div class="empty-message"><div class="empty-message-icon">⚠️</div><div>Failed to load tools</div></div>';
    }
}

// Get category ID for element lookup
function getCategoryId(category) {
    const idMap = {
        'Inventory Management': 'inventory',
        'Customer Management': 'customers',
        'Sales & Analytics': 'sales',
        'Supplier Management': 'suppliers',
        'Operations': 'operations',
        'Pricing & Promotions': 'pricing',
        'Reporting': 'reporting',
        'Social Media Management': 'social'
    };
    return idMap[category] || category.toLowerCase().replace(/ /g, '-');
}

// Select category
function selectCategory(category) {
    currentCategory = category;
    
    // Update nav active state
    navItems.forEach(item => {
        if (item.dataset.category === category) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Update category label
    const categoryLabel = category === 'all' ? 'All Categories' : category;
    currentCategoryEl.textContent = categoryLabel;
    
    filterAndDisplayTools();
}

// Filter and display tools
function filterAndDisplayTools() {
    let filtered = allTools;
    
    // Filter by category
    if (currentCategory !== 'all') {
        filtered = filtered.filter(tool => tool.category === currentCategory);
    }
    
    // Filter by search
    if (searchQuery) {
        filtered = filtered.filter(tool => 
            tool.name.toLowerCase().includes(searchQuery) ||
            tool.description.toLowerCase().includes(searchQuery) ||
            tool.category.toLowerCase().includes(searchQuery)
        );
    }
    
    // Update count
    toolCount.textContent = `${filtered.length} tool${filtered.length !== 1 ? 's' : ''}`;
    
    // Display
    displayTools(filtered);
}

// Display tools in grid
function displayTools(tools) {
    if (tools.length === 0) {
        toolsGrid.innerHTML = `
            <div class="empty-message">
                <div class="empty-message-icon">🔍</div>
                <div>No tools found</div>
            </div>
        `;
        return;
    }
    
    toolsGrid.innerHTML = tools.map(tool => `
        <div class="tool-card" data-tool-name="${tool.name}">
            <div class="tool-card-header">
                <div class="tool-card-name">${tool.name}</div>
                <div class="tool-card-badge">${getCategoryIcon(tool.category)}</div>
            </div>
            <div class="tool-card-description">${tool.description}</div>
            <div class="tool-card-footer">
                <div class="tool-call-count">
                    <span>📞</span>
                    <span>${tool.callCount || 0} calls</span>
                </div>
                <span style="color: var(--primary-color); font-weight: 600;">Test →</span>
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    document.querySelectorAll('.tool-card').forEach(card => {
        card.addEventListener('click', () => {
            const toolName = card.dataset.toolName;
            openTestPanel(toolName);
        });
    });
}

// Get category icon
function getCategoryIcon(category) {
    const icons = {
        'Inventory Management': '📦',
        'Customer Management': '👥',
        'Sales & Analytics': '📊',
        'Supplier Management': '🏢',
        'Operations': '⚙️',
        'Pricing & Promotions': '💲',
        'Reporting': '📈',
        'Social Media Management': '📱'
    };
    return icons[category] || '🔧';
}

// Open test panel
function openTestPanel(toolName) {
    const tool = allTools.find(t => t.name === toolName);
    if (!tool) return;
    
    // Update panel info
    document.getElementById('testToolName').textContent = tool.name;
    document.getElementById('testToolDesc').textContent = tool.description;
    
    // Clear previous result
    testResult.classList.remove('visible', 'success', 'error');
    testResult.innerHTML = '';
    
    // Clear input
    document.getElementById('toolInput').value = '';
    
    // Store current tool
    testToolForm.dataset.toolName = toolName;
    
    // Open panel
    testPanel.classList.add('open');
    
    logActivity(`Opened test panel for ${toolName}`);
}

// Execute test
async function executeTest() {
    const toolName = testToolForm.dataset.toolName;
    const inputText = document.getElementById('toolInput').value;
    
    let input = {};
    if (inputText.trim()) {
        try {
            input = JSON.parse(inputText);
        } catch (error) {
            showResult(false, 'Invalid JSON: ' + error.message);
            return;
        }
    }
    
    try {
        const response = await fetch(`${API_BASE}/test-tool`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ toolName, input })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showResult(true, JSON.stringify(data, null, 2));
            logActivity(`✅ ${toolName} executed successfully`, 'success');
        } else {
            showResult(false, data.error || 'Tool execution failed');
            logActivity(`❌ ${toolName} failed: ${data.error}`, 'error');
        }
        
        // Refresh status to update call count
        fetchStatus();
    } catch (error) {
        showResult(false, 'Request failed: ' + error.message);
        logActivity(`❌ ${toolName} error: ${error.message}`, 'error');
    }
}

// Show test result
function showResult(success, message) {
    testResult.classList.add('visible');
    testResult.classList.toggle('success', success);
    testResult.classList.toggle('error', !success);
    testResult.innerHTML = `<pre>${message}</pre>`;
}

// Log activity
function logActivity(message, type = '') {
    const timestamp = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry' + (type ? ' ' + type : '');
    entry.textContent = `[${timestamp}] ${message}`;
    
    activityLog.insertBefore(entry, activityLog.firstChild);
    
    // Keep only last 50 entries
    while (activityLog.children.length > 50) {
        activityLog.removeChild(activityLog.lastChild);
    }
}
