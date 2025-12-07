#!/bin/bash

# Run Firefox extension on Android device
# Handles device detection and selection automatically

set -e

# Get the script's directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Check if adb is installed
if ! command -v adb &> /dev/null; then
    echo "❌ Error: adb is not installed or not in PATH"
    echo "Install Android SDK Platform Tools: https://developer.android.com/studio/releases/platform-tools"
    exit 1
fi

# Get list of connected devices
DEVICES=$(adb devices -l | grep -v "List of devices" | grep "device" | awk '{print $1}')
DEVICE_COUNT=$(echo "$DEVICES" | grep -c . || echo "0")

if [ "$DEVICE_COUNT" -eq 0 ]; then
    echo "❌ No Android devices found"
    echo ""
    echo "Make sure:"
    echo "  1. Your Android device is connected via USB"
    echo "  2. USB debugging is enabled on your device"
    echo "  3. You've authorized this computer on your device"
    echo ""
    echo "Run 'adb devices' to check device status"
    exit 1
fi

# If user provided a device ID as argument, use it
if [ -n "$1" ]; then
    DEVICE_ID="$1"
    echo "📱 Using specified device: $DEVICE_ID"
elif [ "$DEVICE_COUNT" -eq 1 ]; then
    # Only one device, use it automatically
    DEVICE_ID="$DEVICES"
    echo "📱 Found one device: $DEVICE_ID"
else
    # Multiple devices, ask user to choose
    echo "📱 Found $DEVICE_COUNT Android devices:"
    echo ""
    adb devices -l
    echo ""
    echo "Available device IDs:"
    echo "$DEVICES" | nl
    echo ""
    read -p "Enter device ID (or number): " SELECTION

    # Check if user entered a number
    if [[ "$SELECTION" =~ ^[0-9]+$ ]]; then
        # Validate number is within range
        if [ "$SELECTION" -lt 1 ] || [ "$SELECTION" -gt "$DEVICE_COUNT" ]; then
            echo "❌ Invalid selection: must be between 1 and $DEVICE_COUNT"
            exit 1
        fi
        DEVICE_ID=$(echo "$DEVICES" | sed -n "${SELECTION}p")
        if [ -z "$DEVICE_ID" ]; then
            echo "❌ Invalid selection"
            exit 1
        fi
    else
        # User entered a device ID directly - basic validation
        if [[ ! "$SELECTION" =~ ^[a-zA-Z0-9._-]+$ ]]; then
            echo "❌ Invalid device ID format"
            exit 1
        fi
        DEVICE_ID="$SELECTION"
    fi

    echo "📱 Selected device: $DEVICE_ID"
fi

# Check if dist/firefox exists
if [ ! -d "dist/firefox" ]; then
    echo "❌ dist/firefox not found. Building extension first..."
    npm run build
fi

# Run web-ext
echo ""
echo "🚀 Starting Firefox on Android device: $DEVICE_ID"
echo "🌐 Opening https://www.threads.com"
echo ""

npx web-ext run --source-dir=dist/firefox -t firefox-android --android-device="$DEVICE_ID" --start-url="https://www.threads.com"
