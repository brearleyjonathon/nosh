#!/usr/bin/env bash
# Copy the plugin into a vault so Obsidian can run it.
#
# Nosh has no build step: main.js is the source. Deploying is copying the
# three files Obsidian reads. data.json is the vault's own, and is never
# touched, so the settings and the API key on the other side survive.
#
#   ./deploy.sh                      # into the vault named below
#   ./deploy.sh /path/to/other/vault # into another one
#
# Note: if BRAT still has a beta entry for this plugin pointed at the same
# vault, it will overwrite whatever you put there the next time it updates.
# Remove the entry under Settings, BRAT, Beta plugin list while developing.

set -euo pipefail

VAULT_DEFAULT="/c/Users/brear/Documents/Quartz"
VAULT="${1:-${NOSH_VAULT:-$VAULT_DEFAULT}}"
DEST="$VAULT/.obsidian/plugins/nosh"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -d "$VAULT/.obsidian" ]; then
  echo "Not a vault: $VAULT" >&2
  echo "Pass the vault path, or set NOSH_VAULT." >&2
  exit 1
fi

mkdir -p "$DEST"
for f in main.js manifest.json styles.css; do
  cp "$SRC/$f" "$DEST/$f"
  printf '  %-14s %s\n' "$f" "$(wc -c < "$SRC/$f" | tr -d ' ') bytes"
done

echo "Deployed to $DEST"
if [ -f "$DEST/data.json" ]; then
  echo "Left data.json alone, so its settings and credential are intact."
fi
echo "Reload the plugin in Obsidian to pick it up."
