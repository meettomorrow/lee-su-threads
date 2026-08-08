#!/bin/bash

# Package script for Lee-Su-Threads Extension (Chrome and Firefox)

set -e

# Get the script's directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

# Start from a clean dist/ so a leftover build from an older version can't be
# packaged or trip the version guard below.
echo "🧹 Cleaning previous build output..."
npm run clean

# Build both the default (dist/firefox) and AMO (dist/firefox-amo) outputs so
# this script is self-contained and never packages a stale directory.
echo "🔨 Building extension..."
npm run build
npm run build:firefox-amo

# Verify the built web artifacts match the git tag BEFORE zipping, so a
# mismatch aborts (set -e) without leaving a wrongly-named zip in dist-zip/.
# --web skips MARKETING_VERSION: this script only packages Chrome/Firefox, and
# the Safari app version legitimately lags on a web-only release.
echo "🔎 Verifying versions against the git tag..."
node "$SCRIPT_DIR/check-versions.js" --web

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
echo "Firefox (Direct Install): built and signed as .xpi separately in CI"
