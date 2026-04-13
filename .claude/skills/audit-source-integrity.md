---
name: audit-source-integrity
description: Read-only audit of CH Sources [OS v2]. Detects ingested sources with missing summaries, relevant sources without project links, dedup key gaps, stale blocked records, and Evidence Extracted inconsistencies. Returns a structured findings report. Never writes to any database.
---

You are running a read-only integrity audit on CH Sources [OS v2].

## What you do
Inspect a defined scope of CH Sources records and return a structured findings report. You detect structural issues, graph gaps, and flow breakdowns that a human reviewer should act on.

## What you do NOT do
- Update any source record
- Update any evidence record
- Update any project, organization, or people record
- Create any record in any database
- Delete or archive any record
- Call any write tool (notion-update-page, notion-create-pages, notion-move-pages)

If you are tempted to fix something, stop. Log it in the findings report instead.

---

## Operating scope

Work only on the explicitly provided scope:
- A list of source record IDs, OR
- A project scope (linked CH Projects record ID) that filters the audit to sources linked to that project, OR
- A time window applied to Source Date or ingestion date

If no scope is provided, stop and ask for one. Do not sweep the entire CH Sources database.

---

## How to read source records

Use `notion-fetch` to read individual source records by page ID.
Use `notion-query-database-view` on CH Sources [OS v2] (`6f804e20-834c-4de2-a746-f6343fc75451`) with filter parameters to retrieve scoped batches.
Use `notion-search` to check for duplicate dedup keys or similar source titles within the scope.

Do not use write tools for any read operation.

---

## Checks to run

Run all of the following checks on each source record in scope. Log every finding with the record ID, record title, check name, and a one-line description of the issue.

### 1. Processed source with missing Processed Summary
`Processing Status` = Processed AND `Processed Summary` is empty.
A source marked as Processed must have a summary. An empty summary means the processing step was incomplete.

### 2. Ingested source with missing Processed Summary
`Processing Status` = Ingested AND `Processed Summary` is empty.
An Ingested source has not yet been processed — this is expected. Flag only if the Source Date is more than 7 days old and Relevance Status = Relevant. Stale ingested-but-unprocessed relevant sources need attention.

### 3. Relevant source with no Project link
`Relevance Status` = Relevant AND `Linked Projects` is empty.
Relevant sources should be linked to at least one project. Unlinked relevant sources are operationally invisible.

### 4. Missing Dedup Key
`Dedup Key` is empty.
Every source record must have a dedup key (format: `gmail_XXXX` for Gmail threads, `fireflies_XXXX` for Fireflies transcripts). A missing dedup key means the record cannot be checked against future duplicates.

### 5. Duplicate Dedup Key
Two or more records in scope share the same `Dedup Key`.
A dedup key must be unique across CH Sources. Duplicates indicate the dedup check failed during ingestion. Flag all records sharing the same key.

### 6. Evidence Extracted inconsistency
`Evidence Extracted?` = YES (checked) AND no CH Evidence records are linked to this source record.
This means the source was marked as having evidence extracted, but no evidence records exist linked to it. Either the evidence was deleted or the flag was set incorrectly.

Conversely: `Evidence Extracted?` = NO (unchecked) AND CH Evidence records ARE linked to this source.
The flag was never updated after extraction. (This is a lower-priority finding — the evidence exists, it is just the flag that is stale.)

### 7. Stale Blocked source
`Processing Status` = Blocked AND `Source Date` is more than 30 days ago.
Blocked sources should either be resolved or explicitly marked Ignore. A long-stale Blocked source is a flow breakdown.

### 8. Needs Review without Ignore Reason
`Relevance Status` = Needs Review AND `Ignore Reason` is empty AND `Source Date` is more than 14 days old.
Sources in Needs Review should be triaged within two weeks. After that they need either a decision (link a project, or set Ignore) or an Ignore Reason explaining why they are in limbo.

### 9. Missing Source Platform or Source Type
`Source Platform` is empty OR `Source Type` is empty.
Both fields are required for classification and filtering. A source without platform or type cannot be reliably used in queries.

### 10. Missing Sensitivity or Access Level
`Sensitivity` is empty OR `Access Level` is empty.
Both are required. Default is Internal / Internal. Absence means the record was never reviewed for sensitivity.

### 11. Missing Linked Organization
`Linked Organizations` is empty AND `Relevance Status` = Relevant.
Relevant sources should be linked to at least one organization. An organizationally unlinked relevant source cannot be used in org-level analysis.

### 12. Processed source with empty Sanitized Notes
`Processing Status` = Processed AND `Sanitized Notes` is empty.
Sanitized Notes are the curated content layer between the raw source and the Evidence extraction step. A processed source without sanitized notes means the processing step was incomplete.

### 13. Knowledge Relevant source without Knowledge Asset link
`Knowledge Relevant?` = YES AND no Knowledge Asset is linked.
If a source has been flagged as relevant to a knowledge asset, it should be linked. An unlinked knowledge-relevant source will not surface in knowledge asset review.

### 14. Source Title missing or placeholder
`Source Title` is empty OR appears to be a raw thread subject line pasted without sanitization (e.g., starts with "Re:", "Fwd:", "FW:", or "RE:").
Source Titles should be clean, descriptive titles written during ingestion — not raw email subject lines.

---

## Output format

Return a structured findings report with the following sections:

### Audit Summary
- Scope: [project name / record IDs / time window used]
- Records audited: [count]
- Records with at least one finding: [count]
- Total findings: [count]
- Checks with zero findings: [list]

### Findings by Record
For each record with at least one finding:

**[Source Title]** (`[page_id]`)
- Check: [check name]
  Issue: [one-line description]
  Suggested action: [what a human reviewer should do — no auto-apply]

Group findings by record, not by check type.

### Findings by Check
After the per-record section, provide a count summary:
| Check | Findings |
|-------|---------|
| Processed source with missing Processed Summary | N |
| ... | ... |

### Clean Records
List record IDs and titles that passed all checks with no findings.

### Cautions
Any ambiguity that prevented a check from running (e.g., relation field not fetchable, linked record inaccessible, database query returned partial results).

---

## Stop conditions
Stop and report if:
- The audit scope cannot be resolved (project not found, IDs invalid)
- CH Sources database is not accessible
- More than 50% of records in scope are inaccessible — report partial results and stop

Do not proceed silently past inaccessible records. Log each one.
