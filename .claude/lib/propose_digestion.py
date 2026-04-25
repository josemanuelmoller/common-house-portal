"""
propose_digestion.py - Auto-draft the digestion proposal markdown for a new source.

Replaces the manual ~30 minutes of reading + drafting per document. Given the
extracted text from pdf_extract.py + optional scope hints, this script calls
the Anthropic API to produce the first-draft proposal file. The agent then
reviews, edits, and routes to the user.

Usage:
  python .claude/lib/propose_digestion.py \
      --pdf-txt tmp-pdfs/california-source.txt \
      --hints scope.json \
      --out deliverables/california-digestion-proposal.md

scope.json (optional):
  {
    "title_hint": "...",
    "publisher": "...",
    "geographic_scope": "California / North America",
    "partner_org": "Eunomia",
    "related_project": "Eunomia <> CH California",
    "ch_relevance": "opportunity-spotting...",
    "source_type_hint": "Whitepaper",
    "dedup_key_hint": "calrecycle-source-reduction-needs-assessment-2026"
  }

Output: a markdown file matching the proposal-file structure expected by the
`ingest-document` skill (Phase B). The agent reviews + adjusts before the
user-confirmation gate.

Pre-requisites:
  - ANTHROPIC_API_KEY in environment (read from .env.local)
  - .claude/triage-rubric.md present
  - .claude/schemas/os-v2-schemas.json present
  - .claude/skills/ingest-document/SKILL.md present (used as authority)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import anthropic

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_FILE = REPO_ROOT / ".claude" / "schemas" / "os-v2-schemas.json"
RUBRIC_FILE = REPO_ROOT / ".claude" / "triage-rubric.md"
SKILL_FILE = REPO_ROOT / ".claude" / "skills" / "ingest-document" / "SKILL.md"
ENV_FILE = REPO_ROOT / ".env.local"

# Hard cap on PDF text passed to Claude. Most peer-reviewed papers are < 500K
# chars; SB54-style government reports up to ~500K. Sonnet 4.6 + 1M context
# handles this fine.
MAX_PDF_CHARS = 600_000


def _clean_env_value(v: str) -> str:
    """Strip whitespace, quotes, and trailing literal escape sequences.
    Repo had several .env values written with `echo` and got `\\n` appended literally."""
    v = v.strip().strip('"').strip("'")
    # Strip literal trailing escape sequences that may have been baked in by echo
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
    schema = SCHEMA_FILE.read_text(encoding="utf-8") if SCHEMA_FILE.exists() else "(missing)"
    rubric = RUBRIC_FILE.read_text(encoding="utf-8") if RUBRIC_FILE.exists() else "(missing)"

    return f"""You are the Phase B drafter for the Common House `ingest-document` digestion skill.

Your job: read an external research paper / industry report / whitepaper / standard, plus any user-provided scope hints, and produce the FIRST DRAFT of the digestion proposal markdown file. The agent that invokes you will review your draft, refine it, and route it to a human reviewer.

## Output format

Produce ONLY the markdown content. No preamble, no explanation, no code fences. Use the exact section structure below. Match the style precisely - this is consumed by both an agent and a human.

## Required sections in this order

# {{Document title}} - Digestion Proposal

**Status (YYYY-MM-DD):** Phase B - proposal draft. Awaiting agent review then user confirmation before push.

## 1. Source identification

| Field | Value |
|---|---|
| Title | ... |
| Subtitle | ... |
| Author / publisher | ... |
| Contractor (if any) | ... |
| Date | ... |
| Pages | ... |
| Total chars | ... |
| Statutory anchor (if any) | ... |
| Suggested Source Type | ... (must be one of the schema's Source Type options) |
| Suggested Dedup Key | slug-format-key |
| Source URL | ... |

(Below the table, note any cross-references to existing CH context if surfaced via scope hints.)

## 2. Scope decision

Table of sections / chapters / annexes mapped to one of: **Core digest** / **Light digest** / **Skip**, with rationale. Cap to ~12 rows.

Volume estimate: ~N atomic Evidence records, K candidate Knowledge Assets.

## 3. Evidence preview

For 8-12 representative evidence claims, give: ID (E1, E2, ...), proposed Evidence Type (from schema), proposed Reusability Level (per triage rubric), 1-line statement. Do not draft all 70-100 - this is a SAMPLE for the human reviewer.

## 4. Knowledge Asset preview

Propose 4-9 candidate KAs. For each: name (with explicit geographic scope marker if non-canonical), Asset Type (from schema), 1-2 sentence description, evidence-record clusters that feed it.

If any KA likely overlaps an existing CH KA, flag it and propose update-vs-create.

## 5. Cross-references with existing CH KAs

If scope hints mention prior runs (e.g. LATAM Reuse), surface 2-4 likely cross-references explicitly.

## 6. Open questions for the user

3-6 specific questions. Examples: ambiguous Source URL, choice between merge-vs-separate KA, sensitivity-level confirmation, geographic scope edge cases, partner-org linking decisions.

## 7. Estimated push effort

Single table: step / minutes / tool. Rough estimates only.

---

## Drafting rules - STRICT

1. **Use only schema-valid values.** Any Source Type, Asset Type, Reusability Level, Evidence Type, multi-select tag (Topics/Themes, Geography, Affected Theme, Domain/Theme, Subthemes) MUST come from the cached schema below. If unsure, mark as `[verify]`.

2. **Triage tier targets.** For peer-reviewed multi-market research expect ~50-65% Canonical, 25-35% Reusable, 5-10% Possibly Reusable, 0-5% Project-Specific. For single-company / internal docs invert: ~5-15% Canonical, 20-35% Reusable, 30-50% Possibly Reusable, 15-30% Project-Specific.

3. **Geographic scope explicit.** Every non-Canonical KA name should include the geographic marker (e.g. "(California)" or "- LATAM"). Default disclaimer template: "Findings derived from {{region}} case studies. Generalisation to other regions requires validation."

4. **Skip methodology + appendices.** §Methodology, interview-question sections, references, glossaries, abbreviations: skip. Only digest substantive content.

5. **Cite verbatim.** When quoting the source, use 1-2 sentence excerpts in italics or quotes. Don't paraphrase as if it's a quote.

6. **Honest about gaps.** If the document doesn't cover something a CH stakeholder would care about, note the gap explicitly under "Open questions".

7. **Output one file.** Just the markdown body. No frontmatter, no JSON, no explanation outside the markdown.

---

## Schema cache (authoritative for all multi-select / select values)

```json
{schema}
```

## Triage rubric

{rubric}
"""


def user_message(pdf_text: str, hints: dict) -> str:
    """Compose the user message with the source text + scope hints."""
    truncated = False
    if len(pdf_text) > MAX_PDF_CHARS:
        pdf_text = pdf_text[:MAX_PDF_CHARS]
        truncated = True

    parts = []
    parts.append("## Scope hints from user / agent\n")
    if hints:
        parts.append("```json\n" + json.dumps(hints, indent=2, ensure_ascii=False) + "\n```")
    else:
        parts.append("(none provided)")

    parts.append("\n## Extracted document text\n")
    if truncated:
        parts.append(f"(NOTE: source text truncated at {MAX_PDF_CHARS:,} chars)\n")
    parts.append(pdf_text)
    parts.append("\n\n## Now produce the proposal markdown.\n")
    return "\n".join(parts)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf-txt", required=True, help="Path to extracted PDF text (output of pdf_extract.py)")
    parser.add_argument("--hints", help="Path to scope hints JSON (optional)")
    parser.add_argument("--out", required=True, help="Path to write proposal markdown")
    parser.add_argument("--model", default="claude-sonnet-4-6",
                        help="Model id (default: claude-sonnet-4-6). Use claude-opus-4-7 for very large/complex docs.")
    parser.add_argument("--max-tokens", type=int, default=12000)
    args = parser.parse_args()

    load_env()
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return 2

    pdf_text = Path(args.pdf_txt).read_text(encoding="utf-8")
    hints = {}
    if args.hints and Path(args.hints).exists():
        hints = json.loads(Path(args.hints).read_text(encoding="utf-8"))

    client = anthropic.Anthropic()

    sys_blocks = [{
        "type": "text",
        "text": system_prompt(),
        "cache_control": {"type": "ephemeral"},
    }]

    user_blocks = [{
        "type": "text",
        "text": user_message(pdf_text, hints),
    }]

    print(f"Calling {args.model}; pdf={len(pdf_text):,} chars; max_tokens={args.max_tokens}")
    resp = client.messages.create(
        model=args.model,
        max_tokens=args.max_tokens,
        system=sys_blocks,
        messages=[{"role": "user", "content": user_blocks}],
    )

    # Concatenate text content blocks
    out = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")

    Path(args.out).write_text(out, encoding="utf-8")
    print(f"Wrote {len(out):,} chars to {args.out}")
    print(f"Tokens: input={resp.usage.input_tokens} cached={getattr(resp.usage, 'cache_read_input_tokens', 0)} output={resp.usage.output_tokens}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
