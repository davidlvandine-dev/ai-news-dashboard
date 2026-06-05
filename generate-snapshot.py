"""
generate-snapshot.py — generate a daily AI news snapshot using Claude.

Usage:
  python generate-snapshot.py              # uses today's date
  python generate-snapshot.py 2026-06-03  # specific date

Requirements:
  pip install anthropic
  ANTHROPIC_API_KEY environment variable set

The script sends the existing snapshot schema and a previous snapshot as
context, then asks Claude to produce a fresh daily snapshot JSON. It writes
the new snapshot to data/snapshots/<date>.json and updates data/index.json.

Paste any articles or headlines you want included when prompted, or press
Enter to let Claude work from its training knowledge alone.
"""

import json
import os
import sys
from datetime import date, datetime
from pathlib import Path

import anthropic

SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
INDEX_PATH = DATA_DIR / "index.json"

COMPANIES = [
    "NVIDIA",
    "Alphabet / Google DeepMind",
    "Microsoft",
    "OpenAI",
    "Anthropic",
    "Meta",
    "Amazon / AWS",
    "xAI",
    "Broadcom",
    "Palantir",
]

SCHEMA = """
{
  "date": "YYYY-MM-DD",
  "generatedAt": "<ISO 8601 timestamp>",
  "title": "Top AI Companies Daily News",
  "companies": [
    {
      "name": "<company name>",
      "category": "<one-line description of the company's AI focus>",
      "summary": "<2-3 sentence summary of the company's current AI narrative>",
      "items": [
        {
          "headline": "<short headline>",
          "detail": "<1-2 sentence factual detail>",
          "sourceTitle": "<publication name>",
          "sourceUrl": "<full URL>"
        }
      ]
    }
  ],
  "ipoTracker": [
    {
      "company": "<company name>",
      "stage": "<current stage label>",
      "status": "<one-line status>",
      "process": "<2-3 sentence description of where things stand>",
      "lastChecked": "YYYY-MM-DD",
      "confidence": "<confidence level or source quality>",
      "note": "<optional caveat or watch note>",
      "latestArticle": {
        "title": "<article title>",
        "source": "<publication>",
        "url": "<full URL>",
        "publishedDate": "YYYY-MM-DD"
      }
    }
  ],
  "partnershipTracker": [
    {
      "relationship": "<descriptive name for the relationship>",
      "companies": ["<company A>", "<company B>"],
      "type": "<contract or partnership type>",
      "status": "<current status>",
      "terms": "<known financial or structural terms>",
      "lastChecked": "YYYY-MM-DD",
      "confidence": "<confidence level>",
      "note": "<optional context>",
      "latestArticle": {
        "title": "<article title>",
        "source": "<publication>",
        "url": "<full URL>",
        "publishedDate": "YYYY-MM-DD"
      }
    }
  ]
}
"""


def load_previous_snapshot():
    """Return the most recent existing snapshot as context."""
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    snapshots = sorted(index.get("snapshots", []), key=lambda s: s["date"], reverse=True)
    if not snapshots:
        return None
    path = SCRIPT_DIR / snapshots[0]["path"]
    if path.exists():
        return path.read_text(encoding="utf-8")
    return None


def build_prompt(target_date: str, previous: str | None, extra_context: str) -> str:
    companies_list = "\n".join(f"- {c}" for c in COMPANIES)
    prev_section = (
        f"\n\nFor reference, here is the most recent snapshot:\n<previous_snapshot>\n{previous}\n</previous_snapshot>"
        if previous
        else ""
    )
    extra_section = (
        f"\n\nAdditional context to incorporate:\n<extra_context>\n{extra_context}\n</extra_context>"
        if extra_context.strip()
        else ""
    )
    return f"""You are producing a daily AI industry news snapshot for {target_date}.

Generate a single valid JSON object matching the schema below. Track these companies:
{companies_list}

For each company provide 3–5 news items with real, verifiable headlines and source URLs.
For the IPO tracker, include any AI companies with confirmed or credibly reported IPO activity.
For the partnership tracker, include major compute, cloud, and strategic relationships.

Use only facts you are confident about. If you are uncertain about a URL, use the publication's homepage.
Set "generatedAt" to "{target_date}T12:00:00Z".

Schema:
{SCHEMA}{prev_section}{extra_section}

Respond with only the JSON object — no markdown fences, no explanation."""


def update_index(target_date: str, snapshot_path: str):
    index = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    snapshots = index.get("snapshots", [])

    existing_dates = {s["date"] for s in snapshots}
    if target_date not in existing_dates:
        label = datetime.strptime(target_date, "%Y-%m-%d").strftime("%B %-d, %Y") if os.name != "nt" else datetime.strptime(target_date, "%Y-%m-%d").strftime("%B %d, %Y").lstrip("0")
        snapshots.append({
            "date": target_date,
            "path": snapshot_path,
            "label": label,
        })

    snapshots.sort(key=lambda s: s["date"], reverse=True)
    index["snapshots"] = snapshots
    index["latest"] = snapshots[0]["date"]

    INDEX_PATH.write_text(json.dumps(index, indent=2), encoding="utf-8")


def main():
    target_date = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()

    try:
        datetime.strptime(target_date, "%Y-%m-%d")
    except ValueError:
        print(f"Error: date must be YYYY-MM-DD, got '{target_date}'")
        sys.exit(1)

    out_path = SNAPSHOTS_DIR / f"{target_date}.json"
    if out_path.exists():
        answer = input(f"Snapshot for {target_date} already exists. Overwrite? [y/N] ").strip().lower()
        if answer != "y":
            print("Aborted.")
            sys.exit(0)

    print("Paste any headlines or article excerpts to include (press Enter twice when done, or just Enter to skip):")
    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line == "" and lines and lines[-1] == "":
            break
        lines.append(line)
    extra_context = "\n".join(lines).strip()

    previous = load_previous_snapshot()
    prompt = build_prompt(target_date, previous, extra_context)

    print(f"\nGenerating snapshot for {target_date}...")
    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=8192,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = message.content[0].text.strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Claude returned invalid JSON: {e}")
        error_path = SNAPSHOTS_DIR / f"{target_date}.error.txt"
        error_path.write_text(raw, encoding="utf-8")
        print(f"Raw response saved to {error_path}")
        sys.exit(1)

    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Snapshot written to {out_path}")

    rel_path = f"data/snapshots/{target_date}.json"
    update_index(target_date, rel_path)
    print(f"index.json updated — latest is now {target_date}")


if __name__ == "__main__":
    main()
