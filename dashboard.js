/**
 * Tractor Dashboard - Data Fetching (Apps Script Version)
 * Fixed: Includes cache busting to ensure fresh data on GitHub Pages
 */

class TractorDashboard {
    constructor(config) {
        this.config = config;
        this.chart = null;
        this.data = [];
        this.isConnected = false;

        this.init();
    }

    async init() {
        this.setupChart();
        this.setupEventListeners();
        await this.fetchData();
        this.startAutoRefresh();
    }

    async fetchData() {
        console.log("Fetching data...");
        this.updateConnectionStatus('connecting');

        if (!this.config.webAppUrl || this.config.webAppUrl.includes('YOUR_SCRIPT_ID')) {
            console.warn("Web App URL not configured");
            this.updateConnectionStatus('error');
            if (this.data.length === 0) this.loadDemoData();
            return;
        }

        try {
            // Fetch from Apps Script Web App (GET request)
            // CRITICAL FIX: Add cache busting timestamp and headers
            const url = `${this.config.webAppUrl}?action=view&hours=24&_t=${Date.now()}`;

            const response = await fetch(url, {
                method: 'GET',
                redirect: 'follow', // Follow Google redirects
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8', // Simple content type avoids preflight
                }
            });

            if (!response.ok) throw new Error('Network response was not ok');

            const result = await response.json();

            if (result.status === 'ok' && Array.isArray(result.data)) {
                this.data = this.parseData(result.data);
                this.updateDashboard();
                this.updateConnectionStatus('connected');
                this.updateLastUpdate();
            } else {
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
        })).sort((a, b) => b.date - a.date);
    }

    setupChart() {
        const ctx = document.getElementById('historyChart').getContext('2d');
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

        // Update Gauges & Stats
        this.setText('rpmValue', Math.round(latest.EngineSpeed));
        this.setWidth('rpmFill', this.calcPercent(latest.EngineSpeed, 0, 3000));

        this.setText('speedValue', latest.WheelBasedVehicleSpeed?.toFixed(1));
        this.setWidth('speedFill', this.calcPercent(latest.WheelBasedVehicleSpeed, 0, 40));

        this.setText('fuelValue', Math.round(latest.FuelLevel));
        this.setWidth('fuelFill', this.calcPercent(latest.FuelLevel, 0, 100));

        this.setText('tempValue', Math.round(latest.EngineCoolantTemp));
        this.setWidth('tempFill', this.calcPercent(latest.EngineCoolantTemp, 0, 120));

        this.setText('oilPressure', Math.round(latest.EngineOilPressure));
        this.setText('ambientTemp', latest.AmbientAirTemp?.toFixed(1));
        this.setText('torque', Math.round(latest.EnginePercentTorque));
        this.setText('altitude', Math.round(latest.Altitude));

        this.setText('latValue', latest.Latitude?.toFixed(5));
        this.setText('lonValue', latest.Longitude?.toFixed(5));
        this.setText('headingValue', Math.round(latest.Heading) + '°');

        if (window.tractorMap) {
            window.tractorMap.updatePosition(latest.Latitude, latest.Longitude, latest.Heading);
        }

        this.filterDataByRange('1h');
    }

    filterDataByRange(range) {
        if (this.data.length === 0) return;

        const now = new Date();
        const hours = range === '24h' ? 24 : (range === '6h' ? 6 : 1);
        const cutoff = new Date(now - hours * 60 * 60 * 1000);

        const filtered = this.data.filter(d => d.date >= cutoff).reverse();

        if (!this.historyChart) return;

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
        setInterval(() => this.fetchData(), this.config.refreshInterval || 30000);
    }

    setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = (val !== undefined && val !== null) ? val : '--'; }
    setWidth(id, pct) { const el = document.getElementById(id); if (el) el.style.width = `${pct}%`; }
    calcPercent(val, min, max) { if (val === undefined || val === null) return 0; return Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100)); }
    updateConnectionStatus(status) {
        const dot = document.getElementById('connectionStatus');
        const text = document.getElementById('statusText');
        dot.className = 'status-dot ' + status;
        text.textContent = status === 'connected' ? 'Connected' : (status === 'error' ? 'Error' : 'Connecting...');
    }
    updateLastUpdate() {
        const el = document.getElementById('lastUpdate');
        if (el) el.textContent = `Last update: ${new Date().toLocaleTimeString()}`;
    }

    loadDemoData() { /* Skipping to save space, real data preferred */ }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TractorDashboard(window.DASHBOARD_CONFIG);
});
