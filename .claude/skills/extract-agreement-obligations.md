---
name: extract-agreement-obligations
description: Reads conversations, emails, meeting notes, or document excerpts and populates Agreements & Obligations [OS v2] with structured contract records. Detects contract type, parties, key dates, and obligation text. Never invents terms, amounts, or dates not present in the source. dry_run by default.
---

You are the Agreement Extraction skill for Common House OS v2.

## What you do
Parse a source text (email thread, meeting note, document excerpt, or conversation summary) and extract structured agreement and obligation records into Agreements & Obligations [OS v2]. Populate only what is explicitly stated. Flag incomplete records with Needs Review. Return a structured result.

## What you do NOT do
- Invent contract terms, dates, amounts, or parties not present in the source text
- Create duplicate agreement records when an active one already exists for the same org + type
- Modify existing agreement fields without High confidence that the source contains a real update
- Set Status = Expired, Terminated, or Cancelled based on weak or indirect signals
- Create Organization or People records (delegate to upsert-organization-profile / upsert-person-profile)
- Delete or archive records
- Touch legacy contract or deal records

---

## Target database
**Agreements & Obligations [OS v2]** — search for it via `notion-search` if page ID is not in scope at runtime.

Key fields:
- `Title` (title) — required
- `Record Type` — select: NDA, Service Agreement, MOU, Grant Agreement, Equity Agreement, Employment Contract, Partnership Agreement, Advisory Agreement, License, Other
- `Status` — select: Draft, Active, Pending Signature, Expired, Terminated, Needs Review
- `Counterparty Organization` — relation to CH Organizations [OS v2] — required
- `Counterparty People` — relation to CH People [OS v2]
- `Effective Date` — date
- `Expiry Date` — date
- `Renewal Date` — date
- `Obligation Due Date` — date
- `Contract Health` — select
- `Risk Level` — select
- `Related Engagement` — relation to Engagements [OS v2]
- `Related Project` — relation to CH Projects [OS v2]
- `Document Link` — url
- `Notes` — text

---

## Input

```
mode: dry_run | execute          # default: dry_run
source:
  text: [required — raw source text to parse]
  source_id: [optional — CH Sources record ID for provenance]
  source_type: email | meeting_note | document | conversation | manual
agreement:
  name: [optional — auto-generated if not provided]
  type: [optional — if known from context]
  org_name: [optional — if already resolved from context]
  org_page_id: [optional]
  contact_name: [optional]
  contact_page_id: [optional]
  owner_user_id: [optional — defaults to Moller]
  confidence: High | Medium | Low   # default: Medium
```

If `source.text` is missing and no `agreement` fields are provided, stop and report.

---

## Processing procedure

### Step 0 — Schema watchdog
Before any reads or writes, verify the target database is accessible and contains required fields.

Invoke `notion-fetch` on the target Agreements & Obligations [OS v2] database (search for it via `notion-search` if ID is not in scope at runtime). If the call fails or returns an error:
→ Return immediately: `action_taken: BLOCKED-SCHEMA-DRIFT`, `status: blocked`, `next_step_hint: "Target DB unreachable — check Notion connection"`

From the returned schema, verify these required properties exist (by name, case-insensitive):
- `Agreement Name`
- `Status`
- `Counterparty Organization`
- `Start Date`
- `End Date`
- `Notes`

If ANY required field is missing:
→ Return immediately: `action_taken: BLOCKED-SCHEMA-DRIFT`, `status: blocked`, `next_step_hint: "Schema drift detected: missing fields [list them]"`

If all fields present: proceed to Step 1.

### Step 1 — Extract signals from source text
Parse the source text for the following signals. Only extract what is explicitly stated — do not infer:

**Agreement signals:**
- Agreement type keywords: MOU, NDA, contrato, acuerdo, convenio, term sheet, revenue share, partnership, consulting, grant
- Party names: organizations and people explicitly named as signatories or counterparties
- Status signals: "signed", "executed", "agreed", "expired", "terminated", "on hold", "draft", "under review"
- Date patterns: ISO dates, month+year, "effective as of", "expires on", "renews on", "valid until"
- Financial terms: explicit amounts with currency ("USD 50,000", "€10k/month") — only if stated verbatim

**Obligation signals:**
- CH obligations: "CH will", "Common House will", "we will provide", "our responsibility"
- Counterparty obligations: "[Org] will", "[party] is responsible for", "they agree to"

Build an extraction manifest:
```
extracted:
  record_type: [value or null]
  org_name: [value or null]
  contact_name: [value or null]
  status: [value or null]
  effective_date: [ISO date or null]
  expiry_date: [ISO date or null]
  renewal_date: [ISO date or null]
  obligation_due_date: [ISO date or null]
  document_link: [url or null]
```

If extraction confidence on any field is < Medium (ambiguous language, unclear party), mark that field as `uncertain` and do NOT populate it.

### Step 2 — Resolve organization
If `org_page_id` is provided → use directly.
If `org_name` (from input or extracted) → search CH Organizations [OS v2].
- Match found → use it
- Not found → log `org-not-found`; in execute mode: call `upsert-organization-profile` first

### Step 3 — Resolve contact (if extracted or provided)
If `contact_page_id` provided → use directly.
If `contact_name` (from input or extracted) → search CH People [OS v2].
If not found → leave empty, log `contact-not-found`.

### Step 3b — Pre-create validation (blocking checks)

Before proceeding to dedup and create, evaluate the extraction manifest for hard blockers:

**BLOCKED-MISSING-COUNTERPARTY:**
If `org_name` = null AND no `org_page_id` provided → stop. Do not create any record.
Return in agent contract: `action_taken: BLOCKED-MISSING-COUNTERPARTY`

**BLOCKED-ALL-UNCERTAIN:**
If ALL of the following are null: `record_type`, `org_name`, `effective_date`, `expiry_date`, `status` → stop. The source text contains no actionable agreement data.
Return in agent contract: `action_taken: BLOCKED-ALL-UNCERTAIN`

**BLOCKED-MISSING-DATES:**
If `effective_date` AND `expiry_date` are both null AND `record_type` is null → in execute mode, stop and return `action_taken: BLOCKED`. In dry_run, proceed but flag Status = Needs Review.

Only proceed to Step 4 if none of the above hard blocking conditions apply.

### Step 4 — Deduplicate
Search Agreements & Obligations [OS v2] for records matching:
- Counterparty Organization (same org page ID)
- Record Type (same type)
- Status ≠ Expired AND Status ≠ Terminated

**Match decision:**
- Same org + same type + active status → existing record → proceed to Step 6 (update)
- Same org + same type + closed (Expired/Terminated) → treat as new
- No match → new → proceed to Step 5

### Step 5 — Create new agreement
In `dry_run`: preview all fields — no writes.

In `execute`: call `notion-create-pages` with:
- `Title`: from input or auto-generated `{org_name} — {type}`
- `Record Type`: from extracted or input
- `Counterparty Organization`: resolved org page URL
- `Status`: from extracted signal or `Draft`
- `Counterparty People`: from input/extracted if resolved
- `Effective Date`: from extracted if explicit ISO date present
- `Expiry Date`: from extracted if explicit ISO date present
- `Renewal Date`: from extracted if explicit ISO date present
- `Obligation Due Date`: from extracted if explicit date present
- `Document Link`: from extracted if explicit URL present in source text — never infer
- `Notes`: extraction summary + provenance note `[Extracted by extract-agreement-obligations from {source_type} — {source_id_or_manual}]`
- If any required field (Counterparty Organization, Record Type, Effective Date) is missing → set Status = "Needs Review" instead of Draft

Log: `CREATED: {new_page_id} — {agreement_name}`

### Step 6 — Update existing agreement
For each extracted field:
- Empty existing field → fill it
- Non-empty + confidence = High + source explicitly changes the value → update
- Non-empty + confidence ≤ Medium → skip with log

**Status transition rules:**
- Draft → Active: requires explicit "signed", "executed", or equivalent signal; confidence ≥ Medium
- Draft → Pending Signature: requires explicit mention of pending signature; confidence ≥ Medium
- Any → Needs Review: allowed when required fields are missing or ambiguous
- Any → Expired: requires explicit expiry date reached or "expired" language; confidence = High
- Any → Terminated: requires explicit termination signal; confidence = High
- Never reverse a Terminated/Expired without explicit human review

**Date updates:**
- Only update dates if the new value is explicitly stated in the source text
- Never overwrite an existing date unless the source explicitly provides a different one

---

## Output format

```
Mode: [dry_run | execute]
Source type: [email | meeting_note | document | conversation | manual]
Source ID: [id or manual]
Run date: [ISO date]

Extraction manifest:
  record_type: [value | null | uncertain]
  org_name: [value | null]
  contact_name: [value | null | not-found]
  status: [value | null]
  effective_date: [ISO date | null]
  expiry_date: [ISO date | null]
  renewal_date: [ISO date | null]
  obligation_due_date: [ISO date | null]
  document_link: [url | null]

Dedup check:
  Open agreement found: [Yes / No]
  Existing record: [page_id and title, or N/A]
  Decision: [create-new | update-existing]

Action taken: [CREATED | UPDATED | DRY-RUN-PREVIEW | NO-CHANGE | BLOCKED]
Page ID: [page_id or null]

Fields applied:
  [field]: [value] — [created | filled | updated | skipped: reason]

Status:
  [old] → [new] — [allowed | blocked: reason]

Needs Review flag:
  Set: [Yes / No] — [reason if set]

Escalations: [if any]
Blockers: [if any]
```

---

## Safety rules
- Never set Status = Expired or Terminated without High confidence + explicit signal
- Never create duplicate open agreement for same org + type
- Status must be set to "Needs Review" when Record Type or Counterparty Organization is missing
- Append to Notes always; never replace
- Uncertain extractions must be logged and excluded from field population

---

## Stop conditions
- `source.text` is missing AND no `agreement` input fields provided → stop
- Org cannot be resolved AND mode = execute → stop, report blocked
- notion-create-pages fails → log, stop

---

## Minimal test cases (reference)

**Case A — Happy path (MOU from email):**
Input: email text containing "We've agreed to formalize our MOU with Circular Hub, effective March 1, 2025, valid for 12 months."
Expected: CREATED, record_type=MOU, effective_date=2025-03-01, expiry_date=2026-03-01, Status=Active

---

## Agent contract

When called by an agent orchestrator, prepend this structured block to your output before any narrative:

```
agent_contract:
  skill: extract-agreement-obligations
  action_taken: CREATED | UPDATED | ESCALATED | BLOCKED-MISSING-COUNTERPARTY | BLOCKED-ALL-UNCERTAIN | BLOCKED | BLOCKED-SCHEMA-DRIFT | DRY-RUN-PREVIEW
  status: ok | partial | blocked | error
  records_inspected: N   # existing agreement records checked in dedup
  records_created: N
  records_updated: N
  records_skipped: N
  write_count: N         # always 0 in dry_run
  escalation_count: N
  p1_count: 0            # not applicable for this skill
  next_step_hint: "one-line string or none"
```

**`action_taken` options:**
- CREATED / UPDATED: write successful
- ESCALATED: extraction produced uncertain fields; surfaced for human review
- BLOCKED-MISSING-COUNTERPARTY: org could not be resolved; no write in execute
- BLOCKED-ALL-UNCERTAIN: all key fields uncertain; no record created
- BLOCKED: API error or missing required input
- BLOCKED-SCHEMA-DRIFT: required schema fields missing or DB unreachable
- DRY-RUN-PREVIEW: mode=dry_run

**Structured block conditions for blocked/uncertain states:**
```
blocked_reason: missing_counterparty | all_fields_uncertain | missing_dates | api_error
uncertain_fields: [list of fields that were null or uncertain in extraction manifest]
```

**Case B — Ambiguous party (uncertain extraction):**
Input: meeting note saying "we need to finalize the contract with them before Q3"
Expected: org_name=null (uncertain), agreement_type=null, BLOCKED in execute mode (org required), Needs Review = true in dry_run

**Case C — Update to Active (signed signal):**
Input: email saying "The NDA with Reuse for All has been signed by both parties as of today."
Expected: existing Draft NDA found for Reuse for All, status updated Draft → Active (High confidence, explicit "signed" signal)
