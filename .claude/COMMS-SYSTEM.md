# Comms System — OS v2
Sprint 18 — 2026-04-12

The Comms System is the editorial layer of Common House OS v2. It converts signals from Insight Briefs, active projects, and portfolio companies into channel-specific, voice-specific content — tracked from signal to published output.

> **The core rule:** Every content item has three mandatory dimensions: Voice (who speaks), Platform (where it lives), Format (what shape it takes). These are never mixed. A JMM LinkedIn post and a CH Instagram caption are different outputs requiring different inputs.

---

## Three-layer model

| Layer | What it defines | Where it lives |
|-------|----------------|----------------|
| Voice / Speaker | Who is speaking: JMM Founder, Common House, or a portfolio startup | Style Profiles [OS v2] — Voice/Tone and Brand Identity types |
| Platform / Channel | Where the output lives: LinkedIn, Instagram, Newsletter, Website/Article, Internal/Memo, Deck | Style Profiles [OS v2] — Channel Profile type |
| Content Format | What shape the output takes: LinkedIn Post, Instagram Caption, Newsletter Block, Article Outline, etc. | `Content Type` field on Content Pipeline [OS v2] |

Never collapse these three. Tone and platform are not the same thing.

---

## Two types of Style Profiles

### Voice Profiles (Style Type: Voice/Tone or Brand Identity)
Define WHO speaks: vocabulary, tone, forbidden patterns, structural rules for a person or brand.

**8 active voice profiles (Sprint 18):**
| Profile | Type | Scope |
|---------|------|-------|
| Common House Voice | Voice / Tone | Common House |
| Common House Deck Style | Deck Style | Common House |
| Common House Proposal Style | Proposal Style | Common House |
| JMM Founder Voice | Voice / Tone | JMM |
| iRefill Brand | Brand Identity | Portfolio Startup |
| SUFI Brand | Brand Identity | Portfolio Startup |
| Beeok Brand | Brand Identity | Portfolio Startup |
| Yenxa Brand | Brand Identity | Portfolio Startup |

### Channel Profiles (Style Type: Channel Profile)
Define WHERE the content lives: length, format grammar, CTA style, formality level, visual dependency, opening/closing patterns, restrictions.

**5 active channel profiles (Sprint 18):**
| Profile | Channel | Key rule |
|---------|---------|----------|
| LinkedIn — Channel Profile | LinkedIn | Hook in line 1; 100–150 words; no padded intros; white space |
| Instagram — Channel Profile | Instagram | 1–3 sentences above fold; copy must support visual; 3–8 hashtags |
| Newsletter — Channel Profile | Newsletter | TL;DR at top; 2–4 named sections; single CTA; no pleasantries |
| Website / Article — Channel Profile | Web | H1 + lede + H2 sections; named sources; one CTA per page |
| Internal / Memo — Channel Profile | Internal | TL;DR first; named owner per action; conclusion before context |

---

## Content Pipeline workflow

```
Signal → Topic Brief → Briefed → In Progress → Review → Approved → Ready to Publish → Published
                                                     ↓
                                                 Rejected → Decision Center (Draft Review item)
```

| Status | Who acts | What happens |
|--------|----------|-------------|
| Signal | Anyone | Raw idea logged — no brief yet |
| Topic Brief | Editor / Claude | Platform, Voice, Format decided; Brief written |
| Briefed | Editor / Claude | Ready to draft; Style Profile and Reference Assets linked |
| In Progress | Claude / Editor | Draft being written |
| Review | Human | Draft in Draft Text field; Feedback Status to be set |
| Approved | Human | Approved as-is or Approved with edits |
| Ready to Publish | Human | Final copy confirmed; Output Link set |
| Published | Human | Live. Set Published date. |
| Rejected | Human | Feedback Status set → escalate if systematic |

---

## New Content Pipeline fields (Sprint 18)

| Field | Type | Purpose |
|-------|------|---------|
| Platform | Select | LinkedIn / Instagram / Newsletter / Website / Internal / Deck |
| Voice / Speaker | Select | JMM Founder / Common House / iRefill / SUFI / Beeok / Yenxa / Cross-entity |
| Draft Text | Rich Text | Full draft ready for human review |
| Publish Window | Text | Month/date target for publication |
| Feedback Summary | Text | Human notes on what to change |
| Related Insight Brief | Relation | Links back to Insight Briefs [OS v2] source |

---

## Content formats and when to use them

| Format | Platform | Length | When to use |
|--------|----------|--------|-------------|
| LinkedIn Post | LinkedIn | 100–150 words | Thought leadership, announcements, portfolio news |
| Instagram Caption | Instagram | 1–3 sentences + hashtags | Visual storytelling, mission, community |
| Newsletter Block | Newsletter | 300–600 words (full issue) / 80–120 (single block) | Curated signals, sector updates, portfolio spotlights |
| Article Outline | Website / Article | 600–1200 words when expanded | Opinion pieces, explainers, case studies |
| Commentary Note | LinkedIn / Internal | 60–100 words | Reactions to news, quick takes |
| Internal Brief | Internal / Memo | 150–400 words | Decision memos, portfolio updates, briefing notes |
| Exec Summary | Deck / One-pager Handoff | 200–400 words | Investor or funder summaries |

---

## Voice × Platform combination rules

| Voice | LinkedIn | Instagram | Newsletter | Website/Article | Internal |
|-------|----------|-----------|------------|-----------------|----------|
| JMM Founder | PRIMARY — opinion, argument, scaleup | Low | Medium — opinion blocks | PRIMARY — opinion articles | High — briefing notes |
| Common House | HIGH — ecosystem, thesis | Medium | PRIMARY — sector signals | HIGH — explainers | High — portfolio updates |
| iRefill | HIGH — commercial, product, policy | High — refill visuals | Spotlight sections | Medium — case studies | Low |
| SUFI | Medium — financial inclusion takes | Medium | Spotlight sections | Medium | Low |
| Beeok | Medium | High — product visuals | Spotlight sections | Low | Low |
| Yenxa | Medium | Medium | Spotlight sections | Low | Low |

---

## How to produce content (full workflow)

### Step 1: Check the Insight Engine
Open Insight Briefs [OS v2] → 📋 All Briefs. Look for briefs with Comms Angles filled and Routed to Content Pipeline = true. These are your signal sources.

### Step 2: Identify Voice + Platform + Format
- Who speaks? → Pick Voice Profile
- Where does it live? → Pick Channel Profile
- What shape? → Pick Content Type

### Step 3: Create Content Pipeline item
Set Status = Topic Brief → fill Brief field with the core argument, evidence source, and CTA intent.

### Step 4: Select Style Profile and Channel Profile
Link Related Style Profile (voice guide) to the item.

### Step 5: Draft with Claude
Open Voice Profile → copy Master Prompt → fill [SPECIFY] placeholders. Open Channel Profile → apply length, format, and restriction rules. Draft respecting both.

### Step 6: Log draft
Set Status = Review. Paste draft into Draft Text field.

### Step 7: Human review
Set Feedback Status. If approved: Status = Approved → Ready to Publish → Published.
If rejected or needs edit: add notes to Feedback Summary. If 3+ rejections on same Style Profile → create Decision Item (Type: Draft Review).

---

## Editorial feedback loop → Decision Center

| Feedback Status | Immediate action | Escalation rule |
|----------------|-----------------|-----------------|
| Approved as-is | No action | — |
| Approved with edits | Review edits → update Style Profile Structural Rules | — |
| Too corporate | Strengthen Forbidden Patterns on Voice Profile | After 3 items: create Draft Review Decision Item |
| Too generic | Strengthen Vocabulary Patterns | After 3 items: create Draft Review Decision Item |
| Wrong tone | Review Master Prompt voice rules | After 3 items: create Draft Review Decision Item |
| Needs more data | Add data density guidance to Structural Rules | — |
| Rejected | Root cause: is it the profile or the execution? | Always create Draft Review Decision Item |

Decision Items for editorial issues use:
- Decision Type: Draft Review
- Source Agent: Manual
- Priority: Normal (systematic issues) or High (single outright rejection)

---

## Editorial cadence

### Weekly habit
- 📅 Comms Queue — check active items, confirm publish windows
- 👀 Needs Review — review drafts at Review status, set Feedback Status
- ✍️ Draft Review Queue in Decision Center — resolve any open editorial items

### Monthly habit
- Review Feedback Status history per Style Profile
- Identify profiles with 3+ negative signals → escalate to Decision Center
- Review Channel Profiles for any updates needed based on platform changes

### Recurring spotlights
- Monthly portfolio startup spotlight (1 item per active startup)
- Quarterly CH thesis piece (JMM or CH voice, article or long-form LinkedIn)
- Post-grant result comms (iRefill, SUFI when outcomes confirmed)

---

## Views

### Content Pipeline [OS v2] — Sprint 18 views
| View | Type | Filter |
|------|------|--------|
| 📅 Comms Queue | Table | Active items (not Archived/Rejected/Published), sorted by Publish Window |
| 📲 By Platform | Board | Grouped by Platform |
| 🧠 JMM Voice | Table | Voice = JMM Founder |
| 🏠 CH Voice | Table | Voice = Common House |
| 🚀 Startup Angles | Board | Voice = portfolio startups, grouped by Voice/Speaker |
| ✅ Ready to Publish | Table | Status = Ready to Publish |
| 🔗 By Insight Source | Table | Related Insight Brief visible, sorted |
| 👀 Needs Review | Table | Status = Review (existing Sprint 16/17 view) |
| 📝 Needs Draft | Table | Status = Briefed (existing Sprint 17 view) |

### Style Profiles [OS v2] — Sprint 18 views
| View | Type | Filter |
|------|------|--------|
| 🎙️ Voice Profiles | Table | Style Type ≠ Channel Profile |
| 📡 Channel Profiles | Table | Style Type = Channel Profile |
| 🗂️ Active vs Draft | Board | Grouped by Status |

### Decision Items [OS v2] — Sprint 18 views
| View | Type | Filter |
|------|------|--------|
| ✍️ Draft Review Queue | Table | Decision Type = Draft Review, Status = Open |
| 📋 Editorial Policy Decisions | Table | Decision Type = Policy / Automation Decision |

---

## Database IDs

| Database | DB ID | DS ID |
|----------|-------|-------|
| Style Profiles [OS v2] | `606b1aafe63849a1a81ac6199683dc14` | `3119b5c0-3b8b-4c17-bde0-2772fc9ba4a6` |
| Content Pipeline [OS v2] | `3bf5cf81f45c4db2840590f3878bfdc0` | `29db8c9b-6738-41ab-bf0a-3a5f06c568a0` |
| Insight Briefs [OS v2] | `04bed3a3-fd1a-4b3a-9964-3cd21562e08a` | `839cafc7-d52d-442f-a784-197a5ea34810` |
| Decision Items [OS v2] | `6b801204c4de49c7b6179e04761a285a` | `1cdf6499-0468-4e2c-abcc-21e2bd8a803f` |

---

## Sprint 18 baseline

### 10 content items seeded (total across Sprint 17 + 18)
5 from Sprint 17 (JMM LinkedIn, CH LinkedIn, CH Newsletter Angle, iRefill LinkedIn Brief, SUFI Investor Brief)
5 new in Sprint 18 (CH Instagram, CH Newsletter Block, JMM Article, iRefill Borough Post, CH Internal Brief)

### 7 pilot outputs created
| Pilot | Voice | Platform | Format | Status |
|-------|-------|----------|--------|--------|
| [PILOT 1] JMM — The Scaleup Gap | JMM Founder | LinkedIn | LinkedIn Post | Review |
| [PILOT 2] CH — Circular Economy as Investment Thesis | Common House | LinkedIn | LinkedIn Post | Review |
| [PILOT 3] CH — Circular Economy Infrastructure | Common House | Instagram | Instagram Caption | Review |
| [PILOT 4] CH Newsletter — UK Sector Signals Q2 2026 | Common House | Newsletter | Newsletter Block | Review |
| [PILOT 5] JMM — UK Scaleup Support Article Outline | JMM Founder | Website/Article | Article Outline | Review |
| [PILOT 6] iRefill — Why Refill Beats Recycling | iRefill | LinkedIn | LinkedIn Post | Review |
| [PILOT 7] CH — Q1 Portfolio Update | Common House | Internal/Memo | Internal Brief | Review |

All 7 pilots are in Content Pipeline → 👀 Needs Review. Human review required.

### 2 Decision Items created
- Editorial Review — Sprint 18 Pilot Outputs (7 items) — Priority: High, Due: 2026-04-30
- Editorial Policy — Escalation threshold for Feedback Status → Due: 2026-04-30

---

## What is NOT Comms System

- Raw research or policy documents → those live in Insight Briefs [OS v2]
- Voice/style rules for a brand → those live in Style Profiles [OS v2] as Voice/Tone or Brand Identity profiles
- Platform grammar rules → those live in Style Profiles [OS v2] as Channel Profiles
- Final published assets (PDFs, slide decks, designed graphics) → those live outside Notion
- Investment decisions or grant approvals → those go to Decision Center
