#!/bin/bash
set -e

echo "🚀 Starting Lee-Su-Threads Safari Extension build..."

# Change to project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "📂 Working directory: $PROJECT_ROOT"

# Configuration
APP_NAME="Lee-Su-Threads"
XCODE_PROJECT="src/src.xcodeproj"
SCHEME="src (macOS)"
INFO_PLIST="src/macOS (App)/Info.plist"

# Read version from manifest.json
VERSION=$(grep '"version"' "src/Shared (Extension)/Resources/manifest.json" | sed 's/.*"version": "\(.*\)".*/\1/' | tr -d ' ')
if [ -z "$VERSION" ]; then
    VERSION="0.3.6"
fi
echo "📌 Detected version: $VERSION"

ZIP_NAME="${APP_NAME}-v${VERSION}"

# Step 1: Build JavaScript
echo "📦 Building JavaScript..."
npm install
npm run build

# Step 2: Clean extended attributes
echo "🧹 Cleaning extended attributes..."
find . -not -path "./.git/*" -not -path "./build/*" -not -path "./node_modules/*" -exec xattr -c {} \; 2>/dev/null || true

# Step 3: Build Release version (unsigned)
echo "🔨 Building Release version (unsigned)..."
xcodebuild -project "$XCODE_PROJECT" \
    -scheme "$SCHEME" \
    -configuration Release \
    -derivedDataPath ./build \
    CODE_SIGN_IDENTITY="-" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO \
    clean build

# Find the built app
APP_PATH=$(find ./build -name "*.app" -path "*/Release/*" -type d | head -1)

if [ -z "$APP_PATH" ] || [ ! -d "$APP_PATH" ]; then
    echo "❌ Error: Build failed, cannot find .app in build directory"
    exit 1
fi

echo "✅ Build completed! Found: $APP_PATH"

# Create dist directory
mkdir -p dist/safari

# Step 4: Create ZIP for distribution
echo "📦 Creating ZIP archive..."
FINAL_APP_PATH="dist/safari/${APP_NAME}.app"
rm -rf "$FINAL_APP_PATH"
cp -R "$APP_PATH" "$FINAL_APP_PATH"

# Create ZIP
cd dist/safari
zip -r "../../${ZIP_NAME}.zip" "${APP_NAME}.app"
cd ../..

# Cleanup build directory (optional - keep for debugging)
# rm -rf build

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done! Build completed successfully"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📦 Created files:"
echo "   • dist/safari/${APP_NAME}.app"
echo "   • ${ZIP_NAME}.zip (ready for GitHub Release)"
echo ""
echo "⚠️  Note: This is an UNSIGNED build"
echo "   Users need to:"
echo "   1. Enable 'Allow unsigned extensions' in Safari Developer settings"
echo "   2. Run: xattr -cr /path/to/${APP_NAME}.app"
echo ""
