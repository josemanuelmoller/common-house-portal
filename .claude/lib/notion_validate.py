"""
Notion validation pre-flight helper for OS v2 ingestion.

Reads .claude/schemas/os-v2-schemas.json and validates that all property values
in a payload conform to the database schema BEFORE calling notion-create-pages.

Catches the failure modes from the LATAM digestion run:
  - Multi-select values not in the option allowlist
  - Select values not in the option allowlist
  - Properties referencing fields that don't exist
  - Wrong type for a field

Usage:

    from notion_validate import validate_pages

    errors = validate_pages(
        db_key="ch_evidence_os_v2",
        pages=[{"properties": {...}}, ...]
    )
    if errors:
        for e in errors:
            print(e)
        raise SystemExit(1)
    # else: safe to call notion-create-pages

If errors is empty, all property values pass schema. The actual API call may still
fail for other reasons (rate limits, network, missing parent), but every multi-select
/ select / type-mismatch validation error from the LATAM run would have been caught here.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_FILE = REPO_ROOT / ".claude" / "schemas" / "os-v2-schemas.json"


def load_schemas() -> dict[str, Any]:
    if not SCHEMA_FILE.exists():
        raise FileNotFoundError(
            f"Schema cache not found at {SCHEMA_FILE}. "
            "Re-export from Notion via the hygiene-agent or by manually fetching "
            "and updating .claude/schemas/os-v2-schemas.json."
        )
    return json.loads(SCHEMA_FILE.read_text(encoding="utf-8"))


def parse_multi_select(raw: Any) -> list[str] | None:
    """Notion API expects multi-select values as JSON-stringified arrays passed
    as TEXT in the properties dict. Accept both formats and normalise."""
    if raw is None:
        return None
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        s = raw.strip()
        if s.startswith("[") and s.endswith("]"):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, list):
                    return parsed
            except json.JSONDecodeError:
                pass
        # Single-value string fallback
        return [s] if s else []
    return None


# Soft length caps (Notion accepts more, but readability + scannability suffer)
LENGTH_CAPS = {
    "title": 120,           # Evidence Title / Asset Name / Source Title
    "statement_short": 800, # Evidence Statement, Summary
    "excerpt": 1500,        # Source Excerpt
}


def validate_page(
    db_schema: dict[str, Any],
    page: dict[str, Any],
    page_index: int,
) -> list[str]:
    errors: list[str] = []
    db_name = db_schema.get("title_field", "<unknown DB>")
    fields = db_schema.get("fields", {})
    title_field = db_schema.get("title_field")

    properties = page.get("properties", {})
    if not isinstance(properties, dict):
        return [f"page[{page_index}]: 'properties' must be an object"]

    # Length checks on title + key text fields
    if title_field and title_field in properties:
        tval = str(properties[title_field])
        if len(tval) > LENGTH_CAPS["title"]:
            errors.append(
                f"page[{page_index}] title '{title_field}': {len(tval)} chars "
                f"exceeds soft cap {LENGTH_CAPS['title']} (truncate or restructure)"
            )

    for short_field in ("Evidence Statement", "Summary"):
        if short_field in properties:
            v = str(properties[short_field])
            if len(v) > LENGTH_CAPS["statement_short"]:
                errors.append(
                    f"page[{page_index}] '{short_field}': {len(v)} chars "
                    f"exceeds soft cap {LENGTH_CAPS['statement_short']}"
                )

    if "Source Excerpt" in properties:
        v = str(properties["Source Excerpt"])
        if len(v) > LENGTH_CAPS["excerpt"]:
            errors.append(
                f"page[{page_index}] 'Source Excerpt': {len(v)} chars "
                f"exceeds soft cap {LENGTH_CAPS['excerpt']}"
            )

    for key, value in properties.items():
        # Strip date-expanded suffixes for lookup
        base_key = key
        if key.startswith("date:"):
            # Format: date:<field>:<sub>
            parts = key.split(":")
            if len(parts) >= 2:
                base_key = parts[1]

        spec = fields.get(base_key)
        if spec is None:
            errors.append(
                f"page[{page_index}] field '{key}': unknown property in schema"
            )
            continue

        ftype = spec.get("type")
        options = spec.get("options")

        if ftype == "select":
            if value is None or value == "":
                continue
            if options is not None and value not in options:
                errors.append(
                    f"page[{page_index}] field '{key}': value '{value}' not in select options. "
                    f"Valid: {options}"
                )

        elif ftype == "multi_select":
            if value is None or value == "":
                continue
            parsed = parse_multi_select(value)
            if parsed is None:
                errors.append(
                    f"page[{page_index}] field '{key}': multi_select must be a list or "
                    f'JSON-stringified array, got {type(value).__name__}'
                )
                continue
            if options is not None:
                for v in parsed:
                    if v not in options:
                        errors.append(
                            f"page[{page_index}] field '{key}': multi_select value '{v}' "
                            f"not in option allowlist. Valid: {options}"
                        )

        elif ftype == "checkbox":
            if value not in (None, "", "__YES__", "__NO__"):
                errors.append(
                    f"page[{page_index}] field '{key}': checkbox must be '__YES__' or '__NO__', got '{value}'"
                )

        # date / text / url / title / relation: no value-list validation here
        # relations are validated by Notion server-side anyway

    return errors


def validate_pages(
    db_key: str,
    pages: list[dict[str, Any]],
    schemas: dict[str, Any] | None = None,
) -> list[str]:
    """Returns a list of human-readable error strings. Empty list = pass.

    db_key examples: 'ch_sources_os_v2', 'ch_evidence_os_v2', 'ch_knowledge_assets_os_v2'
    """
    if schemas is None:
        schemas = load_schemas()

    db_schema = schemas.get(db_key)
    if db_schema is None:
        valid_keys = [k for k in schemas if not k.startswith("_")]
        return [f"unknown db_key '{db_key}'. Valid: {valid_keys}"]

    all_errors: list[str] = []
    for i, page in enumerate(pages):
        all_errors.extend(validate_page(db_schema, page, i))
    return all_errors


def cli() -> int:
    if len(sys.argv) < 3:
        print(
            "usage: notion_validate.py <db_key> <pages_json_path>\n"
            "  db_key: ch_sources_os_v2 | ch_evidence_os_v2 | ch_knowledge_assets_os_v2\n"
            "  pages_json_path: a JSON file containing the 'pages' array",
            file=sys.stderr,
        )
        return 2

    db_key = sys.argv[1]
    pages_path = Path(sys.argv[2])
    pages = json.loads(pages_path.read_text(encoding="utf-8"))

    errors = validate_pages(db_key, pages)
    if errors:
        for e in errors:
            print(f"  X{e}")
        print(f"\n{len(errors)} validation error(s).", file=sys.stderr)
        return 1

    print(f"OK {len(pages)} page(s) pass schema validation for {db_key}.")
    return 0


if __name__ == "__main__":
    sys.exit(cli())
