#!/usr/bin/env python3
"""
J1939 CAN Bus Reader for Tractor Data Logging
Reads J1939 messages, decodes using DBC file, and buffers for cloud upload.
"""

import can
import cantools
import yaml
import logging
import time
import threading
from datetime import datetime
from pathlib import Path
from collections import deque
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class J1939Reader:
    """Reads and decodes J1939 messages from CAN bus."""
    
    # J1939 PGN extraction constants
    PDU_FORMAT_MASK = 0xFF00
    PDU_SPECIFIC_MASK = 0xFF
    
    def __init__(self, config_path: str = "config.yaml"):
        """Initialize the J1939 reader with configuration."""
        self.config = self._load_config(config_path)
        self.dbc = self._load_dbc()
        self.bus: Optional[can.Bus] = None
        self.data_buffer: deque = deque(maxlen=self.config['sampling']['max_buffer_size'])
        self.latest_data: Dict[str, Any] = {}
        self.running = False
        self._lock = threading.Lock()
        
    def _load_config(self, config_path: str) -> dict:
        """Load configuration from YAML file."""
        config_file = Path(__file__).parent / config_path
        with open(config_file, 'r') as f:
            return yaml.safe_load(f)
    
    def _load_dbc(self) -> cantools.database.Database:
        """Load J1939 DBC file for message decoding."""
        dbc_path = Path(__file__).parent / "j1939.dbc"
        try:
            db = cantools.database.load_file(str(dbc_path))
            logger.info(f"Loaded DBC with {len(db.messages)} message definitions")
            return db
        except Exception as e:
            logger.error(f"Failed to load DBC file: {e}")
            raise
    
    def _extract_pgn(self, can_id: int) -> int:
        """Extract PGN from 29-bit J1939 CAN ID."""
        # J1939 29-bit ID format:
        # Priority (3 bits) | Reserved (1 bit) | Data Page (1 bit) | PDU Format (8 bits) | 
        # PDU Specific (8 bits) | Source Address (8 bits)
        pdu_format = (can_id >> 16) & 0xFF
        pdu_specific = (can_id >> 8) & 0xFF
        
        if pdu_format < 240:
            # PDU1 format: PGN = PDU Format << 8
            pgn = pdu_format << 8
        else:
            # PDU2 format: PGN = (PDU Format << 8) + PDU Specific
            pgn = (pdu_format << 8) + pdu_specific
        
        return pgn
    
    def _decode_message(self, msg: can.Message) -> Optional[Dict[str, Any]]:
        """Decode a CAN message using the DBC file."""
        try:
            # Try to find and decode the message
            decoded = self.dbc.decode_message(msg.arbitration_id, msg.data)
            pgn = self._extract_pgn(msg.arbitration_id)
            
            return {
                'timestamp': datetime.fromtimestamp(msg.timestamp).isoformat(),
                'pgn': pgn,
                'signals': decoded
            }
        except KeyError:
            # Unknown message ID
            if self.config['can'].get('log_unknown', False):
                pgn = self._extract_pgn(msg.arbitration_id)
                return {
                    'timestamp': datetime.fromtimestamp(msg.timestamp).isoformat(),
                    'pgn': pgn,
                    'raw_data': msg.data.hex(),
                    'unknown': True
                }
            return None
        except Exception as e:
            logger.debug(f"Failed to decode message {hex(msg.arbitration_id)}: {e}")
            return None
    
    def connect(self) -> bool:
        """Connect to the CAN bus interface."""
        try:
            channel = self.config['can']['interface']
            self.bus = can.Bus(
                channel=channel,
                interface='socketcan'
            )
            logger.info(f"Connected to CAN interface: {channel}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to CAN bus: {e}")
            return False
    
    def disconnect(self):
        """Disconnect from the CAN bus."""
        if self.bus:
            self.bus.shutdown()
            self.bus = None
            logger.info("Disconnected from CAN bus")
    
    def _update_latest_data(self, decoded: Dict[str, Any]):
        """Update the latest data dictionary with decoded signals."""
        with self._lock:
            if 'signals' in decoded:
                for signal_name, value in decoded['signals'].items():
                    self.latest_data[signal_name] = {
                        'value': value,
                        'timestamp': decoded['timestamp'],
                        'pgn': decoded['pgn']
                    }
    
    def read_messages(self, duration: float = None):
        """
        Read messages from the CAN bus.
        
        Args:
            duration: How long to read (seconds). None = indefinitely.
        """
        if not self.bus:
            logger.error("Not connected to CAN bus")
            return
        
        self.running = True
        start_time = time.time()
        message_count = 0
        
        logger.info("Starting to read CAN messages...")
        
        try:
            while self.running:
                if duration and (time.time() - start_time) >= duration:
                    break
                
                msg = self.bus.recv(timeout=1.0)
                if msg:
                    decoded = self._decode_message(msg)
                    if decoded:
                        self._update_latest_data(decoded)
                        message_count += 1
                        
                        if message_count % 100 == 0:
                            logger.debug(f"Processed {message_count} messages")
                            
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        finally:
            self.running = False
            logger.info(f"Read {message_count} messages total")
    
    def get_latest_snapshot(self) -> Dict[str, Any]:
        """Get a snapshot of the latest data from all signals."""
        with self._lock:
            snapshot = {
                'timestamp': datetime.now().isoformat(),
                'signals': {}
            }
            
            for signal_name, data in self.latest_data.items():
                snapshot['signals'][signal_name] = data['value']
            
            return snapshot
    
    def add_to_buffer(self, data: Dict[str, Any]):
        """Add data to the upload buffer."""
        self.data_buffer.append(data)
    
    def get_buffered_data(self) -> list:
        """Get and clear all buffered data."""
        with self._lock:
            data = list(self.data_buffer)
            self.data_buffer.clear()
            return data
    
    def stop(self):
        """Stop reading messages."""
        self.running = False


def main():
    """Main entry point for testing."""
    reader = J1939Reader()
    
    if reader.connect():
        try:
            # Read for 60 seconds
            reader.read_messages(duration=60)
            
            # Print latest data
            snapshot = reader.get_latest_snapshot()
            print("\nLatest Data:")
            for signal, value in snapshot['signals'].items():
                print(f"  {signal}: {value}")
                
        finally:
            reader.disconnect()
    else:
        print("Failed to connect to CAN bus")
        print("Make sure to run: sudo ./can_config.sh")


if __name__ == "__main__":
    main()
