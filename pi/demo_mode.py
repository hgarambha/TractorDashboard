#!/usr/bin/env python3
"""
Demo Data Generator - Test the system without a real tractor!

Generates fake J1939 data and sends it to Google Sheets via Apps Script.
Use this to verify your setup before deploying to the tractor.

Usage:
    python3 demo_mode.py              # Run demo continuously
    python3 demo_mode.py --once       # Send one data point and exit
    python3 demo_mode.py --count 10   # Send 10 data points
"""

import argparse
import random
import time
import math
from datetime import datetime

# Import from cloud_sync
from cloud_sync import CloudSync


class DemoDataGenerator:
    """Generates realistic fake tractor data."""
    
    def __init__(self):
        # Simulated tractor state
        self.engine_running = True
        self.engine_rpm = 1200
        self.speed = 0
        self.fuel_level = 85
        self.coolant_temp = 75
        self.latitude = 40.7128  # New York
        self.longitude = -74.0060
        self.heading = 0
        self.altitude = 50
        self.ambient_temp = 22
        self.oil_pressure = 350
        self.time_step = 0
        
    def generate(self) -> dict:
        """Generate one data point with realistic variations."""
        self.time_step += 1
        
        # Simulate engine RPM changes
        rpm_target = 1500 + 300 * math.sin(self.time_step * 0.1)
        self.engine_rpm += (rpm_target - self.engine_rpm) * 0.1 + random.uniform(-50, 50)
        self.engine_rpm = max(800, min(2500, self.engine_rpm))
        
        # Simulate speed (0-30 km/h for farm work)
        speed_target = 15 + 10 * math.sin(self.time_step * 0.05)
        self.speed += (speed_target - self.speed) * 0.1 + random.uniform(-1, 1)
        self.speed = max(0, min(30, self.speed))
        
        # Simulate fuel consumption (slowly decreasing)
        self.fuel_level -= random.uniform(0.01, 0.05)
        self.fuel_level = max(0, self.fuel_level)
        
        # Simulate coolant temperature (stabilizes around 85°C)
        temp_target = 85 + random.uniform(-2, 2)
        self.coolant_temp += (temp_target - self.coolant_temp) * 0.05
        
        # Simulate GPS movement (small random walk)
        self.latitude += random.uniform(-0.0001, 0.0001)
        self.longitude += random.uniform(-0.0001, 0.0001)
        self.heading = (self.heading + random.uniform(-5, 5)) % 360
        self.altitude += random.uniform(-0.5, 0.5)
        
        # Simulate ambient temperature (slow changes)
        self.ambient_temp += random.uniform(-0.1, 0.1)
        
        # Simulate oil pressure
        self.oil_pressure = 350 + random.uniform(-20, 20)
        
        # Simulate torque based on speed
        torque = 40 + (self.speed / 30) * 40 + random.uniform(-5, 5)
        
        return {
            'timestamp': datetime.now().isoformat(),
            'signals': {
                'EngineSpeed': round(self.engine_rpm, 1),
                'EngineCoolantTemp': round(self.coolant_temp, 1),
                'FuelLevel': round(self.fuel_level, 1),
                'WheelBasedVehicleSpeed': round(self.speed, 1),
                'Latitude': round(self.latitude, 6),
                'Longitude': round(self.longitude, 6),
                'Heading': round(self.heading, 1),
                'GPSSpeed': round(self.speed, 1),
                'Altitude': round(self.altitude, 1),
                'AmbientAirTemp': round(self.ambient_temp, 1),
                'EngineOilPressure': round(self.oil_pressure, 0),
                'EnginePercentTorque': round(torque, 1)
            }
        }


def run_demo(config_path: str, count: int = None, interval: int = 30):
    """
    Run the demo data generator.
    
    Args:
        config_path: Path to config.yaml
        count: Number of data points to send (None = infinite)
        interval: Seconds between data points
    """
    print("=" * 50)
    print("🚜 TRACTOR DATA LOGGER - DEMO MODE")
    print("=" * 50)
    print()
    
    # Initialize
    sync = CloudSync(config_path)
    generator = DemoDataGenerator()
    
    # Check status
    status = sync.get_status()
    print(f"Internet: {'✓ Online' if status['online'] else '✗ Offline'}")
    print(f"Web App: {'✓ Configured' if status['webapp_configured'] else '✗ Not configured'}")
    print(f"Pending offline: {status['pending_records']}")
    print()
    
    if not status['webapp_configured']:
        print("❌ Error: Apps Script Web App URL not configured!")
        print("Edit config.yaml and add your webapp_url")
        return
    
    print(f"Sending data every {interval} seconds...")
    if count:
        print(f"Will send {count} data points")
    else:
        print("Press Ctrl+C to stop")
    print("-" * 50)
    
    sent = 0
    try:
        while True:
            # Generate fake data
            data = generator.generate()
            
            # Display current values
            signals = data['signals']
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Data #{sent + 1}")
            print(f"  RPM: {signals['EngineSpeed']:.0f} | "
                  f"Speed: {signals['WheelBasedVehicleSpeed']:.1f} km/h | "
                  f"Fuel: {signals['FuelLevel']:.1f}% | "
                  f"Temp: {signals['EngineCoolantTemp']:.1f}°C")
            print(f"  GPS: {signals['Latitude']:.6f}, {signals['Longitude']:.6f} | "
                  f"Heading: {signals['Heading']:.0f}°")
            
            # Upload
            if sync.upload(data):
                print("  → Sent to Google Sheets ✓")
            else:
                print("  → Stored offline (will sync later)")
            
            sent += 1
            
            # Check if done
            if count and sent >= count:
                print(f"\n✓ Sent {sent} data points")
                break
            
            time.sleep(interval)
            
    except KeyboardInterrupt:
        print(f"\n\nStopped. Sent {sent} data points.")
    
    # Final status
    status = sync.get_status()
    if status['pending_records'] > 0:
        print(f"Pending offline records: {status['pending_records']}")


def main():
    parser = argparse.ArgumentParser(
        description='Demo mode - test with fake tractor data',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Examples:
  python3 demo_mode.py               # Run continuously (Ctrl+C to stop)
  python3 demo_mode.py --once        # Send one data point
  python3 demo_mode.py --count 10    # Send 10 data points
  python3 demo_mode.py --interval 5  # Send every 5 seconds
        '''
    )
    parser.add_argument('--config', default='config.yaml', help='Config file')
    parser.add_argument('--once', action='store_true', help='Send one point and exit')
    parser.add_argument('--count', type=int, help='Number of points to send')
    parser.add_argument('--interval', type=int, default=30, help='Seconds between points')
    
    args = parser.parse_args()
    
    count = 1 if args.once else args.count
    run_demo(args.config, count=count, interval=args.interval)


if __name__ == "__main__":
    main()
