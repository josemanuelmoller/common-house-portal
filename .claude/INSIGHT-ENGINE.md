# Insight Engine — OS v2
Sprint 19 — 2026-04-12

The Insight Engine is the structured analysis layer between raw source ingestion and comms/grant/commercial output. It converts reports, policy documents, and sector research into reusable, routable insight briefs that feed the Design System, Knowledge Assets, Content Pipeline, Decision Center, and Opportunities.

---

## One database

### Insight Briefs [OS v2]
**DB ID:** `04bed3a3-fd1a-4b3a-9964-3cd21562e08a`
**DS ID:** `839cafc7-d52d-442f-a784-197a5ea34810`
**Location:** Backend > Common House Notion

Each insight brief captures:
- Executive Summary, Key Facts, Key Insights
- Implications for CH, Implications for Startups
- Grant Angles, Comms Angles, Opportunity Angles
- Recommended Actions
- Routing checkboxes: Routed to Content Pipeline, Routed to Knowledge, Routed to Decision Center
- Related Style Profile (links to Design System)
- Status: New → In Analysis → Briefed → Routed → Archived

---

## Why Insight Briefs, not just Sources or Knowledge Assets

| Layer | Purpose | When to use |
|-------|---------|-------------|
| CH Sources [OS v2] | Raw ingestion of emails, meetings, documents | Capture first |
| **Insight Briefs [OS v2]** | **Structured analysis: what does this mean for CH?** | **After reading a report/paper** |
| CH Knowledge Assets [OS v2] | Reusable, stable canonical guidance | After brief is Routed and validated |
| Content Pipeline [OS v2] | Active content production requests | When brief generates a specific content need |

Insight Briefs are the intermediate layer. They are the structured output of reading a valuable document — not the raw document, not yet the reusable knowledge asset.

---

## How to create an insight brief

### Step 1: Identify the source
Open the document, report, or policy. Confirm it is:
- A real, attributable source (public report, government document, sector benchmark)
- Relevant to CH, JMM, or a portfolio startup
- Not already covered by an existing brief (check 📋 All Briefs)

### Step 2: Fill the brief
Create a new Insight Briefs [OS v2] record. Required fields:
- Title: `[Publisher] — [Document Title]`
- Status: `In Analysis`
- Source Type, Theme, Sector, Geography
- Executive Summary (1–2 paragraphs: what this document says and why it matters)
- Key Facts (bullet list: the 4–8 most useful specific numbers)
- Key Insights (numbered: the non-obvious implications)
- Confidence: High / Medium / Low (based on source quality)

### Step 3: Assess implications
Fill the implication fields:
- **Implications for CH** — how this affects CH's positioning, narrative, or portfolio thesis
- **Implications for Startups** — which portfolio companies benefit and how
- **Grant Angles** — which grant programs this document supports applications to
- **Comms Angles** — specific content angles derived from this brief
- **Opportunity Angles** — commercial or partnership signals

### Step 4: Route
Set routing flags and change Status to `Routed`:
- `Routed to Content Pipeline` → create Content Pipeline item (Status = Briefed or Review)
- `Routed to Knowledge` → create or update Knowledge Asset record
- `Routed to Decision Center` → create Decision Item if human action is required

### Step 5: Recommended Actions
Write Recommended Actions as a numbered list with [Owner tags]: `[iRefill]`, `[CH Comms]`, `[Grants]`, `[JMM]`, `[CH]`.

---

## Routing rules

| Signal | Route to | What to create |
|--------|----------|----------------|
| Brief contains stat/framework reusable across multiple outputs | Knowledge Assets | Insight Memo (Asset Type) |
| Brief generates a specific content piece idea | Content Pipeline | Status = Briefed |
| Brief surfaces a grant opportunity for a portfolio startup | Decision Center | Type: Missing Input |
| Brief reveals a commercial opportunity | Opportunities | If real signal, create Opportunity record |
| Brief reveals ambiguity or risk requiring human decision | Decision Center | Type: Ambiguity Resolution or Approval |

Only create Opportunity records if there is a real, near-term commercial signal — not every brief warrants one.

---

## 5 real insight briefs seeded (Sprint 17 baseline)

| Brief | Theme | Relevance | Key routing |
|-------|-------|-----------|-------------|
| Ellen MacArthur Foundation — Circular Economy Fundamentals | Circular Economy | iRefill, Grants, Comms, CH | Knowledge + Content Pipeline |
| UK DEFRA — Extended Producer Responsibility for Packaging 2024 | Policy / Grants | iRefill, Grants, CH | Knowledge |
| Tech Nation — State of UK Tech 2023 | Ecosystem / VC | CH, JMM, Growth, Comms | Knowledge + Content Pipeline |
| Content Marketing Institute — B2B Content Marketing Benchmarks 2024 | Growth / Comms | CH, JMM, Comms, Growth | Content Pipeline |
| FCA / Centre for Financial Inclusion — UK Financial Inclusion Evidence Base 2023 | Financial Inclusion | SUFI, Grants, CH | Knowledge + Decision Center |

All 5 at Status = In Analysis as of Sprint 17.

---

## Comms Foundations pilots (Sprint 17)

5 Content Pipeline items created from Insight Briefs:

| Item | Type | Status | Voice Profile |
|------|------|--------|---------------|
| JMM — The UK Scaleup Gap (LinkedIn Post) | LinkedIn Post | Review | JMM Founder Voice |
| CH — Circular Economy as Investment Thesis (LinkedIn Post) | LinkedIn Post | Review | Common House Voice |
| CH Newsletter — UK Policy Wave 2025–2026 (Angle Brief) | Internal Brief | Briefed | Common House Voice |
| iRefill — Why Refill Beats Recycling (LinkedIn Post Brief) | LinkedIn Post | Briefed | iRefill Brand |
| SUFI — The Unbanked Market in the UK (Investor Brief) | Exec Summary | Briefed | SUFI Brand |

Review the two items at Status = Review in Content Pipeline → 👀 Needs Review view.

---

## 2 Knowledge Assets created (Sprint 17)

| Asset | Type | Domain |
|-------|------|--------|
| Circular Economy Framework — EMF Evidence Base | Insight Memo | Refill, Packaging, Zero Waste, Policy |
| UK Packaging Regulation Stack — EPR + PPT Reference | Insight Memo | Refill, Packaging, Policy |

---

## 1 Decision Item created (Sprint 17)

| Item | Type | Priority | Action required |
|------|------|----------|----------------|
| SUFI — Apply to Fair4All Finance (Priority Grant Opportunity) | Missing Input | High | Human must check Fair4All Finance application window and confirm SUFI eligibility |

---

## Views

### Insight Briefs [OS v2] (7 views)
- 📋 All Briefs — all records sorted by Status
- 📥 New / To Review — filter Status = New
- 🗂️ By Theme — board grouped by Theme
- 📣 Routed to Comms — filter Routed to Content Pipeline = true
- 🏛️ Routed to Grants — Grant Angles column visible
- 🧠 Routed to Knowledge — filter Routed to Knowledge = true
- 🏢 By Geography — board grouped by Geography

### Content Pipeline [OS v2] (additional views added Sprint 17)
- 💬 Comms Ideas — filter Content Type = LinkedIn Post
- 🎨 Design Requests — filter Content Type = Deck
- 📝 Needs Draft — filter Status = Briefed
- ✅ Approved for Production — filter Status = Approved

### Style Profiles [OS v2] (additional view added Sprint 17)
- 🔍 Profiles Overview — sorted by Scope, showing key fields

---

## Integration with Comms System (Sprint 18)

When routing a brief to Content Pipeline, the full Comms System workflow applies:
1. Brief's Comms Angles field → Content Pipeline Brief field
2. Set Platform (LinkedIn / Instagram / Newsletter / Website / Internal) on the new item
3. Set Voice / Speaker (JMM Founder / Common House / portfolio startup)
4. Link Related Style Profile (Voice Profile) AND consult the Channel Profile for platform rules
5. Draft respects both voice and channel constraints — not just the voice profile

Full Comms System guide: `.claude/COMMS-SYSTEM.md`

---

## Integration with Grants System (Sprint 19)

When a brief contains grant-relevant content, the Grants System workflow applies:

1. Brief's **Grant Angles** field → identifies specific grant programmes relevant to CH/startups
2. Set `Routed to Decision Center = true` if eligibility is unclear → create Missing Input Decision Item
3. Create Opportunity in Opportunities [OS v2] (Type = Grant) linked to the relevant funder organisation
4. If application support content is needed → route to Content Pipeline (Platform = Internal / Memo, Type = Internal Brief)
5. Set `Routed to Content Pipeline = true` if brief generates a public-facing grant narrative (newsletter, LinkedIn)

**Grant Angles field rules:**
- Only populate if the brief contains a specific, named grant programme with a plausible fit
- Never invent eligibility — flag uncertainty to Decision Center
- Format: `[Programme name] — [Entity] ([Priority level])`

Full Grants System guide: `.claude/GRANTS-SYSTEM.md`

---

## Integration with Design System (Brand Brain)

Insight Briefs feed the Design System at two points:

1. **Brief → Content Pipeline:** When a brief generates a content angle, create a Content Pipeline item linked to the correct Style Profile. The brief's Comms Angles field maps to the Content Pipeline Brief field.
2. **Brief → Knowledge Asset:** When a brief contains a reusable framework or stat set, create an Insight Memo in Knowledge Assets. Link back to the brief for provenance.

The voice separation rule from Brand Brain applies here: always route CH angles to CH profiles, JMM angles to JMM profiles, startup angles to startup-specific profiles. Never mix.

---

## Adding a new insight brief

1. Open Insight Briefs [OS v2] → New page
2. Fill Title, Source Type, Theme, Sector, Geography, Source Link
3. Set Status = In Analysis
4. Write Executive Summary, Key Facts, Key Insights
5. Fill Implications, Angles, Recommended Actions
6. Set routing flags (Routed to Content Pipeline / Knowledge / Decision Center)
7. Create routing targets (Content Pipeline items, Knowledge Assets, Decision Items)
8. Set Status = Routed

Minimum viable brief: Title + Executive Summary + Key Facts + at least one Recommended Action.

---

## What is NOT Insight Engine

- Raw meeting notes or email threads — those live in CH Sources [OS v2]
- Finished content pieces (blog posts, decks) — those live in Content Pipeline [OS v2]
- Stable operational guidance — that lives in Knowledge Assets [OS v2]
- Investment decisions or commercial approvals — those go to Decision Center
