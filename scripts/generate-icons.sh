#!/usr/bin/env bash
#
# Regenerate the raster toolbar icons from icons/icon.svg.
#
# icons/icon.svg is the single source of truth for the toolbar icons. The PNGs
# below are generated artifacts — never hand-edit them, and never export them
# from an editor that flattens transparency onto a white background (that is
# exactly the bug that made the icon show a white square in dark mode).
#
# Requires cairosvg:  python3 -m pip install cairosvg
#
# Note: icons/icon.png (the large master) is intentionally NOT regenerated here.
# It is an App Store / store asset and must stay opaque (App Store icons may not
# carry an alpha channel).
set -euo pipefail

cd "$(dirname "$0")/.."

if ! python3 -m cairosvg --help >/dev/null 2>&1; then
  echo "error: cairosvg is not available. Install it with:" >&2
  echo "  python3 -m pip install cairosvg" >&2
  exit 1
fi

for size in 16 48 128; do
  python3 -m cairosvg icons/icon.svg \
    -W "$size" -H "$size" \
    -b transparent \
    -o "icons/icon${size}.png"
  echo "generated icons/icon${size}.png (${size}x${size})"
done
