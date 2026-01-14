#!/usr/bin/env python3
"""
Cloud Sync Module - Simple HTTP Version (No Google Cloud Project Needed!)
=========================================================================

This version sends data to Google Apps Script Web App via HTTP POST.
Much simpler setup - just need a Google Sheet with Apps Script.

When there's no internet, data is stored locally in SQLite
and automatically uploaded when connectivity is restored.
"""

import json
import yaml
import logging
import time
import threading
import sqlite3
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
from contextlib import contextmanager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class OfflineStorage:
    """
    Persistent offline storage using SQLite database.
    Data survives Pi restarts and is uploaded when internet returns.
    """
    
    def __init__(self, storage_dir: str, max_storage_mb: int = 500):
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = self.storage_dir / "offline_data.db"
        self.max_storage_bytes = max_storage_mb * 1024 * 1024
        self._init_database()
        logger.info(f"Offline storage: {self.db_path}")
    
    def _init_database(self):
        with self._get_connection() as conn:
            conn.execute('''
                CREATE TABLE IF NOT EXISTS pending_uploads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    data TEXT NOT NULL,
                    created_at REAL DEFAULT (strftime('%s', 'now'))
                )
            ''')
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        conn = sqlite3.connect(str(self.db_path), timeout=30)
        try:
            yield conn
        finally:
            conn.close()
    
    def store(self, data: Dict[str, Any]) -> bool:
        try:
            with self._get_connection() as conn:
                conn.execute(
                    'INSERT INTO pending_uploads (timestamp, data) VALUES (?, ?)',
                    (data.get('timestamp', datetime.now().isoformat()), json.dumps(data))
                )
                conn.commit()
            self._enforce_storage_limit()
            return True
        except Exception as e:
            logger.error(f"Failed to store offline: {e}")
            return False
    
    def get_pending_count(self) -> int:
        try:
            with self._get_connection() as conn:
                cursor = conn.execute('SELECT COUNT(*) FROM pending_uploads')
                return cursor.fetchone()[0]
        except:
            return 0
    
    def get_pending_batch(self, batch_size: int = 50) -> List[tuple]:
        try:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    'SELECT id, data FROM pending_uploads ORDER BY created_at ASC LIMIT ?',
                    (batch_size,)
                )
                return [(row[0], json.loads(row[1])) for row in cursor.fetchall()]
        except:
            return []
    
    def mark_uploaded(self, record_ids: List[int]):
        if not record_ids:
            return
        try:
            with self._get_connection() as conn:
                placeholders = ','.join('?' * len(record_ids))
                conn.execute(f'DELETE FROM pending_uploads WHERE id IN ({placeholders})', record_ids)
                conn.commit()
        except Exception as e:
            logger.error(f"Failed to mark uploaded: {e}")
    
    def _enforce_storage_limit(self):
        try:
            if self.db_path.exists() and self.db_path.stat().st_size > self.max_storage_bytes:
                with self._get_connection() as conn:
                    conn.execute('''
                        DELETE FROM pending_uploads WHERE id IN (
                            SELECT id FROM pending_uploads ORDER BY created_at ASC LIMIT 100
                        )
                    ''')
                    conn.commit()
                    logger.warning("Storage limit reached - deleted oldest records")
        except:
            pass
    
    def get_storage_stats(self) -> Dict[str, Any]:
        db_size = self.db_path.stat().st_size if self.db_path.exists() else 0
        return {
            'pending_records': self.get_pending_count(),
            'storage_used_mb': round(db_size / (1024 * 1024), 2),
            'storage_limit_mb': round(self.max_storage_bytes / (1024 * 1024), 2)
        }


class CloudSync:
    """
    Sends data to Google Apps Script Web App via HTTP POST.
    No Google Cloud project or service account needed!
    """
    
    def __init__(self, config_path: str = "config.yaml"):
        self.config = self._load_config(config_path)
        self.webapp_url = self.config.get('apps_script', {}).get('webapp_url', '')
        self.offline_config = self.config.get('offline', {})
        
        # Initialize offline storage
        storage_dir = self.offline_config.get('storage_dir', '/home/pi/j1939-logger/offline_data')
        max_storage = self.offline_config.get('max_storage_mb', 500)
        self.offline_storage = OfflineStorage(storage_dir, max_storage)
        
        self._sync_running = False
        self._sync_thread = None
        
        if not self.webapp_url or self.webapp_url == 'YOUR_WEBAPP_URL_HERE':
            logger.warning("⚠️  Apps Script Web App URL not configured in config.yaml")
    
    def _load_config(self, config_path: str) -> dict:
        config_file = Path(__file__).parent / config_path
        with open(config_file, 'r') as f:
            return yaml.safe_load(f)
    
    def is_online(self) -> bool:
        """Check internet connectivity."""
        try:
            urllib.request.urlopen('https://www.google.com', timeout=5)
            return True
        except:
            return False
    
    def upload(self, data: Dict[str, Any]) -> bool:
        """Upload data to Apps Script. If offline, store locally."""
        if not self.is_online():
            logger.info("Offline - storing data locally")
            return self.offline_storage.store(data)
        
        if self._upload_to_webapp([data]):
            return True
        else:
            return self.offline_storage.store(data)
    
    def _upload_to_webapp(self, data_list: List[Dict[str, Any]]) -> bool:
        """Send data to Google Apps Script Web App."""
        if not data_list:
            return True
        
        if not self.webapp_url or self.webapp_url == 'YOUR_WEBAPP_URL_HERE':
            logger.error("Apps Script Web App URL not configured!")
            return False
        
        try:
            # Prepare request
            json_data = json.dumps(data_list).encode('utf-8')
            req = urllib.request.Request(
                self.webapp_url,
                data=json_data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            
            # Send request
            with urllib.request.urlopen(req, timeout=30) as response:
                result = json.loads(response.read().decode('utf-8'))
                
                if result.get('status') == 'ok':
                    logger.info(f"✓ Uploaded {len(data_list)} record(s) to Google Sheets")
                    return True
                else:
                    logger.error(f"Upload error: {result.get('message')}")
                    return False
                    
        except urllib.error.HTTPError as e:
            logger.error(f"HTTP error: {e.code} - {e.reason}")
            return False
        except Exception as e:
            logger.error(f"Upload failed: {e}")
            return False
    
    def sync_offline_data(self) -> int:
        """Upload all pending offline data."""
        if not self.is_online():
            return 0
        
        pending = self.offline_storage.get_pending_count()
        if pending == 0:
            return 0
        
        logger.info(f"Syncing {pending} offline records...")
        uploaded = 0
        
        while True:
            batch = self.offline_storage.get_pending_batch(50)
            if not batch:
                break
            
            record_ids = [r[0] for r in batch]
            data_list = [r[1] for r in batch]
            
            if self._upload_to_webapp(data_list):
                self.offline_storage.mark_uploaded(record_ids)
                uploaded += len(record_ids)
            else:
                break
            
            time.sleep(1)  # Rate limiting
        
        logger.info(f"Synced {uploaded} records")
        return uploaded
    
    def start_background_sync(self, interval: int = 60):
        """Start background thread to sync offline data."""
        if self._sync_running:
            return
        
        self._sync_running = True
        
        def sync_loop():
            while self._sync_running:
                try:
                    if self.is_online() and self.offline_storage.get_pending_count() > 0:
                        self.sync_offline_data()
                except Exception as e:
                    logger.error(f"Sync error: {e}")
                time.sleep(interval)
        
        self._sync_thread = threading.Thread(target=sync_loop, daemon=True)
        self._sync_thread.start()
        logger.info(f"Background sync started (every {interval}s)")
    
    def stop_background_sync(self):
        self._sync_running = False
    
    def get_status(self) -> Dict[str, Any]:
        stats = self.offline_storage.get_storage_stats()
        return {
            'online': self.is_online(),
            'webapp_configured': bool(self.webapp_url and self.webapp_url != 'YOUR_WEBAPP_URL_HERE'),
            **stats
        }


class DataLogger:
    """Main logger that combines CAN reading and cloud sync."""
    
    def __init__(self, config_path: str = "config.yaml"):
        from j1939_reader import J1939Reader
        
        self.reader = J1939Reader(config_path)
        self.sync = CloudSync(config_path)
        self.running = False
        
        config_file = Path(__file__).parent / config_path
        with open(config_file, 'r') as f:
            config = yaml.safe_load(f)
        self.interval = config['sampling']['interval']
    
    def start(self):
        logger.info("=" * 50)
        logger.info("J1939 TRACTOR DATA LOGGER")
        logger.info("=" * 50)
        
        # Check configuration
        status = self.sync.get_status()
        if not status['webapp_configured']:
            logger.error("❌ Apps Script Web App URL not configured!")
            logger.info("Edit config.yaml and set apps_script.webapp_url")
            return
        
        if not self.reader.connect():
            logger.error("Failed to connect to CAN bus")
            return
        
        self.sync.start_background_sync()
        self.running = True
        
        # Start CAN reading
        read_thread = threading.Thread(target=self.reader.read_messages)
        read_thread.daemon = True
        read_thread.start()
        
        logger.info(f"Logging every {self.interval} seconds. Ctrl+C to stop.")
        
        try:
            while self.running:
                time.sleep(self.interval)
                snapshot = self.reader.get_latest_snapshot()
                
                if snapshot['signals']:
                    self.sync.upload(snapshot)
                    pending = self.sync.offline_storage.get_pending_count()
                    if pending > 0:
                        logger.info(f"Data captured (pending offline: {pending})")
                    else:
                        logger.info("Data captured and uploaded ✓")
        except KeyboardInterrupt:
            pass
        finally:
            self.stop()
    
    def stop(self):
        self.running = False
        self.reader.stop()
        self.reader.disconnect()
        self.sync.stop_background_sync()
        status = self.sync.get_status()
        logger.info(f"Stopped. Pending: {status['pending_records']} records")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='J1939 Logger (Apps Script version)')
    parser.add_argument('--config', default='config.yaml')
    parser.add_argument('--test', action='store_true', help='Test connection')
    parser.add_argument('--status', action='store_true', help='Show status')
    parser.add_argument('--sync', action='store_true', help='Sync offline data')
    args = parser.parse_args()
    
    if args.test:
        print("\n🔧 Testing Apps Script Connection...")
        print("-" * 40)
        
        sync = CloudSync(args.config)
        status = sync.get_status()
        
        print(f"Internet: {'✓ Online' if status['online'] else '✗ Offline'}")
        print(f"Web App URL: {'✓ Configured' if status['webapp_configured'] else '✗ Not set'}")
        
        if status['online'] and status['webapp_configured']:
            test_data = {
                'timestamp': datetime.now().isoformat(),
                'signals': {
                    'EngineSpeed': 1500,
                    'EngineCoolantTemp': 85,
                    'FuelLevel': 75,
                    'Latitude': 40.7128,
                    'Longitude': -74.0060
                }
            }
            if sync._upload_to_webapp([test_data]):
                print("✓ Test data sent successfully!")
            else:
                print("✗ Failed to send test data")
        
    elif args.status:
        print("\n📊 Status")
        print("-" * 40)
        sync = CloudSync(args.config)
        status = sync.get_status()
        for key, value in status.items():
            print(f"{key}: {value}")
        
    elif args.sync:
        print("\n🔄 Syncing offline data...")
        sync = CloudSync(args.config)
        uploaded = sync.sync_offline_data()
        print(f"Uploaded {uploaded} records")
        
    else:
        logger = DataLogger(args.config)
        logger.start()


if __name__ == "__main__":
    main()
