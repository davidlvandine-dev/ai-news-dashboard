#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export CODEX_HOME=/home/dave/.codex
LOG_DIR="$ROOT_DIR/logs"
LOCK_FILE="$ROOT_DIR/.update-with-codex.lock"
TODAY="$(date +%F)"
LOG_FILE="$LOG_DIR/update-$TODAY.log"

mkdir -p "$LOG_DIR"

if ! command -v codex >/dev/null 2>&1; then
  echo "codex CLI was not found in PATH." | tee -a "$LOG_FILE"
  echo "Install Codex CLI and run: codex login --device-auth" | tee -a "$LOG_FILE"
  exit 1
fi

cd "$ROOT_DIR"

PROMPT='Update the AI News Dashboard snapshot for today using current web research. Refresh general AI company news, the IPO tracker, and the partnerships tracker. Track NVIDIA, Alphabet / Google DeepMind, Microsoft, OpenAI, Anthropic, Meta, Amazon / AWS, xAI, Broadcom, Palantir, Apple, AMD, Perplexity AI, CoreWeave, Mistral AI, and Tesla for general news. Refresh IPO status for Anthropic, OpenAI, SpaceX / xAI, Cerebras Systems, Databricks, Scale AI, Perplexity AI, Hugging Face, and any newly relevant AI IPO candidates; mark CoreWeave as recently completed IPO. Refresh major AI partnerships and contracts including Anthropic-xAI/SpaceX, Anthropic-AWS, Anthropic-Google-Broadcom, Anthropic-Microsoft-NVIDIA, OpenAI-Microsoft, OpenAI-Amazon, OpenAI-NVIDIA, OpenAI-AMD, OpenAI-Oracle/SoftBank/CoreWeave, Meta-CoreWeave, Anthropic-CoreWeave, Anthropic-Palantir-AWS, Apple-OpenAI, AMD-Microsoft, AMD-Meta, and CoreWeave-NVIDIA. Write or update data/snapshots/YYYY-MM-DD.json for today using the existing JSON schema: date, generatedAt, title, companies[], ipoTracker[], partnershipTracker[], sources[]. Update data/index.json so latest points to today and the snapshots list includes today without duplicate dates, sorted newest first. Preserve all historical snapshots. Validate the JSON before finishing.'

{
  echo "==== $(date -Is) Starting AI News Dashboard update ===="
  flock -n 9 || {
    echo "Another update is already running."
    exit 0
  }

  codex exec \
    --sandbox workspace-write \
    "$PROMPT"

  python3 -m json.tool "data/index.json" >/dev/null
  python3 -m json.tool "data/snapshots/$TODAY.json" >/dev/null
  echo "==== $(date -Is) Update complete ===="
} 9>"$LOCK_FILE" 2>&1 | tee -a "$LOG_FILE"
