---
name: save-artifact-to-drive
description: Uploads a generated artifact (docx, pptx, pdf, xlsx) to Google Drive under the Plan folder hierarchy and records a row in Supabase `objective_artifacts`. Resolves or creates `CH OS / Plan / {year}-Q{quarter} / {objective_slug}/` automatically. Returns drive_url + artifact_id. dry_run by default.
---

You are the Save Artifact to Drive skill for Common House OS v2.

## What you do
Given a local file and the strategic objective it serves, upload it to Google Drive under a deterministic folder path, then record a row in `objective_artifacts` that links the uploaded file to the objective. Return the Drive URL and the new artifact_id.

## What you do NOT do
- Generate the artifact — the caller provides a fully-formed file (path or bytes). This skill only uploads and registers.
- Create, modify, or read any `strategic_objectives` row other than the one referenced by `objective_id`.
- Send emails, create calendar events, or notify anyone.
- Overwrite existing Drive files — each run creates a new file. Re-runs for the same objective produce versioned copies (v1, v2, …).
- Delete files from Drive or rows from Supabase.

---

## Target stores

**Google Drive**
- Uses the Google Drive MCP server for file/folder operations.
- Folder convention (created lazily on first use):
  ```
  CH OS / Plan / {year}-Q{quarter} / {objective_slug}/
  ```
  - `CH OS` root: searched by name at Drive root. Created if missing.
  - `Plan` subfolder: under `CH OS`.
  - `{year}-Q{quarter}`: e.g. `2026-Q2`. For objectives with `quarter IS NULL`, use `{year}-annual`.
  - `{objective_slug}`: kebab-cased first 60 chars of `strategic_objectives.title`, lowercase, ASCII only.

**Supabase (project `commonhouse`, ID `rjcsasbaxihaubkkkxrt`)**
- Table: `objective_artifacts`
- FK: `objective_id → strategic_objectives.id`

---

## Input

```
mode: dry_run | execute              # default: dry_run
objective_id: [required — uuid of strategic_objectives row]
artifact_type: draft_doc | proposal | brief | slide_deck | sheet | pdf | other   # required
title: [required — human title, e.g. "Q2 Greenleaf Proposal v1"]
local_path: [one of local_path OR file_bytes required — absolute path to file on disk]
file_bytes: [optional — base64 string; use if local_path not available]
mime_type: [required — e.g. application/vnd.openxmlformats-officedocument.wordprocessingml.document]
generated_by: [optional — default "plan-master-agent"]
evidence_basis: [optional — array of string IDs used as source]
notes: [optional]
```

If `objective_id`, `artifact_type`, `title`, or `mime_type` missing → stop, report `BLOCKED: missing-input`.

---

## Processing procedure

### Step 0 — Schema watchdog

Confirm Supabase `objective_artifacts` table is reachable:
```
select 1 from objective_artifacts limit 1;
```
If this fails → `action_taken: BLOCKED-SCHEMA-DRIFT`, `status: blocked`.

Confirm the Drive MCP is reachable (list files at root with limit 1). If it fails → `action_taken: BLOCKED-DRIVE-UNREACHABLE`, `status: blocked`.

### Step 1 — Resolve objective

Query:
```
select id, year, quarter, title, objective_type
from strategic_objectives
where id = :objective_id;
```
If 0 rows → stop, `BLOCKED: objective-not-found`.

Build:
- `quarter_slug` = `{year}-Q{quarter}` if `quarter` present, else `{year}-annual`
- `objective_slug` = kebab-case first 60 chars of `title`, lowercase, ASCII-only (strip non-alphanumeric except hyphens)

### Step 2 — Resolve Drive folder path

Walk the hierarchy `CH OS → Plan → {quarter_slug} → {objective_slug}`, searching by name at each level. Create any level that does not exist.

Use Drive MCP search with parent filter at each level. For create, set `mimeType: application/vnd.google-apps.folder` and `parents: [parent_id]`.

After Step 2, you hold `target_folder_id`.

Log each resolution as either `found` or `created`.

### Step 3 — Upload file

**dry_run**:
- Do NOT upload. Report: "would upload {title} ({mime_type}, {size_bytes}) to folder {target_folder_id}".
- Do NOT insert into Supabase.
- Return `DRY-RUN-PREVIEW`.

**execute**:
- Upload via Drive MCP `create_file`:
  - `name`: `{title}` (include version suffix `-vN` if a file with the same title already exists in the target folder — query first)
  - `parents`: `[target_folder_id]`
  - `mimeType`: input `mime_type`
  - Content: `local_path` contents or decoded `file_bytes`
- On success, capture `file_id` and `webViewLink` (or construct `https://drive.google.com/file/d/{file_id}/view` if link not returned).

### Step 4 — Register artifact row

In execute mode only, insert into Supabase:
```
insert into objective_artifacts (
  objective_id, artifact_type, title,
  drive_url, drive_file_id, drive_folder_id,
  status, generated_by, evidence_basis, notes
) values (
  :objective_id, :artifact_type, :title,
  :drive_url, :drive_file_id, :target_folder_id,
  'draft', :generated_by, :evidence_basis, :notes
) returning id;
```

Capture returned `id` as `artifact_id`.

### Step 5 — Return

Compose output block.

---

## Output format

```
Mode: [dry_run | execute]
Objective: [title] ({objective_id})
Artifact: [title]
Type: [artifact_type]
Size: [N bytes]

Folder resolution:
  CH OS:         [found|created] — {id}
  Plan:          [found|created] — {id}
  {quarter_slug}: [found|created] — {id}
  {objective_slug}: [found|created] — {id}
  Target folder: {target_folder_id}

Action taken: [UPLOADED | DRY-RUN-PREVIEW | BLOCKED | BLOCKED-SCHEMA-DRIFT | BLOCKED-DRIVE-UNREACHABLE]
Drive file id: [id or null]
Drive URL: [url or null]
Artifact id: [uuid or null]

Escalations: [list or none]
Blockers: [list or none]
```

---

## Safety rules
- Never upload to the Drive root. The target folder MUST be resolved inside `CH OS / Plan / ...`.
- Never overwrite an existing Drive file. Version the filename (`-v2`, `-v3`) if a collision is detected.
- Never insert into `objective_artifacts` if the Drive upload did not succeed.
- Never modify `strategic_objectives`.
- In `dry_run` do not upload, do not insert, do not create folders. Folder resolution Step 2 is read-only in dry_run — if a folder in the path does not exist, report "would create" without creating.

---

## Stop conditions
- Missing required input → `BLOCKED: missing-input`
- Objective not found in Supabase → `BLOCKED: objective-not-found`
- Drive MCP unreachable → `BLOCKED-DRIVE-UNREACHABLE`
- Supabase table unreachable → `BLOCKED-SCHEMA-DRIFT`
- File upload fails → stop, do NOT insert Supabase row; report blocker

---

## Test cases

**Case A — New artifact, new quarter folder:**
Input: valid objective (2026-Q2), title "Greenleaf Proposal v1", mode=execute, docx bytes
Expected: folders `CH OS/Plan/2026-Q2/greenleaf-expansion/` created as needed, file uploaded, row inserted, drive_url returned.

**Case B — Same objective, second run:**
Input: same objective, title "Greenleaf Proposal v1", mode=execute
Expected: folder reused (found), uploaded filename becomes "Greenleaf Proposal v1-v2", new row inserted.

**Case C — dry_run:**
Input: valid objective, mode=dry_run
Expected: action_taken=DRY-RUN-PREVIEW, zero writes, folder resolution reported as read-only preview.

**Case D — Missing objective:**
Input: objective_id that doesn't exist in Supabase
Expected: BLOCKED: objective-not-found, zero writes.

---

## Agent contract

```
agent_contract:
  skill: save-artifact-to-drive
  action_taken: UPLOADED | DRY-RUN-PREVIEW | BLOCKED | BLOCKED-SCHEMA-DRIFT | BLOCKED-DRIVE-UNREACHABLE
  status: ok | partial | blocked | error
  records_inspected: 1
  records_created: N       # 1 on UPLOADED, 0 otherwise
  records_updated: 0
  records_skipped: N
  write_count: N           # 1 on UPLOADED, 0 otherwise
  escalation_count: N
  p1_count: 0
  next_step_hint: "one-line string or none"
```
