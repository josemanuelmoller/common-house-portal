"""
notion_dedup.py - Search Notion CH Sources for likely duplicates of a candidate Source.

Used as Phase C.0 by the ingest-document skill: BEFORE creating a new Source
record, run this to detect likely duplicates by Dedup Key (exact) + title
keywords (fuzzy). Output is a small JSON report the agent surfaces to the user.

Usage:
  python .claude/lib/notion_dedup.py \
      --dedup-key "calrecycle-source-reduction-needs-assessment-2026" \
      --title-keywords "California SB 54 source reduction Eunomia" \
      --out tmp/dedup-report.json

Exit codes:
  0 = no likely dupes found (safe to create)
  1 = likely dupe(s) found (agent should pause + confirm with user)
  2 = error
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_FILE = REPO_ROOT / ".claude" / "schemas" / "os-v2-schemas.json"
ENV_FILE = REPO_ROOT / ".env.local"
NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"


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
    key = os.environ.get("NOTION_API_KEY")
    if not key:
        raise SystemExit("NOTION_API_KEY not set")
    return {
        "Authorization": f"Bearer {key}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }


def search_workspace(query: str, page_size: int = 25) -> list[dict]:
    """Use Notion's search endpoint (workspace-wide). Filters to pages."""
    payload = {
        "query": query,
        "page_size": page_size,
        "filter": {"value": "page", "property": "object"},
    }
    r = requests.post(f"{NOTION_API}/search", headers=headers(), json=payload, timeout=30)
    if not r.ok:
        return []
    return r.json().get("results", [])


def query_sources_by_dedup_key(data_source_id: str, dedup_key: str) -> list[dict]:
    """Query CH Sources by exact Dedup Key match.

    Uses data_sources/{id}/query (2025-09-03 API), NOT databases/{id}/query
    (which only works for older API versions / single-source DBs).
    """
    payload = {
        "filter": {
            "property": "Dedup Key",
            "rich_text": {"equals": dedup_key},
        },
        "page_size": 5,
    }
    r = requests.post(
        f"{NOTION_API}/data_sources/{data_source_id}/query",
        headers=headers(),
        json=payload,
        timeout=30,
    )
    if not r.ok:
        return []
    return r.json().get("results", [])


def extract_title(page: dict) -> str:
    props = page.get("properties", {})
    for v in props.values():
        if v.get("type") == "title":
            t = v.get("title", [])
            if t and isinstance(t, list):
                return "".join(seg.get("plain_text", "") for seg in t)
    return ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dedup-key", help="Exact Dedup Key to match in CH Sources")
    parser.add_argument("--title-keywords", help="Title keywords for fuzzy workspace search")
    parser.add_argument("--out", help="Output JSON path for dedup report")
    args = parser.parse_args()

    load_env()
    schemas = json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))
    src_schema = schemas["ch_sources_os_v2"]
    ds_id = src_schema["data_source_id"]
    db_id = src_schema["database_id"]

    report: dict = {
        "dedup_key_query": args.dedup_key,
        "title_keywords": args.title_keywords,
        "exact_dedup_matches": [],
        "fuzzy_title_matches": [],
        "verdict": "safe-to-create",
    }

    if args.dedup_key:
        exact = query_sources_by_dedup_key(ds_id, args.dedup_key)
        for page in exact:
            report["exact_dedup_matches"].append({
                "id": page.get("id"),
                "url": page.get("url"),
                "title": extract_title(page),
            })

    if args.title_keywords:
        fuzzy = search_workspace(args.title_keywords, page_size=10)
        for page in fuzzy:
            # Filter to results that look like CH Sources entries
            parent = page.get("parent", {})
            if parent.get("database_id", "").replace("-", "") == db_id.replace("-", ""):
                report["fuzzy_title_matches"].append({
                    "id": page.get("id"),
                    "url": page.get("url"),
                    "title": extract_title(page),
                })

    if report["exact_dedup_matches"]:
        report["verdict"] = "DUPE-EXACT-STOP"
    elif report["fuzzy_title_matches"]:
        report["verdict"] = "POSSIBLE-DUPE-CONFIRM-WITH-USER"

    out = json.dumps(report, indent=2, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(out, encoding="utf-8")
        print(f"Wrote dedup report to {args.out}")
    print(out)

    if report["verdict"] == "DUPE-EXACT-STOP":
        return 1
    if report["verdict"] == "POSSIBLE-DUPE-CONFIRM-WITH-USER":
        return 1  # caller should pause
    return 0


if __name__ == "__main__":
    sys.exit(main())
