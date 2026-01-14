# Hardware Requirements

## Essential Components

| Component | Specs | Approx. Cost | Notes |
|-----------|-------|--------------|-------|
| Raspberry Pi 4 | 4GB+ RAM | $55-75 | 8GB preferred for reliability |
| CAN Bus HAT | MCP2515 based | $20-40 | PiCAN2, Waveshare RS485 CAN |
| MicroSD Card | 32GB+ Class 10 | $10-15 | Industrial grade recommended |
| Power Supply | 12V → 5V 3A | $15-25 | Must handle tractor 12V power |
| Enclosure | Weatherproof | $15-30 | IP65 or better for field use |
| CAN Cable | 2-wire shielded | $10-20 | Connects to tractor diagnostic port |

**Total Estimated Cost: $125-205**

---

## Recommended CAN HAT Options

### 1. PiCAN2 (Recommended)
- Proven J1939 compatibility
- 120Ω termination jumper
- LED indicators
- ~$40

### 2. Waveshare RS485 CAN HAT
- Dual RS485 + CAN
- Good for expanding later
- ~$25

### 3. Seeed Studio CAN Shield
- Industrial-grade
- Extended temperature range
- ~$35

---

## Power Considerations

Tractors provide 12V DC. Use a buck converter:
- Input: 7-36V DC (handles starting surges)
- Output: 5V 3A minimum
- Example: LM2596 module or automotive USB adapter

**Important**: Add a fuse (5A) between tractor power and converter.

---

## Optional: GPS Enhancement

If your tractor doesn't broadcast GPS over J1939:

| Component | Purpose | Cost |
|-----------|---------|------|
| GPS Module | Adafruit Ultimate GPS | $40 |
| Antenna | External for cab mounting | $15 |

Connect via UART GPIO pins on Pi.
