/**
 * Tractor Dashboard - Data Fetching
 */

class TractorDashboard {
    constructor(config) {
        // Fallback if config is missing or URL placeholder is left
        this.config = config || {};

        this.chart = null;
        this.data = [];
        this.isConnected = false;

        console.log("Dashboard initialized with config:", this.config);

        this.init();
    }

    async init() {
        this.setupChart();
        this.setupEventListeners();
        await this.fetchData(); // Fetch immediately
        this.startAutoRefresh();
    }

    async fetchData() {
        console.log("Fetching data...");
        this.updateConnectionStatus('connecting');

        const url = this.config.webAppUrl;

        // Validation
        if (!url || url.includes('YOUR_SCRIPT_ID')) {
            console.error("❌ Web App URL is missing or incorrect in index.html");
            this.updateConnectionStatus('error');
            document.getElementById('statusText').textContent = "Config Error (Check Console)";
            return;
        }

        try {
            // Fetch from Apps Script Web App
            // We use 'no-cors' mode cautiously, but typically Apps Script returns JSON
            // If CORS is an issue, we rely on the script returning simple JSON with correct headers.
            // Note: standard fetch follows redirects. 
            const response = await fetch(`${url}?action=view&hours=24`);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log("Data received:", result);

            if (result.status === 'ok' && Array.isArray(result.data)) {
                this.data = this.parseData(result.data);
                this.updateDashboard();
                this.updateConnectionStatus('connected');
                this.updateLastUpdate();
            } else {
                console.warn("Invalid data structure:", result);
                throw new Error('Invalid data format');
            }

        } catch (error) {
            console.error('Fetch error:', error);
            this.updateConnectionStatus('error');
        }
    }

    parseData(rawData) {
        return rawData.map(d => ({
            ...d,
            date: new Date(d.Timestamp)
        })).sort((a, b) => b.date - a.date); // Sort newest first
    }

    setupChart() {
        const ctx = document.getElementById('historyChart')?.getContext('2d');
        if (!ctx) return;

        this.historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'RPM',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Speed',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { labels: { color: '#9ca3af' } } },
                scales: {
                    x: { ticks: { color: '#6b7280' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                    y: {
                        type: 'linear', position: 'left',
                        title: { display: true, text: 'RPM', color: '#3b82f6' },
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#6b7280' }
                    },
                    y1: {
                        type: 'linear', position: 'right',
                        title: { display: true, text: 'km/h', color: '#10b981' },
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#6b7280' }
                    }
                }
            }
        });
    }

    updateDashboard() {
        if (this.data.length === 0) return;

        const latest = this.data[0];

        // Helpers
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = (val != null && val !== undefined) ? val : '--'; };
        const setW = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`; };
        const pct = (val, max) => (val || 0) / max * 100;

        // Update Gauges
        setTxt('rpmValue', Math.round(latest.EngineSpeed));
        setW('rpmFill', pct(latest.EngineSpeed, 3000));

        const speed = parseFloat(latest.WheelBasedVehicleSpeed);
        setTxt('speedValue', !isNaN(speed) ? speed.toFixed(1) : '--');
        setW('speedFill', pct(speed, 40));

        setTxt('fuelValue', Math.round(latest.FuelLevel));
        setW('fuelFill', pct(latest.FuelLevel, 100));

        setTxt('tempValue', Math.round(latest.EngineCoolantTemp));
        setW('tempFill', pct(latest.EngineCoolantTemp, 120));

        // Update Stats
        setTxt('oilPressure', Math.round(latest.EngineOilPressure));
        setTxt('ambientTemp', latest.AmbientAirTemp?.toFixed(1));
        setTxt('torque', Math.round(latest.EnginePercentTorque));
        setTxt('altitude', Math.round(latest.Altitude));

        // Location
        setTxt('latValue', latest.Latitude?.toFixed(5));
        setTxt('lonValue', latest.Longitude?.toFixed(5));
        setTxt('headingValue', Math.round(latest.Heading) + '°');

        if (window.tractorMap) {
            window.tractorMap.updatePosition(latest.Latitude, latest.Longitude, latest.Heading);
        }

        // Update Diagnostics Panel (always visible)
        this.updateDiagnostics(latest);

        // Refresh Chart (default 1h)
        this.filterDataByRange('1h');
    }

    updateDiagnostics(data) {
        const statusIndicator = document.getElementById('statusIndicator');
        const faultList = document.getElementById('faultList');

        if (!statusIndicator) return;

        const hasFaults = data.HasFaults === true || data.HasFaults === 'true';
        const faultCount = parseInt(data.FaultCount) || 0;
        const alertLevel = data.AlertLevel || 'ok';
        const faultDescriptions = data.FaultDescriptions || '';

        // Update status indicator
        statusIndicator.className = 'status-indicator ' + alertLevel;

        if (alertLevel === 'critical') {
            statusIndicator.innerHTML = '<span class="status-icon">🔴</span><span class="status-text">CRITICAL - Stop Engine! (' + faultCount + ' faults)</span>';
            faultList.style.display = 'block';
        } else if (alertLevel === 'warning') {
            statusIndicator.innerHTML = '<span class="status-icon">🟡</span><span class="status-text">Warning - ' + faultCount + ' issue(s) detected</span>';
            faultList.style.display = 'block';
        } else if (alertLevel === 'info') {
            statusIndicator.innerHTML = '<span class="status-icon">🔵</span><span class="status-text">Check Engine - ' + faultCount + ' code(s)</span>';
            faultList.style.display = 'block';
        } else {
            statusIndicator.innerHTML = '<span class="status-icon">✅</span><span class="status-text">All Systems OK</span>';
            faultList.style.display = 'none';
        }

        // Display active faults
        faultList.innerHTML = '';
        if (faultDescriptions && hasFaults) {
            const faults = faultDescriptions.split(';').filter(f => f.trim());
            faults.forEach(fault => {
                const item = document.createElement('div');
                item.className = 'fault-item ' + alertLevel;
                item.innerHTML = `<div class="fault-info"><span class="fault-desc">${fault.trim()}</span></div>`;
                faultList.appendChild(item);
            });
        }
    }

    async showDiagHistory() {
        const modal = document.getElementById('historyModal');
        const historyList = document.getElementById('historyList');

        if (!modal) return;

        modal.style.display = 'flex';
        historyList.innerHTML = '<div class="loading">Loading history...</div>';

        // Get date filters
        const start = document.getElementById('histStart')?.value;
        const end = document.getElementById('histEnd')?.value;

        let url = `${this.config.webAppUrl}?action=diagnostics&status=all`;
        if (start) url += `&start_date=${start}`;
        if (end) url += `&end_date=${end}`;

        try {
            const response = await fetch(url);
            const result = await response.json();

            if (result.status === 'ok') {
                this.diagHistory = result.diagnostics || [];
                // Re-apply current tab filter
                const activeTab = document.querySelector('.modal-tabs .tab-btn.active');
                const currentStatus = activeTab ? activeTab.dataset.status : 'all';
                this.filterHistory(currentStatus);
            }
        } catch (error) {
            historyList.innerHTML = '<div class="loading">Failed to load history</div>';
            console.error('History fetch error:', error);
        }
    }

    closeHistoryModal() {
        const modal = document.getElementById('historyModal');
        if (modal) modal.style.display = 'none';
    }

    filterHistory(status) {
        // Update tab buttons
        document.querySelectorAll('.modal-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === status);
        });

        if (!this.diagHistory) return;

        const filtered = status === 'all'
            ? this.diagHistory
            : this.diagHistory.filter(d => d.status === status);

        this.renderHistoryList(filtered);
    }

    renderHistoryList(items) {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        if (!items || items.length === 0) {
            historyList.innerHTML = '<div class="no-faults">No diagnostic history found</div>';
            return;
        }

        historyList.innerHTML = items.map(item => {
            const firstSeen = item.firstSeen ? new Date(item.firstSeen).toLocaleString() : 'Unknown';
            const lastSeen = item.lastSeen ? new Date(item.lastSeen).toLocaleString() : 'Unknown';

            let actionHtml = '';
            let resolvedInfoHtml = '';

            if (item.status === 'active') {
                actionHtml = `<button class="resolve-btn" onclick="window.dashboard.resolveIssue('${item.id}')">✓ Mark Resolved</button>`;
            } else {
                const resolvedDate = item.resolvedAt ? new Date(item.resolvedAt).toLocaleDateString() : '';
                actionHtml = `<span style="color:var(--accent-success); font-weight:bold;">✓ Resolved ${resolvedDate}</span>`;

                if (item.resolvedBy || item.notes) {
                    resolvedInfoHtml = `
                        <div class="resolved-details" style="margin-top: 8px; font-size: 0.85rem; color: var(--text-secondary); border-top: 1px solid var(--border-color); padding-top: 6px;">
                            ${item.resolvedBy ? `<div><strong>By:</strong> ${item.resolvedBy}</div>` : ''}
                            ${item.notes ? `<div><strong>Note:</strong> ${item.notes}</div>` : ''}
                        </div>
                    `;
                }
            }

            return `
                <div class="history-item ${item.status}">
                    <div class="history-item-header">
                        <span class="history-item-title">SPN ${item.spn} / FMI ${item.fmi}</span>
                        <span class="history-item-status ${item.status}">${item.status}</span>
                    </div>
                    <div class="history-item-desc">${item.description || 'No description'}</div>
                    <div class="history-item-meta">
                        Category: ${item.category || 'unknown'} | 
                        Occurrences: ${item.occurrenceCount || 1} | 
                        First: ${firstSeen}
                    </div>
                    ${resolvedInfoHtml}
                    <div class="history-item-actions">${actionHtml}</div>
                </div>
            `;
        }).join('');
    }

    async resolveIssue(id) {
        const modalHtml = `
            <div class="resolve-modal">
                <div class="resolve-form">
                    <h3>Resolve Diagnostic Issue</h3>
                    <div class="form-group">
                        <label>Resolved By:</label>
                        <input type="text" id="resolveName" placeholder="Enter your name/ID">
                    </div>
                    <div class="form-group">
                        <label>Notes/Action Taken:</label>
                        <textarea id="resolveNotes" placeholder="Describe the fix..."></textarea>
                    </div>
                    <div class="form-actions">
                        <button onclick="window.dashboard.confirmResolve('${id}')" class="btn-primary">Confirm</button>
                        <button onclick="window.dashboard.cancelResolve()" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        // Simple overlay injection for prompt
        const overlay = document.createElement('div');
        overlay.id = 'resolveOverlay';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = modalHtml;
        document.body.appendChild(overlay);

        // Focus input
        setTimeout(() => document.getElementById('resolveName').focus(), 100);
    }


    async confirmResolve(id) {
        const name = document.getElementById('resolveName').value;
        const notes = document.getElementById('resolveNotes').value;
        const confirmBtn = document.querySelector('.resolve-modal .btn-primary');

        if (!name) {
            alert('Please enter your name/ID');
            return;
        }

        // Show loading state
        if (confirmBtn) {
            confirmBtn.textContent = 'Resolving...';
            confirmBtn.disabled = true;
        }

        const payload = {
            action: 'resolve',
            id: id,
            resolvedBy: name,
            notes: notes
        };

        const cleanup = () => {
            document.getElementById('resolveOverlay')?.remove();
        };

        try {
            // First try no-cors for speed/robustness against CORS errors on simple trigger
            await fetch(this.config.webAppUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });

            // Assume success with no-cors if no network error thrown
            // Wait a short moment for script to process then reload
            setTimeout(() => {
                alert('Issue marked as resolved.');
                cleanup();
                this.closeHistoryModal();
                this.showDiagHistory(); // Re-open to show updated list
            }, 1000);

        } catch (error) {
            console.error('Resolve error:', error);
            alert('Failed to resolve issue. Please try again.');
            cleanup();
        }
    }

    cancelResolve() {
        const overlay = document.getElementById('resolveOverlay');
        if (overlay) overlay.remove();
    }

    toggleMapFullscreen() {
        const mapCard = document.querySelector('.map-card');
        mapCard.classList.toggle('map-fullscreen');

        // Trigger resize event for Leaflet
        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);
    }
    filterDataByRange(range) {
        if (this.data.length === 0 || !this.historyChart) return;

        const now = new Date();
        const hours = range === '24h' ? 24 : (range === '6h' ? 6 : 1);
        const cutoff = new Date(now - hours * 60 * 60 * 1000);

        const filtered = this.data.filter(d => d.date >= cutoff).reverse(); // Oldest first for chart

        this.historyChart.data.labels = filtered.map(d =>
            d.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        this.historyChart.data.datasets[0].data = filtered.map(d => d.EngineSpeed);
        this.historyChart.data.datasets[1].data = filtered.map(d => d.WheelBasedVehicleSpeed);
        this.historyChart.update();

        if (window.tractorMap) window.tractorMap.updateHistory(filtered.reverse());
    }

    setupEventListeners() {
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterDataByRange(e.target.dataset.range);
            });
        });
    }

    startAutoRefresh() {
        const interval = this.config.refreshInterval || 10000;
        console.log(`Starting auto-refresh every ${interval}ms`);
        setInterval(() => this.fetchData(), interval);
    }

    updateConnectionStatus(status) {
        const dot = document.getElementById('connectionStatus');
        const text = document.getElementById('statusText');
        if (dot) dot.className = 'status-dot ' + status;
        if (text) text.textContent = status === 'connected' ? 'Connected' : (status === 'error' ? 'Connection Error' : 'Connecting...');
    }
    updateLastUpdate() {
        const el = document.getElementById('lastUpdate');
        if (el) el.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Check if configuration exists
    if (!window.DASHBOARD_CONFIG) {
        console.error("Configuration missing! Make sure window.DASHBOARD_CONFIG is defined in index.html");
        return;
    }
    window.dashboard = new TractorDashboard(window.DASHBOARD_CONFIG);
});
