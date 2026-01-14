/**
 * Tractor Dashboard - Data Fetching and Chart Rendering
 * Fetches data from Google Sheets and updates UI
 */

class TractorDashboard {
    constructor(config) {
        this.config = config;
        this.historyChart = null;
        this.data = [];
        this.isConnected = false;
        this.lastUpdate = null;

        this.init();
    }

    async init() {
        this.setupChart();
        this.setupEventListeners();
        await this.fetchData();
        this.startAutoRefresh();
    }

    setupChart() {
        const ctx = document.getElementById('historyChart').getContext('2d');

        this.historyChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Engine RPM',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Speed (km/h)',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'Coolant Temp (°C)',
                        data: [],
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#9ca3af',
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(17, 24, 39, 0.9)',
                        titleColor: '#f9fafb',
                        bodyColor: '#9ca3af',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1
                    }
                },
                scales: {
                    x: {
                        display: true,
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#6b7280',
                            maxTicksLimit: 8
                        }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'RPM',
                            color: '#3b82f6'
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
                        ticks: {
                            color: '#6b7280'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Speed / Temp',
                            color: '#10b981'
                        },
                        grid: {
                            drawOnChartArea: false
                        },
                        ticks: {
                            color: '#6b7280'
                        }
                    }
                }
            }
        });
    }

    setupEventListeners() {
        // Time range selector
        document.querySelectorAll('.time-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.filterDataByRange(e.target.dataset.range);
            });
        });
    }

    async fetchData() {
        try {
            this.updateConnectionStatus('connecting');

            const response = await fetch(
                `https://sheets.googleapis.com/v4/spreadsheets/${this.config.spreadsheetId}/values/${this.config.sheetName}?key=${this.config.apiKey}`
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            this.data = this.parseSheetData(result.values);

            this.updateDashboard();
            this.updateConnectionStatus('connected');
            this.lastUpdate = new Date();
            this.updateLastUpdateTime();

        } catch (error) {
            console.error('Failed to fetch data:', error);
            this.updateConnectionStatus('error');

            // Use demo data if API fails
            if (this.data.length === 0) {
                this.loadDemoData();
            }
        }
    }

    parseSheetData(rows) {
        if (!rows || rows.length < 2) return [];

        const headers = rows[0];
        const data = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const entry = {};

            headers.forEach((header, index) => {
                entry[header] = row[index] || null;
            });

            // Parse timestamp
            if (entry.Timestamp) {
                entry.date = new Date(entry.Timestamp);
            }

            // Parse numeric values
            ['EngineSpeed', 'EngineCoolantTemp', 'FuelLevel', 'WheelBasedVehicleSpeed',
                'Latitude', 'Longitude', 'Heading', 'GPSSpeed', 'Altitude',
                'AmbientAirTemp', 'EngineOilPressure', 'EnginePercentTorque'].forEach(field => {
                    if (entry[field]) {
                        entry[field] = parseFloat(entry[field]);
                    }
                });

            data.push(entry);
        }

        // Sort by timestamp (newest first for latest, but we'll reverse for charts)
        return data.sort((a, b) => (b.date || 0) - (a.date || 0));
    }

    updateDashboard() {
        if (this.data.length === 0) return;

        const latest = this.data[0];

        // Update gauges
        this.updateGauge('rpm', latest.EngineSpeed, 0, 3000);
        this.updateGauge('speed', latest.WheelBasedVehicleSpeed, 0, 50);
        this.updateGauge('fuel', latest.FuelLevel, 0, 100);
        this.updateGauge('temp', latest.EngineCoolantTemp, 0, 120);

        // Update stats
        this.updateStat('oilPressure', latest.EngineOilPressure);
        this.updateStat('ambientTemp', latest.AmbientAirTemp);
        this.updateStat('torque', latest.EnginePercentTorque);
        this.updateStat('altitude', latest.Altitude);

        // Update location
        this.updateLocation(latest.Latitude, latest.Longitude, latest.Heading);

        // Update chart with last hour by default
        this.filterDataByRange('1h');
    }

    updateGauge(name, value, min, max) {
        const valueEl = document.getElementById(`${name}Value`);
        const fillEl = document.getElementById(`${name}Fill`);

        if (valueEl) {
            valueEl.textContent = value !== null && value !== undefined
                ? Math.round(value)
                : '--';
        }

        if (fillEl && value !== null && value !== undefined) {
            const percent = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
            fillEl.style.width = `${percent}%`;
        }
    }

    updateStat(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value !== null && value !== undefined
                ? Math.round(value * 10) / 10
                : '--';
        }
    }

    updateLocation(lat, lon, heading) {
        document.getElementById('latValue').textContent =
            lat !== null ? lat.toFixed(6) : '--';
        document.getElementById('lonValue').textContent =
            lon !== null ? lon.toFixed(6) : '--';
        document.getElementById('headingValue').textContent =
            heading !== null ? `${Math.round(heading)}°` : '--°';

        // Update map if available
        if (window.tractorMap && lat && lon) {
            window.tractorMap.updatePosition(lat, lon, heading);
        }
    }

    filterDataByRange(range) {
        const now = new Date();
        let cutoff;

        switch (range) {
            case '1h':
                cutoff = new Date(now - 60 * 60 * 1000);
                break;
            case '6h':
                cutoff = new Date(now - 6 * 60 * 60 * 1000);
                break;
            case '24h':
                cutoff = new Date(now - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000);
                break;
            default:
                cutoff = new Date(now - 60 * 60 * 1000);
        }

        const filtered = this.data
            .filter(d => d.date && d.date >= cutoff)
            .reverse(); // Chronological order for chart

        this.updateChart(filtered);

        // Update map history
        if (window.tractorMap) {
            window.tractorMap.updateHistory(filtered);
        }
    }

    updateChart(data) {
        if (!this.historyChart) return;

        const labels = data.map(d => {
            if (!d.date) return '';
            return d.date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        });

        this.historyChart.data.labels = labels;
        this.historyChart.data.datasets[0].data = data.map(d => d.EngineSpeed || null);
        this.historyChart.data.datasets[1].data = data.map(d => d.WheelBasedVehicleSpeed || null);
        this.historyChart.data.datasets[2].data = data.map(d => d.EngineCoolantTemp || null);

        this.historyChart.update('none');
    }

    updateConnectionStatus(status) {
        const dot = document.getElementById('connectionStatus');
        const text = document.getElementById('statusText');

        dot.classList.remove('connected', 'error');

        switch (status) {
            case 'connected':
                dot.classList.add('connected');
                text.textContent = 'Connected';
                this.isConnected = true;
                break;
            case 'error':
                dot.classList.add('error');
                text.textContent = 'Connection Error';
                this.isConnected = false;
                break;
            default:
                text.textContent = 'Connecting...';
        }
    }

    updateLastUpdateTime() {
        const el = document.getElementById('lastUpdate');
        if (el && this.lastUpdate) {
            el.textContent = `Last update: ${this.lastUpdate.toLocaleTimeString()}`;
        }
    }

    startAutoRefresh() {
        setInterval(() => {
            this.fetchData();
        }, this.config.refreshInterval);
    }

    loadDemoData() {
        // Generate demo data for testing UI without API
        console.log('Loading demo data...');
        const now = new Date();
        const demoData = [];

        for (let i = 60; i >= 0; i--) {
            demoData.push({
                date: new Date(now - i * 60 * 1000),
                Timestamp: new Date(now - i * 60 * 1000).toISOString(),
                EngineSpeed: 1200 + Math.random() * 800,
                EngineCoolantTemp: 80 + Math.random() * 15,
                FuelLevel: 75 - i * 0.1 + Math.random() * 2,
                WheelBasedVehicleSpeed: 15 + Math.random() * 10,
                Latitude: 40.7128 + (Math.random() - 0.5) * 0.01,
                Longitude: -74.0060 + (Math.random() - 0.5) * 0.01,
                Heading: Math.random() * 360,
                GPSSpeed: 15 + Math.random() * 10,
                Altitude: 50 + Math.random() * 10,
                AmbientAirTemp: 22 + Math.random() * 5,
                EngineOilPressure: 350 + Math.random() * 50,
                EnginePercentTorque: 40 + Math.random() * 30
            });
        }

        this.data = demoData.reverse();
        this.updateDashboard();
        this.updateConnectionStatus('connected');

        document.getElementById('statusText').textContent = 'Demo Mode';
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new TractorDashboard(window.DASHBOARD_CONFIG);
});
