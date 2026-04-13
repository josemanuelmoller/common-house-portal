# Proposal System — OS v2
Sprint 21 — 2026-04-12

The Proposal System answers: **"What should we propose to this client now?"** It converts sales conversations, client notes, and budget signals into structured proposal briefs with scope, phases, deliverables, pricing logic, positioning, and design requests.

---

## One database

### Proposal Briefs [OS v2]
**DB ID:** `76bfd50f-a991-4361-9b9b-51de4b8eae67`
**DS ID:** `8f0fb3de-2a16-4b8b-a858-5ab068d2f2e4`
**Location:** Backend > Common House Notion

Each proposal brief captures:
- Buyer Problem — what the client is actually trying to solve
- Recommended Scope — what should be in scope
- Phases / Modules — proposed work phases
- Deliverables — concrete outputs
- Assumptions and Exclusions — scope boundaries
- Pricing Logic — how to think about pricing (logic, not fixed numbers)
- Relevant Residents / Capabilities — who inside CH delivers this
- Relevant Precedents — past projects that validate credibility
- Why CH — the commercial narrative for winning
- Design Asset Requested — what design outputs are needed
- Related Opportunity — linked Opportunity in pipeline
- Status: Draft → In Review → Approved → Sent → Won / Lost / Archived

---

## Why Proposal Briefs, not Opportunities or Projects

| Layer | Purpose | When to use |
|-------|---------|-------------|
| Opportunities [OS v2] | Commercial pipeline: who, what stage, next step | For tracking deals |
| **Proposal Briefs [OS v2]** | **Structured brief: what exactly to propose and how** | **When a deal needs a scoped proposal** |
| CH Projects [OS v2] | Active delivery tracking | After a proposal is won |
| Content Pipeline [OS v2] | Design and content production | When proposal needs a deck or one-pager |

A brief is not a proposal document — it is the structured input that makes writing a proposal fast and consistent.

---

## How to create a proposal brief

### Step 1: Identify the sales signal
A proposal brief is triggered by:
- A meeting or call where a client expressed a real need + budget signal
- An Opportunity moving to Active or Qualifying status
- An inbound request or RFP
- A follow-up conversation where scope needs to be defined

### Step 2: Fill the brief
Create a new Proposal Briefs [OS v2] record. Required fields:
- **Title:** `[Client] — [Engagement Type]` e.g., `Greenleaf Retail — Refill Infrastructure Implementation`
- **Status:** `Draft`
- **Buyer Problem:** 1–3 sentences — the specific pain the client is trying to solve
- **Proposal Type:** Exploratory / Scoped / Phased / Implementation-led / Retainer / Partnership-led / Grant Support
- **Budget Range:** Honest estimate of the engagement envelope
- **Recommended Scope:** What we are proposing to do
- **Phases / Modules:** How the work is structured

### Step 3: Fill commercial fields
- **Deliverables:** Concrete outputs the client receives
- **Assumptions:** What we assume to be true for the scope to hold
- **Exclusions:** What is explicitly NOT included — prevents scope creep
- **Pricing Logic:** How to approach pricing (value-based? Phase-gated? Day rate? Retainer?)
- **Why CH:** The commercial narrative — why Common House wins this over alternatives
- **Relevant Residents / Capabilities:** Who inside the House delivers this
- **Relevant Precedents:** Past projects (Auto Mercado, iRefill borough pilots) that prove delivery

### Step 4: Link to pipeline
- **Client / Organization:** Link to the client record in CH Organizations
- **Related Opportunity:** Link to the Opportunity record

### Step 5: Request design assets
Set **Design Asset Requested:**
- `Proposal Deck` — full slide proposal
- `One-pager` — single page executive summary
- `Executive Brief` — structured written brief (PDF)
- `Client PDF` — polished client-facing document
- `Proposal Skeleton` — blank template for client
- `Offer Card` — reusable offer card from Offers [OS v2]

Then create corresponding item(s) in Content Pipeline:
- Platform: `Internal / Memo`
- Content Type: `Proposal Deck` or `Internal Brief`
- Status: `Briefed`
- Link Related Style Profile (entity voice)

### Step 6: Review and send
- Change Status → `In Review` → create Decision Item (Type: Draft Review) if needed
- Once approved → Status → `Approved`
- After sending to client → Status → `Sent`
- Outcome → `Won` or `Lost`

---

## Proposal Types

| Type | When to use |
|------|-------------|
| Exploratory | Discovery phase — scope not yet defined |
| Scoped | Fixed scope, clear deliverables, time-bounded |
| Phased | Multi-phase delivery with decision gates between phases |
| Implementation-led | Hands-on delivery (e.g., retail refill rollout) |
| Partnership-led | Co-delivery with a partner or startup |
| Retainer | Ongoing advisory or embedded support |
| Grant Support | Proposal for grant application support services |

---

## Pricing Logic rules

- **Never put specific prices in Notion.** Pricing Logic is strategy, not quotes.
- Use ranges: `Phase-gated — Phase 1 fixed fee, Phase 2 scoped on outcomes`
- Use logic: `Value-based — pricing anchored to cost of doing nothing, not day rate`
- Escalate to JMM if pricing logic is genuinely novel

---

## Pilot record (Sprint 21)

| Brief | Client | Type | Budget Range | Status |
|-------|--------|------|--------------|--------|
| [PILOT 1] Greenleaf Retail — Refill Infrastructure Implementation Brief | Greenleaf Retail | Phased | £30k–£75k | Draft |

Pilot ID: `34045e5b-6633-813c-9e07-ce91d7d0532b`

---

## 5 views created (Sprint 21)

| View | Filter | Purpose |
|------|--------|---------|
| 📝 New / Drafting | Status = Draft | Active briefs being written |
| 🏢 By Client | Board / Status | Pipeline overview by stage |
| 👀 Needs Review | Status = In Review | Briefs awaiting approval |
| 🎨 Ready for Design | Sort by Budget Range | All briefs with design requests |
| ✅ Approved | Status = Approved | Approved, ready to send |

---

## Integration with Offer System

When creating a proposal:
1. Check Offers [OS v2] → ✅ Active Offers — does a reusable offer cover this need?
2. If yes: use the Offer's Modules, Pricing Logic, and Why CH as starting point — customise for client
3. If no: after delivering, consider whether this proposal should become a new Offer

The relationship: **Offers are the reusable template. Proposals are the client-specific instance.**

---

## Integration with Content Pipeline

All design outputs for proposals flow through Content Pipeline [OS v2]:
1. Set Design Asset Requested on the Proposal Brief
2. Create Content Pipeline item → Platform = `Internal / Memo` → Content Type = `Proposal Deck`
3. Set Voice / Speaker to match the entity (Common House / portfolio startup)
4. Link Related Style Profile
5. Status: `Briefed` → `Review` → `Approved`

Content Pipeline views: 📋 Proposal Requests, 🎨 Ready for Design, 👀 Proposal & Offer Review

---

## Integration with Opportunities

Proposal Briefs link to Opportunities [OS v2] via the **Related Opportunity** field.

Flow:
- Opportunity reaches Active/Qualifying → create Proposal Brief (Status = Draft)
- Proposal sent → Opportunity Stage advances
- Proposal Won → Opportunity → Closed Won → create CH Project record

---

## Residents and capabilities reference

Before filling "Relevant Residents / Capabilities," check who is currently in the House and what they are known for. This field is the credibility proof — not aspirational staffing.

Rule: Only include residents who have actually done this type of work, or CH capabilities that are structurally part of the House (not per-project hires).

---

## What is NOT the Proposal System

- Full proposal documents (Word, slides) — those go in Content Pipeline and Google Drive
- Commercial pricing sheets or rate cards — stored externally, never in Notion
- Client agreements or contracts — those go in Agreements & Obligations [OS v2]
- Project plans or delivery trackers — those go in CH Projects [OS v2]

---

## Database IDs

| Database | DB ID | DS ID |
|----------|-------|-------|
| Proposal Briefs [OS v2] | `76bfd50f-a991-4361-9b9b-51de4b8eae67` | `8f0fb3de-2a16-4b8b-a858-5ab068d2f2e4` |
| CH Organizations [OS v2] | `bef1bb86-ab2b-4cd2-80b6-b33f9034b96c` | `a0410f76-1f3e-4ec1-adc4-e47eb4132c3d` |
| Opportunities [OS v2] | `687caa98-594a-41b5-95c9-960c141be0c0` | `2938041a-c3ad-4cd8-bc7a-f39d9635af14` |
| Content Pipeline [OS v2] | `3bf5cf81-f45c-4db2-8405-90f3878bfdc0` | `29db8c9b-6738-41ab-bf0a-3a5f06c568a0` |
