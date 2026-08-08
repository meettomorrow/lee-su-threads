#!/usr/bin/env bash
set -euo pipefail

# Set the Safari/iOS app's Xcode MARKETING_VERSION from the latest git tag.
#
# Run this before archiving the Safari app for App Store submission so the
# App Store version always matches the git tag — never hand-edit
# MARKETING_VERSION in project.pbxproj by hand.
#
# The Xcode project uses GENERATE_INFOPLIST_FILE = YES, so the App Store
# version (CFBundleShortVersionString) is derived from the MARKETING_VERSION
# build setting in project.pbxproj — the Info.plist files carry no version
# key of their own. That's why this writes MARKETING_VERSION in the pbxproj
# directly. (An earlier version used `agvtool new-marketing-version`, which
# only rewrites CFBundleShortVersionString in Info.plist — a no-op here, since
# those files have no such key — so it silently failed to change the version.)
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
PBXPROJ="$PROJECT_ROOT/dist-safari/safari-project/Lee-Su-Sui/Lee-Su-Sui.xcodeproj/project.pbxproj"

if [ ! -f "$PBXPROJ" ]; then
  echo "❌ Xcode project not found at:" >&2
  echo "   $PBXPROJ" >&2
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

# Rewrite every build config's MARKETING_VERSION. The value may be bare
# (MARKETING_VERSION = 1.0.6;) or quoted (MARKETING_VERSION = "1.0.6";);
# [^;]* covers both, and we always write it bare (a plain numeric version
# needs no quoting).
BEFORE="$(grep -c 'MARKETING_VERSION = ' "$PBXPROJ" || true)"
if [ "${BEFORE:-0}" -eq 0 ]; then
  echo "❌ No MARKETING_VERSION entries found in project.pbxproj — nothing to set." >&2
  exit 1
fi

perl -i -pe "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = ${VERSION};/g" "$PBXPROJ"

UPDATED="$(grep -c "MARKETING_VERSION = ${VERSION};" "$PBXPROJ" || true)"
if [ "${UPDATED:-0}" -ne "${BEFORE}" ]; then
  echo "❌ Expected to set ${BEFORE} MARKETING_VERSION entries but only ${UPDATED} now read ${VERSION}." >&2
  exit 1
fi

echo "✅ Done (${UPDATED} MARKETING_VERSION ent(ies) now = ${VERSION})."
