#!/usr/bin/env bash
set -euo pipefail

# Set the Safari/iOS app's Xcode MARKETING_VERSION from the latest git tag.
#
# macOS + Xcode only (uses `agvtool`). Run this before archiving the Safari
# app for App Store submission so the App Store version always matches the
# git tag — never hand-edit MARKETING_VERSION in project.pbxproj again.
#
# Usage:
#   bash scripts/set-safari-version.sh          # use the latest git tag
#   bash scripts/set-safari-version.sh 1.0.6    # override explicitly

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
XCODE_DIR="$PROJECT_ROOT/dist-safari/safari-project/Lee-Su-Sui"

if ! command -v xcrun >/dev/null 2>&1 || ! xcrun --find agvtool >/dev/null 2>&1; then
  echo "❌ agvtool not available. This script requires macOS with Xcode installed." >&2
  exit 1
fi

if [ ! -d "$XCODE_DIR" ]; then
  echo "❌ Xcode project not found at:" >&2
  echo "   $XCODE_DIR" >&2
  echo "   Run 'npm run setup:safari' first to generate it." >&2
  exit 1
fi

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  TAG="$(git -C "$PROJECT_ROOT" describe --tags --abbrev=0 2>/dev/null || true)"
  VERSION="${TAG#v}"
fi

if [ -z "$VERSION" ]; then
  echo "❌ No version given and no git tag found. Tag the release first (git tag vX.Y.Z)." >&2
  exit 1
fi

echo "🍎 Setting Safari MARKETING_VERSION → $VERSION"
( cd "$XCODE_DIR" && xcrun agvtool new-marketing-version "$VERSION" >/dev/null )

CURRENT="$( cd "$XCODE_DIR" && xcrun agvtool what-marketing-version -terse 2>/dev/null | tail -n 1 || true )"
echo "✅ Done (MARKETING_VERSION is now ${CURRENT:-$VERSION})."
