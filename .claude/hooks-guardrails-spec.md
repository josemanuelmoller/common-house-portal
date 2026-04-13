# OS v2 Hooks & Guardrails — Implementation Spec

**Status:** Implementation-ready spec. Not yet live.  
**Environment:** Claude Code on Windows 11, bash shell.  
**Hook surface:** Claude Code supports a `hooks` key in `settings.json` / `settings.local.json` with `PreToolUse` / `PostToolUse` / `Stop` / `Notification` trigger points. Each hook runs a shell command. Output to stdout/stderr is visible in the Claude Code console. A non-zero exit code from a `PreToolUse` hook blocks the tool call.

> **Dependency before activation:** Verify hook shell command execution works reliably on this Windows + bash environment before enabling any blocking hooks. Test with a no-op echo command first. All hooks below are specified as **non-blocking** (exit 0 always) to stay safe until validated.

---

## Hook 1 — No Raw Dump Guard

**Goal:** Remind the agent not to write raw email bodies, raw transcripts, or unprocessed content directly into Notion page content fields.

| Field | Value |
|-------|-------|
| Trigger | `PreToolUse` |
| Matcher | `mcp__*__notion-create-pages` OR `mcp__*__notion-update-page` |
| Condition | Tool input contains `content` field with more than ~500 characters |
| Action | Print reminder to stderr; exit 0 (non-blocking) |
| Risk | Low — advisory only |
| Shell command | `echo "[OS v2 GUARD] Verify: content being written is a processed summary, not a raw dump. Raw email bodies and transcripts must not be stored in Notion." >&2; exit 0` |

---

## Hook 2 — Dedup Key Guard

**Goal:** Remind the agent to check for existing dedup keys before creating a new CH Sources record.

| Field | Value |
|-------|-------|
| Trigger | `PreToolUse` |
| Matcher | `mcp__*__notion-create-pages` |
| Condition | Tool input `data_source_id` resolves to CH Sources [OS v2] (`6f804e20-834c-4de2-a746-f6343fc75451`) |
| Action | Print reminder to stderr; exit 0 (non-blocking) |
| Risk | Low — advisory only |
| Shell command | `echo "[OS v2 GUARD] Dedup check: confirm no existing CH Sources record shares this dedup key (gmail_XXXX / fireflies_XXXX) before creating." >&2; exit 0` |

---

## Hook 3 — Evidence Integrity Guard

**Goal:** Remind the agent that newly created evidence must have Source Record, Project, and Evidence Type set.

| Field | Value |
|-------|-------|
| Trigger | `PreToolUse` |
| Matcher | `mcp__*__notion-create-pages` |
| Condition | Tool input `data_source_id` resolves to CH Evidence [OS v2] (`ed78f965-d6e5-47ee-b60c-d7056d381454`) |
| Action | Print reminder to stderr; exit 0 (non-blocking) |
| Risk | Low — advisory only |
| Shell command | `echo "[OS v2 GUARD] Evidence integrity: confirm Source Record, Project, Evidence Type, and Validation Status=New are all set before creating." >&2; exit 0` |

---

## Hook 4 — Legacy Database Block

**Goal:** Prevent writes to legacy databases (Meetings [master], Projects [master], or any pre-OS v2 database).

| Field | Value |
|-------|-------|
| Trigger | `PreToolUse` |
| Matcher | `mcp__*__notion-create-pages` OR `mcp__*__notion-update-page` |
| Condition | Tool input references a known legacy database ID |
| Action | Print warning to stderr; exit 0 (non-blocking until validated, then upgrade to exit 1) |
| Risk | Medium if blocking — start non-blocking, upgrade after shell validation |
| Known legacy IDs | `2b745e5b-66338061-824a-e05fa531557b` (Legacy Projects), others TBD |
| Shell command | `echo "[OS v2 GUARD] Legacy block: check that target database is an OS v2 database, not a legacy master database." >&2; exit 0` |

---

## Settings.local.json — How to Activate

Add a `hooks` section alongside the existing `permissions` section:

```json
{
  "permissions": { ... },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__21b47c4c-840f-453d-bcc9-a729a4e0bbbf__notion-create-pages",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[OS v2 GUARD] Dedup check: confirm no existing CH Sources record shares this dedup key before creating.\" >&2"
          }
        ]
      }
    ]
  }
}
```

## What Is Already Covered Without Hooks

The subagent files already implement these rules as behavioral instructions:
- **No raw dump**: `source-intake.md` line 22 — "Dump raw email bodies..."
- **Dedup guard**: `source-intake.md` lines 72–85 — full dedup procedure
- **Evidence integrity**: `evidence-review.md` lines 120–134 — creation procedure with required fields
- **Legacy block**: `source-intake.md` line 17 — "Use legacy databases..."

Hooks add a second enforcement layer at the tool-call level, independent of LLM instruction following.

---

*Created: 2026-04-10. Activate after shell command validation on Windows + bash.*
