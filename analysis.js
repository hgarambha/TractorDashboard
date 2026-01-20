/**
 * Advanced Data Analysis Module
 * Handles the logic for the detailed overlay view.
 */

class AnalysisMod {
    constructor(dashboard) {
        this.dashboard = dashboard;
        this.isOpen = false;
        this.currentParam = null;
        this.chart = null;
    }

    // List of parameters available for analysis
    getAvailableParams() {
        return [
            { id: 'EngineSpeed', label: 'Engine RPM', color: '#3b82f6' },
            { id: 'WheelBasedVehicleSpeed', label: 'Speed (km/h)', color: '#10b981' },
            { id: 'FuelLevel', label: 'Fuel Level (%)', color: '#f59e0b' },
            { id: 'EngineCoolantTemp', label: 'Coolant Temp (°C)', color: '#ef4444' },
            { id: 'EngineOilPressure', label: 'Oil Pressure (kPa)', color: '#8b5cf6' },
            { id: 'EnginePercentTorque', label: 'Torque (%)', color: '#ec4899' },
            { id: 'Altitude', label: 'Altitude (m)', color: '#6366f1' }
        ];
    }

    open(paramId) {
        if (this.isOpen) return;
        this.isOpen = true;
        this.currentParam = paramId;

        this.renderOverlay();
        this.setupChart(paramId);
        this.loadData();
    }

    close() {
        const overlay = document.getElementById('analysisOverlay');
        if (overlay) overlay.remove();
        this.isOpen = false;
        this.chart = null;
    }

    renderOverlay() {
        const params = this.getAvailableParams();
        const mainParam = params.find(p => p.id === this.currentParam) || params[0];

        const html = `
            <div id="analysisOverlay" class="analysis-overlay">
                <div class="analysis-header">
                    <div class="analysis-title">
                        <h2>📊 ${mainParam.label} Analysis</h2>
                    </div>
                    <div class="analysis-controls">
                        <div id="custom-date-range" class="custom-date-range" style="display: none; gap: 5px; align-items: center; margin-right: 10px;">
                            <input type="date" id="analysisStart" class="date-input">
                            <span style="color: #888;">to</span>
                            <input type="date" id="analysisEnd" class="date-input">
                            <button onclick="analysis.applyCustomRange()" class="btn-sm">Go</button>
                        </div>
                        <select id="analysisTimeRange" class="time-select">
                            <option value="1h">Last 1 Hour</option>
                            <option value="6h">Last 6 Hours</option>
                            <option value="24h">Last 24 Hours</option>
                            <option value="custom">Custom Range</option>
                        </select>
                        <button class="close-analysis-btn" onclick="analysis.close()">×</button>
                    </div>
                </div>
                
                <div class="analysis-body">
                    <aside class="analysis-sidebar">
                        <h3>Compare With</h3>
                        <div class="compare-list">
                            ${params.filter(p => p.id !== this.currentParam).map(p => `
                                <div class="compare-item">
                                    <input type="checkbox" id="chk_${p.id}" class="compare-checkbox" 
                                           data-param="${p.id}" onchange="analysis.updateComparison()">
                                    <label for="chk_${p.id}">${p.label}</label>
                                </div>
                            `).join('')}
                        </div>
                    </aside>
                    
                    <main class="analysis-chart-container">
                        <div class="chart-stats-summary">
                            <div class="summary-card">
                                <div class="summary-label">Current</div>
                                <div class="summary-val" id="statCurrent">--</div>
                            </div>
                            <div class="summary-card">
                                <div class="summary-label">Average</div>
                                <div class="summary-val" id="statAvg">--</div>
                            </div>
                            <div class="summary-card">
                                <div class="summary-label">Min</div>
                                <div class="summary-val" id="statMin">--</div>
                            </div>
                            <div class="summary-card">
                                <div class="summary-label">Max</div>
                                <div class="summary-val" id="statMax">--</div>
                            </div>
                        </div>
                        <div class="analysis-chart-wrapper">
                            <canvas id="analysisChart"></canvas>
                        </div>
                    </main>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);

        // Bind time change
        document.getElementById('analysisTimeRange').addEventListener('change', (e) => {
            this.loadData(e.target.value);
        });
    }

    setupChart(mainParamId) {
        const ctx = document.getElementById('analysisChart').getContext('2d');
        const paramConfig = this.getAvailableParams().find(p => p.id === mainParamId);

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: paramConfig.label,
                    data: [],
                    borderColor: paramConfig.color,
                    backgroundColor: paramConfig.color + '20',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: { legend: { position: 'top' } },
                scales: {
                    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                    y: {
                        position: 'left',
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: '#888' },
                        title: { display: true, text: paramConfig.label }
                    }
                }
            }
        });
    }

    loadData(range = '1h') {
        const customControls = document.getElementById('custom-date-range');

        // Persist "custom" visibility if we are in custom mode
        if (range === 'custom' || range === 'custom_date') {
            if (customControls) {
                customControls.style.display = 'flex';
                customControls.style.visibility = 'visible'; // Ensure it's not hidden
            }
            if (range === 'custom') return; // Wait for user to click "Go"
        } else {
            if (customControls) customControls.style.display = 'none';
        }

        let data = this.dashboard.data; // Already sorted Newest -> Oldest
        let filtered = [];

        // Synchronize: if we are updating (e.g. comparison added), use existing dates
        const currentRange = document.getElementById('analysisTimeRange').value;

        if (range === 'custom_date' || (currentRange === 'custom' && range === 'refresh')) {
            const startStr = document.getElementById('analysisStart').value;
            const endStr = document.getElementById('analysisEnd').value;
            if (!startStr || !endStr) return;

            const start = new Date(startStr);
            const end = new Date(endStr);
            end.setHours(23, 59, 59, 999); // End of day

            filtered = data.filter(d => d.date >= start && d.date <= end).reverse();
        } else {
            const rangeToUse = range === 'refresh' ? currentRange : range;
            if (rangeToUse === 'custom' || rangeToUse === 'custom_date') {
                // Recursive call or similar logic to handle sync
                this.loadData('custom_date');
                return;
            }
            const hours = rangeToUse === '24h' ? 24 : (rangeToUse === '6h' ? 6 : 1);
            const now = new Date();
            const cutoff = new Date(now - hours * 3600000);
            filtered = data.filter(d => d.date >= cutoff).reverse(); // Oldest first
        }

        this.updateChartData(filtered);
        this.calculateStats(filtered);
    }

    applyCustomRange() {
        this.loadData('custom_date');
    }

    updateChartData(data) {
        if (!this.chart) return;

        const labels = data.map(d => d.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
        this.chart.data.labels = labels;

        // Update main dataset
        const mainParam = this.currentParam;
        this.chart.data.datasets[0].data = data.map(d => d[mainParam]);

        // Update comparison datasets
        const checkboxes = document.querySelectorAll('.compare-checkbox:checked');

        // Remove old comparison datasets (keep first one)
        this.chart.data.datasets = [this.chart.data.datasets[0]];
        this.chart.options.scales = {
            x: this.chart.options.scales.x,
            y: this.chart.options.scales.y
        };

        checkboxes.forEach((chk, index) => {
            const pid = chk.dataset.param;
            const pConfig = this.getAvailableParams().find(p => p.id === pid);
            const axisId = 'y' + (index + 1);

            this.chart.data.datasets.push({
                label: pConfig.label,
                data: data.map(d => d[pid]),
                borderColor: pConfig.color,
                borderDash: [5, 5],
                fill: false,
                tension: 0.3,
                yAxisID: axisId
            });

            // Add scale
            this.chart.options.scales[axisId] = {
                position: index % 2 === 0 ? 'right' : 'right', // Stack on right for now
                grid: { drawOnChartArea: false },
                ticks: { color: pConfig.color },
                title: { display: true, text: pConfig.label, color: pConfig.color }
            };
        });

        this.chart.update();
    }

    updateComparison() {
        // Trigger reload using 'refresh' mode which preserves current range (including custom)
        this.loadData('refresh');
    }

    calculateStats(data) {
        if (data.length === 0) return;
        const values = data.map(d => parseFloat(d[this.currentParam]) || 0);

        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const current = values[values.length - 1]; // Last item

        document.getElementById('statCurrent').innerText = current.toFixed(1);
        document.getElementById('statAvg').innerText = avg.toFixed(1);
        document.getElementById('statMin').innerText = min.toFixed(1);
        document.getElementById('statMax').innerText = max.toFixed(1);
    }
}

// Attach to window
window.initAnalysis = (dashboard) => {
    window.analysis = new AnalysisMod(dashboard);
};
