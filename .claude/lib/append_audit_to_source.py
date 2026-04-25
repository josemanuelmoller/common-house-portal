"""
append_audit_to_source.py - Append a digestion-run audit summary to the body of
a CH Sources [OS v2] record. Makes governance + telemetry queryable inside
Notion (not just in deliverables/*.md).

Usage:
  python .claude/lib/append_audit_to_source.py \
      --source-url https://www.notion.so/<source-uuid> \
      --audit-md deliverables/<slug>-digestion-proposal.md

The script appends the markdown body as a divider + summary block + the audit
content to the Source page (via Notion's append-block-children endpoint).
Idempotent header marker prevents duplicate appends on re-runs.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env.local"
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"

AUDIT_HEADER = "## Digestion Audit Trail"  # idempotency marker


def _clean_env_value(v: str) -> str:
    v = v.strip().strip('"').strip("'")
    while v.endswith(("\\n", "\\r", "\\t")):
        v = v[:-2]
    return v.strip()


def load_env() -> None:
    if os.environ.get("NOTION_API_KEY"):
        return
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = _clean_env_value(v)
        if k.strip() == "NOTION_API_KEY":
            os.environ["NOTION_API_KEY"] = v


def headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {os.environ['NOTION_API_KEY']}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def extract_uuid(url: str) -> str:
    m = re.search(r"([0-9a-f]{32})", url, re.I)
    if m:
        h = m.group(1)
        return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"
    m = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", url, re.I)
    return m.group(1) if m else ""


def chunk_rich_text(text: str, limit: int = 1900) -> list[dict]:
    out = []
    s = text
    while s:
        out.append({"type": "text", "text": {"content": s[:limit]}})
        s = s[limit:]
    return out


def md_to_blocks(md: str) -> list[dict]:
    blocks = []
    for line in md.splitlines():
        line = line.rstrip()
        if not line.strip():
            continue
        if line.startswith("### "):
            blocks.append({"object": "block", "type": "heading_3",
                           "heading_3": {"rich_text": chunk_rich_text(line[4:])}})
        elif line.startswith("## "):
            blocks.append({"object": "block", "type": "heading_2",
                           "heading_2": {"rich_text": chunk_rich_text(line[3:])}})
        elif line.startswith("# "):
            blocks.append({"object": "block", "type": "heading_1",
                           "heading_1": {"rich_text": chunk_rich_text(line[2:])}})
        elif line.lstrip().startswith(("- ", "* ")):
            blocks.append({"object": "block", "type": "bulleted_list_item",
                           "bulleted_list_item": {"rich_text": chunk_rich_text(line.lstrip()[2:])}})
        else:
            blocks.append({"object": "block", "type": "paragraph",
                           "paragraph": {"rich_text": chunk_rich_text(line)}})
    return blocks


def already_appended(page_id: str) -> bool:
    """Check if AUDIT_HEADER already exists in the page body."""
    r = requests.get(f"{NOTION_API}/blocks/{page_id}/children?page_size=100",
                     headers=headers(), timeout=30)
    if not r.ok:
        return False
    for block in r.json().get("results", []):
        if block.get("type") == "heading_2":
            text = block.get("heading_2", {}).get("rich_text", [])
            content = "".join(t.get("plain_text", "") for t in text)
            if AUDIT_HEADER.replace("## ", "") in content:
                return True
    return False


def append_blocks(page_id: str, blocks: list[dict]) -> None:
    # Notion limits 100 blocks per append call; chunk if needed
    for i in range(0, len(blocks), 100):
        chunk = blocks[i:i + 100]
        r = requests.patch(f"{NOTION_API}/blocks/{page_id}/children",
                           headers=headers(),
                           json={"children": chunk},
                           timeout=60)
        if not r.ok:
            try:
                err = r.json()
            except Exception:
                err = {"raw": r.text}
            raise SystemExit(f"Notion append error {r.status_code}: {json.dumps(err, indent=2)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--audit-md", required=True)
    parser.add_argument("--force", action="store_true",
                        help="Append even if AUDIT_HEADER already present (NOT idempotent)")
    args = parser.parse_args()

    load_env()
    page_id = extract_uuid(args.source_url)
    if not page_id:
        print(f"Could not extract page UUID from {args.source_url}", file=sys.stderr)
        return 2

    if not args.force and already_appended(page_id):
        print(f"Audit already appended to {page_id} - skipping (use --force to re-append)")
        return 0

    md = Path(args.audit_md).read_text(encoding="utf-8")

    # Build the prefix block
    today = datetime.now().strftime("%Y-%m-%d")
    prefix = (
        f"\n{AUDIT_HEADER}\n"
        f"\nAppended by `ingest-document` skill on {today}. "
        f"Source of truth: `{args.audit_md}` in repo. "
        f"This embedded copy makes governance queryable inside Notion.\n\n"
        f"---\n\n"
    )
    blocks = md_to_blocks(prefix + md)

    append_blocks(page_id, blocks)
    print(f"Appended {len(blocks)} blocks to source {page_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
