"""
triage_evidence.py - Apply triage-rubric.md to a batch of evidence statements.

Replaces hand-judgement with a documented, repeatable Claude API call. Reads a
JSON file with proposed evidence (full or partial properties), classifies each
into Canonical / Reusable / Possibly Reusable / Project-Specific per the rubric,
and writes back the file with `Reusability Level` + `Confidence Level` filled
in plus a `_triage_reasoning` annotation.

Usage:
  python .claude/lib/triage_evidence.py \
      --in tmp/payloads/evidence-batch-1.json \
      --out tmp/payloads/evidence-batch-1-triaged.json

The script is non-destructive (writes to --out, leaves --in alone) and idempotent.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import anthropic

REPO_ROOT = Path(__file__).resolve().parents[2]
RUBRIC_FILE = REPO_ROOT / ".claude" / "triage-rubric.md"
ENV_FILE = REPO_ROOT / ".env.local"

VALID_TIERS = ["Project-Specific", "Possibly Reusable", "Reusable", "Canonical"]
VALID_CONFIDENCE = ["Low", "Medium", "High"]


def _clean_env_value(v: str) -> str:
    v = v.strip().strip('"').strip("'")
    while v.endswith(("\\n", "\\r", "\\t")):
        v = v[:-2]
    return v.strip()


def load_env() -> None:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        v = _clean_env_value(v)
        if k.strip() == "ANTHROPIC_API_KEY":
            os.environ["ANTHROPIC_API_KEY"] = v


def system_prompt() -> str:
    rubric = RUBRIC_FILE.read_text(encoding="utf-8") if RUBRIC_FILE.exists() else "(rubric missing)"
    return f"""You are the triage classifier for the Common House `ingest-document` digestion pipeline.

Given a batch of proposed evidence statements (each with: title, statement, source-quality hint, type), assign each one a Reusability Level + Confidence Level per the rubric below. Then return ONLY valid JSON.

## Output format

Respond with a JSON array, one object per input item, in the SAME ORDER as input:

```json
[
  {{
    "index": 0,
    "reusability_level": "Canonical | Reusable | Possibly Reusable | Project-Specific",
    "confidence_level": "Low | Medium | High",
    "reasoning": "1-sentence rule citation from the rubric"
  }},
  ...
]
```

Do NOT include any preamble or trailing commentary. Output only the JSON array.

## Rules

1. Use ONLY the four allowed Reusability Level values.
2. Use ONLY the three allowed Confidence Level values.
3. `confidence_level` reflects source-quality + claim-type:
   - High = peer-reviewed source + direct finding
   - Medium = industry report / multi-case research / single-source interview
   - Low = single anecdote / assumption / weak evidence
4. `reasoning` cites which rubric rule (or test) triggered the tier - keep to ONE sentence.
5. If the input doesn't include a `source_quality` field, infer Medium by default.
6. Be honest about ambiguity: when an item could be Canonical or Reusable, prefer Reusable. When between Reusable and Possibly Reusable, prefer Possibly Reusable. Don't inflate.

## The rubric

{rubric}
"""


def build_input_summary(pages: list[dict]) -> str:
    """Compose a compact representation of the batch for triage."""
    items = []
    for i, page in enumerate(pages):
        props = page.get("properties", {})
        items.append({
            "index": i,
            "title": props.get("Evidence Title", ""),
            "type": props.get("Evidence Type", ""),
            "statement": props.get("Evidence Statement", ""),
            "source_quality": page.get("source_quality_hint", ""),
            "geography": props.get("Geography", ""),
        })
    return json.dumps(items, indent=2, ensure_ascii=False)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="input_path", required=True, help="Input batch JSON")
    parser.add_argument("--out", required=True, help="Output triaged batch JSON")
    parser.add_argument("--model", default="claude-sonnet-4-6")
    parser.add_argument("--max-tokens", type=int, default=8000)
    args = parser.parse_args()

    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2

    pages = json.loads(Path(args.input_path).read_text(encoding="utf-8"))
    summary = build_input_summary(pages)

    client = anthropic.Anthropic()

    print(f"Triaging {len(pages)} evidence records via {args.model}")
    resp = client.messages.create(
        model=args.model,
        max_tokens=args.max_tokens,
        system=[{
            "type": "text",
            "text": system_prompt(),
            "cache_control": {"type": "ephemeral"},
        }],
        messages=[{"role": "user", "content": [{"type": "text", "text": summary}]}],
    )

    raw = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")

    # Parse JSON (be lenient: strip ```json fences if present)
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = "\n".join(cleaned.splitlines()[1:-1])
    try:
        triage = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print(f"Could not parse triage JSON: {e}", file=sys.stderr)
        print(f"Raw output:\n{raw}", file=sys.stderr)
        return 2

    # Apply triage to each page
    by_idx = {item.get("index"): item for item in triage if isinstance(item, dict)}
    for i, page in enumerate(pages):
        t = by_idx.get(i)
        if not t:
            continue
        rl = t.get("reusability_level")
        cl = t.get("confidence_level")
        reason = t.get("reasoning", "")
        if rl in VALID_TIERS:
            page.setdefault("properties", {})["Reusability Level"] = rl
        if cl in VALID_CONFIDENCE:
            page.setdefault("properties", {})["Confidence Level"] = cl
        page["_triage_reasoning"] = reason

    Path(args.out).write_text(json.dumps(pages, indent=2, ensure_ascii=False), encoding="utf-8")

    # Summary tally
    tally: dict[str, int] = {}
    for page in pages:
        rl = page.get("properties", {}).get("Reusability Level", "?")
        tally[rl] = tally.get(rl, 0) + 1
    print(f"Wrote {args.out}")
    print(f"Tally: {json.dumps(tally, indent=2)}")
    print(f"Tokens: input={resp.usage.input_tokens} cached={getattr(resp.usage, 'cache_read_input_tokens', 0)} output={resp.usage.output_tokens}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
