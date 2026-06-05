#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON_MARKER="# AI News Dashboard updates"
CRON_LINE="0 8,12,18 * * * cd $ROOT_DIR && ./update-with-codex.sh >> $ROOT_DIR/logs/cron.log 2>&1"

mkdir -p "$ROOT_DIR/logs"

existing="$(mktemp)"
new_cron="$(mktemp)"

crontab -l 2>/dev/null > "$existing" || true
grep -v -F "$CRON_MARKER" "$existing" | grep -v -F "$ROOT_DIR/update-with-codex.sh" > "$new_cron" || true
{
  cat "$new_cron"
  echo "$CRON_MARKER"
  echo "$CRON_LINE"
} | crontab -

rm -f "$existing" "$new_cron"

echo "Installed cron schedule:"
echo "$CRON_LINE"
