"""
notion_push.py - Wrapper to post validated JSON payloads to Notion via API directly.

Replaces the pattern where the agent inlines the entire JSON payload into
a notion-create-pages MCP call. That pattern wastes ~80% of context budget
on a moderate-sized run because every record gets pasted (and echoed back)
through the tool boundary. This script reads the file directly, transforms
to Notion-API-native format, and posts.

Two commands:
  push      - create pages from a validated batch JSON file
  backlink  - bulk-update Evidence <-> Knowledge Asset relations

Usage:
  python .claude/lib/notion_push.py push --db ch_evidence_os_v2 --json batch.json --out-ids batch-ids.json
  python .claude/lib/notion_push.py backlink --map evidence_ka_map.json

Pre-requisites:
  - NOTION_API_KEY in environment (read from .env.local at top-level if present)
  - .claude/schemas/os-v2-schemas.json present and current
  - Input JSON has been validated by .claude/lib/notion_validate.py first

The input JSON format matches what the notion-create-pages MCP tool expects:
flat property dict with values as strings / __YES__|__NO__ / JSON-stringified arrays
for multi-select and relations. This script transforms that to Notion's nested
property format on the way out.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Any

import requests

# Force UTF-8 stdout so we can print Unicode chars (arrows, em-dashes, accents)
# on Windows cp1252 terminals.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_FILE = REPO_ROOT / ".claude" / "schemas" / "os-v2-schemas.json"
ENV_FILE = REPO_ROOT / ".env.local"

NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"  # data-source-aware API version


# ----- Environment + schema loading -----------------------------------------

def _clean_env_value(v: str) -> str:
    """Strip whitespace, quotes, and trailing literal escape sequences."""
    v = v.strip().strip('"').strip("'")
    while v.endswith(("\\n", "\\r", "\\t")):
        v = v[:-2]
    return v.strip()


def load_env() -> None:
    """Load NOTION_API_KEY from .env.local if not already in env."""
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


def load_schemas() -> dict[str, Any]:
    return json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))


def headers() -> dict[str, str]:
    key = os.environ.get("NOTION_API_KEY")
    if not key:
        raise SystemExit(
            "NOTION_API_KEY not in environment. "
            "Add it to .env.local (top-level) or export it before running."
        )
    return {
        "Authorization": f"Bearer {key}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


# ----- Property format transformation ---------------------------------------

def extract_uuid(url_or_id: str) -> str:
    """Pull a UUID out of a Notion URL or accept a raw UUID."""
    if not url_or_id:
        return ""
    # raw 32-hex with dashes
    m = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", url_or_id, re.I)
    if m:
        return m.group(1)
    # dashless 32-hex (e.g. last segment of a notion.so URL)
    m = re.search(r"([0-9a-f]{32})", url_or_id, re.I)
    if m:
        h = m.group(1)
        return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"
    return ""


def parse_array(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        s = value.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
        return [s] if s else []
    return []


def to_notion_properties(flat: dict[str, Any], db_schema: dict[str, Any]) -> dict[str, Any]:
    """Transform the flat MCP-style properties to Notion-API nested format."""
    result: dict[str, Any] = {}
    fields = db_schema.get("fields", {})

    # Pre-process date:foo:start / date:foo:end keys into combined date dicts
    date_buckets: dict[str, dict[str, Any]] = {}
    for key, value in list(flat.items()):
        if not key.startswith("date:"):
            continue
        parts = key.split(":")
        if len(parts) < 3:
            continue
        base = parts[1]
        sub = parts[2]
        date_buckets.setdefault(base, {})[sub] = value

    for base_key, parts in date_buckets.items():
        if base_key not in fields:
            continue
        d: dict[str, Any] = {}
        if parts.get("start"):
            d["start"] = parts["start"]
        if parts.get("end"):
            d["end"] = parts["end"]
        if d:
            result[base_key] = {"date": d}

    for key, value in flat.items():
        if key.startswith("date:"):
            continue  # handled above
        spec = fields.get(key)
        if spec is None:
            continue  # unknown field, skip
        ftype = spec.get("type")

        if value is None or value == "":
            continue

        if ftype == "title":
            result[key] = {"title": [{"text": {"content": str(value)[:2000]}}]}
        elif ftype == "text":
            chunks = chunk_rich_text(str(value))
            result[key] = {"rich_text": chunks}
        elif ftype == "select":
            result[key] = {"select": {"name": str(value)}}
        elif ftype == "multi_select":
            arr = parse_array(value)
            result[key] = {"multi_select": [{"name": v} for v in arr]}
        elif ftype == "checkbox":
            result[key] = {"checkbox": str(value) == "__YES__"}
        elif ftype == "url":
            result[key] = {"url": str(value)}
        elif ftype == "relation":
            arr = parse_array(value)
            ids = [extract_uuid(v) for v in arr]
            result[key] = {"relation": [{"id": i} for i in ids if i]}
        # date already handled
        # created_time / last_edited_time are read-only; skip silently

    return result


def chunk_rich_text(text: str, limit: int = 1900) -> list[dict[str, Any]]:
    """Notion limits each rich_text segment to 2000 chars. Split safely."""
    out: list[dict[str, Any]] = []
    s = text
    while s:
        out.append({"text": {"content": s[:limit]}})
        s = s[limit:]
    return out


# ----- Markdown -> Notion blocks (minimal) ----------------------------------

def md_to_blocks(md: str) -> list[dict[str, Any]]:
    """Minimal Markdown -> Notion block converter.

    Handles: H1/H2/H3, paragraphs, bullet lists. Tables and rich formatting
    are rendered as plain paragraphs to avoid losing data.
    """
    blocks: list[dict[str, Any]] = []
    if not md:
        return blocks

    lines = md.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()

        if not line.strip():
            i += 1
            continue

        if line.startswith("### "):
            blocks.append({
                "object": "block",
                "type": "heading_3",
                "heading_3": {"rich_text": chunk_rich_text(line[4:])},
            })
        elif line.startswith("## "):
            blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {"rich_text": chunk_rich_text(line[3:])},
            })
        elif line.startswith("# "):
            blocks.append({
                "object": "block",
                "type": "heading_1",
                "heading_1": {"rich_text": chunk_rich_text(line[2:])},
            })
        elif line.lstrip().startswith(("- ", "* ")):
            content = line.lstrip()[2:]
            blocks.append({
                "object": "block",
                "type": "bulleted_list_item",
                "bulleted_list_item": {"rich_text": chunk_rich_text(content)},
            })
        else:
            # Paragraph: collect consecutive non-blank, non-special lines
            buf = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not lines[i].lstrip().startswith(("#", "- ", "* ")):
                buf.append(lines[i].rstrip())
                i += 1
            text = " ".join(buf)
            blocks.append({
                "object": "block",
                "type": "paragraph",
                "paragraph": {"rich_text": chunk_rich_text(text)},
            })
            continue

        i += 1

    return blocks


# ----- API calls ------------------------------------------------------------

def post_page(database_id: str, properties: dict[str, Any], children: list[dict[str, Any]] | None = None,
              dry_run: bool = False) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "parent": {"database_id": database_id},
        "properties": properties,
    }
    if children:
        # Notion limits children in a single create to 100
        payload["children"] = children[:100]

    if dry_run:
        return {"_dry_run": True, "payload_size": len(json.dumps(payload))}

    r = requests.post(f"{NOTION_API}/pages", headers=headers(), json=payload, timeout=60)
    if not r.ok:
        try:
            err = r.json()
        except Exception:
            err = {"raw": r.text}
        raise SystemExit(f"Notion API error {r.status_code}: {json.dumps(err, indent=2)}")
    return r.json()


def patch_page_relations(page_id: str, relation_updates: dict[str, list[str]],
                         dry_run: bool = False) -> dict[str, Any]:
    """Update one or more relation fields on a page. relation_updates is
    {"<Field Name>": [page_uuid_or_url, ...], ...}."""
    properties: dict[str, Any] = {}
    for field, urls in relation_updates.items():
        ids = [extract_uuid(u) for u in urls]
        properties[field] = {"relation": [{"id": i} for i in ids if i]}
    payload = {"properties": properties}

    if dry_run:
        return {"_dry_run": True, "page_id": page_id, "fields": list(relation_updates.keys())}

    r = requests.patch(f"{NOTION_API}/pages/{page_id}", headers=headers(), json=payload, timeout=60)
    if not r.ok:
        try:
            err = r.json()
        except Exception:
            err = {"raw": r.text}
        raise SystemExit(f"Notion API error {r.status_code} on {page_id}: {json.dumps(err, indent=2)}")
    return r.json()


# ----- Commands -------------------------------------------------------------

def cmd_push(args: argparse.Namespace) -> int:
    schemas = load_schemas()
    db_schema = schemas.get(args.db)
    if db_schema is None:
        valid = [k for k in schemas if not k.startswith("_")]
        print(f"unknown db_key '{args.db}'. Valid: {valid}", file=sys.stderr)
        return 2

    database_id = db_schema.get("database_id")
    if not database_id:
        print(f"db_schema for {args.db} missing 'database_id'", file=sys.stderr)
        return 2

    pages = json.loads(Path(args.json).read_text(encoding="utf-8"))

    started_at = time.time()
    out_ids: list[dict[str, Any]] = []
    errors: list[str] = []

    for i, page in enumerate(pages):
        flat_props = page.get("properties", {})
        notion_props = to_notion_properties(flat_props, db_schema)
        children = md_to_blocks(page.get("content", "")) if page.get("content") else None

        try:
            result = post_page(database_id, notion_props, children, dry_run=args.dry_run)
        except SystemExit as e:
            errors.append(f"page[{i}]: {e}")
            if args.fail_fast:
                raise
            continue

        if args.dry_run:
            print(f"[{i+1}/{len(pages)}] DRY-RUN payload {result['payload_size']} bytes")
            continue

        page_id = result.get("id")
        page_url = result.get("url")
        title = ""
        title_field = db_schema.get("title_field")
        if title_field:
            t = flat_props.get(title_field, "")
            title = str(t)[:80]
        out_ids.append({"index": i, "id": page_id, "url": page_url, "title": title})
        print(f"[{i+1}/{len(pages)}] OK {page_id}  {title}")

        # Light rate-limit (Notion: 3 req/s soft cap)
        time.sleep(0.35)

    elapsed = time.time() - started_at

    if args.out_ids and not args.dry_run:
        Path(args.out_ids).write_text(json.dumps(out_ids, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nWrote {len(out_ids)} ids to {args.out_ids}")

    # Telemetry block
    telemetry = {
        "command": "push",
        "db": args.db,
        "input_pages": len(pages),
        "created": len(out_ids),
        "errors": errors,
        "elapsed_seconds": round(elapsed, 2),
        "dry_run": args.dry_run,
    }
    if args.telemetry_out and not args.dry_run:
        Path(args.telemetry_out).write_text(json.dumps(telemetry, indent=2), encoding="utf-8")
    print(f"\n[telemetry] {json.dumps(telemetry)}")

    return 0 if not errors else 1


def cmd_backlink(args: argparse.Namespace) -> int:
    """Apply a mapping of Notion page -> {field: [related-urls]} updates.

    Map file format (JSON):
    [
      {"page_url": "...", "updates": {"Knowledge Assets Linked": ["url1", "url2"]}},
      {"page_url": "...", "updates": {"Evidence Used as Sources": ["url1", ...]}}
    ]

    Use this to do bulk Evidence <-> KA bidirectional linking after a push.
    """
    entries = json.loads(Path(args.map).read_text(encoding="utf-8"))

    ok = 0
    for i, entry in enumerate(entries):
        url = entry.get("page_url") or entry.get("page_id")
        page_id = extract_uuid(url) if url else ""
        if not page_id:
            print(f"[{i+1}/{len(entries)}] SKIP (no page_url/page_id)", file=sys.stderr)
            continue
        updates = entry.get("updates", {})
        if not updates:
            continue

        result = patch_page_relations(page_id, updates, dry_run=args.dry_run)
        if args.dry_run:
            print(f"[{i+1}/{len(entries)}] DRY-RUN {page_id} fields={list(updates.keys())}")
        else:
            ok += 1
            print(f"[{i+1}/{len(entries)}] OK {page_id} fields={list(updates.keys())}")

        time.sleep(0.35)

    if not args.dry_run:
        print(f"\nUpdated {ok}/{len(entries)} pages")
    return 0


def main() -> int:
    load_env()

    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0] if __doc__ else "")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_push = sub.add_parser("push", help="Create pages in a Notion DB from a validated JSON file")
    p_push.add_argument("--db", required=True,
                        help="Schema key from os-v2-schemas.json: ch_sources_os_v2 | ch_evidence_os_v2 | ch_knowledge_assets_os_v2")
    p_push.add_argument("--json", required=True, help="Path to batch JSON file")
    p_push.add_argument("--out-ids", help="Path to write created page IDs / URLs / titles")
    p_push.add_argument("--telemetry-out", help="Write run telemetry JSON to this path")
    p_push.add_argument("--fail-fast", action="store_true", help="Stop on first error instead of continuing")
    p_push.add_argument("--dry-run", action="store_true", help="Print payload sizes without sending")
    p_push.set_defaults(func=cmd_push)

    p_back = sub.add_parser("backlink", help="Bulk-update relation fields on existing pages")
    p_back.add_argument("--map", required=True, help="Path to backlink-map JSON file")
    p_back.add_argument("--dry-run", action="store_true", help="Print updates without sending")
    p_back.set_defaults(func=cmd_backlink)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
