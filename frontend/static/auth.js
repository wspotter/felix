/**
 * Authentication Module for Felix Voice Agent
 */

const AUTH_TOKEN_KEY = 'felixAuthToken';
const AUTH_USERNAME_KEY = 'felixUsername';

class AuthManager {
    constructor() {
        this.token = localStorage.getItem(AUTH_TOKEN_KEY);
        this.username = localStorage.getItem(AUTH_USERNAME_KEY);
        this.isAdminUser = false;
    }

    getToken() { return this.token; }
    getUsername() { return this.username; }
    isLoggedIn() { return !!this.token; }
    isAdmin() { return this.isAdminUser; }

    setAuth(token, username, isAdmin = false) {
        this.token = token;
        this.username = username;
        this.isAdminUser = isAdmin;
        localStorage.setItem(AUTH_TOKEN_KEY, token);
        localStorage.setItem(AUTH_USERNAME_KEY, username);
    }

    clearAuth() {
        this.token = null;
        this.username = null;
        this.isAdminUser = false;
        localStorage.removeItem(AUTH_TOKEN_KEY);
        localStorage.removeItem(AUTH_USERNAME_KEY);
    }

    async login(username, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Login failed');
        }
        const data = await response.json();
        this.setAuth(data.token, data.username, data.is_admin);
        return data;
    }

    async logout() {
        if (this.token) {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + this.token }
                });
            } catch (e) {}
        }
        this.clearAuth();
    }

    async verifyToken() {
        if (!this.token) return false;
        try {
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': 'Bearer ' + this.token }
            });
            if (!response.ok) {
                this.clearAuth();
                return false;
            }
            const data = await response.json();
            this.username = data.username;
            this.isAdminUser = data.is_admin;
            return true;
        } catch (e) {
            this.clearAuth();
            return false;
        }
    }

    async syncSettingsToServer(settings) {
        if (!this.token) return;
        try {
            await fetch('/api/auth/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + this.token
                },
                body: JSON.stringify(settings)
            });
        } catch (e) {}
    }

    async fetchSettings() {
        if (!this.token) return null;
        try {
            const response = await fetch('/api/auth/settings', {
                headers: {
                    'Authorization': 'Bearer ' + this.token
                }
            });
            if (!response.ok) return null;
            const data = await response.json();
            return data.settings || null;
        } catch (e) {
            console.warn('Failed to load user settings', e);
            return null;
        }
    }

    async getUsers() {
        const response = await fetch('/api/admin/users', {
            headers: { 'Authorization': 'Bearer ' + this.token }
        });
        if (!response.ok) throw new Error('Failed to fetch users');
        return await response.json();
    }

    async createUser(username, password, isAdmin = false) {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.token
            },
            body: JSON.stringify({ username, password, is_admin: isAdmin })
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create user');
        }
        return await response.json();
    }

    async deleteUser(username) {
        const response = await fetch('/api/admin/users/' + username, {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + this.token }
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to delete user');
        }
        return true;
    }

    async updateUser(username, updates) {
        const response = await fetch('/api/admin/users/' + username, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + this.token
            },
            body: JSON.stringify(updates)
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to update user');
        }
        return await response.json();
    }
}

const authManager = new AuthManager();

export function showLoginModal() {
    const existing = document.getElementById('loginOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'loginOverlay';
    overlay.className = 'login-overlay';
    overlay.innerHTML = '<div class="login-modal"><div class="login-header"><h2>Welcome to Felix</h2><p>Sign in to continue</p></div><div class="login-error" id="loginError"></div><form class="login-form" id="loginForm"><input type="text" id="loginUsername" placeholder="Username" autocomplete="username" required><input type="password" id="loginPassword" placeholder="Password" autocomplete="current-password" required><button type="submit" class="login-btn" id="loginBtn">Sign In</button></form></div>';

    document.body.appendChild(overlay);

    const form = document.getElementById('loginForm');
    const errorDiv = document.getElementById('loginError');
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const loginBtn = document.getElementById('loginBtn');

    setTimeout(() => usernameInput.focus(), 100);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            errorDiv.textContent = 'Please enter username and password';
            errorDiv.classList.add('show');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        errorDiv.classList.remove('show');

        try {
            await authManager.login(username, password);
            overlay.remove();
            showUserIndicator();
            window.location.reload();
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.add('show');
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
            passwordInput.value = '';
            passwordInput.focus();
        }
    });
}

export function showUserIndicator() {
    const existing = document.getElementById('userIndicator');
    if (existing) existing.remove();
    if (!authManager.isLoggedIn()) return;

    const indicator = document.createElement('div');
    indicator.id = 'userIndicator';
    indicator.className = 'user-indicator';
    indicator.innerHTML = '<span class="username">' + authManager.getUsername() + '</span><button class="logout-btn" id="logoutBtn">Logout</button>';

    document.body.appendChild(indicator);

    document.getElementById('logoutBtn').addEventListener('click', async () => {
        await authManager.logout();
        window.location.reload();
    });
}

export function initAdminPanel() {
    const adminSection = document.getElementById('adminSection');
    if (!adminSection || !authManager.isAdmin()) {
        if (adminSection) adminSection.classList.add('hidden');
        return;
    }
    adminSection.classList.remove('hidden');
}

export async function checkAuth() {
    if (authManager.isLoggedIn()) {
        const valid = await authManager.verifyToken();
        if (valid) {
            showUserIndicator();
            return true;
        }
    }
    showLoginModal();
    return false;
}

export function getToken() { return authManager.getToken(); }
export function getUsername() { return authManager.getUsername(); }
export function isLoggedIn() { return authManager.isLoggedIn(); }
export function isAdmin() { return authManager.isAdmin(); }
export async function logout() { await authManager.logout(); }
export async function syncSettingsToServer(settings) { await authManager.syncSettingsToServer(settings); }
export async function fetchUserSettings() { return await authManager.fetchSettings(); }
