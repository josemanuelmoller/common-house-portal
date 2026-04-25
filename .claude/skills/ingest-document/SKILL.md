---
name: ingest-document
description: |
  End-to-end digestion pipeline for research papers, industry reports, whitepapers,
  and standards into Common House OS v2. Triggers when the user wants to ingest a
  PDF or external document (not a Gmail thread, not a Fireflies meeting) and have
  it broken down into Source + atomic Evidence + candidate Knowledge Assets.
  Proposal-first by default. Bidirectional links between Evidence and Knowledge Assets.
  Schema-validated before every Notion write.
trigger_examples:
  - "Ingest this PDF into the platform"
  - "Digerí este paper / whitepaper / industry report"
  - "Run the digestion pipeline on this document"
  - "Process this research report into OS v2"
when_not_to_use:
  - For Gmail threads → use ingest-email-thread skill
  - For Fireflies meetings → use ingest-conversation skill
  - For one-shot KA creation without Evidence layer → use the existing /api/ingest-library admin route
inputs:
  - PDF file path (local) or stable URL
  - Optional: scope hints (geography, partner org, related project, sensitivity)
  - Optional: which sections to digest vs skip (full doc vs core)
outputs:
  - Source record in CH Sources [OS v2]
  - N atomic Evidence records in CH Evidence [OS v2] (bidirectionally linked to Source)
  - K candidate Knowledge Assets in CH Knowledge Assets [OS v2] (status=Draft, with Evidence backlinks)
  - Audit trail markdown file in deliverables/{slug}-digestion-proposal.md
---

# ingest-document

Digest a research paper / industry report / whitepaper / standard into OS v2.
This skill exists to avoid the manual hand-stitching that the LATAM Reuse Policy run required.

## Foundational rules (do not skip)

1. **Schemas are authoritative.** Before any Notion write, load
   `.claude/schemas/os-v2-schemas.json`. Every multi-select / select value MUST
   be validated against this file. Use `.claude/lib/notion_validate.py`.
2. **Triage is documented, not vibes-based.** Assign every Evidence record a
   `Reusability Level` using `.claude/triage-rubric.md`. Cite the rule that
   triggered the tier (Canonical / Reusable / Possibly Reusable / Project-Specific).
3. **Proposal-first.** Always write the audit file BEFORE Notion writes. User
   reviews. User confirms. Then push.
4. **Geographic scope is explicit.** Every KA derived from this skill MUST have
   geographic scope in the title or as a disclaimer in `Canonical Guidance / Main Body`.
   Default disclaimer for non-canonical KAs: *"Findings derived from {region} case
   studies. Generalisation to other regions requires validation."*
5. **Bidirectional links.** When a KA references Evidence, set BOTH:
   - KA's `Evidence Used as Sources` → list of Evidence URLs
   - Each Evidence's `Knowledge Assets Linked` → list of KA URLs
   This requires a 2-pass write (Evidence first, then KA, then Evidence update).
6. **Dedup before create.** Compute a stable `Dedup Key` for the Source
   (e.g. `slug(title)-{year}`). Query CH Sources for existing Dedup Key before
   creating. If exists → STOP and ask user whether to update vs abort.

## Phase A — Extract + structure

Run the PDF extractor:

```bash
python .claude/lib/pdf_extract.py <input.pdf> <output.txt>
```

The output is a page-numbered text dump. Skim the table of contents to confirm
the document type (research paper / industry report / whitepaper / standard).

## Phase B — Plan + propose (NOW AUTOMATED)

Build a `scope.json` capturing what you know about the document up front:

```json
{
  "title_hint": "...",
  "publisher": "...",
  "geographic_scope": "...",
  "partner_org": "...",
  "related_project": "...",
  "ch_relevance": "...",
  "source_type_hint": "Research Report | Industry Report | Whitepaper | Standard | Document",
  "dedup_key_hint": "..."
}
```

Then call the Phase B drafter — it auto-generates the first draft of the proposal:

```bash
python .claude/lib/propose_digestion.py \
  --pdf-txt <output.txt> \
  --hints scope.json \
  --out deliverables/{slug}-digestion-proposal.md
```

The drafter uses the cached schema + triage rubric + skill rules to produce a structured proposal markdown. Review it. Edit any incorrect schema-value choices, KA-naming conflicts, or scope decisions. Surface dedup checks (search CH Sources by title keywords + suggested Dedup Key).

**Pause here.** Show the proposal to the user. Wait for confirmation on the open questions before pushing.

## Phase C — Push (after confirmation)

### Phase C.1 — Source record

1. Search CH Sources for existing Dedup Key.
2. If found → ask user: update existing or skip?
3. If not found → create with these fields:
   - Source Title (title)
   - Source Type: choose from schema valid values (typically "Document")
   - Source Platform: "Web" if external paper, "Upload" if PDF was uploaded to library-docs
   - Source Date (publication date)
   - Source URL (publisher URL or Supabase signed URL)
   - Processing Status: "Processed"
   - Relevance Status: "Relevant"
   - Knowledge Relevant?: __YES__
   - Evidence Extracted?: __YES__
   - Native Source Record?: __YES__
   - Dedup Key: stable slug-year
   - Source External ID: ISBN/DOI/internal-ref
   - Processed Summary: ≤500 chars synthesis
   - Sanitized Notes: methodology + author + reviewer details

### Phase C.2 — Evidence batch creation

For each batch of ≤25 records:

1. Build payload as a list of pages with `properties` dict and save as JSON file (e.g. `tmp/payloads/evidence-batch-1.json`).

2. **Validate** with `notion_validate.py`:

   ```bash
   python .claude/lib/notion_validate.py ch_evidence_os_v2 tmp/payloads/evidence-batch-1.json
   ```

   If errors → fix and re-validate. Do NOT push until clean.

3. **Push via the wrapper** (NOT via notion-create-pages MCP — the wrapper saves ~80% of agent context):

   ```bash
   python .claude/lib/notion_push.py push \
     --db ch_evidence_os_v2 \
     --json tmp/payloads/evidence-batch-1.json \
     --out-ids tmp/payloads/evidence-batch-1-ids.json
   ```

   The script transforms the flat MCP-format payload to Notion-API-native format, posts via `NOTION_API_KEY`, and writes returned page IDs/URLs/titles to the `--out-ids` file. Use `--dry-run` first if you want to confirm payload sizes.

4. For each evidence record (in the JSON file):
   - Evidence Title: ≤120 char descriptive headline
   - Evidence Statement: 2-3 sentence atomic claim
   - Evidence Type: from schema (Approval / Blocker / Process Step / Stakeholder / Risk / Objection / Decision / Requirement / Dependency / Outcome / Assumption / Contradiction / Insight Candidate / Milestone / Traction)
   - Reusability Level: per triage rubric
   - Validation Status: "New"
   - Confidence Level: "High" for peer-reviewed, "Medium" for industry, "Low" for single-anecdote
   - Sensitivity Level: "Shareable" for public sources, "Internal" for client docs
   - Topics / Themes: from schema multi-select valid values ONLY
   - Geography: from schema multi-select valid values (UK / EU / LATAM / North America / Africa-MENA / Asia / Global)
   - Affected Theme: from schema multi-select valid values (NOT same as Topics — distinct allowlists)
   - Source Record: relation array with the Source URL from C.1
   - Source Excerpt: short verbatim quote (1-2 sentences) backing the claim
   - Date Captured: today
4. Push via `notion-create-pages`. Capture all returned IDs/URLs.

### Phase C.3 — Knowledge Asset candidates

After all Evidence is created and IDs captured:

1. Search CH Knowledge Assets by name to detect potential overlap with existing KAs.
2. If overlap detected → propose an update to the existing KA (use `update-knowledge-asset` skill flow). Do NOT create a duplicate.
3. If no overlap → create new candidates. For each:
   - Asset Name: includes geographic scope marker (e.g. " — LATAM", " — NA", "(California)")
   - Asset Type: from schema (Framework / Pattern Library / Playbook / Sector Insight / etc)
   - Status: "Draft"
   - Sensitivity Level: "Public-Facing" for academic, "Restricted Internal" for client-derived
   - Portal Visibility: "portfolio" (default for candidates)
   - Operationally Active?: __NO__
   - Living Room Theme: __NO__
   - Migration Status: "Not Migrated"
   - Domain / Theme: from schema valid values (note: "Latam" and "Latin America" both exist; pick one consistently)
   - Subthemes: from schema valid values (note: "Governance" is NOT valid here; only Approvals / Training / Operations / Stakeholders / Rollout / Procurement / Legal / Metrics)
   - Source File URL: publisher URL or signed URL
   - Version: "0.1 (candidate)"
   - Summary: ≤500 chars
   - Canonical Guidance / Main Body: structured markdown with sections
   - Evidence Used as Sources: relation array of Evidence URLs that feed this KA

### Phase C.4 — Backlink Evidence ↔ KA (auto, via wrapper)

After Source + Evidence + KAs are created and you have all returned IDs (in the `*-ids.json` files from `notion_push.py push --out-ids`), build a single backlink-map JSON file. Format:

```json
[
  {"page_url": "https://www.notion.so/<KA-uuid>",
   "updates": {"Evidence Used as Sources": ["evidence-url-1", "evidence-url-2"]}},
  {"page_url": "https://www.notion.so/<evidence-uuid>",
   "updates": {"Knowledge Assets Linked": ["ka-url-1", "ka-url-2"]}}
]
```

Then push all updates in one wrapper call:

```bash
python .claude/lib/notion_push.py backlink --map tmp/payloads/backlink-map.json
```

The wrapper handles rate limiting (Notion 3 req/s), error reporting, and dry-run via `--dry-run`. This step is REQUIRED for Evidence to be discoverable from the Knowledge layer by downstream agents (`score-signal`, `knowledge-curator`).

### Mapping discipline

Track `evidence_to_ka_map` as you draft proposals — for each evidence item, note which KA(s) it should feed. Persist it in `tmp/payloads/evidence_ka_map.json` so Phase C.4 has structured input rather than reverse-engineering from titles.

## Phase D — Audit

Update the proposal file `deliverables/{slug}-digestion-proposal.md` with:

1. Source Notion URL
2. Evidence count + URLs (or a summary if many)
3. KA URLs
4. Validation errors encountered + how resolved
5. Any deferred items (e.g. file upload to Supabase if service key not available)

If a non-obvious technical finding emerged (e.g. bucket location, schema gap, dedup collision), save a **reference memory** in
`C:\Users\josem\.claude\projects\C--Users-josem-OneDrive-Escritorio-Claude-Code\memory\`.

## Schema reference (always read this)

`.claude/schemas/os-v2-schemas.json` is the authoritative cache. Re-export weekly via the hygiene-agent or by manually fetching CH Sources / CH Evidence / CH Knowledge Assets via notion-fetch.

Common pitfalls (from LATAM run):

- `"Governance"` is valid in `Affected Theme` (Evidence) but NOT in `Subthemes` (KA)
- `"Behaviour Change"` is valid in `Topics / Themes` (Evidence) but NOT in `Affected Theme` (Evidence)
- `"Commercial"` is valid in `Affected Theme` (Evidence) but NOT in `Topics / Themes` (Evidence)
- Multi-select properties pass as JSON-stringified arrays in the `properties` dict (e.g. `"[\"Reuse\", \"Policy\"]"`), not as plain Python lists
- Date fields use expanded keys: `"date:Source Date:start": "2025-12-01"`
- Checkbox fields use `"__YES__"` / `"__NO__"` strings, not booleans

## Triage tier targets (sanity check)

For peer-reviewed multi-market research, expect ~50-65% Canonical, 25-35% Reusable, 5-10% Possibly Reusable, 0-5% Project-Specific. Significant deviation = re-examine triage decisions.

## Cost-aware batching

Notion `notion-create-pages` accepts up to 100 pages per call but JSON payload size grows linearly. Stay at ≤25 records per batch to keep payloads reviewable and to limit blast radius if a batch fails validation.

## Reference dependencies

| Path | Purpose |
|---|---|
| `.claude/schemas/os-v2-schemas.json` | Schema cache (CH Sources / Evidence / KA + multi-select valid values) |
| `.claude/triage-rubric.md` | Triage decision rules (Canonical/Reusable/Possibly/Project) |
| `.claude/lib/pdf_extract.py` | PDF → page-numbered text dump |
| `.claude/lib/propose_digestion.py` | Phase B: auto-draft proposal markdown via Claude API |
| `.claude/lib/notion_dedup.py` | Phase C.0: detect Source duplicates by Dedup Key + fuzzy title |
| `.claude/lib/notion_validate.py` | Pre-flight schema validator + length checks |
| `.claude/lib/triage_evidence.py` | Apply triage rubric to evidence batch via Claude API |
| `.claude/lib/notion_push.py` | Push validated batches via Notion API directly (saves ~80% context vs MCP inlining) |
| `.claude/lib/append_audit_to_source.py` | Append digestion audit to Source body for Notion governance |

## Recommended end-to-end command sequence

```bash
# Phase A
python .claude/lib/pdf_extract.py paper.pdf paper.txt

# Phase B (auto-drafted)
python .claude/lib/propose_digestion.py --pdf-txt paper.txt --hints scope.json --out deliverables/{slug}-proposal.md

# Phase C.0 (dedup check)
python .claude/lib/notion_dedup.py --dedup-key "{slug}" --title-keywords "key terms"
# exit 1 = pause for user; exit 0 = safe to proceed

# Phase C.1 (Source push)
python .claude/lib/notion_validate.py ch_sources_os_v2 source.json
python .claude/lib/notion_push.py push --db ch_sources_os_v2 --json source.json --out-ids source-ids.json --telemetry-out source-telemetry.json

# Phase C.2 (Evidence batch — repeat per batch)
python .claude/lib/triage_evidence.py --in evidence-batch-1.json --out evidence-batch-1-triaged.json
python .claude/lib/notion_validate.py ch_evidence_os_v2 evidence-batch-1-triaged.json
python .claude/lib/notion_push.py push --db ch_evidence_os_v2 --json evidence-batch-1-triaged.json --out-ids evidence-batch-1-ids.json

# Phase C.3 (KAs)
python .claude/lib/notion_validate.py ch_knowledge_assets_os_v2 kas.json
python .claude/lib/notion_push.py push --db ch_knowledge_assets_os_v2 --json kas.json --out-ids kas-ids.json

# Phase C.4 (bidirectional backlinks)
python .claude/lib/notion_push.py backlink --map evidence_ka_map.json

# Phase D (audit appended to Notion)
python .claude/lib/append_audit_to_source.py --source-url <source-url> --audit-md deliverables/{slug}-proposal.md
```

## What changed in P2/P3/P4 (vs original skill)

- **Schema enrichments**: Topics/Themes added `Equity / Inclusion`, `Investment / Finance`, `Industry / Government`. KA gained `Related Knowledge Assets` self-relation + `Linked Strategic Objectives` text field. Evidence also gained `Linked Strategic Objectives`.
- **Length validation**: validator now flags titles > 120 chars and statements > 800 chars (soft caps for readability).
- **Auto-dedup**: `notion_dedup.py` runs before any Source create. Exit code 1 = pause for user.
- **Triage classifier**: `triage_evidence.py` applies rubric via Claude API. Removes hand-judgement from large batches.
- **Telemetry**: `notion_push.py push --telemetry-out` emits a JSON block with input/created/errors/elapsed per run.
- **Audit-as-Notion-record**: `append_audit_to_source.py` makes proposal/audit queryable inside Notion (idempotent via header marker).
- **Strategic objective linkage**: populate `Linked Strategic Objectives` (text field, comma-separated objective IDs from Supabase `strategic_objectives` table) on Evidence + KAs that score against the strategic plan. score-signal agent reads this field via Notion + joins with Supabase.

## What this skill does NOT do

- Upload the PDF to Supabase library-docs (requires SUPABASE_SERVICE_KEY; see reference_library_docs_bucket.md). For research papers with stable publisher URLs, this is fine. For internal docs, route through `/api/ingest-library` admin endpoint instead.
- Link to `strategic_objectives` (Supabase) — pending P2 schema enhancement.
- Auto-classify the source as one of CH's Asset Types — that's done in the proposal phase by reading the document.
