# Decision Center — OS v2
Sprint 15 — 2026-04-12

The Decision Center is the canonical place where Common House OS v2 asks for human judgement and where humans return structured feedback to the system.

**Notion DB:** Decision Items [OS v2]
**DB ID:** `6b801204c4de49c7b6179e04761a285a`
**DS ID:** `collection://1cdf6499-0468-4e2c-abcc-21e2bd8a803f`
**Location:** Backend > Common House Notion

---

## What it is

Every time an agent or skill reaches a point where it cannot proceed without human input — ambiguity, missing data, execute gate, policy question, or draft review — it creates (or proposes) a Decision Item here.

Decision Items are:
- Structured (not chat messages, not loose outputs)
- Typed (one of 5 decision types)
- Actionable (human picks from valid actions: Approve, Reject, Defer, Edit, Choose Canonical, Needs Investigation, Escalate)
- Traceable (who resolved it, when, what they chose, feedback signal)
- Connected to the system (linked to affected org, person, opportunity, automation)

---

## Decision Types taxonomy

### A — Approval
For: create record, execute write, activate something, promote from dry_run to execute.
Valid human actions: **Approve**, **Reject**, **Defer**, **Edit / Adjust**
Key fields used: Proposed Action, Requires Execute, Execute Approved
Agents that generate: deal-flow-agent, portfolio-health-agent, grant-monitor-agent

### B — Ambiguity Resolution
For: duplicates, canonical record, merge later, keep separate, unclear mapping.
Valid human actions: **Choose Canonical**, **Needs Investigation**, **Defer**, **Reject**
Key fields used: Proposed Action, Suggested Value / Draft Text, Affected Person / Org
Agents that generate: hygiene-agent, db-hygiene-operator, upsert-person-profile

### C — Missing Input
For: Suggested Next Step, End Date, owner, thesis, runway update, critical missing fields.
Valid human actions: **Edit / Adjust**, **Defer**, **Needs Investigation**
Key fields used: Suggested Value / Draft Text, Human Notes, Final Value / Final Text
Agents that generate: portfolio-health-agent, grant-monitor-agent, Manual backlog

### D — Draft Review
For: status update text, proposal summary, wording, generated notes.
Valid human actions: **Approve**, **Edit / Adjust**, **Reject**
Key fields used: Suggested Value / Draft Text, Final Value / Final Text, Human Notes
Agents that generate: update-project-status, briefing-agent, proposal-packager

### E — Policy / Automation Decision
For: activate execute automatic, change threshold, enable hook, approval policy.
Valid human actions: **Approve**, **Edit / Adjust**, **Defer**, **Reject**
Key fields used: Proposed Action, Affected Automation, Human Notes
Agents that generate: Manual, hygiene-agent, grant-monitor-agent

---

## Field reference

| Field | Purpose |
|---|---|
| Decision Item | Title / name of the item |
| Decision Type | One of the 5 types above |
| Status | Open / In Progress / Approved / Rejected / Deferred / Resolved / Auto-Closed |
| Source Agent | Agent or skill that generated it |
| Risk Level | P1 — Critical / High / Medium / Low |
| Confidence | Agent confidence in the proposed action |
| Priority | Urgent / High / Normal / Low |
| Requires Execute | True if resolving triggers a write operation |
| Execute Approved | Must be true before any agent runs execute |
| Needs Human Input | Item cannot auto-resolve — human must provide information |
| Can Auto-Close | Item can be closed by system if conditions met |
| Proposed Action | What the agent proposed to do |
| Suggested Value / Draft Text | Specific value, name, or text suggested |
| Human Decision | Approve / Reject / Defer / Edit / Choose Canonical / Needs Investigation / Escalate |
| Human Notes | Human explanation or instructions for the agent |
| Final Value / Final Text | Corrected or confirmed value after review |
| Feedback Category | Signal for agent/skill improvement |
| Affected Organization | Link to CH Organizations [OS v2] |
| Affected Person | Link to CH People [OS v2] |
| Affected Opportunity | Link to Opportunities [OS v2] |
| Affected Automation | Link to Automations [OS v2] |
| Trigger Source | URL or run reference |
| Resolved By | Who resolved it |
| Created At | Auto (system) |
| Resolved At | Human fills when closing |
| Decision Due Date | SLA or deadline |

---

## Views

| View | Filter | Purpose |
|---|---|---|
| 🔴 Needs Approval | Status=Open, Type=Approval | All pending approvals |
| 📥 Needs Input | Status=Open, Type=Missing Input | Gaps waiting for data |
| 🔀 Ambiguities | Status=Open, Type=Ambiguity Resolution | Duplicates and unclear mappings |
| 📝 Drafts to Review | Status=Open, Type=Draft Review | Generated text waiting for sign-off |
| ⚙️ Policy Decisions | Status=Open, Type=Policy / Automation Decision | Hook and execute policy gates |
| 🚨 High Risk / P1 | Risk Level=P1, Status=Open | Critical items first |
| ⏳ Pending Execute | Requires Execute=true, Execute Approved=false, Open | All blocked execute gates |
| ✅ Resolved This Week | Status=Resolved | Feedback loop and audit trail |
| 🕐 Oldest Pending | Status=Open, sorted by Created At ASC | Items aging in queue |
| 🤖 By Agent | Board grouped by Source Agent | Which agents generate most review |

---

## How to work the queue

**Daily sweep (2 min):**
1. Open 🚨 High Risk / P1 — resolve or escalate anything P1
2. Open ⏳ Pending Execute — unblock any items where you have approved
3. Open 📥 Needs Input — fill in missing fields you can answer immediately

**Weekly review (10-15 min):**
1. Open 🔀 Ambiguities — resolve any duplicate/canonical decisions pending
2. Open 🔴 Needs Approval — approve or reject pending agent proposals
3. Open ⚙️ Policy Decisions — review any hook or execute policy changes

**How to resolve an item:**
1. Open the item page
2. Set **Human Decision** (Approve / Reject / Defer / Edit / Choose Canonical / Needs Investigation / Escalate)
3. Add **Human Notes** (what you decided and why — agents read this)
4. If editing: fill **Final Value / Final Text** with the corrected value
5. Set **Feedback Category** (helps improve agent quality)
6. Set **Status** to Resolved (or Approved / Rejected)
7. Fill **Resolved By** (your name or initials)
8. Fill **Resolved At** (today's date)

**Execute gate flow:**
- If Requires Execute = true → human must set Execute Approved = true
- Agent checks Execute Approved before running any execute-mode write
- If Execute Approved = false → agent skips or blocks

---

## Integration pattern: how agents create Decision Items

### Trigger conditions (when to create a Decision Item)

An agent or skill should create (or propose) a Decision Item when:
1. It detects a duplicate record and confidence < 100%
2. It proposes an execute write with Risk Level > Medium
3. It encounters a missing required field that cannot be inferred
4. It generates draft text that requires human sign-off before publishing
5. A policy parameter needs explicit human confirmation before proceeding

### Pattern for agents (dry_run mode)

```
# In dry_run output, agent surfaces Decision Item proposal:

decision_item_proposal:
  title: "Hugo Labrin — Choose Canonical Record"
  decision_type: Ambiguity Resolution
  source_agent: hygiene-agent
  risk_level: High
  proposed_action: "Two records detected. Recommend keeping 33f45e5b as canonical."
  suggested_value: "ID: 33f45e5b-6633-814a-914d-f6b141d11d30"
  requires_execute: true
  trigger_source: "hygiene-agent dry_run 2026-04-12"
  action_for_human: Choose Canonical
```

### Pattern for execute gate

```
# Before running execute, agent checks Decision Item:

pre_execute_check:
  - find Decision Item where Trigger Source matches current run
  - verify Execute Approved = true
  - if Execute Approved = false → SKIP and log in agent output
  - if no Decision Item exists → create one and SKIP execute
```

### Concrete example: deal-flow-agent → Decision Center

**Scenario:** deal-flow-agent dry_run finds a borderline match (score 52/90) for Beeok × Co Capital.

**Expected agent behavior:**
1. Log in dry_run output: `BORDERLINE: Beeok × Co Capital, score 52/90 — below strong threshold (60)`
2. If Co Capital also has no sector data: create a Decision Item of type `Missing Input`
3. Human fills in Co Capital sector data → resolves the Missing Input item
4. Next deal-flow run: Co Capital now has sector data → match score recalculated
5. If score ≥ 60 on next run → deal-flow creates Approval Decision Item for the match
6. Human approves → Execute Approved = true → deal-flow executes investor match

**What's implemented vs documented:**

| Step | Status |
|---|---|
| Agents surface proposals in dry_run output | Implemented (existing agent format) |
| Human manually creates Decision Item from dry_run output | Implemented (manual workflow) |
| Agent auto-creates Decision Item via Notion write | Pattern documented — not yet automated |
| Agent checks Execute Approved before execute | Pattern documented — requires agent update |

**Path to automation:** Add a `create_decision_item` step to agent skill chain for scenarios that match the trigger conditions above. Use `notion-create-pages` with the Decision Items DS ID: `1cdf6499-0468-4e2c-abcc-21e2bd8a803f`.

---

## Feedback loop

The **Feedback Category** field captures structured signals for agent improvement.

| Category | Signal to agent |
|---|---|
| Good suggestion | Reasoning and thresholds are well-calibrated |
| Wrong record | Relation or entity match was incorrect — check dedup logic |
| Wrong reasoning | Confidence score or match logic needs review |
| Missing context | Agent didn't have enough data — check input sources |
| Threshold too aggressive | Score threshold or flag condition set too low |
| Needs more data | External data source needed — flag for enrichment |
| Approved with edits | Correct direction but details needed adjustment |
| Rejected as noise | False positive — tighten filter conditions |

**How to use feedback:**
After resolving 10+ items per agent, review the Feedback Category distribution. Patterns like repeated `Wrong record` from hygiene-agent → review the dedup threshold in `resolve-entities.md`. Repeated `Threshold too aggressive` from deal-flow → raise `min_match_score` in RUNBOOK.md.

---

## Bridge to Agent Management

Decision Items are linked to Automations [OS v2] via **Affected Automation**.

Key insights available via 🤖 By Agent view:
- Which agents generate the most decisions → highest friction in the pipeline
- Which agents generate the most `Rejected as noise` → threshold adjustment needed
- Which agents have many Pending Execute items → blocked capacity

To see this from the Agent Management side (Automations [OS v2]):
- Filter to a specific agent record
- Check `Human Override Needed` — this flag aligns with P1 or High Risk Decision Items
- `Last Run Summary` should reference active Decision Items when agent is blocked

---

## Adding to RUNBOOK

When a weekly/monthly agent run surfaces items requiring human decisions:
1. Agent output will include `decision_items_proposed: N`
2. Open 🕐 Oldest Pending or 🚨 High Risk / P1 in Decision Center
3. Work the queue before running the next agent
4. Mark items Resolved before marking agent run as complete

---

## What is NOT a Decision Item

- Routine dry_run output that requires no human action (briefing-agent weekly summary)
- Automated safe fixes already approved (SF-1 through SF-5)
- Records already resolved in a previous sprint
- Information lookups or read operations
