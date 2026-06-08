#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
LOCK_FILE="$ROOT_DIR/.update-news.lock"
TODAY="$(date +%F)"
LOG_FILE="$LOG_DIR/update-$TODAY.log"

mkdir -p "$LOG_DIR"

{
  flock -n 9 || {
    echo "$(date -Is) Another update is already running, skipping."
    exit 0
  }

  echo "==== $(date -Is) Starting AI News Dashboard update ===="

  if ! command -v claude >/dev/null 2>&1; then
    echo "claude CLI not found in PATH."
    exit 1
  fi

  cd "$ROOT_DIR"

  PROMPT="Update the AI News Dashboard snapshot for today ($TODAY) using current web research.

Refresh general AI company news, the IPO tracker, and the partnerships tracker.

Track NVIDIA, Alphabet / Google DeepMind, Microsoft, OpenAI, Anthropic, Meta, Amazon / AWS, xAI, Broadcom, Palantir, Apple, AMD, Perplexity AI, CoreWeave, Mistral AI, and Tesla for general news.

Refresh IPO status for Anthropic, OpenAI, SpaceX / xAI, Cerebras Systems, Databricks, Scale AI, Perplexity AI, Hugging Face, and any newly relevant AI IPO candidates; mark CoreWeave as recently completed IPO.

Refresh major AI partnerships and contracts including Anthropic-xAI/SpaceX, Anthropic-AWS, Anthropic-Google-Broadcom, Anthropic-Microsoft-NVIDIA, OpenAI-Microsoft, OpenAI-Amazon, OpenAI-NVIDIA, OpenAI-AMD, OpenAI-Oracle/SoftBank/CoreWeave, Meta-CoreWeave, Anthropic-CoreWeave, Anthropic-Palantir-AWS, Apple-OpenAI, AMD-Microsoft, AMD-Meta, and CoreWeave-NVIDIA.

Write or update data/snapshots/$TODAY.json using the existing JSON schema from data/snapshots/2026-06-05.json as a reference: date, generatedAt, title, companies[], ipoTracker[], partnershipTracker[], sources[].

Update data/index.json so latest points to $TODAY and the snapshots list includes $TODAY without duplicate dates, sorted newest first. Preserve all historical snapshots already listed.

Validate both JSON files before finishing."

  claude --dangerously-skip-permissions -p "$PROMPT"

  python3 -m json.tool "data/index.json" >/dev/null
  python3 -m json.tool "data/snapshots/$TODAY.json" >/dev/null

  git add data/snapshots/"$TODAY".json data/index.json
  git diff --cached --quiet && {
    echo "No changes to commit."
    exit 0
  }
  git commit -m "Auto-update AI news snapshot for $TODAY"
  git push

  echo "==== $(date -Is) Update complete and pushed ===="
} 9>"$LOCK_FILE" 2>&1 | tee -a "$LOG_FILE"
