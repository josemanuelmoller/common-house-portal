# Backlog

Tracked deliberately so nothing gets dropped when a conversation moves fast.
Updated: 2026-04-21.

Anything here should be in one of three states:
- **Active** — committed to the current sprint.
- **Parked** — intentionally deferred (with reason).
- **Ideas** — proposed, not yet decided.

---

## Active (current sprint)

| # | Item | Effort | Status |
|---|------|--------|--------|
| — | — | — | — |

Nothing committed yet for the next sprint. Pick from Ideas → Active.

---

## Parked — explicit

| # | Item | Why parked | Unlock when |
|---|------|-----------|-------------|
| P-SEC-1 | **Security sprint** — RLS on all Supabase tables, secret rotation docs, house-keeper-agent, gate UI cliente | User deferred to a dedicated session | Before first external client |
| P-PPL-1 | **People rename** (Contacts → People in Notion DB + app/UI) | Low urgency, partial unblock done via aliases column | When external collaborators need "People" label |
| P-PPL-2 | **candidate_type field** (EIR / Advisor / Consultant / Prospect) | Bundled with People rename | Together with P-PPL-1 |

---

## Ideas — clipper (WhatsApp / web)

| # | Idea | Effort | Value | Priority |
|---|------|--------|-------|----------|
| C-1 | **Delta capture v0.6.0** — only new messages since last clip per chat | 2-3h | High (daily use UX) | High |
| C-2 | **AI distill v0.7.0** — Haiku extracts decisions/commitments/actions → Evidence | 3-4h | High (closes Sources→Evidence loop for WA) | High |
| C-3 | **/admin/conversations page** — list all WA clips cross-persona | 1-2h | Medium (discovery surface) | Med |
| C-4 | **Populate people.aliases** for top contacts (Pancho, Cote, etc.) | 5min manual | Med (improves matching) | Low |
| C-5 | **Project aliases** — add aliases column to projects + use in matcher | 30min | Med (precision on project mention detection) | Low |
| C-6 | **Auto-scroll progress indicator** — real-time message count during extraction | 1h | Low (polish) | Low |
| C-7 | **"Confirm org" button** with `contact_org_memberships` table (option C from discussion) | 1.5h | Med | Med |
| C-8 | **Audio transcription** — Whisper on voice memos detected in WA clips | 6-10h | High (voice memos are ~30% of WA) | Med |
| C-9 | **Orphan re-matching** — re-process sender_person_id nulls via orphan_match_candidates + admin review UI | 3-4h | High (diagnosed: 644/644 orphans today due to full_name vs name column bug) | **Active** |
| C-10 | **Explicit mode indicator in popup** — top badge "WhatsApp mode" / "Article mode" / "Document mode". Today the mode is implicit from tab URL and UX differs silently. Make it visible. | 1-2h | Med (clarity) | Low |

## Ideas — intelligence on top of conversation_messages

| # | Idea | Effort | Value |
|---|------|--------|-------|
| I-1 | **Before-meeting brief** in Hall — auto-generated 30 min before reu with last N interactions + open pending | 4-6h | **Very high** (user-identified killer use case) |
| I-2 | **Commitments tracker** — AI extracts "I'll send you X" / "let me know about Y" → inbox of open pending items cross-canal | 4-6h | High |
| I-3 | **Decision log** — decisions extracted from WA/emails/meetings, filterable by period | 2-3h | High (depends on I-2 infra) |
| I-4 | **Semantic search** — pgvector on conversation_messages + evidence + knowledge | 6-8h | Med |
| I-5 | **Auto-draft reply** — Claude proposes response to pending WA/email thread using full person context | 4h | High (once I-2 exists) |
| I-6 | **Time/attention analytics** — "this month 23h eq. in conversations with X vs 4h with Y" | 2-3h | Low (vanity metric) |

## Ideas — platform (from original socios meeting)

| # | Idea | Effort | Value |
|---|------|--------|-------|
| S-1 | **English-first UI** (+ optional ES/FR) | 3-5 days | Med (external clients) |
| S-2 | **Finance integration** (QuickBooks read-only) | 2 sprints | Med (depends on use) |
| S-3 | **Proposal wizard** — audit existing + build cohesive flow | 3-5 days | High (CH ops-critical) |
| S-4 | **Board meetings** — dedicated surface + permissions | 2-3 days | Med |
| S-5 | **WhatsApp per-user tokens** — replace single CLIPPER_TOKEN once > 3 users | 1-2 days | Low (while only Cote + socios) |
| S-6 | **Right-click context menu clip** (no popup needed) | 1h | Low (nice-to-have) |
| S-7 | **Firefox/Safari extension support** | 2-3 days | Low |

---

## Technical debt

| Item | Risk | Fix effort |
|------|------|-----------|
| `.claude/launch.json` paths-with-spaces break preview_start | Low (dev friction only) | 10min |
| Untracked exploration artifacts in `chrome-extension/clipper/icons/` (Brain 2.jpg etc.) | Low | 2min gitignore or delete |
| `.claude/agents/score-signal.md` + `weekly-synthesis.md` untracked since session start | Low (probably user's agents in progress) | Check w/ user |
| WA extractor: reply-quote + link-preview cleanup imperfect | Low | Iterate on real clips |
| Server `CLIPPER_TOKEN` single-value for all users | Low at current scale | See S-5 |

---

## Process note

**Don't let new ideas vaporize.** Whenever something comes up mid-sprint:
1. Drop it under `Ideas` here.
2. Commit the line.
3. Come back to pick it in the next sprint planning.

Target: max 2 items in `Active` at any time. Keeps shipping unblocked.
