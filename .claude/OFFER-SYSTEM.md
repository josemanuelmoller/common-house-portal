# Offer System — OS v2
Sprint 21 — 2026-04-12

The Offer System answers: **"What reusable offers does Common House have that can be sold again and again?"** It converts past project experience, resident capabilities, and portfolio proof into productised offers with buyer logic, modules, pricing rationale, proof points, and sales narrative.

---

## One database

### Offers [OS v2]
**DB ID:** `58b863e9-c789-465b-82eb-244674bc394f`
**DS ID:** `10c7de04-8f71-45ff-9e37-32e683829232`
**Location:** Backend > Common House Notion

Each offer captures:
- Core Problem Solved — the buyer pain in 1–2 sentences
- ICP / Buyer Logic — ideal customer profile and firmographics
- Ideal Buyer — role, org type, decision-maker profile
- Modules — discrete work packages that make up the offer
- Typical Pricing Logic — how to price this (never specific amounts)
- Typical Timeline — expected delivery duration
- Delivery Model — workshop, sprint, retainer, embedded, etc.
- Triggers — events or signals that create urgency
- Sales Narrative — what to say to move a buyer to yes
- Proof Points — named evidence that CH can deliver this
- Case Evidence — precedent projects and measurable outcomes
- Why CH Can Deliver — credibility argument and unique positioning
- Related Residents / Capabilities — who inside CH delivers this
- Opportunity Cues — target accounts and buyer signals
- Design Assets Needed — what sales materials are required
- Offer Status: Active / In Development / Deprecated

---

## Why Offers, not Products or Services

This is **not** a product catalogue. Offers are:
- Grounded in real delivery evidence (Auto Mercado, borough pilots, portfolio precedents)
- Specific about who the buyer is and what their problem is
- Honest about pricing logic — never invented numbers
- Linked to real sales opportunities

An offer is only Active if it has been delivered at least once OR has a credible near-term proof point.

---

## Offer Categories

| Category | What it covers |
|----------|----------------|
| Retail Implementation | Physical retail refill rollout, store infrastructure, sustainability ops |
| Startup Support | Mentoring, strategy, commercial acceleration for early-stage startups |
| Portfolio Acceleration | Structured programme from idea to investment-ready |
| Grant Support | Grant identification, eligibility, brief writing support |
| Ecosystem Building | Network activation, convening, partnership structures |
| Circular Economy | CE strategy, EPR advisory, zero waste operations |
| Financial Inclusion | Fintech advisory, underserved market strategy |
| Design & Comms | Brand development, content strategy, visual identity |
| Commercial Strategy | Go-to-market, pricing strategy, channel development |

---

## How to create an offer

### Step 1: Identify the reusable pattern
An offer should be created when:
- CH has delivered the same type of engagement 2+ times
- A proposal has been won that could be replicated
- A resident capability is strong enough to sell repeatedly
- An Insight Brief reveals a market gap CH can fill

Do NOT create an offer speculatively. Start with evidence.

### Step 2: Fill the offer
Create a new Offers [OS v2] record. Required fields:
- **Offer Name:** Clear commercial name — what a buyer would recognise
- **Offer Status:** `Active` (if proven) or `In Development` (if building)
- **Offer Category:** select from list
- **Core Problem Solved:** 1–2 sentences — the exact buyer pain
- **ICP / Buyer Logic:** firmographics — sector, org size, maturity, triggers
- **Ideal Buyer:** role and decision-maker profile

### Step 3: Fill the commercial body
- **Modules:** Numbered list of discrete work components
- **Typical Pricing Logic:** How to think about pricing this offer (value-based? Per module? Phase-gated?)
- **Typical Timeline:** e.g., `6–10 weeks from kick-off`
- **Delivery Model:** How CH delivers this in practice
- **Triggers:** What events create urgency (e.g., "Retailer faces EPR compliance date")

### Step 4: Fill the evidence base
- **Proof Points:** Named, specific — `Auto Mercado pilot: 3 refill stations, 8-week rollout`
- **Case Evidence:** Named precedent projects with measurable outcomes
- **Why CH Can Deliver:** The credibility narrative — why CH wins this over generalist consultants
- **Related Residents / Capabilities:** Which residents anchor this offer

### Step 5: Set up sales assets
- **Opportunity Cues:** Named target accounts, buyer signals, account types
  - Format: `[Company name] — [signal]` e.g., `Tesco — sustainability procurement review`
- **Design Assets Needed:** Sales Deck / One-pager / Offer Card / Proposal Skeleton / Case Study / Pitch Email
- Create corresponding Content Pipeline items (Content Type = Sales Deck, Platform = Internal / Memo)

### Step 6: Link to opportunities
- **Related Opportunities:** Link to any active Opportunity records in pipeline
- **Related Project Precedents:** Link to CH Projects that prove delivery

---

## Active offers (Sprint 21)

| Offer | Category | Status | Based on |
|-------|----------|--------|---------|
| Retail Refill Implementation — From Pilot to Programme | Retail Implementation | **Active** | Auto Mercado pilot + iRefill borough precedents |
| Portfolio Startup Acceleration — From Idea to Investment-Ready | Portfolio Acceleration | In Development | JMM advisory experience — pricing validation pending |

---

## Offer Status rules

| Status | Meaning | When to use |
|--------|---------|-------------|
| Active | Ready to sell. Has delivery evidence. | After first successful delivery or strong proof |
| In Development | Being built. Needs validation. | New offer pattern identified, not yet proven |
| Deprecated | No longer offered. | Offer is superseded or no longer viable |

Rule: Only mark Active if you can honestly answer "we have done this before." If not — In Development.

---

## Pricing Logic rules (same as Proposal System)

- **Never put specific prices in Notion.** Typical Pricing Logic is strategy, not quotes.
- Use logic: `Phase-gated — fixed fee per module, scoped total on outcomes`
- Use anchors: `Value-based — pricing anchored to cost of not acting (EPR fines, reputational risk)`
- Escalate to JMM before quoting any offer commercially for the first time

---

## Offer → Proposal flow

When a new proposal is needed for an offer type:
1. Open Offers [OS v2] → ✅ Active Offers → find the matching offer
2. Copy Modules, Pricing Logic, Why CH Can Deliver, and Proof Points into new Proposal Brief
3. Customise for the specific client: adjust Buyer Problem, Phases, Assumptions, Exclusions
4. Set Related Opportunity and Client / Organization on the Proposal Brief
5. The Offer remains unchanged — it is the canonical version

---

## Opportunity Cues → Opportunities

Named Opportunity Cues in an offer should trigger Opportunity creation in Opportunities [OS v2]:
1. Offer Cue: `Co-op — sustainability team reviewing refill pilots`
2. → Create Opportunity: `Retail Refill Implementation — Co-op`, Type = Commercial, Priority = P2
3. Link Opportunity back to the Offer via Related Opportunities

This closes the loop between the offer library and the live sales pipeline.

---

## Integration with Proposal System

Offers are the **reusable template**. Proposals are the **client-specific instance**.

- One offer → many proposals
- An offer never changes per-client — it evolves through the Offer versioning (Tier / Version field)
- If a proposal requires heavy customisation of a module, that is a signal to create a new Offer Category or Module variant

---

## Integration with Content Pipeline

All design outputs for offers flow through Content Pipeline [OS v2]:
1. Set Design Assets Needed on the Offer record
2. Create Content Pipeline item → Platform = `Internal / Memo` → Content Type = `Sales Deck`
3. Link Related Style Profile (entity voice)
4. Status: `Briefed` → `Review` → `Approved`

Content Pipeline views: 🎁 Offer Requests, 🎨 Ready for Design

---

## Integration with Grants System

Some offers have a grant angle:
- Grant Support offer category → connect to relevant Opportunity (Type = Grant) in Grants System
- If an offer is relevant to an upcoming grant call → create Decision Item linking offer to grant

---

## 6 views created (Sprint 21)

| View | Filter / Group | Purpose |
|------|----------------|---------|
| ✅ Active Offers | Offer Status = Active | Ready-to-sell offers |
| 🔨 In Development | Offer Status = In Development | Offers being built |
| 🗂️ By Offer Category | Board / Offer Category | Portfolio view by domain |
| 🎯 By Delivery Model | Board / Offer Status | Pipeline view |
| 🎨 Needs Design Assets | Sort by Offer Category | All offers needing sales materials |
| 🔗 Opportunity-Linked Offers | Sort by Offer Status | Offers with active deals |

---

## What is NOT the Offer System

- Client proposals — those go in Proposal Briefs [OS v2]
- Rate cards or pricing sheets — stored externally
- Services that have never been delivered — use In Development sparingly
- General CH positioning or brand statements — those live in Knowledge Assets or BRAND-BRAIN.md

---

## Weekly review habit

- ✅ Active Offers — are all active offers up to date with latest proof points?
- 🔨 In Development — are any offers ready to move to Active?
- 🔗 Opportunity-Linked Offers — are opportunity cues being actioned in the pipeline?

---

## Database IDs

| Database | DB ID | DS ID |
|----------|-------|-------|
| Offers [OS v2] | `58b863e9-c789-465b-82eb-244674bc394f` | `10c7de04-8f71-45ff-9e37-32e683829232` |
| Proposal Briefs [OS v2] | `76bfd50f-a991-4361-9b9b-51de4b8eae67` | `8f0fb3de-2a16-4b8b-a858-5ab068d2f2e4` |
| Opportunities [OS v2] | `687caa98-594a-41b5-95c9-960c141be0c0` | `2938041a-c3ad-4cd8-bc7a-f39d9635af14` |
| Content Pipeline [OS v2] | `3bf5cf81-f45c-4db2-8405-90f3878bfdc0` | `29db8c9b-6738-41ab-bf0a-3a5f06c568a0` |
| CH Organizations [OS v2] | `bef1bb86-ab2b-4cd2-80b6-b33f9034b96c` | `a0410f76-1f3e-4ec1-adc4-e47eb4132c3d` |
