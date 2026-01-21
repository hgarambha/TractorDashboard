/**
 * Tractor Map - Leaflet + OpenStreetMap Integration
 * Live position tracking and historical path display
 */

class TractorMap {
    constructor() {
        this.map = null;
        this.marker = null;
        this.historyPath = null;
        this.historyMarkers = [];
        this.showHistory = false;

        this.init();
    }

    init() {
        // Initialize map centered on default location
        this.map = L.map('map', {
            center: [40.7128, -74.0060],
            zoom: 15,
            zoomControl: true
        });

        // Add OpenStreetMap tiles (100% free!)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: 19
        }).addTo(this.map);

        // Create custom tractor icon
        this.tractorIcon = L.divIcon({
            className: 'tractor-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        // Create history path style
        this.pathStyle = {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8,
            smoothFactor: 1
        };

        this.setupControls();
    }

    setupControls() {
        const liveBtn = document.getElementById('showLiveBtn');
        const historyBtn = document.getElementById('showHistoryBtn');
        const timeSelector = document.getElementById('mapTimeSelector');
        const timeBtns = timeSelector ? timeSelector.querySelectorAll('.time-btn') : [];

        // Handle Time Range Click
        timeBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active from all
                timeBtns.forEach(b => b.classList.remove('active'));
                // Add to clicked
                e.target.classList.add('active');

                // Redraw history with new range
                const range = e.target.dataset.range; // 1h, 6h, 24h
                if (window.dashboard && window.dashboard.data) {
                    this.updateHistory(window.dashboard.data.slice().reverse(), range);
                }
            });
        });

        if (liveBtn) {
            liveBtn.addEventListener('click', () => {
                console.log('Map: Switching to Live Mode');
                this.showHistory = false;
                liveBtn.classList.add('active');
                historyBtn.classList.remove('active');
                if (timeSelector) timeSelector.style.display = 'none';

                this.clearHistory();
                this.map.invalidateSize();

                if (this.marker) {
                    const latlng = this.marker.getLatLng();
                    this.map.setView(latlng, 15);
                    this.map.panTo(latlng);
                }
            });
        }

        if (historyBtn) {
            historyBtn.addEventListener('click', () => {
                console.log('Map: Switching to History Mode');
                this.showHistory = true;
                historyBtn.classList.add('active');
                liveBtn.classList.remove('active');
                if (timeSelector) timeSelector.style.display = 'flex';

                this.map.invalidateSize();

                // Check for data immediately
                if (window.dashboard && window.dashboard.data && window.dashboard.data.length > 0) {
                    // Default to 1h for performance
                    const activeTimeBtn = timeSelector ? timeSelector.querySelector('.active') : null;
                    const range = activeTimeBtn ? activeTimeBtn.dataset.range : '1h';

                    console.log(`Map: Loading history (${range})...`);
                    this.updateHistory(window.dashboard.data.slice().reverse(), range);
                } else {
                    console.warn('Map: No data available for history yet.');
                }
            });
        }
    }

    updatePosition(lat, lon, heading) {
        if (!lat || !lon || isNaN(lat) || isNaN(lon)) return;

        const position = [lat, lon];

        if (!this.marker) {
            // Create marker on first position
            this.marker = L.marker(position, {
                icon: this.tractorIcon,
                rotationAngle: heading || 0
            }).addTo(this.map);

            // Add popup
            this.marker.bindPopup(`
                <div style="text-align: center; font-family: Inter, sans-serif;">
                    <strong>🚜 Tractor</strong><br>
                    <small>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}</small>
                </div>
            `);

            // Center map on first position
            this.map.setView(position, 15);
        } else {
            // Update marker position
            this.marker.setLatLng(position);

            // Update popup content
            this.marker.setPopupContent(`
                <div style="text-align: center; font-family: Inter, sans-serif;">
                    <strong>🚜 Tractor</strong><br>
                    <small>Lat: ${lat.toFixed(6)}<br>Lon: ${lon.toFixed(6)}</small>
                </div>
            `);
        }

        // Pan to marker if in live mode
        if (!this.showHistory) {
            this.map.panTo(position);
        }
    }

    updateHistory(data, range = '1h') {
        if (!this.showHistory) {
            return;
        }

        // Filter by time range
        const now = new Date();
        const hrs = range === '24h' ? 24 : (range === '6h' ? 6 : 1);
        const cutoff = new Date(now - hrs * 3600000);

        // Filter data with valid coordinates AND time range
        const validData = data.filter(d =>
            d.Latitude && d.Longitude &&
            !isNaN(d.Latitude) && !isNaN(d.Longitude) &&
            new Date(d.IsoTimestamp || d.date) >= cutoff
        );

        console.log(`Map: Drawing history path for last ${range} (${validData.length} points)`);

        // Clear existing history
        this.clearHistory();

        if (validData.length === 0) return;

        // Create path coordinates
        const coordinates = validData.map(d => [d.Latitude, d.Longitude]);

        // Draw path
        this.historyPath = L.polyline(coordinates, this.pathStyle).addTo(this.map);

        // Add start and end markers
        if (coordinates.length > 1) {
            // Start marker (green)
            const startMarker = L.circleMarker(coordinates[0], {
                radius: 8,
                fillColor: '#10b981',
                color: '#fff',
                weight: 2,
                fillOpacity: 1
            }).addTo(this.map);
            startMarker.bindPopup('Start');
            this.historyMarkers.push(startMarker);

            // End marker (red)
            const endMarker = L.circleMarker(coordinates[coordinates.length - 1], {
                radius: 8,
                fillColor: '#ef4444',
                color: '#fff',
                weight: 2,
                fillOpacity: 1
            }).addTo(this.map);
            endMarker.bindPopup('Current');
            this.historyMarkers.push(endMarker);
        }

        // Fit map to show entire path
        if (this.historyPath) {
            this.map.fitBounds(this.historyPath.getBounds(), {
                padding: [50, 50]
            });
        }
    }

    clearHistory() {
        if (this.historyPath) {
            this.map.removeLayer(this.historyPath);
            this.historyPath = null;
        }

        this.historyMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.historyMarkers = [];
    }

    // Calculate distance between two points (Haversine formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    toRad(deg) {
        return deg * (Math.PI / 180);
    }

    // Get total distance traveled from history
    getTotalDistance(data) {
        let total = 0;
        const validData = data.filter(d =>
            d.Latitude && d.Longitude &&
            !isNaN(d.Latitude) && !isNaN(d.Longitude)
        );

        for (let i = 1; i < validData.length; i++) {
            total += this.calculateDistance(
                validData[i - 1].Latitude,
                validData[i - 1].Longitude,
                validData[i].Latitude,
                validData[i].Longitude
            );
        }

        return total;
    }
}

// Initialize map when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.tractorMap = new TractorMap();
});
