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

# Get version from manifest.json in dist/
VERSION=$(grep '"version"' dist/manifest.json | sed 's/.*"version": "\(.*\)".*/\1/')

echo "📦 Packaging Lee-Su-Threads v${VERSION}..."

# Create dist-zip directory if it doesn't exist
mkdir -p dist-zip

# Create a temporary directory for building
TEMP_DIR=$(mktemp -d)
trap "rm -rf '$TEMP_DIR'" EXIT

# ========== Chrome Build ==========
echo ""
echo "🌐 Building Chrome extension..."

CHROME_DIR="$TEMP_DIR/chrome"
mkdir -p "$CHROME_DIR"

# Copy built files from dist/ (excluding Firefox manifest and source maps)
cd dist
cp -r \
  manifest.json \
  background.js \
  content.js \
  injected.js \
  popup.html \
  popup.js \
  styles.css \
  icons \
  _locales \
  "$CHROME_DIR/"
cd "$PROJECT_ROOT"

# Create Chrome zip
cd "$CHROME_DIR"
zip -r "$PROJECT_ROOT/dist-zip/lee-su-threads-chrome-v${VERSION}.zip" . -x "*.DS_Store" "*.map"
cd "$PROJECT_ROOT"

echo "✅ Created dist-zip/lee-su-threads-chrome-v${VERSION}.zip"
echo "📊 Size: $(du -h dist-zip/lee-su-threads-chrome-v${VERSION}.zip | cut -f1)"

# ========== Firefox Build ==========
echo ""
echo "🦊 Building Firefox extension..."

FIREFOX_DIR="$TEMP_DIR/firefox"
mkdir -p "$FIREFOX_DIR"

# Copy built files from dist/ (excluding Chrome manifest and source maps)
cd dist
cp -r \
  background.js \
  content.js \
  injected.js \
  popup.html \
  popup.js \
  styles.css \
  icons \
  _locales \
  "$FIREFOX_DIR/"
cd "$PROJECT_ROOT"

# Copy Firefox-specific manifest from dist/
cp "dist/manifest.firefox.json" "$FIREFOX_DIR/manifest.json"

# Create Firefox zip
cd "$FIREFOX_DIR"
zip -r "$PROJECT_ROOT/dist-zip/lee-su-threads-firefox-v${VERSION}.zip" . -x "*.DS_Store" "*.map"
cd "$PROJECT_ROOT"

echo "✅ Created dist-zip/lee-su-threads-firefox-v${VERSION}.zip"
echo "📊 Size: $(du -h dist-zip/lee-su-threads-firefox-v${VERSION}.zip | cut -f1)"

echo ""
echo "🎉 All builds complete!"
echo ""
echo "Chrome:  dist-zip/lee-su-threads-chrome-v${VERSION}.zip"
echo "Firefox: dist-zip/lee-su-threads-firefox-v${VERSION}.zip"
