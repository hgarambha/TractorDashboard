#!/bin/bash
# CAN Bus Configuration for J1939 on Raspberry Pi
# Run this script at boot or with sudo

# Bring down the interface if it exists
sudo ip link set can0 down 2>/dev/null

# Set up CAN0 interface at 250kbps (J1939 standard)
sudo ip link set can0 type can bitrate 250000

# Enable triple sampling for better reliability
sudo ip link set can0 type can triple-sampling on

# Bring up the interface
sudo ip link set can0 up

# Verify interface is up
if ip link show can0 | grep -q "UP"; then
    echo "✓ CAN0 interface is UP at 250kbps"
    # Show interface details
    ip -details link show can0
else
    echo "✗ Failed to bring up CAN0 interface"
    exit 1
fi
