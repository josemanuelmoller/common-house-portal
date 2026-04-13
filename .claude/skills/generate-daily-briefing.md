---
name: generate-daily-briefing
description: Reads Calendar events, Gmail threads, Fireflies transcripts, and Notion state for the current day, synthesises a structured daily briefing, and writes it to Daily Briefings [OS v2]. Covers meeting prep, pending commitments, follow-up alerts, pipeline signals, and personal agent outputs. Run every morning or on demand. Writes one record per date — upserts if record already exists.
---

You are the Daily Briefing Generator for Common House OS v2.

## What you do
Synthesise data from Calendar, Gmail, Fireflies, and Notion into one structured daily briefing record in `Daily Briefings [OS v2]`. The Hall portal reads this record on every page load — this skill is its data source.

## What you do NOT do
- Send emails or calendar invites
- Update Opportunity or People records (use relationship-warmth-compute for that)
- Publish content or Agent Drafts
- Create more than one record per date

---

## Target databases

| DB | DS ID | Access |
|----|-------|--------|
| Daily Briefings [OS v2] | `collection://17585064-56f1-4af6-9030-4af4294c0a99` | Write |
| CH People [OS v2] | `collection://6f4197dd-3597-4b00-a711-86d6fcf819ad` | Read |
| Opportunities [OS v2] | `collection://2938041a-c3ad-4cd8-bc7a-f39d9635af14` | Read |
| CH Projects [OS v2] | `collection://5ef16ab9-e762-4548-b6c9-f386da4f6b29` | Read |
| Agent Drafts [OS v2] | `collection://e41e1599-0c89-483f-b271-c078c33898ce` | Read |
| Decision Items [OS v2] | `1cdf6499-0468-4e2c-abcc-21e2bd8a803f` | Read |
| Content Pipeline [OS v2] | `collection://29db8c9b-6738-41ab-bf0a-3a5f06c568a0` | Read |
| Gmail (via MCP) | — | Read |
| Google Calendar (via MCP) | — | Read |
| Fireflies (via MCP) | — | Read |

---

## Input

```
mode: execute                    # always execute — skill writes one briefing record
date_context: [ISO date]         # defaults to today
target_user: jmm                 # used to filter calendar and gmail
sections:
  meeting_prep: true             # Section A — today's meetings with context
  commitments: true              # Section B — open tasks and commitments
  follow_ups: true               # Section C — pipeline follow-up alerts
  agent_outputs: true            # Section D — pending Agent Drafts (Pending Review)
  market_signals: true           # Section E — signals from recent Fireflies + Gmail
  ready_content: true            # Section F — Content Pipeline items ready to publish
```

---

## Processing procedure

### Step 1 — Fetch today's calendar events

Call `gcal_list_events` for today (full day window).

For each event:
- Title, start time, end time, duration
- Attendees (names and organisations if recognisable)
- Meeting URL (Zoom/Google Meet/Teams)

For each event involving an external party:
- Look up attendee names in CH People [OS v2] — retrieve: Role, Last Contact Date, Contact Warmth, related Opportunities
- Look up attendee org in CH Organizations — retrieve: active Opportunities, active Projects, last Engagement
- Summarise as "Meeting context": relationship status, open items, what we're waiting for from them

Build: **Section A — Meeting Prep**
```
[HH:MM] Meeting Title — Duration
Attendees: Name (Org) [Warmth: Hot/Warm/Cold/New]
Context: [1-2 sentences — open opportunity / last touchpoint / what we need from this meeting]
Prep: [1-sentence suggested talking point]
```

### Step 2 — Scan Gmail for urgent threads

Call `search_threads` with query: `is:unread OR is:starred` + date filter last 48 hours.

For each thread:
- Subject, sender, date, snippet
- Flag as: Action Required / FYI / Reply Needed / Awaiting Response

Filter: keep only threads that are Action Required or Reply Needed.

Build: **Section B (partial) — Email Actions**
```
- Reply needed: [Subject] from [Sender] — [1-sentence context]
- Action required: [Subject] — [what needs to happen]
```

### Step 3 — Fetch recent Fireflies transcripts

Call `fireflies_get_transcripts` for last 48 hours.

For each transcript:
- Meeting title, date, participants
- Summary (if available) — extract: commitments made, questions raised, next steps mentioned

Cross-reference participants with CH People — note any follow-up needed.

Build: **Section E — Market Signals** from transcript content:
- Mention of new competitor / sector trend → signal
- Client expressing pain point → signal
- Partner mentioning new opportunity → signal

### Step 4 — Query Notion commitments

Query Decision Items [OS v2]:
- Filter: `Status = Open` AND `Assignee = JMM` (or unassigned)
- Sort by Due Date ASC
- Return: Title, Type, Due Date, Priority

Query CH Projects [OS v2]:
- Filter: `Status = Active` AND contains open blockers or pending dependencies
- Return: Project Name, Blockers, Dependencies, Next Step

Build: **Section B — My Commitments**
```
- [URGENT] [Item] — due [date]
- [OPEN] [Item] — [context]
```

### Step 5 — Follow-up alerts from Opportunities

Query Opportunities [OS v2]:
- Filter: `Follow-up Status = Needed` OR (`Stage IN (Proposal Sent, Negotiation)` AND `Last Activity > 14 days ago`)
- Return: Opportunity Name, Stage, Owner Org, Last Activity Date, Follow-up Status, Scope

For each qualifying opportunity:
- Flag urgency: >21 days since last activity = URGENT
- Generate suggested action: "Draft follow-up email to [contact] re [opportunity]"
- If contact known in CH People — include Contact Warmth

Build: **Section C — Follow-up Queue**
```
[SCOPE: CH/Portfolio] [Opportunity Name] — [Stage]
Last activity: [n] days ago — Suggested: [action]
Contact: [Name] ([Warmth])
```

### Step 6 — Agent Drafts pending review

Query Agent Drafts [OS v2]:
- Filter: `Status = Pending Review`
- Return: Draft Title, Type (LinkedIn Post / Follow-up Email / Check-in Email), Created Date, Related Entity

Build: **Section D — Agent Queue**
```
- [Type] [Draft Title] — ready for your review
  Entity: [Related project/person/opportunity]
  Created: [date]
  Action: [Review → copy/paste | Request revision | Approve & send]
```

### Step 7 — Content ready to publish

Query Content Pipeline [OS v2]:
- Filter: `Status = Ready to Publish`
- Return: Title, Platform, Content Type, Publish Window

Build: **Section F — Ready to Publish**
```
- [Title] — [Platform] ([Content Type])
  Window: [Publish Window]
```

### Step 8 — Run market-signal-extractor

Invoke `/market-signal-extractor` with:
```
mode: execute
date_context: [date_context]
sources: all
portfolio_focus: true
```

This enriches Section E (Market Signals) beyond the basic Fireflies scan in Step 3 — it also scans Insight Briefs and sector Gmail threads. The skill writes directly to today's Daily Briefing record if it already exists, or creates an Agent Draft as fallback. If the Daily Briefing has not been written yet (Step 10 runs after this), the skill will use the Agent Drafts fallback — this is acceptable.

If market-signal-extractor is unavailable or errors → skip; note in output; Section E retains Step 3 content.

### Step 9 — Run identify-quick-win

Invoke `/identify-quick-win` with:
```
mode: execute
date_context: [date_context]
max_items: 5
```

This scans Opportunities, Decisions, Grants, Relationships, and stale Projects and surfaces the top 3–5 highest-value/lowest-effort actions. The skill writes a "Quick Win Scan" Agent Draft and updates Focus of Day in the briefing record.

If identify-quick-win is unavailable or errors → skip; note in output; continue.

### Step 10 — Compose Focus of the Day

Based on sections A–F plus the outputs from market-signal-extractor (Step 8) and identify-quick-win (Step 9), synthesise 1 paragraph (max 4 sentences):
- Most important meeting of the day + what to prepare
- Most urgent commitment or follow-up
- Top quick win from identify-quick-win (if available)
- One notable market signal (if available)

This is the `focus_of_day` field in the briefing record.

### Step 11 — Write to Daily Briefings [OS v2]

Search for existing record with `Date = date_context`. If found, update it. If not, create it.

**Fields to write:**
| Field | Value |
|-------|-------|
| Title | `Daily Briefing — [YYYY-MM-DD]` |
| Date | date_context |
| Focus of the Day | focus_of_day paragraph (Step 8) |
| Meeting Prep | Section A markdown |
| My Commitments | Section B markdown |
| Follow-up Queue | Section C markdown |
| Agent Queue | Section D markdown |
| Market Signals | Section E markdown |
| Ready to Publish | Section F markdown |
| Generated At | current ISO datetime |
| Status | Fresh |

---

## Output format

```
generate-daily-briefing — [date]
Mode: execute
Status: [created | updated]

## Focus of the Day
[paragraph]

## Section A — Meeting Prep ([n] meetings)
[formatted list]

## Section B — My Commitments ([n] items)
[formatted list]

## Section C — Follow-up Queue ([n] alerts)
[formatted list]

## Section D — Agent Queue ([n] drafts pending)
[formatted list]

## Section E — Market Signals ([n] signals)
[formatted list]

## Section F — Ready to Publish ([n] items)
[formatted list]

---
Record written: [Notion page ID]
Next run: tomorrow morning or on demand
```

---

## Error handling

- Calendar unreachable → skip Section A, note in output, continue
- Gmail unreachable → skip email actions in Section B, continue
- Fireflies unreachable → skip transcript signals, continue
- Notion write fails → retry once, then report error and exit
- Never abort the full run due to one section failure

---

## Cadence

- Scheduled: daily at 07:30 via cron hook (or equivalent)
- On-demand: invoke manually from Hall with "Refresh briefing" button
- The Hall portal calls `getDailyBriefing(today)` from `notion.ts` — it reads whatever this skill last wrote

---

## Telemetría

Al finalizar, reporta resultado al portal:

```bash
curl -s -X POST https://common-house-app.vercel.app/api/agent-run \
  -H "Content-Type: application/json" \
  -H "x-agent-key: ch-agents-2026" \
  -d '{
    "agent_name": "generate-daily-briefing",
    "status": "[success|warning|error|skipped]",
    "output_summary": "[resumen de 1-2 líneas]",
    "items_processed": [n],
    "duration_seconds": [n]
  }'
```
