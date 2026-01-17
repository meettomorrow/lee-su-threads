#!/bin/bash

# Setup Safari Xcode Project
# This script creates a permanent Safari extension project in dist-safari/

set -e  # Exit on error

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_SAFARI="$PROJECT_ROOT/dist-safari"
PROJECT_NAME="Lee-Su-Threads"
BUNDLE_ID="com.meettomorrow.leesuthreads"

echo "🍎 Setting up Safari Xcode project..."

# Step 1: Build all extensions (Chrome, Firefox, Safari)
echo ""
echo "📦 Step 1/4: Building extensions..."
cd "$PROJECT_ROOT"
npm run build

if [ ! -d "dist/safari" ]; then
  echo "❌ Error: dist/safari not found. Build failed?"
  exit 1
fi

# Step 2: Create dist-safari directory
echo ""
echo "📁 Step 2/4: Creating dist-safari directory..."
mkdir -p "$DIST_SAFARI"

# Step 3: Convert to Safari extension
echo ""
echo "🔄 Step 3/4: Converting to Safari extension..."
echo "   This will create an Xcode project at:"
echo "   $DIST_SAFARI/safari-project/"

xcrun safari-web-extension-converter dist/safari \
  --project-location "$DIST_SAFARI/safari-project" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --force

# Step 4: Find the .xcodeproj file
echo ""
echo "🔍 Step 4/4: Locating Xcode project..."
XCODE_PROJECT=$(find "$DIST_SAFARI/safari-project" -name "*.xcodeproj" | head -n 1)

if [ -z "$XCODE_PROJECT" ]; then
  echo "❌ Error: Could not find .xcodeproj file"
  exit 1
fi

echo ""
echo "✅ Safari project created successfully!"
echo ""
echo "📂 Project location:"
echo "   $XCODE_PROJECT"
echo ""
echo "🚀 Next steps:"
echo ""
echo "1. Open Xcode project:"
echo "   open \"$XCODE_PROJECT\""
echo ""
echo "2. In Xcode, for EACH target (iOS and macOS):"
echo "   - Select target in left sidebar"
echo "   - Go to 'Signing & Capabilities' tab"
echo "   - Check '☑ Automatically manage signing'"
echo "   - Team: Select your Personal Team"
echo ""
echo "3. Build and run:"
echo "   - Select iOS or macOS target (top toolbar)"
echo "   - Click Run (▶️) or press Cmd+R"
echo ""
echo "4. Enable extension in Safari:"
echo "   - Safari → Settings → Extensions"
echo "   - Enable '$PROJECT_NAME'"
echo ""
echo "💡 Tip: Run this script again anytime to rebuild the project"
echo ""
