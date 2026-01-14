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

        // Refresh Chart (default 1h)
        this.filterDataByRange('1h');
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

