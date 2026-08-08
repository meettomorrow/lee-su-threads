#!/usr/bin/env bash
set -euo pipefail

# Set the Safari/iOS app's Xcode MARKETING_VERSION from the latest git tag.
#
# macOS + Xcode only (uses `agvtool`). Run this before archiving the Safari
# app for App Store submission so the App Store version always matches the
# git tag — never hand-edit MARKETING_VERSION in project.pbxproj again.
#
# Because project.pbxproj is tracked in git, the commit that sets the version
# must exist *before* the tag points at it. The reliable release order is:
#
#   bash scripts/set-safari-version.sh 1.0.7   # set + git commit the pbxproj
#   git tag v1.0.7 && git push origin v1.0.7   # then tag that commit
#
# The no-argument form reads the latest tag and is meant for re-syncing an
# existing project, not for cutting a new release.
#
# Usage:
#   bash scripts/set-safari-version.sh 1.0.7    # explicit version (release)
#   bash scripts/set-safari-version.sh          # re-sync from the latest git tag

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
  # --match keeps a stray tag (ios-*, nightly) from being read as the version.
  TAG="$(git -C "$PROJECT_ROOT" describe --tags --abbrev=0 --match='v[0-9]*.[0-9]*.[0-9]*' 2>/dev/null || true)"
  VERSION="$TAG"
fi

# Strip a leading 'v' on either path so "v1.0.6" and "1.0.6" both work.
VERSION="${VERSION#v}"

if [ -z "$VERSION" ]; then
  echo "❌ No version given and no matching git tag found. Pass one explicitly: set-safari-version.sh 1.0.7" >&2
  exit 1
fi

# App Store Connect only accepts a numeric version of at most three parts
# (X, X.Y, or X.Y.Z). This is DELIBERATELY stricter than the extension's
# EXTENSION_VERSION_RE in scripts/lib/version.js, which allows a 4th part
# because Chrome MV3 does. Bash can't import that module, so the rule is
# duplicated here on purpose — keep the two in sync when either platform's
# constraints change.
if ! printf '%s' "$VERSION" | grep -Eq '^[0-9]+(\.[0-9]+){1,2}$'; then
  echo "❌ Invalid version \"$VERSION\". Expected a numeric version like 1.0.6 (max 3 parts for the App Store)." >&2
  exit 1
fi

echo "🍎 Setting Safari MARKETING_VERSION → $VERSION"
( cd "$XCODE_DIR" && xcrun agvtool new-marketing-version "$VERSION" >/dev/null )

CURRENT="$( cd "$XCODE_DIR" && xcrun agvtool what-marketing-version -terse 2>/dev/null | tail -n 1 || true )"
echo "✅ Done (MARKETING_VERSION is now ${CURRENT:-$VERSION})."
