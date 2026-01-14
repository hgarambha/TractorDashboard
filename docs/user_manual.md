# 🚜 J1939 Data Logger - User Manual

**Complete guide to installing, using, and maintaining your tractor data logging system.**

---

## 🚀 Quick Start

**System Overview:**
- **Tractor** sends data via CAN Bus.
- **Raspberry Pi** reads data, stores it offline if needed, or sends it to the cloud.
- **Google Sheets** saves your data forever.
- **Web Dashboard** shows live gauges and maps on your phone or computer.

---

## 🛠️ Installation Guide

### Phase 1: Cloud Setup (Do this first)

1.  **Google Sheet**:
    - Create a new Google Sheet named **"Tractor Data"**.
    - Go to **Extensions > Apps Script**.
    - Paste the code from `appscript/Code.gs`.
    - Click **Deploy > New Deployment**.
    - Select type: **Web app**.
    - Details:
        - Execute as: **Me**
        - Who has access: **Anyone**
    - **Deploy** and **COPY THE URL**.

### Phase 2: Raspberry Pi Setup

1.  **Install Software**:
    Copy all files to `/home/pi/j1939-logger/`.
    ```bash
    cd /home/pi/j1939-logger
    sudo ./can_config.sh   # Sets up CAN interface
    pip3 install -r requirements.txt
    ```

2.  **Configure**:
    Edit `config.yaml`:
    ```yaml
    apps_script:
      webapp_url: "https://script.google.com/macros/s/YOUR_COPIED_URL/exec"
    ```

3.  **Run**:
    ```bash
    python3 cloud_sync.py
    ```

### Phase 3: Dashboard Setup

1.  **Configure**:
    Open `dashboard/index.html`.
    Scroll to the bottom and ensure your URL is there:
    ```javascript
    window.DASHBOARD_CONFIG = {
        webAppUrl: 'https://script.google.com/macros/s/YOUR_COPIED_URL/exec',
        refreshInterval: 10000
    };
    ```

2.  **Deploy**:
    Upload the `dashboard` folder to **GitHub**.
    Go to **Settings > Pages** and enable GitHub Pages on the `dashboard` folder (or root).

---

## 📱 Features & Usage

### 1. Offline Mode 📶
- The system naturally handles dead zones.
- If internet produces an error, data is saved to a local database (`offline_data.db`).
- Once online, it automatically uploads pending data in the background.

### 2. Live Dashboard 📊
- **Gauges**: Shows real-time RPM, Speed, Fuel, Temp.
- **Map**: Shows live tractor location (Live Mode) or past routes (History Mode).
- **History**: Click "1H" / "6H" / "24H" to see past performance graphs.

### 3. Demo Mode 🧪
Test the system without a tractor!
```bash
python3 demo_mode.py
```
This sends fake realistic data to your dashboard to verify everything works.

---

## 🔧 Maintenance & Troubleshooting

### Q: Dashboard says "HTTP 400" or won't load?
- **Check Cache**: Hard refresh the page (`Ctrl+F5`).
- **Check Config**: Ensure `index.html` has the correct `webAppUrl`.
- **Check Deployment**: Ensure your Apps Script deployment is set to **"Anyone"**.

### Q: No data in Google Sheets?
- **Check Pi**: Run `python3 cloud_sync.py --test`.
- **Check URL**: Verify the URL in `config.yaml` matches your Web App deployment.

### Q: Wrong Date/Time?
- The Pi sends UTC time. Google Sheets might display it in your local time if configured.

### Q: How to change the sampling rate?
- Edit `config.yaml`:
  ```yaml
  sampling:
    interval: 30  # Seconds between logs
  ```

---

## 📂 File Structure

- `pi/` - Code for the Raspberry Pi.
- `dashboard/` - Website files (HTML, CSS, JS).
- `appscript/` - Code for Google Sheets.
- `docs/` - Use guides.

---

*Built with ❤️ for simple, robust tractor monitoring.*
