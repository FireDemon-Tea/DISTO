/**
 * Professional Minecraft Metrics Dashboard
 * Enhanced JavaScript for real-time monitoring
 */

class MetricsDashboard {
    constructor() {
        this.token = this.getOrPromptToken();
        this.sessionToken = null;
        this.isAuthenticated = false;
        this.userInfo = null;
        this.metrics = {};
        this.history = [];
        this.maxHistoryLength = 100;
        this.updateInterval = 2000; // 2 seconds
        this.isConnected = false;
        this.lastUpdate = null;
        this.charts = {};
        this.ws = null;
        this.wsConnected = false;
        this.lastModDataHash = null;
        
        this.init();
    }

    init() {
        // Don't start any API calls until we're authenticated
        this.checkAuthentication();
    }

    getOrPromptToken() {
        let token = localStorage.getItem('metrics_token');
        if (!token) {
            token = prompt('Enter your metrics token:');
            if (token) {
                localStorage.setItem('metrics_token', token);
            }
        }
        return token;
    }

    async isServerAvailable() {
        try {
            // Try a simple health check endpoint
            const response = await fetch('/api/session', {
                method: 'HEAD',
                headers: {
                    'X-Session-Token': this.sessionToken || 'dummy'
                }
            });
            return response.status !== 0; // 0 means connection refused
        } catch (error) {
            return false; // Any error means server not available
        }
    }

    async checkAuthentication() {
        // Check if we have a session token
        this.sessionToken = localStorage.getItem('session_token');
        if (this.sessionToken) {
            try {
                const response = await fetch('/api/session', {
                    headers: {
                        'X-Session-Token': this.sessionToken
                    }
                });
                const data = await response.json();
                
                if (data.authenticated) {
                    this.isAuthenticated = true;
                    this.userInfo = data;
                    this.initializeDashboard();
                    return;
                } else {
                    // Invalid session, clear it
                    localStorage.removeItem('session_token');
                    this.sessionToken = null;
                }
            } catch (error) {
                console.log('Session check failed (server may not be running):', error.message);
                // Don't clear the session token if server is just not running
                // Keep it so user can login when server starts
                this.sessionToken = null;
            }
        }
        
        // Not authenticated or server not running, show login form
        this.showLoginForm();
    }

    showLoginForm() {
        document.body.innerHTML = `
            <div class="login-container">
                <div class="login-card">
                    <div class="login-header">
                        <h1>Minecraft Metrics Dashboard</h1>
                        <p>Please log in to access the dashboard</p>
                    </div>
                    
                    <form id="login-form" class="login-form">
                        <div class="form-group">
                            <label for="username">Username</label>
                            <input type="text" id="username" name="username" required 
                                   placeholder="Enter your username">
                        </div>
                        <div class="form-group">
                            <label for="password">Password</label>
                            <input type="password" id="password" name="password" required 
                                   placeholder="Enter your password">
                        </div>
                        <button type="submit" class="login-btn">
                            <span class="login-icon">🔐</span>
                            Login
                        </button>
                    </form>
                    
                    <div id="login-error" class="login-error" style="display: none;"></div>
                </div>
            </div>
        `;

        // Add event listener for login form
        const loginForm = document.getElementById('login-form');
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Add Enter key listener to password field
        const passwordField = document.getElementById('password');
        if (passwordField) {
            passwordField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.handleLogin();
                }
            });
        }
    }


    async handleLogin() {
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login-error');
        const submitBtn = document.querySelector('#login-form .login-btn');
        
        console.log('Login attempt for user:', username);
        
        if (!username) {
            this.showLoginError('Please enter a username');
            return;
        }
        
        if (!password) {
            this.showLoginError('Please enter a password');
            return;
        }

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="login-icon">⏳</span> Logging in...';
        errorDiv.style.display = 'none';

        try {
            console.log('Sending login request...');
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            console.log('Login response status:', response.status);
            const data = await response.json();
            console.log('Login response data:', data);

            if (data.success) {
                console.log('Login successful, initializing dashboard...');
                this.sessionToken = data.sessionToken;
                this.isAuthenticated = true;
                this.userInfo = data;
                
                // Store session token
                localStorage.setItem('session_token', this.sessionToken);
                
                // Refresh the page to show the dashboard
                console.log('Login successful, refreshing page...');
                window.location.reload();
            } else {
                console.log('Login failed:', data.error);
                this.showLoginError(data.error || 'Login failed');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showLoginError('Connection error. Please try again.');
        } finally {
            // Reset button
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span class="login-icon">🔐</span> Login';
        }
    }


    showLoginError(message, type = 'error') {
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = message;
        errorDiv.className = `login-error ${type}`;
        errorDiv.style.display = 'block';
    }

    initializeDashboard() {
        // Only initialize if we're actually authenticated
        if (!this.isAuthenticated || !this.sessionToken) {
            console.log('Not authenticated, skipping dashboard initialization');
            return;
        }
        
        console.log('Initializing dashboard for authenticated user');
        
        // Load the main dashboard HTML
        this.loadDashboardHTML();
        
        // Initialize dashboard components
        this.setupEventListeners();
        this.setupTabs();
        this.setupConsole();
        this.setupPlayerLocationLinks();
        this.startMetricsPolling();
        this.initializeCharts();
        this.updateConnectionStatus();
        this.loadSettings();
        
        // Check console access based on admin status
        this.checkConsoleAccess();
        
        // Add logout functionality
        this.addLogoutButton();
        
        // Initialize admin portal if user is admin
        this.initializeAdminPortal();
        
        // Initialize BlueMap integration
        this.initializeBlueMap();
    }

    loadDashboardHTML() {
        console.log('Loading dashboard HTML...');
        
        // Hide login form and show dashboard content
        const loginContainer = document.querySelector('.login-container');
        if (loginContainer) {
            console.log('Hiding login container');
            loginContainer.style.display = 'none';
        } else {
            console.log('Login container not found');
        }
        
        // Show the main dashboard content
        const header = document.querySelector('.header');
        const main = document.querySelector('.main');
        
        if (header) {
            console.log('Showing header');
            header.style.display = 'block';
        } else {
            console.log('Header not found');
        }
        
        if (main) {
            console.log('Showing main content');
            main.style.display = 'block';
        } else {
            console.log('Main content not found');
        }
        
        console.log('Dashboard HTML loading complete');
    }

    addLogoutButton() {
        // Add logout button to the header
        const header = document.querySelector('.header');
        if (header && this.userInfo) {
            const userInfo = document.createElement('div');
            userInfo.className = 'user-info';
            userInfo.innerHTML = `
                <span class="user-name">${this.userInfo.displayName}</span>
                ${this.userInfo.isAdmin ? '<span class="op-badge">Admin</span>' : ''}
                <button class="btn btn-secondary btn-small" onclick="dashboard.showChangePasswordModal()">Change Password</button>
                <button class="logout-btn" onclick="dashboard.logout()">Logout</button>
            `;
            header.appendChild(userInfo);
        }
    }

    async logout() {
        try {
            if (this.sessionToken) {
                await fetch('/api/logout', {
                    method: 'POST',
                    headers: {
                        'X-Session-Token': this.sessionToken
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear session data
            localStorage.removeItem('session_token');
            this.sessionToken = null;
            this.isAuthenticated = false;
            this.userInfo = null;
            
            // Show login form again
            this.showLoginForm();
        }
    }

    hideConsoleForNonOp() {
        // Hide console tab and content for non-OP users
        const consoleTab = document.querySelector('[data-tab="console"]');
        const consoleContent = document.getElementById('console');
        
        if (consoleTab) {
            consoleTab.style.display = 'none';
        }
        if (consoleContent) {
            consoleContent.style.display = 'none';
        }
        
        // Stop console polling
        this.stopConsolePolling();
    }

    checkConsoleAccess() {
        // Check if user has admin access for console and admin portal
        if (!this.userInfo || !this.userInfo.isAdmin) {
            this.hideConsoleForNonOp();
            this.hideAdminForNonAdmin();
        }
    }

    hideAdminForNonAdmin() {
        // Hide admin tab for non-admin users
        const adminTab = document.querySelector('[data-tab="admin"]');
        if (adminTab) {
            adminTab.style.display = 'none';
        }
    }

    initializeAdminPortal() {
        // Only initialize if user is admin
        if (!this.userInfo || !this.userInfo.isAdmin) {
            return;
        }

        // Show admin tab
        const adminTab = document.querySelector('[data-tab="admin"]');
        if (adminTab) {
            adminTab.style.display = 'block';
        }

        // Setup admin event listeners
        this.setupAdminEventListeners();
        
        // Load users
        this.loadUsers();
    }

    setupAdminEventListeners() {
        // Create user button
        const createUserBtn = document.getElementById('create-user-btn');
        if (createUserBtn) {
            createUserBtn.addEventListener('click', () => this.showCreateUserModal());
        }

    }

    async loadUsers() {
        try {
            const response = await fetch('/api/admin/users', {
                headers: {
                    'X-Session-Token': this.sessionToken
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            if (data.success) {
                this.displayUsers(data.users);
            } else {
                this.showNotification('Failed to load users: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Failed to load users:', error);
            this.showNotification('Failed to load users: ' + error.message, 'error');
        }
    }

    displayUsers(users) {
        const tbody = document.getElementById('users-table-body');
        if (!tbody) return;

        if (!users || Object.keys(users).length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-row">No users found</td></tr>';
            return;
        }

        tbody.innerHTML = Object.values(users).map(user => `
            <tr>
                <td>${user.username}</td>
                <td>${user.isAdmin ? '<span class="admin-badge">Admin</span>' : '<span class="user-badge">User</span>'}</td>
                <td>${new Date(user.createdAt).toLocaleDateString()}</td>
                <td>${new Date(user.lastModified).toLocaleDateString()}</td>
                <td>
                    <div class="action-buttons">
                        ${user.username !== this.userInfo.username && user.username.toLowerCase() !== 'admin' ? `
                            <button class="btn btn-small btn-warning" onclick="dashboard.toggleAdminStatus('${user.username}', ${!user.isAdmin})">
                                ${user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                            </button>
                            <button class="btn btn-small btn-danger" onclick="dashboard.deleteUser('${user.username}')">
                                Delete
                            </button>
                        ` : user.username === this.userInfo.username ? '<span class="text-muted">Current User</span>' : '<span class="text-muted">Original Admin</span>'}
                    </div>
                </td>
            </tr>
        `).join('');
    }

    showCreateUserModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('create-user-modal');
        if (!modal) {
            modal = this.createUserModal();
            document.body.appendChild(modal);
        }

        // Reset form
        const form = modal.querySelector('#create-user-form');
        form.reset();
        
        // Show modal
        modal.style.display = 'flex';
    }

    createUserModal() {
        const modal = document.createElement('div');
        modal.id = 'create-user-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3 class="modal-title">Create New User</h3>
                    <button class="modal-close" type="button">&times;</button>
                </div>
                <form id="create-user-form" class="modal-content">
                    <div class="form-group">
                        <label for="new-username">Username</label>
                        <input type="text" id="new-username" name="username" required 
                               placeholder="Enter username">
                    </div>
                    <div class="form-group">
                        <label for="new-password">Password</label>
                        <input type="password" id="new-password" name="password" required 
                               placeholder="Enter password (min 6 characters)">
                    </div>
                    <div class="form-group">
                        <label for="new-is-admin">
                            <input type="checkbox" id="new-is-admin" name="isAdmin">
                            Admin privileges
                        </label>
                    </div>
                </form>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'">
                        Cancel
                    </button>
                    <button type="button" class="btn btn-primary" onclick="dashboard.createUser()">
                        Create User
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        return modal;
    }

    async createUser() {
        const form = document.getElementById('create-user-form');
        const formData = new FormData(form);
        
        const username = formData.get('username').trim();
        const password = formData.get('password');
        const isAdmin = formData.get('isAdmin') === 'on';

        if (!username) {
            this.showNotification('Username is required', 'error');
            return;
        }

        if (!password || password.length < 6) {
            this.showNotification('Password must be at least 6 characters long', 'error');
            return;
        }

        try {
            const response = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': this.sessionToken
                },
                body: JSON.stringify({ username, password, isAdmin })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification('User created successfully', 'success');
                document.getElementById('create-user-modal').style.display = 'none';
                this.loadUsers(); // Refresh the user list
            } else {
                this.showNotification('Failed to create user: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Failed to create user:', error);
            this.showNotification('Failed to create user: ' + error.message, 'error');
        }
    }

    async toggleAdminStatus(username, isAdmin) {
        if (!confirm(`Are you sure you want to ${isAdmin ? 'grant' : 'remove'} admin privileges for ${username}?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${username}/admin`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': this.sessionToken
                },
                body: JSON.stringify({ isAdmin })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification(`Admin status updated for ${username}`, 'success');
                this.loadUsers(); // Refresh the user list
            } else {
                this.showNotification('Failed to update admin status: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Failed to update admin status:', error);
            this.showNotification('Failed to update admin status: ' + error.message, 'error');
        }
    }

    async deleteUser(username) {
        if (!confirm(`Are you sure you want to delete user ${username}? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`/api/admin/users/${username}`, {
                method: 'DELETE',
                headers: {
                    'X-Session-Token': this.sessionToken
                }
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification(`User ${username} deleted successfully`, 'success');
                this.loadUsers(); // Refresh the user list
            } else {
                this.showNotification('Failed to delete user: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Failed to delete user:', error);
            this.showNotification('Failed to delete user: ' + error.message, 'error');
        }
    }

    showChangePasswordModal() {
        // Create modal if it doesn't exist
        let modal = document.getElementById('change-password-modal');
        if (!modal) {
            modal = this.createChangePasswordModal();
            document.body.appendChild(modal);
        }

        // Reset form
        const form = modal.querySelector('#change-password-form');
        form.reset();
        
        // Show modal
        modal.style.display = 'flex';
    }

    createChangePasswordModal() {
        const modal = document.createElement('div');
        modal.id = 'change-password-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3 class="modal-title">Change Password</h3>
                    <button class="modal-close" type="button">&times;</button>
                </div>
                <form id="change-password-form" class="modal-content">
                    <div class="form-group">
                        <label for="old-password">Current Password</label>
                        <input type="password" id="old-password" name="oldPassword" required 
                               placeholder="Enter current password">
                    </div>
                    <div class="form-group">
                        <label for="new-password">New Password</label>
                        <input type="password" id="new-password" name="newPassword" required 
                               placeholder="Enter new password (min 6 characters)">
                    </div>
                    <div class="form-group">
                        <label for="confirm-new-password">Confirm New Password</label>
                        <input type="password" id="confirm-new-password" name="confirmPassword" required 
                               placeholder="Confirm new password">
                    </div>
                </form>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" onclick="this.closest('.modal').style.display='none'">
                        Cancel
                    </button>
                    <button type="button" class="btn btn-primary" onclick="dashboard.changePassword()">
                        Change Password
                    </button>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });

        return modal;
    }

    async changePassword() {
        const form = document.getElementById('change-password-form');
        const formData = new FormData(form);
        
        const oldPassword = formData.get('oldPassword');
        const newPassword = formData.get('newPassword');
        const confirmPassword = formData.get('confirmPassword');

        if (!oldPassword) {
            this.showNotification('Current password is required', 'error');
            return;
        }

        if (!newPassword || newPassword.length < 6) {
            this.showNotification('New password must be at least 6 characters long', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showNotification('New passwords do not match', 'error');
            return;
        }

        try {
            const response = await fetch('/api/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': this.sessionToken
                },
                body: JSON.stringify({ oldPassword, newPassword, confirmPassword })
            });

            const data = await response.json();
            
            if (data.success) {
                this.showNotification('Password changed successfully', 'success');
                document.getElementById('change-password-modal').style.display = 'none';
            } else {
                this.showNotification('Failed to change password: ' + data.error, 'error');
            }
        } catch (error) {
            console.error('Failed to change password:', error);
            this.showNotification('Failed to change password: ' + error.message, 'error');
        }
    }

    setupEventListeners() {
        // Settings functionality
        this.setupSettingsListeners();

        // Window visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopMetricsPolling();
                this.stopConsolePolling();
            } else if (this.isAuthenticated && this.sessionToken) {
                this.startMetricsPolling();
                this.startConsolePolling();
            }
        });
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                this.switchToTab(targetTab);
            });
        });
    }

    switchToTab(targetTab) {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');
        
        // Remove active class from all tabs and contents
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(content => content.classList.remove('active'));
        
        // Add active class to target tab and corresponding content
        const targetTabElement = document.querySelector(`[data-tab="${targetTab}"]`);
        if (targetTabElement) {
            targetTabElement.classList.add('active');
        }
        
        const targetContent = document.getElementById(targetTab);
        if (targetContent) {
            targetContent.classList.add('active');
        }
    }

    setupPlayerLocationLinks() {
        // Use event delegation to handle clicks on player location links
        document.addEventListener('click', (event) => {
            console.log('Click event on:', event.target);
            if (event.target.classList.contains('player-location-link')) {
                console.log('Player location link clicked');
                const playerId = event.target.getAttribute('data-player-id');
                console.log('Player ID:', playerId);
                console.log('Player data cache:', this.playerDataCache);
                
                if (playerId && this.playerDataCache && this.playerDataCache[playerId]) {
                    const player = this.playerDataCache[playerId];
                    console.log('Found player data:', player);
                    this.openBlueMapForPlayer(player);
                } else {
                    console.error('Player data not found for ID:', playerId);
                }
            }
        });
    }

    setupConsole() {
        this.consoleHistory = [];
        this.consoleHistoryIndex = -1;
        this.consolePaused = false;
        
        const consoleInput = document.getElementById('console-input');
        const consoleSend = document.getElementById('console-send');
        const consoleOutput = document.getElementById('console-output');
        const clearConsole = document.getElementById('clear-console');
        const pauseConsole = document.getElementById('pause-console');

        if (consoleInput && consoleSend) {
            consoleSend.addEventListener('click', () => this.sendConsoleCommand());
            consoleInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendConsoleCommand();
                }
            });
            
            // Console history navigation
            consoleInput.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateConsoleHistory(-1);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateConsoleHistory(1);
                }
            });
        }

        if (clearConsole) {
            clearConsole.addEventListener('click', () => this.clearConsole());
        }

        if (pauseConsole) {
            pauseConsole.addEventListener('click', () => this.toggleConsolePause());
        }


        // Console is ready - no welcome messages needed
    }

    setupSettingsListeners() {
        // Save settings button
        const saveBtn = document.getElementById('save-settings');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        // Reset settings button
        const resetBtn = document.getElementById('reset-settings');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetSettings());
        }
    }

    loadSettings() {
        const serverName = localStorage.getItem('server_name') || 'Minecraft Server Dashboard';
        const serverNameInput = document.getElementById('server-name');
        if (serverNameInput) {
            serverNameInput.value = serverName;
        }
        this.updateServerName(serverName);
    }

    saveSettings() {
        const serverNameInput = document.getElementById('server-name');
        if (serverNameInput) {
            const serverName = serverNameInput.value.trim() || 'Minecraft Server Dashboard';
            localStorage.setItem('server_name', serverName);
            this.updateServerName(serverName);
            this.showSuccessMessage('Settings saved successfully!');
        }
    }

    resetSettings() {
        const serverNameInput = document.getElementById('server-name');
        if (serverNameInput) {
            serverNameInput.value = 'Minecraft Server Dashboard';
            localStorage.setItem('server_name', 'Minecraft Server Dashboard');
            this.updateServerName('Minecraft Server Dashboard');
            this.showSuccessMessage('Settings reset to default!');
        }
    }

    updateServerName(name) {
        const logoText = document.querySelector('.logo-text');
        if (logoText) {
            logoText.textContent = name;
        }
    }

    showSuccessMessage(message) {
        // Create or update success message
        let successElement = document.getElementById('success-message');
        if (!successElement) {
            successElement = document.createElement('div');
            successElement.id = 'success-message';
            successElement.className = 'success-state';
            document.body.insertBefore(successElement, document.body.firstChild);
        }
        
        successElement.innerHTML = `
            <div class="success-icon">✅</div>
            <div>${message}</div>
            <button onclick="this.parentElement.remove()" class="btn btn-primary" style="margin-top: 1rem;">
                Dismiss
            </button>
        `;
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (successElement && successElement.parentElement) {
                successElement.remove();
            }
        }, 3000);
    }

    async fetchMetrics() {
        if (!this.isAuthenticated || !this.sessionToken) {
            console.log('Not authenticated, skipping metrics fetch');
            return;
        }

        try {
            const response = await fetch('/api/metrics', {
                headers: {
                    'X-Session-Token': this.sessionToken
                }
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    // Session expired, logout
                    this.logout();
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.updateMetrics(data);
            this.isConnected = true;
            this.lastUpdate = new Date();
            this.updateConnectionStatus();

        } catch (error) {
            console.error('Failed to fetch metrics:', error);
            // Don't show error messages to user - just update connection status silently
            this.isConnected = false;
            this.updateConnectionStatus();
        }
    }

    updateMetrics(data) {
        const previousMetrics = { ...this.metrics };
        this.metrics = data;
        
        // Add to history
        this.history.push({
            timestamp: Date.now(),
            ...data
        });

        // Limit history size
        if (this.history.length > this.maxHistoryLength) {
            this.history.shift();
        }

        // Update UI elements
        this.updateMetricCards(data, previousMetrics);
        this.updateCharts();
        this.updateLastRefreshTime();
        this.updatePlayerList(data);
    }

    updateMetricCards(data, previous) {
        // Performance metrics
        this.updateMetric('tps', data.tps, 'number', previous);
        this.updateMetric('tick', data.tick_time_ms, 'number', previous);
        this.updateMetric('cpu', data.cpu_usage_percent, 'number', previous);
        
        // System metrics
        this.updateRAM(data, previous);
        this.updateMetric('uptime', data.server_uptime_ms, 'duration', previous);
        this.updateMetric('chunks', data.chunks_loaded, 'integer', previous);
        
        // Disk usage metrics
        this.updateMetric('world-size', data.world_size_mb, 'integer', previous);
        this.updateMetric('disk-free', data.disk_free_gb, 'integer', previous);
        this.updateMetric('disk-usage', data.disk_usage_percent, 'integer', previous);
        
        // Player metrics
        this.updateMetric('pc', data.player_count, 'integer', previous);
        
        // Network metrics
        this.updateMetric('lat', data.network_latency_ms, 'number', previous);
        this.updateMetric('world-time', data.world_time, 'time', previous);
        this.updateMetric('version', data.minecraft_version, 'string', previous);
        
        // Entity metrics - no longer showing total count as separate metric
        
        // Mod metrics - no longer showing mod count as separate metric
        
        // Update detailed sections
        this.updateNetworkStats(data);
        this.updateEntityBreakdown(data);
        this.updateModList(data);
    }

    updateMetric(id, value, format, previous) {
        const element = document.getElementById(id);
        if (element) {
            const formattedValue = this.formatValue(value, format);
            element.textContent = formattedValue;
            
            // Add status class based on value
            this.updateMetricStatus(element, { id, value });
            
            // Add trend indicator
            this.updateTrendIndicator({ id, value }, previous);
        }
    }

    updateRAM(data, previous) {
        const ramMbElement = document.getElementById('ram-mb');
        const ramPercentElement = document.getElementById('ram-percent');
        
        if (ramMbElement && data.ram_usage_mb !== undefined && data.ram_usage_mb !== "Data unavailable") {
            ramMbElement.textContent = Math.round(data.ram_usage_mb);
            this.updateMetricStatus(ramMbElement, { id: 'ram', value: data.ram_usage_mb });
        } else if (ramMbElement) {
            ramMbElement.textContent = '—';
        }
        
        if (ramPercentElement && data.ram_usage_percent !== undefined && data.ram_usage_percent !== "Data unavailable") {
            ramPercentElement.textContent = `${Math.round(data.ram_usage_percent)}%`;
        } else if (ramPercentElement && data.ram_usage_mb !== undefined && data.ram_total_mb !== undefined && 
                   data.ram_usage_mb !== "Data unavailable" && data.ram_total_mb !== "Data unavailable") {
            // Calculate percentage if not provided
            const percent = (data.ram_usage_mb / data.ram_total_mb) * 100;
            ramPercentElement.textContent = `${Math.round(percent)}%`;
        } else if (ramPercentElement) {
            ramPercentElement.textContent = '—';
        }
        
        // Update trend for RAM
        this.updateTrendIndicator({ id: 'ram', value: data.ram_usage_mb }, previous);
    }

    formatValue(value, format) {
        if (value === null || value === undefined || value === "Data unavailable") {
            return '—';
        }

        if (typeof value === 'string' && value === "Data unavailable") {
            return '—';
        }

        if (typeof value === 'number' && isNaN(value)) {
            return '—';
        }

        switch (format) {
            case 'integer':
                return Math.round(value).toString();
            case 'number':
                return typeof value === 'number' ? value.toFixed(1) : value.toString();
            case 'duration':
                return this.formatDuration(value);
            case 'time':
                return this.formatGameTime(value);
            case 'string':
                return value.toString();
            default:
                return value.toString();
        }
    }

    updateMetricStatus(element, metric) {
        // Remove existing status classes
        element.classList.remove('status-excellent', 'status-good', 'status-warning', 'status-danger');
        
        let statusClass = '';
        
        switch (metric.id) {
            case 'tps':
                if (metric.value >= 19.5) statusClass = 'status-excellent';
                else if (metric.value >= 18) statusClass = 'status-good';
                else if (metric.value >= 15) statusClass = 'status-warning';
                else statusClass = 'status-danger';
                break;
                
            case 'tick':
                if (metric.value <= 50) statusClass = 'status-excellent';
                else if (metric.value <= 100) statusClass = 'status-good';
                else if (metric.value <= 200) statusClass = 'status-warning';
                else statusClass = 'status-danger';
                break;
                
            case 'cpu':
                if (metric.value <= 50) statusClass = 'status-excellent';
                else if (metric.value <= 75) statusClass = 'status-good';
                else if (metric.value <= 90) statusClass = 'status-warning';
                else statusClass = 'status-danger';
                break;
                
            case 'ram':
                // RAM status depends on available memory, not just usage
                statusClass = 'status-good'; // Default to good
                break;
                
            case 'lat':
                if (metric.value <= 50) statusClass = 'status-excellent';
                else if (metric.value <= 100) statusClass = 'status-good';
                else if (metric.value <= 200) statusClass = 'status-warning';
                else statusClass = 'status-danger';
                break;
        }
        
        if (statusClass) {
            element.classList.add(statusClass);
        }
    }

    updateTrendIndicator(metric, previous) {
        const trendElement = document.getElementById(`${metric.id}-trend`);
        if (!trendElement || !previous || previous[metric.id] === undefined) {
            return;
        }

        const current = metric.value;
        const previousValue = previous[metric.id];
        const diff = current - previousValue;
        
        // Remove existing trend classes
        trendElement.classList.remove('trend-up', 'trend-down', 'trend-neutral');
        
        if (Math.abs(diff) < 0.1) {
            trendElement.classList.add('trend-neutral');
            trendElement.textContent = '→';
        } else if (diff > 0) {
            trendElement.classList.add('trend-up');
            trendElement.textContent = '↗';
        } else {
            trendElement.classList.add('trend-down');
            trendElement.textContent = '↘';
        }
    }

    initializeCharts() {
        // Initialize simple charts for key metrics
        this.charts = {
            tps: this.createSimpleChart('tps-chart', 'TPS Over Time', 'tps'),
            tick: this.createSimpleChart('tick-chart', 'Tick Time Over Time', 'tick_time_ms'),
            cpu: this.createSimpleChart('cpu-chart', 'CPU Usage Over Time', 'cpu_usage_percent'),
            ram: this.createSimpleChart('ram-chart', 'RAM Usage Over Time', 'ram_usage_mb')
        };
    }

    createSimpleChart(containerId, title, dataKey) {
        const container = document.getElementById(containerId);
        if (!container) return null;

        // Create a simple SVG-based chart
        const chartElement = document.createElement('div');
        chartElement.className = 'chart-container';
        chartElement.innerHTML = `
            <div style="text-align: center; margin-bottom: 1rem;">
                <div style="font-size: 0.875rem; color: var(--text-muted);">${title}</div>
            </div>
            <svg width="100%" height="150" viewBox="0 0 400 150" style="background: var(--background); border-radius: var(--radius);">
                <defs>
                    <linearGradient id="gradient-${dataKey}" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" style="stop-color:var(--primary-color);stop-opacity:0.3" />
                        <stop offset="100%" style="stop-color:var(--primary-color);stop-opacity:0" />
                    </linearGradient>
                </defs>
                <path id="line-${dataKey}" stroke="var(--primary-color)" stroke-width="2" fill="none"/>
                <path id="area-${dataKey}" fill="url(#gradient-${dataKey})"/>
                <text id="current-${dataKey}" x="10" y="20" font-size="12" fill="var(--text-primary)">Current: —</text>
                <text id="avg-${dataKey}" x="10" y="35" font-size="10" fill="var(--text-secondary)">Average: —</text>
            </svg>
        `;
        
        container.innerHTML = '';
        container.appendChild(chartElement);
        return chartElement;
    }

    updateCharts() {
        if (this.history.length < 2) return;

        Object.keys(this.charts).forEach(key => {
            const dataKey = this.getDataKey(key);
            this.updateChart(key, dataKey);
        });
    }

    getDataKey(chartKey) {
        const mapping = {
            'tps': 'tps',
            'tick': 'tick_time_ms',
            'cpu': 'cpu_usage_percent',
            'ram': 'ram_usage_mb'
        };
        return mapping[chartKey] || chartKey;
    }

    updateChart(chartKey, dataKey) {
        const linePath = document.getElementById(`line-${dataKey}`);
        const areaPath = document.getElementById(`area-${dataKey}`);
        const currentText = document.getElementById(`current-${dataKey}`);
        const avgText = document.getElementById(`avg-${dataKey}`);

        if (!linePath || !areaPath || !currentText || !avgText) return;

        const data = this.history.map(h => h[dataKey]).filter(v => v !== undefined && !isNaN(v));
        if (data.length < 2) return;

        const maxData = Math.max(...data);
        const minData = Math.min(...data);
        const range = maxData - minData || 1;
        const width = 400;
        const height = 150;
        const padding = 20;

        // Create path data
        let linePathData = '';
        let areaPathData = '';

        data.forEach((value, index) => {
            const x = padding + (index / (data.length - 1)) * (width - 2 * padding);
            const y = height - padding - ((value - minData) / range) * (height - 2 * padding);
            
            if (index === 0) {
                linePathData += `M ${x} ${y}`;
                areaPathData += `M ${x} ${height - padding} L ${x} ${y}`;
            } else {
                linePathData += ` L ${x} ${y}`;
                areaPathData += ` L ${x} ${y}`;
            }
        });

        // Close area path
        const lastX = padding + (width - 2 * padding);
        areaPathData += ` L ${lastX} ${height - padding} Z`;

        linePath.setAttribute('d', linePathData);
        areaPath.setAttribute('d', areaPathData);

        // Update text
        const current = data[data.length - 1];
        const average = data.reduce((a, b) => a + b, 0) / data.length;
        
        currentText.textContent = `Current: ${this.formatValue(current, 'number')}`;
        avgText.textContent = `Average: ${this.formatValue(average, 'number')}`;
    }

    startMetricsPolling() {
        if (!this.isAuthenticated || !this.sessionToken) {
            console.log('Not authenticated, skipping metrics polling');
            return;
        }
        
        this.stopMetricsPolling(); // Clear any existing interval
        this.fetchMetrics(); // Initial fetch
        this.pollingInterval = setInterval(() => {
            this.fetchMetrics();
        }, this.updateInterval);
    }

    stopMetricsPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    updateConnectionStatus() {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            if (this.isConnected) {
                statusElement.textContent = 'Connected';
                statusElement.className = 'status-indicator';
            } else {
                statusElement.textContent = 'Disconnected';
                statusElement.className = 'status-indicator';
                statusElement.style.background = 'var(--danger-color)';
            }
        }
    }

    updateLastRefreshTime() {
        const timeElement = document.getElementById('last-refresh');
        if (timeElement && this.lastUpdate) {
            timeElement.textContent = this.lastUpdate.toLocaleTimeString();
        }
    }


    showError(message) {
        // Create or update error message
        let errorElement = document.getElementById('error-message');
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'error-message';
            errorElement.className = 'error-state';
            document.body.insertBefore(errorElement, document.body.firstChild);
        }
        
        errorElement.innerHTML = `
            <div class="error-icon">⚠️</div>
            <div>${message}</div>
            <button onclick="this.parentElement.remove()" class="btn btn-primary" style="margin-top: 1rem;">
                Dismiss
            </button>
        `;
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorElement && errorElement.parentElement) {
                errorElement.remove();
            }
        }, 5000);
    }


    updatePlayerList(data) {
        const playerListElement = document.getElementById('player-list');
        if (!playerListElement) return;

        // If we have actual player data, use it
        if (data.players && Array.isArray(data.players) && data.players.length > 0) {
            playerListElement.innerHTML = data.players.map(player => {
                const location = player.location;
                const locationText = location ? 
                    `${location.x}, ${location.y}, ${location.z}` : 
                    'Unknown';
                const dimension = location && location.dimension ? 
                    location.dimension.split(':')[1] || location.dimension : 
                    'Unknown';
                
                const canOpenMap = location && this.bluemapConfig && this.bluemapConfig.url;
                const playerId = `player-${player.name.replace(/[^a-zA-Z0-9]/g, '')}-${Date.now()}`;
                const locationDisplay = canOpenMap ? 
                    `<span class="player-location-link" data-player-id="${playerId}" title="Click to view on map">Location: ${locationText} 🗺️</span>` :
                    `<span class="player-location" title="BlueMap not configured">Location: ${locationText}</span>`;
                
                // Store player data for later retrieval
                if (canOpenMap) {
                    this.playerDataCache = this.playerDataCache || {};
                    this.playerDataCache[playerId] = player;
                }
                
                return `
                <div class="player-item">
                    <div class="player-head">
                        <img src="https://mc-heads.net/avatar/${player.name || 'steve'}/32" 
                             alt="${player.name || 'Unknown'}" 
                             class="player-head-image"
                             onerror="this.style.display='none'; this.nextElementSibling.style.display='block';">
                        <div class="player-avatar-fallback" style="display:none;">${player.name ? player.name.charAt(0).toUpperCase() : '?'}</div>
                    </div>
                    <div class="player-info">
                        <div class="player-name">${player.name || 'Unknown'}</div>
                        <div class="player-ping">Ping: ${player.ping || 0}ms</div>
                        <div>${locationDisplay}</div>
                        <div class="player-dimension">Dimension: ${dimension}</div>
                    </div>
                </div>
            `;
            }).join('');
        } else if (data.player_count && data.player_count > 0 && data.player_count !== "Data unavailable") {
            // If we only have player count but no actual player data, show a message
            playerListElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">👥</div>
                    <div>${data.player_count} player${data.player_count !== 1 ? 's' : ''} online</div>
                    <div style="font-size: 0.875rem; margin-top: 0.5rem; opacity: 0.7;">
                        Player details not available
                    </div>
                </div>
            `;
        } else {
            playerListElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">👤</div>
                    <div>No players online</div>
                </div>
            `;
        }
    }

    updateNetworkStats(data) {
        const networkStatsElement = document.getElementById('network-stats');
        if (!networkStatsElement) return;

        if (data.network_stats && typeof data.network_stats === 'object') {
            const stats = data.network_stats;
            networkStatsElement.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-item">
                        <div class="stat-label">Connected Players</div>
                        <div class="stat-value">${stats.connected_players || 0}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Packets Sent</div>
                        <div class="stat-value">${this.formatNumber(stats.packets_sent_total || 0)}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Packets Received</div>
                        <div class="stat-value">${this.formatNumber(stats.packets_received_total || 0)}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Activity Level</div>
                        <div class="stat-value ${stats.network_activity_level === 'Active' ? 'status-good' : 'status-warning'}">${stats.network_activity_level || 'Unknown'}</div>
                    </div>
                </div>
            `;
        } else {
            networkStatsElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">📡</div>
                    <div>Network statistics not available</div>
                </div>
            `;
        }
    }

    updateEntityBreakdown(data) {
        const entityBreakdownElement = document.getElementById('entity-breakdown');
        if (!entityBreakdownElement) return;

        // Store the latest data for teleport functionality
        this.latestData = data;

        if (data.entity_counts_summary && typeof data.entity_counts_summary === 'object') {
            const summary = data.entity_counts_summary;
            // Filter out players from entity list
            const filteredEntities = Object.entries(summary)
                .filter(([type]) => type !== 'minecraft:player')
                .sort(([,a], [,b]) => b - a);

            if (filteredEntities.length > 0) {
                entityBreakdownElement.innerHTML = `
                    <div class="entity-grid">
                        ${filteredEntities.map(([type, count]) => `
                            <div class="entity-tile clickable" data-entity-type="${type}">
                                <div class="entity-image">${this.getEntityImage(type)}</div>
                                <div class="entity-count-large">${count}</div>
                                <div class="entity-type-small">${this.formatEntityType(type)}</div>
                            </div>
                        `).join('')}
                    </div>
                `;

                // Add click handlers to entity tiles
                this.addEntityClickHandlers(data);
            } else {
                entityBreakdownElement.innerHTML = `
                    <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
                        <div>No entities found</div>
                    </div>
                `;
            }
        } else {
            entityBreakdownElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔍</div>
                    <div>Entity information not available</div>
                </div>
            `;
        }
    }

    updateModList(data) {
        const modListElement = document.getElementById('mod-list');
        if (!modListElement) return;

        if (data.mod_status && data.mod_status.loaded_mods && Array.isArray(data.mod_status.loaded_mods)) {
            const mods = data.mod_status.loaded_mods;
            const fabricVersion = data.mod_status.fabric_version || 'Unknown';
            
            // Create a hash of the mod data to check if it changed
            const modDataHash = this.createModDataHash(mods, fabricVersion);
            
            // Only update if mod data actually changed
            if (this.lastModDataHash !== modDataHash) {
                this.lastModDataHash = modDataHash;
                
                // Preserve current section states before updating
                const currentStates = this.getModSectionStates();
                
                // Categorize mods
                const categorizedMods = this.categorizeMods(mods);
                
                modListElement.innerHTML = `
                    <div class="mod-info">
                        <div class="mod-info-item">
                            <div class="mod-info-label">Fabric Version</div>
                            <div class="mod-info-value">${fabricVersion}</div>
                        </div>
                    </div>
                    <div class="mod-sections">
                        ${this.renderModSection('User Mods', categorizedMods.user, currentStates['user-mods'] !== false)}
                        ${this.renderModSection('Fabric API', categorizedMods.fabric, currentStates['fabric-api'] === true)}
                        ${this.renderModSection('Libraries', categorizedMods.libraries, currentStates['libraries'] === true)}
                        ${this.renderModSection('Core Components', categorizedMods.core, currentStates['core-components'] === true)}
                    </div>
                `;
            }
        } else {
            // Only show error if we haven't shown it before
            if (!modListElement.querySelector('.error-message')) {
                modListElement.innerHTML = `
                    <div class="error-message" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                        <div style="font-size: 2rem; margin-bottom: 0.5rem;">🔧</div>
                        <div>Mod information not available</div>
                    </div>
                `;
            }
        }
    }

    createModDataHash(mods, fabricVersion) {
        // Create a simple hash of the mod data to detect changes
        const modData = {
            count: mods.length,
            fabricVersion: fabricVersion,
            modIds: mods.map(mod => `${mod.id}:${mod.version}`).sort()
        };
        return JSON.stringify(modData);
    }

    getModSectionStates() {
        const states = {};
        const sections = ['user-mods', 'fabric-api', 'libraries', 'core-components'];
        
        sections.forEach(sectionId => {
            const content = document.getElementById(`${sectionId}-content`);
            if (content) {
                states[sectionId] = content.classList.contains('expanded');
            }
        });
        
        return states;
    }

    categorizeMods(mods) {
        const categories = {
            user: [],
            fabric: [],
            libraries: [],
            core: []
        };

        mods.forEach(mod => {
            const id = mod.id.toLowerCase();
            const name = (mod.name || mod.id).toLowerCase();

            // User mods (not Fabric API, not core libraries)
            if (!id.startsWith('fabric') && 
                !id.startsWith('minecraft') && 
                !id.startsWith('java') &&
                !id.startsWith('openjdk') &&
                !id.startsWith('mixin') &&
                !this.isLibrary(id, name)) {
                categories.user.push(mod);
            }
            // Fabric API components
            else if (id.startsWith('fabric') || name.includes('fabric api')) {
                categories.fabric.push(mod);
            }
            // Libraries
            else if (this.isLibrary(id, name)) {
                categories.libraries.push(mod);
            }
            // Core components
            else {
                categories.core.push(mod);
            }
        });

        return categories;
    }

    isLibrary(id, name) {
        const libraryPatterns = [
            'jackson', 'javalin', 'jakarta', 'jetty', 'kotlin', 'slf4j',
            'gson', 'log4j', 'commons', 'apache', 'google', 'netty'
        ];
        
        return libraryPatterns.some(pattern => 
            id.includes(pattern) || name.includes(pattern)
        );
    }

    renderModSection(title, mods, isExpanded = false) {
        if (mods.length === 0) return '';

        const sectionId = title.toLowerCase().replace(/\s+/g, '-');
        const isUserMods = title === 'User Mods';
        
        return `
            <div class="mod-section">
                <div class="mod-section-header" onclick="toggleModSection('${sectionId}')">
                    <div class="mod-section-title">
                        <span class="mod-section-arrow ${isExpanded ? 'expanded' : ''}">▶</span>
                        ${title}
                        <span class="mod-section-count">(${mods.length})</span>
                    </div>
                </div>
                <div class="mod-section-content ${isExpanded ? 'expanded' : ''}" id="${sectionId}-content">
                    <div class="mod-grid">
                        ${mods.map(mod => `
                            <div class="mod-tile ${isUserMods ? 'user-mod' : ''}">
                                <div class="mod-name-large">${mod.name || mod.id}</div>
                                <div class="mod-version-small">${mod.version || 'Unknown'}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    // HTTP polling for console output (WebSocket alternative)
    startConsolePolling() {
        if (!this.isAuthenticated || !this.sessionToken) {
            console.log('Not authenticated, skipping console polling');
            return;
        }
        
        this.consolePollingInterval = setInterval(() => {
            this.fetchConsoleOutput();
        }, 2000); // Poll every 2 seconds
        
        // Initial fetch
        this.fetchConsoleOutput();
    }

    stopConsolePolling() {
        if (this.consolePollingInterval) {
            clearInterval(this.consolePollingInterval);
            this.consolePollingInterval = null;
        }
    }

    async fetchConsoleOutput() {
        if (!this.isAuthenticated || !this.sessionToken) {
            console.log('Not authenticated, skipping console fetch');
            return;
        }

        try {
            const response = await fetch('/api/console/history', {
                headers: {
                    'X-Session-Token': this.sessionToken
                }
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    // Session expired, logout
                    this.logout();
                    return;
                } else if (response.status === 403) {
                    // Not OP, hide console
                    this.hideConsoleForNonOp();
                    return;
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            
            if (data.console_output && Array.isArray(data.console_output)) {
                // Initialize history if not set
                if (!this.consoleOutputHistory) {
                    this.consoleOutputHistory = [];
                }
                
                // Handle case where console output was reset (server restart, etc.)
                if (data.console_output.length < this.consoleOutputHistory.length) {
                    this.consoleOutputHistory = [];
                }
                
                // Find new lines by comparing content, not just length
                const newLines = [];
                for (let i = this.consoleOutputHistory.length; i < data.console_output.length; i++) {
                    newLines.push(data.console_output[i]);
                }
                
                // Add new lines to console
                if (newLines.length > 0) {
                    for (const line of newLines) {
                        this.addConsoleLine(line, 'server');
                    }
                }
                
                // Update our history
                this.consoleOutputHistory = [...data.console_output];
            }

        } catch (error) {
            console.error('Failed to fetch console output:', error);
            // Don't show console polling errors to user
        }
    }

    // WebSocket methods (temporarily disabled)
    connectWebSocket() {
        if (!this.token) {
            this.addConsoleLine('No authentication token available for WebSocket connection', 'error');
            return;
        }
        
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(this.token)}`;
        
        this.addConsoleLine(`Attempting to connect to WebSocket: ${wsUrl.replace(this.token, '***')}`, 'info');
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.wsConnected = true;
                this.addConsoleLine('WebSocket connected - receiving live console output', 'success');
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    if (message.type === 'console') {
                        this.addConsoleLine(message.data, 'server');
                    }
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                    this.addConsoleLine(`Failed to parse WebSocket message: ${e.message}`, 'error');
                }
            };
            
            this.ws.onclose = (event) => {
                this.wsConnected = false;
                this.addConsoleLine(`WebSocket disconnected (code: ${event.code}, reason: ${event.reason || 'No reason provided'}) - reconnecting...`, 'warning');
                // Reconnect after 3 seconds
                setTimeout(() => this.connectWebSocket(), 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.addConsoleLine(`WebSocket connection error: ${error.message || 'Unknown error'}`, 'error');
            };
            
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.addConsoleLine(`Failed to create WebSocket connection: ${error.message}`, 'error');
        }
    }

    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
            this.wsConnected = false;
        }
    }

    // Console methods
    sendConsoleCommand() {
        const consoleInput = document.getElementById('console-input');
        if (!consoleInput) return;

        const command = consoleInput.value.trim();
        if (!command) return;

        // Add to history
        this.consoleHistory.push(command);
        this.consoleHistoryIndex = this.consoleHistory.length;

        // Display command
        this.addConsoleLine(`> ${command}`, 'command');

        // Send command to server
        this.executeServerCommand(command);

        // Clear input
        consoleInput.value = '';
    }

    async executeServerCommand(command) {
        try {
            const response = await fetch('/api/console', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': this.sessionToken
                },
                body: JSON.stringify({ command: command })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                this.addConsoleLine(result.output || 'Command executed successfully', 'success');
            } else {
                this.addConsoleLine(result.error || 'Command failed', 'error');
            }
        } catch (error) {
            this.addConsoleLine(`Error: ${error.message}`, 'error');
        }
    }

    addConsoleLine(text, type = 'output') {
        const consoleOutput = document.getElementById('console-output');
        if (!consoleOutput) return;

        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        
        // Don't add timestamp for server output as it already has one
        if (type === 'server') {
            line.textContent = text;
        } else {
            line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        }
        
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        
        // Limit console output to prevent memory issues
        const maxLines = 500;
        while (consoleOutput.children.length > maxLines) {
            consoleOutput.removeChild(consoleOutput.firstChild);
        }
    }

    clearConsole() {
        const consoleOutput = document.getElementById('console-output');
        if (consoleOutput) {
            consoleOutput.innerHTML = '';
            this.addConsoleLine('Console cleared', 'info');
        }
    }

    toggleConsolePause() {
        this.consolePaused = !this.consolePaused;
        const pauseBtn = document.getElementById('pause-console');
        if (pauseBtn) {
            pauseBtn.textContent = this.consolePaused ? 'Resume' : 'Pause';
        }
        this.addConsoleLine(`Console ${this.consolePaused ? 'paused' : 'resumed'}`, 'info');
    }

    navigateConsoleHistory(direction) {
        if (this.consoleHistory.length === 0) return;

        const consoleInput = document.getElementById('console-input');
        if (!consoleInput) return;

        this.consoleHistoryIndex += direction;
        
        if (this.consoleHistoryIndex < 0) {
            this.consoleHistoryIndex = 0;
        } else if (this.consoleHistoryIndex >= this.consoleHistory.length) {
            this.consoleHistoryIndex = this.consoleHistory.length;
            consoleInput.value = '';
            return;
        }

        consoleInput.value = this.consoleHistory[this.consoleHistoryIndex];
    }


    // Utility methods
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
        if (ms < 86400000) return `${(ms / 3600000).toFixed(1)}h`;
        return `${(ms / 86400000).toFixed(1)}d`;
    }

    formatGameTime(time) {
        if (time === undefined || time === null) return '—';
        
        const days = Math.floor(time / 24000);
        const hours = Math.floor((time % 24000) / 1000);
        const minutes = Math.floor((time % 1000) * 0.06);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    formatEntityType(type) {
        // Convert entity type IDs to more readable names
        const typeMap = {
            'minecraft:player': 'Player',
            'minecraft:zombie': 'Zombie',
            'minecraft:skeleton': 'Skeleton',
            'minecraft:creeper': 'Creeper',
            'minecraft:spider': 'Spider',
            'minecraft:enderman': 'Enderman',
            'minecraft:cow': 'Cow',
            'minecraft:pig': 'Pig',
            'minecraft:sheep': 'Sheep',
            'minecraft:chicken': 'Chicken',
            'minecraft:item': 'Dropped Item',
            'minecraft:arrow': 'Arrow',
            'minecraft:experience_orb': 'XP Orb',
            'minecraft:item_frame': 'Item Frame',
            'minecraft:painting': 'Painting'
        };
        
        return typeMap[type] || type.replace('minecraft:', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    getEntityImage(type) {
        // Map entity types to their local head image sources
        const entityImages = {
            'minecraft:player': '/heads/player.png',
            'minecraft:zombie': '/heads/zombie.png',
            'minecraft:skeleton': '/heads/skeleton.png',
            'minecraft:creeper': '/heads/creeper.png',
            'minecraft:spider': '/heads/spider.png',
            'minecraft:enderman': '/heads/enderman.png',
            'minecraft:cow': '/heads/cow.png',
            'minecraft:pig': '/heads/pig.png',
            'minecraft:sheep': '/heads/sheep.png',
            'minecraft:chicken': '/heads/chicken.png',
            'minecraft:bat': '/heads/bat.png',
            'minecraft:cod': '/heads/cod.png',
            'minecraft:salmon': '/heads/salmon.png',
            'minecraft:tropical_fish': '/heads/tropical_fish.png',
            'minecraft:pufferfish': '/heads/pufferfish.png',
            'minecraft:dolphin': '/heads/dolphin.png',
            'minecraft:squid': '/heads/squid.png',
            'minecraft:glow_squid': '/heads/glow_squid.png',
            'minecraft:horse': '/heads/horse.png',
            'minecraft:donkey': '/heads/donkey.png',
            'minecraft:mule': '/heads/mule.png',
            'minecraft:llama': '/heads/llama.png',
            'minecraft:wolf': '/heads/wolf.png',
            'minecraft:cat': '/heads/cat.png',
            'minecraft:ocelot': '/heads/ocelot.png',
            'minecraft:fox': '/heads/fox.png',
            'minecraft:rabbit': '/heads/rabbit.png',
            'minecraft:polar_bear': '/heads/polar_bear.png',
            'minecraft:panda': '/heads/panda.png',
            'minecraft:bee': '/heads/bee.png',
            'minecraft:item': '/heads/item.png',
            'minecraft:arrow': '/heads/arrow.png',
            'minecraft:experience_orb': '/heads/experience_orb.png',
            'minecraft:item_frame': '/heads/item_frame.png',
            'minecraft:painting': '/heads/painting.png',
            'minecraft:minecart': '/heads/minecart.png',
            'minecraft:chest_minecart': '/heads/chest_minecart.png',
            'minecraft:furnace_minecart': '/heads/furnace_minecart.png',
            'minecraft:tnt_minecart': '/heads/tnt_minecart.png',
            'minecraft:hopper_minecart': '/heads/hopper_minecart.png',
            'minecraft:boat': '/heads/boat.png',
            'minecraft:chest_boat': '/heads/chest_boat.png'
        };

        const imageUrl = entityImages[type];
        if (imageUrl) {
            return `<img src="${imageUrl}" alt="${this.formatEntityType(type)}" class="entity-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"><div class="entity-fallback" style="display:none;">${this.getEntityEmoji(type)}</div>`;
        } else {
            return `<div class="entity-fallback">${this.getEntityEmoji(type)}</div>`;
        }
    }

    getEntityEmoji(type) {
        // Fallback emojis for entities without specific images
        const entityEmojis = {
            'minecraft:player': '🧑',
            'minecraft:zombie': '🧟',
            'minecraft:skeleton': '💀',
            'minecraft:creeper': '💥',
            'minecraft:spider': '🕷️',
            'minecraft:enderman': '👤',
            'minecraft:cow': '🐄',
            'minecraft:pig': '🐷',
            'minecraft:sheep': '🐑',
            'minecraft:chicken': '🐔',
            'minecraft:bat': '🦇',
            'minecraft:cod': '🐟',
            'minecraft:salmon': '🐟',
            'minecraft:tropical_fish': '🐠',
            'minecraft:pufferfish': '🐡',
            'minecraft:dolphin': '🐬',
            'minecraft:squid': '🦑',
            'minecraft:glow_squid': '🦑',
            'minecraft:horse': '🐴',
            'minecraft:donkey': '🫏',
            'minecraft:mule': '🫏',
            'minecraft:llama': '🦙',
            'minecraft:wolf': '🐺',
            'minecraft:cat': '🐱',
            'minecraft:ocelot': '🐱',
            'minecraft:fox': '🦊',
            'minecraft:rabbit': '🐰',
            'minecraft:polar_bear': '🐻‍❄️',
            'minecraft:panda': '🐼',
            'minecraft:bee': '🐝',
            'minecraft:item': '📦',
            'minecraft:arrow': '🏹',
            'minecraft:experience_orb': '✨',
            'minecraft:item_frame': '🖼️',
            'minecraft:painting': '🎨',
            'minecraft:minecart': '🚂',
            'minecraft:chest_minecart': '🚂',
            'minecraft:furnace_minecart': '🚂',
            'minecraft:tnt_minecart': '🚂',
            'minecraft:hopper_minecart': '🚂',
            'minecraft:boat': '🚤',
            'minecraft:chest_boat': '🚤'
        };

        return entityEmojis[type] || '❓';
    }

    addEntityClickHandlers(data) {
        const entityTiles = document.querySelectorAll('.entity-tile.clickable');
        entityTiles.forEach(tile => {
            tile.addEventListener('click', () => {
                const entityType = tile.getAttribute('data-entity-type');
                this.showEntityLocationsModal(entityType, data);
            });
        });
    }

    showEntityLocationsModal(entityType, data) {
        // Create modal if it doesn't exist
        let modal = document.getElementById('entity-locations-modal');
        if (!modal) {
            modal = this.createEntityLocationsModal();
            document.body.appendChild(modal);
        }

        // Get entity locations from data
        const locations = this.getEntityLocations(entityType, data);
        
        // Update modal content
        const modalTitle = modal.querySelector('.modal-title');
        const modalContent = modal.querySelector('.modal-content');
        
        modalTitle.textContent = `${this.formatEntityType(entityType)} Locations (${locations.length})`;
        
        if (locations.length === 0) {
            modalContent.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">📍</div>
                    <div>No locations found for this entity type</div>
                </div>
            `;
        } else {
            modalContent.innerHTML = `
                <div class="entity-locations-list">
                    ${locations.map((location, index) => `
                        <div class="location-item">
                            <div class="location-info">
                                <div class="location-coords">
                                    <span class="coord-label">X:</span> <span class="coord-value">${location.x}</span>
                                    <span class="coord-label">Y:</span> <span class="coord-value">${location.y}</span>
                                    <span class="coord-label">Z:</span> <span class="coord-value">${location.z}</span>
                                </div>
                                <div class="location-world">${this.formatWorldName(location.world)}</div>
                            </div>
                            ${this.userInfo && this.userInfo.isAdmin ? `
                                <button class="teleport-btn" data-location-index="${index}" data-location='${JSON.stringify(location)}'>
                                    <span class="teleport-icon">⚡</span>
                                    Teleport
                                </button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            `;

            // Add click handlers for teleport buttons
            this.addTeleportClickHandlers();
        }

        // Show modal
        modal.style.display = 'flex';
    }

    createEntityLocationsModal() {
        const modal = document.createElement('div');
        modal.id = 'entity-locations-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3 class="modal-title">Entity Locations</h3>
                    <button class="modal-close" type="button">&times;</button>
                </div>
                <div class="modal-content">
                    <!-- Content will be populated dynamically -->
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.querySelector('.modal-backdrop').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });

        return modal;
    }

    getEntityLocations(entityType, data) {
        const locations = [];
        
        if (data.entity_locations_by_world && typeof data.entity_locations_by_world === 'object') {
            for (const [worldName, worldData] of Object.entries(data.entity_locations_by_world)) {
                if (worldData && typeof worldData === 'object' && worldData[entityType]) {
                    locations.push(...worldData[entityType]);
                }
            }
        }
        
        return locations;
    }

    formatWorldName(worldName) {
        // Convert minecraft:overworld to "Overworld", etc.
        const worldNames = {
            'minecraft:overworld': 'Overworld',
            'minecraft:the_nether': 'The Nether',
            'minecraft:the_end': 'The End'
        };
        
        return worldNames[worldName] || worldName.replace('minecraft:', '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    addTeleportClickHandlers() {
        const teleportButtons = document.querySelectorAll('.teleport-btn');
        teleportButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const locationData = JSON.parse(button.getAttribute('data-location'));
                this.showPlayerSelectionModal(locationData);
            });
        });
    }

    showPlayerSelectionModal(locationData) {
        // Create player selection modal if it doesn't exist
        let playerModal = document.getElementById('player-selection-modal');
        if (!playerModal) {
            playerModal = this.createPlayerSelectionModal();
            document.body.appendChild(playerModal);
        }

        // Get current players from the latest metrics data
        const currentData = this.latestData;
        const players = currentData && currentData.players ? currentData.players : [];

        // Update modal content
        const modalTitle = playerModal.querySelector('.player-modal-title');
        const playerList = playerModal.querySelector('.player-list');
        
        modalTitle.textContent = `Select Player to Teleport to ${locationData.x}, ${locationData.y}, ${locationData.z}`;
        
        if (players.length === 0) {
            playerList.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">👥</div>
                    <div>No players online</div>
                </div>
            `;
        } else {
            playerList.innerHTML = `
                ${players.map(player => `
                    <div class="player-item" data-player-name="${player.name}">
                        <div class="player-info">
                            <div class="player-name">${player.name}</div>
                            <div class="player-ping">Ping: ${player.ping}ms</div>
                        </div>
                        <button class="select-player-btn" data-player-name="${player.name}">
                            Select
                        </button>
                    </div>
                `).join('')}
            `;

            // Add click handlers for player selection
            this.addPlayerSelectionHandlers(locationData);
        }

        // Show modal
        playerModal.style.display = 'flex';
    }

    createPlayerSelectionModal() {
        const modal = document.createElement('div');
        modal.id = 'player-selection-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-dialog">
                <div class="modal-header">
                    <h3 class="player-modal-title">Select Player</h3>
                    <button class="modal-close" type="button">&times;</button>
                </div>
                <div class="modal-content">
                    <div class="player-list">
                        <!-- Player list will be populated dynamically -->
                    </div>
                </div>
            </div>
        `;

        // Add event listeners
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        modal.querySelector('.modal-backdrop').addEventListener('click', () => {
            modal.style.display = 'none';
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                modal.style.display = 'none';
            }
        });

        return modal;
    }

    addPlayerSelectionHandlers(locationData) {
        const selectButtons = document.querySelectorAll('.select-player-btn');
        selectButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                const playerName = button.getAttribute('data-player-name');
                this.teleportPlayer(playerName, locationData);
            });
        });
    }

    async teleportPlayer(playerName, locationData) {
        try {
            // Show loading state
            const button = document.querySelector(`[data-player-name="${playerName}"]`);
            const originalText = button.textContent;
            button.textContent = 'Teleporting...';
            button.disabled = true;

            const response = await fetch('/api/teleport', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Session-Token': this.sessionToken
                },
                body: JSON.stringify({
                    player: playerName,
                    x: locationData.x,
                    y: locationData.y,
                    z: locationData.z,
                    world: locationData.world
                })
            });

            const result = await response.json();

            if (result.success) {
                // Show success message
                button.textContent = 'Success!';
                button.style.background = 'var(--success-color, #10b981)';
                
                // Close the player selection modal
                const playerModal = document.getElementById('player-selection-modal');
                if (playerModal) {
                    playerModal.style.display = 'none';
                }

                // Show success notification
                this.showNotification(`Successfully teleported ${playerName} to ${locationData.x}, ${locationData.y}, ${locationData.z}`, 'success');
            } else {
                // Show error message
                button.textContent = 'Failed';
                button.style.background = 'var(--error-color, #ef4444)';
                this.showNotification(`Failed to teleport ${playerName}: ${result.error}`, 'error');
            }

            // Reset button after 2 seconds
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
                button.style.background = '';
            }, 2000);

        } catch (error) {
            console.error('Teleport error:', error);
            this.showNotification(`Error teleporting ${playerName}: ${error.message}`, 'error');
            
            // Reset button
            const button = document.querySelector(`[data-player-name="${playerName}"]`);
            button.textContent = 'Select';
            button.disabled = false;
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Show notification
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Remove after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 5000);
    }

    // BlueMap Integration Methods
    async initializeBlueMap() {
        console.log('Initializing BlueMap integration...');
        
        // Load BlueMap configuration
        this.loadBlueMapConfig();
        
        // Setup BlueMap event listeners
        this.setupBlueMapEventListeners();
        
        // Try to auto-detect BlueMap first
        await this.detectBlueMap();
        
        // Initialize map if configuration exists
        if (this.bluemapConfig && this.bluemapConfig.url) {
            this.loadBlueMap();
        } else {
            this.showBlueMapConfiguration();
        }
    }

    async detectBlueMap() {
        console.log('Detecting BlueMap configuration...');
        
        try {
            const response = await fetch('/api/bluemap/detect');
            if (!response.ok) {
                console.warn('Failed to detect BlueMap:', response.status);
                this.hideMapTab();
                return;
            }
            
            const bluemapInfo = await response.json();
            console.log('BlueMap detection result:', bluemapInfo);
            
            if (bluemapInfo.status === 'running' && bluemapInfo.detected_url) {
                console.log('Auto-detected BlueMap URL:', bluemapInfo.detected_url);
                
                // Update configuration with detected URL
                this.bluemapConfig.url = bluemapInfo.detected_url;
                this.bluemapConfig.autoDetected = true;
                this.bluemapConfig.detectionInfo = bluemapInfo;
                
                // Save the auto-detected configuration
                this.saveBlueMapConfig();
                
                this.showNotification(`BlueMap auto-detected at ${bluemapInfo.detected_url}`, 'success');
                this.showMapTab();
            } else if (bluemapInfo.status === 'not_installed') {
                console.log('BlueMap mod is not installed');
                this.bluemapConfig.detectionInfo = bluemapInfo;
                this.hideMapTab();
            } else if (bluemapInfo.status === 'not_running') {
                console.log('BlueMap mod is installed but not running');
                this.bluemapConfig.detectionInfo = bluemapInfo;
                this.showNotification('BlueMap mod is installed but not running. Please start BlueMap or configure manually.', 'warning');
                this.hideMapTab();
            } else {
                // Any other status means BlueMap is not available
                this.hideMapTab();
            }
            
        } catch (error) {
            console.error('Error detecting BlueMap:', error);
            this.hideMapTab();
        }
    }

    hideMapTab() {
        const mapTab = document.querySelector('[data-tab="map"]');
        if (mapTab) {
            mapTab.style.display = 'none';
            console.log('Map tab hidden - BlueMap not available');
        }
    }

    showMapTab() {
        const mapTab = document.querySelector('[data-tab="map"]');
        if (mapTab) {
            mapTab.style.display = 'block';
            console.log('Map tab shown - BlueMap available');
        }
    }

    loadBlueMapConfig() {
        // Load BlueMap configuration from localStorage
        const config = localStorage.getItem('bluemap_config');
        if (config) {
            try {
                this.bluemapConfig = JSON.parse(config);
            } catch (e) {
                console.error('Failed to parse BlueMap config:', e);
                this.bluemapConfig = this.getDefaultBlueMapConfig();
            }
        } else {
            this.bluemapConfig = this.getDefaultBlueMapConfig();
        }
    }

    generateBlueMapPlayerUrl(player) {
        if (!player.location || !this.bluemapConfig || !this.bluemapConfig.url) {
            return null;
        }

        const { x, y, z, dimension, world_save_name } = player.location;
        // Use the world save name from the server (dynamic based on actual server configuration)
        const worldName = world_save_name || 'world'; // Fallback to 'world' if not provided
        
        console.log('Original coordinates:', { x, y, z, dimension, world_save_name });
        console.log('Using world save name:', worldName);
        
        // Use more precise coordinates (round to 1 decimal place instead of integers)
        const preciseX = Math.round(x * 10) / 10;
        const preciseY = Math.round((y + 50) * 10) / 10; // 50 blocks above player for better aerial view
        const preciseZ = Math.round(z * 10) / 10;
        
        console.log('Precise coordinates:', { x: preciseX, y: preciseY, z: preciseZ });
        
        // Try different coordinate formats - some systems might expect different formats
        // Format 1: Standard Minecraft coordinates
        const coords1 = { x: preciseX, y: preciseY, z: preciseZ };
        // Format 2: Some systems might expect block coordinates (integers)
        const coords2 = { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) };
        // Format 3: Some systems might have Z inverted
        const coords3 = { x: preciseX, y: preciseY, z: -preciseZ };
        // Format 4: BlueMap offset correction (based on your observation: 564.3->464, 103.3->0)
        // This suggests BlueMap might be applying an offset or using a different origin
        const coords4 = { x: preciseX - 100.3, y: preciseY, z: preciseZ - 103.3 };
        // Format 5: Alternative offset calculation
        const coords5 = { x: preciseX - 100, y: preciseY, z: preciseZ - 103 };
        
        console.log('Coordinate format options:', { coords1, coords2, coords3, coords4, coords5 });
        
        // Use Format 1 (standard coordinates) since it's not an offset issue
        const coords = coords1;
        
        // Add a note about which format is being used
        console.log('Using coordinate format 1 (standard Minecraft coordinates)');
        
        // Generate BlueMap URL with player coordinates
        const baseUrl = this.bluemapConfig.url;
        
        // BlueMap uses hash-based URL format: #world:x:y:z:distance_from_ground:zoom:rx:ry:rz:perspective
        // Based on your example: #world:552:53:203:141:3:0:0:0:0:perspective
        // Format: x:y:z:distance_from_ground:zoom:rx:ry:rz:perspective
        const hashFormat = `#${worldName}:${coords.x}:${coords.y}:${coords.z}:50:0:0:0:0:perspective`;
        
        console.log('BlueMap hash format:', hashFormat);
        
        const finalUrl = `${baseUrl}${hashFormat}`;
        console.log('Generated BlueMap URL:', finalUrl);
        
        return finalUrl;
    }

    openBlueMapForPlayer(player) {
        console.log('Opening BlueMap for player:', player);
        
        const mapUrl = this.generateBlueMapPlayerUrl(player);
        console.log('Generated map URL:', mapUrl);
        
        if (!mapUrl) {
            this.showNotification('Unable to generate map link for player', 'error');
            return;
        }

        // Store the player URL so it doesn't get overwritten
        this.currentPlayerMapUrl = mapUrl;
        this.currentPlayerName = player.name;

        // Switch to map tab
        this.switchToTab('map');
        
        // Update the iframe source to show the player's location
        const iframe = document.getElementById('bluemap-iframe');
        if (iframe) {
            console.log('Updating iframe src to:', mapUrl);
            iframe.src = mapUrl;
        } else {
            console.error('BlueMap iframe not found');
        }
        
        this.showNotification(`Opening map for ${player.name}`, 'info');
    }

    // Temporary debugging function - you can call this from browser console
    // Usage: dashboard.testCoordinateFormats(playerData)
    testCoordinateFormats(player) {
        console.log('Testing coordinate formats for player:', player);
        
        if (!player.location) {
            console.error('No location data for player');
            return;
        }
        
        const { x, y, z, dimension } = player.location;
        const worldName = dimension.split(':')[1] || dimension;
        
        const formats = [
            { name: 'Format 1 (Standard)', x: x, y: y, z: z },
            { name: 'Format 2 (Block coords)', x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) },
            { name: 'Format 3 (Z inverted)', x: x, y: y, z: -z },
            { name: 'Format 4 (BlueMap offset correction)', x: x - 100.3, y: y, z: z - 103.3 },
            { name: 'Format 5 (Alternative offset)', x: x - 100, y: y, z: z - 103 },
            { name: 'Format 6 (X inverted)', x: -x, y: y, z: z },
            { name: 'Format 7 (Both X,Z inverted)', x: -x, y: y, z: -z }
        ];
        
        formats.forEach((format, index) => {
            const url = `${this.bluemapConfig.url}?world=${worldName}&x=${format.x}&y=${format.y}&z=${format.z}&zoom=3`;
            console.log(`${format.name}: ${url}`);
        });
        
        console.log('You can manually test these URLs to see which one works correctly');
    }

    getDefaultBlueMapConfig() {
        return {
            url: 'http://localhost:8100',
            defaultWorld: '',
            autoRefresh: true,
            fullscreenEnabled: true
        };
    }

    saveBlueMapConfig() {
        localStorage.setItem('bluemap_config', JSON.stringify(this.bluemapConfig));
    }

    setupBlueMapEventListeners() {
        // Refresh map button
        const refreshBtn = document.getElementById('refresh-map');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshBlueMap());
        }

        // Fullscreen map button
        const fullscreenBtn = document.getElementById('fullscreen-map');
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', () => this.toggleFullscreenMap());
        }

        // Retry map button
        const retryBtn = document.getElementById('retry-map');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => this.retryBlueMap());
        }

        // Configure map button
        const configureBtn = document.getElementById('configure-map');
        if (configureBtn) {
            configureBtn.addEventListener('click', () => this.showBlueMapConfiguration());
        }

        // Configuration form buttons
        const saveConfigBtn = document.getElementById('save-map-config');
        if (saveConfigBtn) {
            saveConfigBtn.addEventListener('click', () => this.saveBlueMapConfiguration());
        }

        const testConnectionBtn = document.getElementById('test-map-connection');
        if (testConnectionBtn) {
            testConnectionBtn.addEventListener('click', () => this.testBlueMapConnection());
        }

        const detectBtn = document.getElementById('detect-bluemap');
        if (detectBtn) {
            detectBtn.addEventListener('click', () => this.manualDetectBlueMap());
        }

        const cancelConfigBtn = document.getElementById('cancel-map-config');
        if (cancelConfigBtn) {
            cancelConfigBtn.addEventListener('click', () => this.hideBlueMapConfiguration());
        }

        // Escape key to exit fullscreen
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isMapFullscreen) {
                this.exitFullscreenMap();
            }
        });
    }

    loadBlueMap() {
        console.log('Loading BlueMap...', this.bluemapConfig);
        
        const iframe = document.getElementById('bluemap-iframe');
        const loading = document.getElementById('map-loading');
        const error = document.getElementById('map-error');
        
        if (!iframe || !loading || !error) {
            console.error('BlueMap elements not found');
            return;
        }

        // Show loading state
        loading.style.display = 'flex';
        error.style.display = 'none';
        iframe.style.display = 'none';
        iframe.classList.remove('loaded');

        // Build BlueMap URL
        let mapUrl;
        
        // Check if we have a player-specific URL to show
        if (this.currentPlayerMapUrl) {
            mapUrl = this.currentPlayerMapUrl;
            console.log('Using stored player map URL:', mapUrl);
        } else {
            // Use default URL
            mapUrl = this.bluemapConfig.url;
            if (this.bluemapConfig.defaultWorld) {
                mapUrl += `#${this.bluemapConfig.defaultWorld}`;
            }
            console.log('Using default map URL:', mapUrl);
        }

        // Set iframe source
        iframe.src = mapUrl;

        // Handle iframe load
        iframe.onload = () => {
            console.log('BlueMap iframe loaded successfully');
            setTimeout(() => {
                loading.style.display = 'none';
                iframe.style.display = 'block';
                iframe.classList.add('loaded');
                this.updateMapStatus('connected');
            }, 1000); // Small delay to ensure smooth transition
        };

        // Handle iframe error
        iframe.onerror = () => {
            console.error('Failed to load BlueMap iframe');
            this.showBlueMapError('Failed to load BlueMap. Please check if BlueMap is running and accessible.');
        };

        // Timeout fallback
        setTimeout(() => {
            if (!iframe.classList.contains('loaded')) {
                console.warn('BlueMap load timeout');
                this.showBlueMapError('BlueMap failed to load within 10 seconds. Please check the URL and try again.');
            }
        }, 10000); // 10 second timeout
    }

    refreshBlueMap() {
        console.log('Refreshing BlueMap...');
        // Clear any player-specific URL when manually refreshing
        this.currentPlayerMapUrl = null;
        this.currentPlayerName = null;
        this.loadBlueMap();
    }

    retryBlueMap() {
        console.log('Retrying BlueMap connection...');
        this.loadBlueMap();
    }

    showBlueMapError(customMessage = null) {
        const loading = document.getElementById('map-loading');
        const error = document.getElementById('map-error');
        const iframe = document.getElementById('bluemap-iframe');
        
        if (loading) loading.style.display = 'none';
        if (iframe) {
            iframe.style.display = 'none';
            iframe.classList.remove('loaded');
        }
        if (error) {
            error.style.display = 'flex';
            
            // Update error message if custom message provided
            if (customMessage) {
                const errorMessage = error.querySelector('.error-message');
                if (errorMessage) {
                    errorMessage.textContent = customMessage;
                }
            }
        }
        
        this.updateMapStatus('disconnected');
    }

    showBlueMapConfiguration() {
        const configPanel = document.querySelector('.map-config-panel');
        if (configPanel) {
            configPanel.style.display = 'block';
            
            // Populate form with current config
            const urlInput = document.getElementById('bluemap-url');
            const worldSelect = document.getElementById('map-world');
            
            if (urlInput) urlInput.value = this.bluemapConfig.url;
            if (worldSelect) worldSelect.value = this.bluemapConfig.defaultWorld;
            
            // Show detection info if available
            this.updateDetectionInfo();
        }
    }
    
    updateDetectionInfo() {
        const configPanel = document.querySelector('.map-config-panel');
        if (!configPanel || !this.bluemapConfig.detectionInfo) return;
        
        const detectionInfo = this.bluemapConfig.detectionInfo;
        
        // Create or update detection info display
        let detectionDiv = configPanel.querySelector('.detection-info');
        if (!detectionDiv) {
            detectionDiv = document.createElement('div');
            detectionDiv.className = 'detection-info';
            detectionDiv.style.cssText = 'margin-bottom: 1rem; padding: 0.75rem; background: var(--background); border-radius: var(--radius); border: 1px solid var(--border);';
            
            const formGroup = configPanel.querySelector('.form-group');
            if (formGroup) {
                configPanel.insertBefore(detectionDiv, formGroup);
            }
        }
        
        let statusColor = 'var(--text-secondary)';
        let statusIcon = 'ℹ️';
        
        switch (detectionInfo.status) {
            case 'running':
                statusColor = 'var(--success-color)';
                statusIcon = '✅';
                break;
            case 'not_running':
                statusColor = 'var(--warning-color)';
                statusIcon = '⚠️';
                break;
            case 'not_installed':
                statusColor = 'var(--danger-color)';
                statusIcon = '❌';
                break;
        }
        
        detectionDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                <span style="color: ${statusColor};">${statusIcon}</span>
                <strong style="color: ${statusColor};">BlueMap Detection</strong>
            </div>
            <div style="font-size: 0.875rem; color: var(--text-secondary);">
                ${detectionInfo.message}
                ${detectionInfo.detected_url ? `<br>Detected URL: <code>${detectionInfo.detected_url}</code>` : ''}
            </div>
        `;
    }

    hideBlueMapConfiguration() {
        const configPanel = document.querySelector('.map-config-panel');
        if (configPanel) {
            configPanel.style.display = 'none';
        }
    }

    saveBlueMapConfiguration() {
        const urlInput = document.getElementById('bluemap-url');
        const worldSelect = document.getElementById('map-world');
        
        if (!urlInput) {
            this.showNotification('URL input not found', 'error');
            return;
        }

        const url = urlInput.value.trim();
        if (!url) {
            this.showNotification('Please enter a BlueMap URL', 'error');
            return;
        }

        // Validate URL
        try {
            new URL(url);
        } catch (e) {
            this.showNotification('Please enter a valid URL', 'error');
            return;
        }

        // Update configuration
        this.bluemapConfig.url = url;
        this.bluemapConfig.defaultWorld = worldSelect ? worldSelect.value : '';
        
        // Save configuration
        this.saveBlueMapConfig();
        
        // Hide configuration panel
        this.hideBlueMapConfiguration();
        
        // Reload map with new configuration
        this.loadBlueMap();
        
        // Show the map tab since we now have a configuration
        this.showMapTab();
        
        this.showNotification('BlueMap configuration saved successfully', 'success');
    }

    async manualDetectBlueMap() {
        const detectBtn = document.getElementById('detect-bluemap');
        const urlInput = document.getElementById('bluemap-url');
        
        if (!detectBtn) return;
        
        // Show loading state
        const originalText = detectBtn.textContent;
        detectBtn.textContent = 'Detecting...';
        detectBtn.disabled = true;

        try {
            await this.detectBlueMap();
            
            // Update the URL input with detected URL if found
            if (this.bluemapConfig.detected_url && urlInput) {
                urlInput.value = this.bluemapConfig.detected_url;
            }
            
            // Update detection info display
            this.updateDetectionInfo();
            
            // Show/hide map tab based on detection result
            if (this.bluemapConfig.detectionInfo && this.bluemapConfig.detectionInfo.status === 'running') {
                this.showMapTab();
            } else {
                this.hideMapTab();
            }
            
        } catch (error) {
            console.error('Manual BlueMap detection failed:', error);
            this.showNotification('BlueMap detection failed. Please check manually.', 'error');
            this.hideMapTab();
        } finally {
            // Reset button
            detectBtn.textContent = originalText;
            detectBtn.disabled = false;
        }
    }

    async testBlueMapConnection() {
        const urlInput = document.getElementById('bluemap-url');
        const testBtn = document.getElementById('test-map-connection');
        
        if (!urlInput || !testBtn) return;
        
        const url = urlInput.value.trim();
        if (!url) {
            this.showNotification('Please enter a BlueMap URL first', 'error');
            return;
        }

        // Show loading state
        const originalText = testBtn.textContent;
        testBtn.textContent = 'Testing...';
        testBtn.disabled = true;

        try {
            // Test connection by trying to fetch the BlueMap page
            const response = await fetch(url, { 
                method: 'HEAD',
                mode: 'no-cors' // Handle CORS issues
            });
            
            // If we get here without an error, the connection is likely working
            this.showNotification('BlueMap connection test successful!', 'success');
            
        } catch (error) {
            console.error('BlueMap connection test failed:', error);
            this.showNotification('BlueMap connection test failed. Please check the URL and ensure BlueMap is running.', 'error');
        } finally {
            // Reset button
            testBtn.textContent = originalText;
            testBtn.disabled = false;
        }
    }

    toggleFullscreenMap() {
        if (this.isMapFullscreen) {
            this.exitFullscreenMap();
        } else {
            this.enterFullscreenMap();
        }
    }

    enterFullscreenMap() {
        const mapContainer = document.querySelector('.map-container');
        if (!mapContainer) return;

        // Add fullscreen class
        mapContainer.classList.add('map-fullscreen');
        this.isMapFullscreen = true;

        // Update button text
        const fullscreenBtn = document.getElementById('fullscreen-map');
        if (fullscreenBtn) {
            fullscreenBtn.innerHTML = '<span class="btn-icon">⛶</span> Exit Fullscreen';
        }

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        console.log('Entered fullscreen map mode');
    }

    exitFullscreenMap() {
        const mapContainer = document.querySelector('.map-container');
        if (!mapContainer) return;

        // Remove fullscreen class
        mapContainer.classList.remove('map-fullscreen');
        this.isMapFullscreen = false;

        // Update button text
        const fullscreenBtn = document.getElementById('fullscreen-map');
        if (fullscreenBtn) {
            fullscreenBtn.innerHTML = '<span class="btn-icon">⛶</span> Fullscreen';
        }

        // Restore body scroll
        document.body.style.overflow = '';

        console.log('Exited fullscreen map mode');
    }

    updateMapStatus(status) {
        // This could be used to show connection status in the UI
        console.log('BlueMap status:', status);
        
        // You could add a status indicator to the map header here
        const mapHeader = document.querySelector('#map .card-header');
        if (mapHeader) {
            // Remove existing status
            const existingStatus = mapHeader.querySelector('.map-status');
            if (existingStatus) {
                existingStatus.remove();
            }
            
            // Add new status
            const statusElement = document.createElement('div');
            statusElement.className = `map-status ${status}`;
            statusElement.textContent = status;
            mapHeader.appendChild(statusElement);
        }
    }
}

// Global function for toggling mod sections
function toggleModSection(sectionId) {
    const content = document.getElementById(`${sectionId}-content`);
    const arrow = document.querySelector(`#${sectionId}-content`).previousElementSibling.querySelector('.mod-section-arrow');
    
    if (content && arrow) {
        const isExpanded = content.classList.contains('expanded');
        
        if (isExpanded) {
            content.classList.remove('expanded');
            arrow.classList.remove('expanded');
        } else {
            content.classList.add('expanded');
            arrow.classList.add('expanded');
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only create dashboard instance, don't start any API calls yet
    window.dashboard = new MetricsDashboard();
});

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MetricsDashboard;
}
