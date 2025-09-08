/**
 * Professional Minecraft Metrics Dashboard
 * Enhanced JavaScript for real-time monitoring
 */

class MetricsDashboard {
    constructor() {
        this.token = this.getOrPromptToken();
        this.metrics = {};
        this.history = [];
        this.maxHistoryLength = 100;
        this.updateInterval = 2000; // 2 seconds
        this.isConnected = false;
        this.lastUpdate = null;
        this.charts = {};
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupTabs();
        this.startMetricsPolling(); // Always start auto-refresh
        this.initializeCharts();
        this.updateConnectionStatus();
        this.loadSettings();
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

    setupEventListeners() {
        // Settings functionality
        this.setupSettingsListeners();

        // Window visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.stopMetricsPolling();
            } else {
                this.startMetricsPolling();
            }
        });
    }

    setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        const tabContents = document.querySelectorAll('.tab-content');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                
                // Remove active class from all tabs and contents
                tabs.forEach(t => t.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked tab and corresponding content
                tab.classList.add('active');
                const targetContent = document.getElementById(targetTab);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
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
        if (!this.token) {
            this.showError('No authentication token provided');
            return;
        }

        try {
            const response = await fetch(`/api/metrics?token=${encodeURIComponent(this.token)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            this.updateMetrics(data);
            this.isConnected = true;
            this.lastUpdate = new Date();
            this.updateConnectionStatus();

        } catch (error) {
            console.error('Failed to fetch metrics:', error);
            this.showError(`Connection failed: ${error.message}`);
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
        
        // Player metrics
        this.updateMetric('pc', data.player_count, 'integer', previous);
        
        // Network metrics
        this.updateMetric('lat', data.network_latency_ms, 'number', previous);
        this.updateMetric('world-time', data.world_time, 'time', previous);
        this.updateMetric('version', data.minecraft_version, 'string', previous);
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
            playerListElement.innerHTML = data.players.map(player => `
                <div class="player-item">
                    <div class="player-avatar">${player.name ? player.name.charAt(0).toUpperCase() : '?'}</div>
                    <div class="player-info">
                        <div class="player-name">${player.name || 'Unknown'}</div>
                        <div class="player-ping">Ping: ${player.ping || 0}ms</div>
                    </div>
                </div>
            `).join('');
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
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new MetricsDashboard();
});

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MetricsDashboard;
}
