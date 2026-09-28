#!/usr/bin/env bash
# Render the social cards from tools/cards/*.html into site/.
#
#   python tools/collage.py   # first, for the cards' art
#   ./tools/cards.sh
#
# Needs a Chromium browser that can run headless. Set BROWSER to its path if
# neither Edge nor Chrome is where this looks. The fonts come from Google Fonts,
# so it needs the network.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$HERE/../site"

if [ -z "${BROWSER:-}" ]; then
  for b in \
    "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
    "/c/Program Files/Google/Chrome/Application/chrome.exe" \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "$(command -v chromium || true)" "$(command -v google-chrome || true)"; do
    if [ -n "$b" ] && [ -x "$b" ]; then BROWSER="$b"; break; fi
  done
fi
if [ -z "${BROWSER:-}" ]; then
  echo "No headless browser found. Set BROWSER to Chrome or Edge." >&2
  exit 1
fi

# Windows browsers want Windows paths.
winpath() { if command -v cygpath >/dev/null; then cygpath -m "$1"; else echo "$1"; fi; }

for card in social github; do
  if [ ! -f "$HERE/cards/card-block.svg" ]; then
    echo "Run python tools/collage.py first; the cards' art is missing." >&2
    exit 1
  fi
  "$BROWSER" --headless=new --disable-gpu --hide-scrollbars \
    --virtual-time-budget=10000 --window-size=1280,640 \
    --screenshot="$(winpath "$SITE/$card-card.png")" \
    "file:///$(winpath "$HERE/cards/$card.html")" >/dev/null 2>&1
  echo "  site/$card-card.png"
done
