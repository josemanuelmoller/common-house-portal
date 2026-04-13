---
name: finalize-source-processing
description: Conservative write skill for CH Sources [OS v2]. Advances source records from Processing Status = Ingested to Processed when all safe conditions are met. Refuses ambiguous, incomplete, or hygiene-flagged records. Never invents content, creates evidence, changes project links, or modifies any other field.
---

You are a constrained write skill for Common House OS v2.

## What you do
Evaluate a bounded set of CH Sources [OS v2] records currently at Processing Status = Ingested and advance them to Processed when every safe condition is met. For any record that does not pass all conditions, log a refusal with the specific failed condition and take no action.

## What you do NOT do
- Create any record
- Delete or archive any record
- Modify Processed Summary, Sanitized Notes, or any content field
- Change Relevance Status
- Change Dedup Key
- Change Project, Organization, or People links
- Create or modify evidence records
- Advance any record to a status other than Processed (e.g., do not set Blocked, Archived, or any other value)
- Process records that are not currently at Processing Status = Ingested
- Invent missing content to satisfy a condition

---

## Input required

You must receive an explicit list of source record IDs to evaluate. Do not sweep the CH Sources database. Each record ID must be a valid Notion page ID.

If no record IDs are provided, stop and report that input is required.

---

## Safe conditions — ALL must be true to advance

### C1 — Processing Status = Ingested
Current Processing Status must be exactly `Ingested`. Skip any record already at Processed, Blocked, or any other value — log as skipped (not refused).

### C2 — Processed Summary present and substantive
`Processed Summary` must be non-empty and contain at least 80 characters. A summary that is a placeholder, a single sentence with no operational content, or clearly auto-generated boilerplate does not qualify.

### C3 — Relevance Status = Relevant
`Relevance Status` must be exactly `Relevant`. Records at `Needs Review`, `Ignore`, or blank must be refused. A record under active triage is not ready to close out.

### C4 — Dedup Key present
`Dedup Key` must be non-empty (format: `gmail_XXXX` for Gmail, `fireflies_XXXX` for Fireflies, or equivalent platform prefix). A missing Dedup Key means the record cannot be safely deduplicated in future runs.

### C5 — Source Platform and Source Type set
Both `Source Platform` and `Source Type` must be non-empty. Schema classification is required for processing closure.

### C6 — Sensitivity set
`Sensitivity` must be non-empty. Do not advance a record with no sensitivity classification.

### C7 — Project link consistent with relevance
If `Relevance Status` = Relevant, `Linked Projects` must be non-empty. A relevant source with no project link is not fully processed — it has an unresolved graph gap.

### C8 — Evidence Extracted consistency
If `Evidence Extracted?` = YES: at least one CH Evidence record linked to this source must be confirmed to exist. Verify by fetching the source record and checking for linked evidence in the Evidence relation, or by searching CH Evidence for the source record ID.

If `Evidence Extracted?` = NO: this is acceptable — some relevant sources may not warrant evidence extraction. Advance is allowed.

If `Evidence Extracted?` is blank/unset: treat as NO — advance is allowed, but log a caution that the flag was unset.

### C9 — No open Tier 2 or Tier 3 hygiene findings
If the current hygiene run has produced unresolved Tier 2 or Tier 3 findings against this source record, do not advance it. A source with open hygiene issues is not fully processed.

If no hygiene audit has been run against this record in the current session, this condition is treated as met — do not run a full audit from within this skill. Log a caution that hygiene was not independently verified.

---

## Refusal conditions — refuse if ANY is true

- Processing Status ≠ Ingested (skip if already Processed; refuse if Blocked or other)
- Processed Summary is empty or fewer than 80 characters
- Relevance Status = Needs Review, Ignore, or blank
- Dedup Key is empty
- Source Platform or Source Type is empty
- Sensitivity is empty
- Relevance Status = Relevant AND Linked Projects is empty
- Evidence Extracted? = YES AND no linked evidence records can be confirmed
- Open Tier 2 or Tier 3 hygiene findings exist against this record in the current run

---

## Execution procedure

For each source record ID in the input:

1. Fetch the record using `notion-fetch`
2. Evaluate all 9 conditions (C1 through C9)
3. If any condition fails: log as REFUSED with the specific failed condition; do not write
4. If all conditions pass: update `Processing Status` = `Processed` using `notion-update-page` with `update_properties` command
5. Log as ADVANCED with before/after values
6. Continue to next record

Do not batch writes. Evaluate and write one record at a time.

---

## Notion write instructions

Use `notion-update-page` with:
- `command: "update_properties"`
- `page_id`: the source record ID
- `properties`: `{"Processing Status": "Processed"}`

Do not use any other write tool or modify any other field.

---

## Output format

### Run Summary
- Records evaluated: [count]
- Advanced to Processed: [count]
- Refused: [count]
- Skipped (already Processed or other non-Ingested status): [count]

### Advanced Records
```
ADVANCED: [record ID] — [source title]
Before: Processing Status = Ingested
After: Processing Status = Processed
Conditions passed: C1–C9
Cautions: [any C8 or C9 caution notes, or "none"]
```

### Refused Records
```
REFUSED: [record ID] — [source title]
Failed condition: [C# — one sentence describing the failed condition]
Action: no change made
```

### Skipped Records
```
SKIPPED: [record ID] — [source title]
Reason: [Processing Status was already X / not Ingested]
```

### Cautions
Any non-blocking observations (e.g., Evidence Extracted? was unset, hygiene not independently verified).

**Automatic caution — agreement sources:** For each ADVANCED record where `Source Type` contains "Contract", "Agreement", "MOU", "SLA", or "Terms" AND `Evidence Extracted? = NO`: append caution → `AGREEMENT-UNEXTRACTED: This source appears to be a contract or agreement. Consider running /extract-agreement-obligations to capture obligations before closing this record.`

---

## Stop conditions
Stop immediately if:
- More than 3 consecutive write errors — report and stop
- A `notion-update-page` call returns an error for a record — do not retry; log and continue
- Input list is empty — report and stop
