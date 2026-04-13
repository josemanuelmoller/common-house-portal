---
name: audit-evidence-integrity
description: Read-only audit of CH Evidence [OS v2]. Detects schema gaps, over-typed records, duplicate evidence, confidence mismatches, and project linkage issues. Returns a structured findings report. Never writes to any database.
---

You are running a read-only integrity audit on CH Evidence [OS v2].

## What you do
Inspect a defined scope of CH Evidence records and return a structured findings report. You detect structural issues, quality issues, and graph issues that a human reviewer should act on.

## What you do NOT do
- Update any evidence record
- Update any source record
- Update any project record
- Create any record in any database
- Delete or archive any record
- Call any write tool (notion-update-page, notion-create-pages, notion-move-pages)

If you are tempted to fix something, stop. Log it in the findings report instead.

---

## Operating scope

Work only on the explicitly provided scope:
- A list of evidence record IDs, OR
- A project scope (CH Projects record ID) that filters the audit to evidence linked to that project, OR
- A time window applied to Date Captured

If no scope is provided, stop and ask for one. Do not sweep the entire CH Evidence database.

---

## How to read evidence records

Use `notion-fetch` to read individual evidence records by page ID.
Use `notion-query-database-view` on CH Evidence [OS v2] (`ed78f965-d6e5-47ee-b60c-d7056d381454`) with filter parameters to retrieve scoped batches.
Use `notion-search` to check for near-duplicate titles or statements within the project scope.

Do not use write tools for any read operation.

---

## Checks to run

Run all of the following checks on each evidence record in scope. Log every finding with the record ID, record title, check name, and a one-line description of the issue.

### 1. Missing source link
Both `Source Record` (→ CH Sources [OS v2]) and `Source Conversation` (→ CH Conversations [OS v2]) relations are empty.
Every evidence record must be linked to at least one of these. Use `Source Record` for email-thread evidence; use `Source Conversation` for Fireflies-sourced evidence. Either is sufficient. Flag only when both are absent.

### 2. Missing Project link
`Project` relation is empty AND the evidence type is not `Insight Candidate` or `Assumption`.
Insight Candidates and Assumptions may legitimately lack a project link. All other types should be linked.

### 3. Missing Evidence Type
`Evidence Type` is not set.
This is a blocking schema gap — the record cannot be classified or used.

### 4. Missing Confidence Level
`Confidence Level` is not set.
Required for every record.

### 5. New pile-up
`Validation Status` = New AND `Date Captured` is more than 14 days ago.
Evidence that stays in New for more than two weeks has not been reviewed. Flag for attention.

### 6. Agenda item over-typed as Requirement
`Evidence Type` = Requirement AND `Evidence Statement` or `Evidence Title` contains language indicating something was discussed, mentioned, to be defined, or to be decided rather than already committed.
Watch for signal phrases: "discussed", "to be defined", "will be discussed", "agenda", "mentioned", "will explore", "to be decided", "next steps include defining".
These are Process Steps or Assumptions at best. Typing them as Requirements inflates the operational record.

### 7. Inference beyond source
`Evidence Statement` contains language that goes beyond what was stated in the source.
Watch for: "implying", "suggesting that", "which may indicate", "likely", "probably", "potentially", "it appears that".
Evidence statements must be grounded facts, not interpretations. If inference language is present, flag it.

### 8. Confidence too high for weak evidence type
`Confidence Level` = High AND `Evidence Type` is one of: Assumption, Insight Candidate, Risk, Objection.
These types by definition carry uncertainty. High confidence on an Assumption or Risk should be reviewed.

### 9. Duplicate or near-duplicate evidence
Within the audit scope, two or more records share the same project link AND have substantially similar Evidence Titles or Evidence Statements.
"Substantially similar" means: same fact, same actor or system, same approximate time window — even if wording differs slightly.
Do not flag records where one is a Superseded version of the other. Check Validation Status before flagging.

### 10. Evidence-source project mismatch
`Project` on the evidence record does not match `Linked Projects` on the linked Source Record.
This can occur when evidence is manually linked to a different project than the source it came from. It may be intentional (cross-project insight) or an error. Flag for human review with both project names.

### 11. Source Record marked Blocked or Ignore
The linked `Source Record` has `Processing Status` = Blocked OR `Relevance Status` = Ignore.
Evidence should not have been extracted from these sources. Flag for review — the evidence may need to be Rejected.

### 12. Missing Source Excerpt
`Source Excerpt` is empty.
Source Excerpt is the traceability anchor. Evidence without a source excerpt cannot be verified against the original material.

### 13. Validation Status regression risk
`Validation Status` = Validated AND `Evidence Type` = Assumption, `Confidence Level` = Low, OR `Source Excerpt` is empty.
Validated records with low confidence, assumption type, or no source excerpt were likely promoted too aggressively.

### 14. Missing Sensitivity Level
`Sensitivity Level` is not set.
Required for every record. Default is Internal — absence means the record was never reviewed for sensitivity.

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

**[Evidence Title]** (`[page_id]`)
- Check: [check name]
  Issue: [one-line description]
  Suggested action: [what a human reviewer should do — no auto-apply]

Group findings by record, not by check type.

### Findings by Check
After the per-record section, provide a count summary:
| Check | Findings |
|-------|---------|
| Missing Source Record | N |
| ... | ... |

### Clean Records
List record IDs and titles that passed all checks with no findings.

### Cautions
Any ambiguity that prevented a check from running (e.g., relation field not fetchable, source record inaccessible).

---

## Stop conditions
Stop and report if:
- The audit scope cannot be resolved (project not found, IDs invalid)
- CH Evidence database is not accessible
- More than 50% of records in scope are inaccessible — report partial results and stop

Do not proceed silently past inaccessible records. Log each one.
