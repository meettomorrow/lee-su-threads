#!/bin/bash

# Package script for Lee-Su-Threads Extension (Chrome and Firefox)

set -e

# Get the script's directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Build the extension first
echo "🔨 Building extension..."
npm run build

# Get version from manifest.json in dist/chrome/
VERSION=$(grep '"version"' dist/chrome/manifest.json | sed 's/.*"version": "\(.*\)".*/\1/')

echo "📦 Packaging Lee-Su-Threads v${VERSION}..."

# Create dist-zip directory if it doesn't exist
mkdir -p dist-zip

# ========== Chrome Build ==========
echo ""
echo "🌐 Building Chrome extension..."

# Create Chrome zip directly from dist/chrome (excluding source maps)
cd dist/chrome
zip -r "$PROJECT_ROOT/dist-zip/lee-su-threads-chrome-v${VERSION}.zip" . -x "*.DS_Store" "*.map"
cd "$PROJECT_ROOT"

echo "✅ Created dist-zip/lee-su-threads-chrome-v${VERSION}.zip"
echo "📊 Size: $(du -h dist-zip/lee-su-threads-chrome-v${VERSION}.zip | cut -f1)"

# ========== Firefox Build ==========
echo ""
echo "🦊 Building Firefox extension..."

# Check if firefox-amo directory exists (AMO unlisted build)
if [ ! -d "dist/firefox-amo" ]; then
  echo "❌ Error: dist/firefox-amo/ not found"
  echo "   Run 'npm run build:firefox-amo' first"
  exit 1
fi

echo "📦 Building AMO version (for unlisted review)..."
cd dist/firefox-amo
zip -r "$PROJECT_ROOT/dist-zip/lee-su-threads-firefox-v${VERSION}-amo.zip" . -x "*.DS_Store" "*.map"
cd "$PROJECT_ROOT"

echo "✅ Created dist-zip/lee-su-threads-firefox-v${VERSION}-amo.zip (AMO unlisted)"
echo "📊 Size: $(du -h dist-zip/lee-su-threads-firefox-v${VERSION}-amo.zip | cut -f1)"

echo ""
echo "🎉 All builds complete!"
echo ""
echo "Chrome:  dist-zip/lee-su-threads-chrome-v${VERSION}.zip"

echo "Firefox (AMO): dist-zip/lee-su-threads-firefox-v${VERSION}-amo.zip"
if [ -d "dist/firefox-direct" ]; then
  echo "Firefox (Direct Install): Will be signed and created as .xpi in CI"
fi
