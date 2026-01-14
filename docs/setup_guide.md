# Complete Setup Guide - J1939 Tractor Data Logger
# (Simple Version - No Google Cloud Project Needed!)

This guide walks you through setting up the tractor data logger using **Google Apps Script** - 
no Google Cloud project or organization required!

---

## 🎯 How It Works

```
TRACTOR                    RASPBERRY PI                 GOOGLE
───────                    ────────────                 ──────
   │                           │                           │
   │ J1939 CAN Bus             │                           │
   ├──────────────────────────►│ Read & Decode             │
   │                           │      │                    │
   │                           │      ▼                    │
   │                           │ Has Internet?             │
   │                           │   │                       │
   │                           │   ├─► YES ─► HTTP POST ──►│ Apps Script
   │                           │   │          to Web App   │     │
   │                           │   │                       │     ▼
   │                           │   └─► NO ──► SQLite       │ Google Sheet
   │                           │              (offline)    │     │
   │                           │                           │     ▼
   │                           │              When online ─┼─► Dashboard
   │                           │              auto-sync    │
```

---

## 📋 Step 1: Create Google Sheet + Apps Script

### 1.1 Create a new Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it: **Tractor Data**

### 1.2 Add the Apps Script

1. In your new spreadsheet, go to **Extensions → Apps Script**
2. Delete any existing code in the editor
3. Copy and paste the entire contents of `appscript/Code.gs`
4. Click **Save** (💾 icon)
5. Name the project: **TractorLogger**

### 1.3 Deploy as Web App

1. Click **Deploy → New Deployment**
2. Click the gear icon ⚙️ next to "Select type" and choose **Web app**
3. Fill in:
   - Description: `Tractor Data API`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**
5. Click **Authorize access** and follow the prompts
6. **COPY THE WEB APP URL** - it looks like:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

### 1.4 Test the Web App

Open the URL in your browser. You should see:
```json
{"status":"ok","message":"J1939 Logger API is running..."}
```

---

## 📋 Step 2: Set Up Raspberry Pi

### 2.1 Initial Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install CAN utilities
sudo apt install -y can-utils python3-pip

# Enable SPI
sudo raspi-config
# → Interface Options → SPI → Enable
sudo reboot
```

### 2.2 Configure CAN Interface

Create `/etc/network/interfaces.d/can0`:
```bash
sudo nano /etc/network/interfaces.d/can0
```

Add:
```
auto can0
iface can0 inet manual
    pre-up /sbin/ip link set can0 type can bitrate 250000
    up /sbin/ifconfig can0 up
    down /sbin/ifconfig can0 down
```

### 2.3 Install Logger Software

```bash
# Create directory
mkdir -p /home/pi/j1939-logger
cd /home/pi/j1939-logger

# Copy files (from your computer)
# Use SCP, USB drive, or git clone

# Install Python dependencies
pip3 install -r requirements.txt
```

### 2.4 Configure the Logger

Edit `config.yaml`:
```bash
nano config.yaml
```

**IMPORTANT:** Paste your Web App URL:
```yaml
apps_script:
  webapp_url: https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

---

## 📋 Step 3: Test Everything

### Test CAN Bus
```bash
# Start CAN interface
sudo ip link set can0 up type can bitrate 250000

# Check for messages (with tractor on)
candump can0
```

### Test Apps Script Connection
```bash
cd /home/pi/j1939-logger
python3 cloud_sync.py --test
```

Expected output:
```
🔧 Testing Apps Script Connection...
----------------------------------------
Internet: ✓ Online
Web App URL: ✓ Configured
✓ Test data sent successfully!
```

Check your Google Sheet - you should see a test row!

---

## 📋 Step 4: Run the Logger

### Manual Start (for testing)
```bash
python3 cloud_sync.py
```

### Auto-Start on Boot
```bash
sudo nano /etc/systemd/system/j1939-logger.service
```

Paste:
```ini
[Unit]
Description=J1939 Tractor Data Logger
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/j1939-logger
ExecStart=/usr/bin/python3 cloud_sync.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable:
```bash
sudo systemctl enable j1939-logger
sudo systemctl start j1939-logger
sudo systemctl status j1939-logger
```

---

## 📋 Step 5: Set Up Dashboard

### Option A: View in Google Sheets

Your data is already in Google Sheets! You can:
- Create charts directly in Sheets
- Use the built-in Explore feature
- Share the sheet with others

### Option B: Web Dashboard (GitHub Pages)

1. Push the `dashboard/` folder to GitHub
2. Update `index.html` with your Sheet's public URL
3. Enable GitHub Pages in Settings
4. Access at `https://yourusername.github.io/yourrepo/`

---

## 🔧 Useful Commands

| Command | Purpose |
|---------|---------|
| `python3 cloud_sync.py` | Start logger |
| `python3 cloud_sync.py --test` | Test connection |
| `python3 cloud_sync.py --status` | View offline storage |
| `python3 cloud_sync.py --sync` | Manually upload offline data |
| `candump can0` | View raw CAN messages |
| `sudo systemctl status j1939-logger` | Check service status |
| `journalctl -u j1939-logger -f` | View live logs |

---

## ❓ Troubleshooting

| Problem | Solution |
|---------|----------|
| "Web App URL not configured" | Edit config.yaml with your URL |
| "Failed to send data" | Check if URL is correct, try in browser |
| No CAN messages | Check wiring, verify bitrate 250000 |
| Data not appearing in Sheet | Check Apps Script deployment settings |
