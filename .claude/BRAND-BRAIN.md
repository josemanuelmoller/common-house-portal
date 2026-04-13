# Brand Brain — OS v2
Sprint 18 — 2026-04-12

The Brand Brain is the canonical source for all voice, style, and content production guidance in Common House OS v2. It replaces ad-hoc prompting with structured, reusable profiles that maintain consistent voice across CH, JMM, and portfolio startups.

> **Naming note:** This system is called "Design System" in user-facing references. Do NOT use "Studio System" — it creates confusion with venture studio / zero waste studio contexts.

---

## Channel Profiles (Sprint 18)

Style Profiles [OS v2] now contains a second profile type: **Channel Profile** (Style Type = Channel Profile). Channel Profiles define platform grammar — not voice. They live in the same database as Voice Profiles.

**5 active channel profiles:**
| Profile | Channel | Key constraint |
|---------|---------|---------------|
| LinkedIn — Channel Profile | LinkedIn | 100–150 words; hook in line 1; white space required |
| Instagram — Channel Profile | Instagram | 1–3 sentences above fold; copy supports visual |
| Newsletter — Channel Profile | Newsletter | TL;DR first; 2–4 named sections; single CTA |
| Website / Article — Channel Profile | Web | H1 + lede + H2; named sources; one CTA per page |
| Internal / Memo — Channel Profile | Internal | TL;DR first; named owner per action |

**Rule:** Every content item requires both a Voice Profile (who speaks) AND a Channel Profile (where it lives). Full comms workflow: `.claude/COMMS-SYSTEM.md`

---

## Three databases

### Style Profiles [OS v2]
**DB ID:** `606b1aafe63849a1a81ac6199683dc14`
**DS ID:** `3119b5c0-3b8b-4c17-bde0-2772fc9ba4a6`
**Location:** Backend > Common House Notion

The canonical library of voice and style rules. Each profile contains:
- Tone summary, structural rules, vocabulary patterns, forbidden patterns
- CTA style, data density, visual density
- Master Prompt — the ready-to-use Claude prompt for that voice/style
- Anti-examples — what NOT to produce

**8 active profiles (Sprint 16):**
| Profile | Style Type | Scope |
|---------|-----------|-------|
| Common House Voice | Voice / Tone | Common House |
| Common House Deck Style | Deck Style | Common House |
| Common House Proposal Style | Proposal Style | Common House |
| JMM Founder Voice | Voice / Tone | JMM |
| iRefill Brand | Brand Identity | Portfolio Startup |
| SUFI Brand | Brand Identity | Portfolio Startup |
| Beeok Brand | Brand Identity | Portfolio Startup |
| Yenxa Brand | Brand Identity | Portfolio Startup |

---

### Reference Assets [OS v2]
**DB ID:** `264f5e5e179c4449ba12a44fad9491f4`
**DS ID:** `fc498f7b-9f90-40ef-9e74-2a7077ce1cb0`
**Location:** Backend > Common House Notion

Annotated examples of good content. Each asset captures:
- Why it's good (structural analysis)
- What to emulate vs. what to avoid
- Tone notes and reusable block patterns
- Linked to Related Style Profile and Related Organization

**5 active reference assets (Sprint 16):**
1. CH — Portfolio Partnership One-pager
2. JMM — Ecosystem Builder LinkedIn Post
3. iRefill — Municipal Buyer Pitch Deck
4. Beeok — IDB-Aligned Investor One-pager
5. Yenxa — Bridge Round Outreach Email

---

### Content Pipeline [OS v2]
**DB ID:** `3bf5cf81f45c4db2840590f3878bfdc0`
**DS ID:** `29db8c9b-6738-41ab-bf0a-3a5f06c568a0`
**Location:** Backend > Common House Notion

Tracks every content production request from Brief → Approved. Each item links to:
- Related Style Profile (voice/style guide to apply)
- Reference Assets (examples to follow)
- Related Organization, Project, Opportunity, or Engagement

**Feedback Status field** (ties to Decision Center feedback loop):
- Approved as-is, Approved with edits, Too corporate, Too generic, Wrong tone, Needs more data, Rejected

---

## How to produce content

### Step 1: Identify the right Style Profile
Open Style Profiles [OS v2] → select the profile that matches the entity (CH / JMM / startup) and channel (deck / proposal / email / post).

### Step 2: Pull the Master Prompt
Open the profile page. Copy the Master Prompt from the page body. Fill in the [SPECIFY] placeholders:
- Content type
- Audience
- Key argument
- Any data to include

### Step 3: Check Reference Assets
Open Reference Assets [OS v2] → filter by Owner Entity → review the relevant assets for structural patterns and reusable blocks.

### Step 4: Draft with Claude
Paste the Master Prompt into a Claude conversation. Include the Reference Asset structural patterns as additional context if the output type is a deck or one-pager.

### Step 5: Log in Content Pipeline
Create a new Content Pipeline item:
- Set Status = Briefed (before drafting) or In Progress (during)
- Link the Style Profile and Reference Assets used
- Set Status = Review when draft is ready for human review

### Step 6: Review and feedback
Human reviews the output. Sets:
- Feedback Status (one of the 7 options)
- Status = Approved or Approved with edits
- If rejected: add Notes explaining why → feeds back into profile improvement

---

## Design request flow (what to produce, how to produce it)

| Output type | Style Profile | Reference Asset | Notes |
|-------------|--------------|-----------------|-------|
| CH investor one-pager | Common House Voice + Proposal Style | CH Partnership One-pager | Lead with ecosystem gap, not CH history |
| CH deck (partners) | Common House Deck Style | — | Argument-first; 8 slides; specific ask |
| JMM LinkedIn post | JMM Founder Voice | JMM LinkedIn Post | Hook line 1, 150 words max |
| Startup investor deck | [Startup] Brand | [Startup] Reference Asset | Use startup-specific profile, not CH voice |
| Startup one-pager | [Startup] Brand | [Startup] Reference Asset | Lead with problem, not product |
| Startup grant application | [Startup] Brand | — | Mirror funder's language back at them |
| Startup commercial proposal | [Startup] Brand | [Startup] Reference Asset | Scope-specific, outcome-measurable |

---

## Feedback loop → Decision Center

When a Content Pipeline item is reviewed and marked with Feedback Status, the signal should be used to improve the relevant Style Profile:

| Feedback Status | Action on Style Profile |
|-----------------|------------------------|
| Approved as-is | No change needed — profile is well-calibrated |
| Approved with edits | Review the edits — add to Structural Rules or Forbidden Patterns |
| Too corporate | Strengthen Forbidden Patterns; add anti-example |
| Too generic | Strengthen Vocabulary Patterns; tighten Tone Summary |
| Wrong tone | Review Master Prompt voice rules; may need a new profile |
| Needs more data | Add data density guidance to Structural Rules |
| Rejected | Root cause analysis — is it the profile or the prompt execution? |

For systematic review (after 5+ items per profile), create a Decision Item in Decision Items [OS v2]:
- Type: Draft Review
- Source Agent: Manual
- Proposed Action: Update [profile name] — [specific change]

---

## Pilot outputs (Sprint 16 baseline)

4 pilot outputs created and in Content Pipeline at Status = Review:

1. **Common House — Ecosystem One-pager** (One-pager, Partners/Investors)
   → Template for all future CH partner one-pagers
   
2. **Common House — Partnership Deck Skeleton** (Deck, Investors/Partners)
   → 8-slide reusable structure; argument-first format

3. **Beeok — IDB Investor Deck Skeleton** (Deck, Investors)
   → 10-slide structure; IDB-aligned framing; update metrics before use

4. **iRefill — Municipal Pilot Commercial One-pager** (One-pager, Clients)
   → Borough-specific template; update local waste data before use

Review all 4 in Content Pipeline → 👀 Needs Review view before marking Approved.

---

## Views

### Style Profiles [OS v2]
- 📋 All Profiles — all profiles sorted by status
- 🗂️ By Scope — board grouped by scope (CH / JMM / Portfolio Startup)
- 🏠 CH + JMM — filtered to Common House scope
- 🚀 Portfolio Startups — filtered to Portfolio Startup scope
- ✅ Active Only — active profiles only

### Reference Assets [OS v2]
- 📋 All Assets — all assets sorted by owner
- 🗂️ By Owner — board grouped by owner entity
- 📁 By Asset Type — board grouped by asset type
- 🏠 CH + JMM — filtered to Common House
- 🚀 Portfolio — filtered to iRefill (expand filter manually for others)

### Content Pipeline [OS v2]
- 📋 All Content — all items
- 🔥 Active Work — In Progress, sorted by due date
- 👀 Needs Review — items at Review status
- 🗂️ By Content Type — board grouped by content type
- 📅 Calendar — calendar view by due date

---

## Adding a new profile

1. Open Style Profiles [OS v2] → New page
2. Fill all fields: Style Type, Scope, Tone Summary, Structural Rules, Vocabulary Patterns, Forbidden Patterns, CTA Style, Data Density, Visual Density
3. Write the Master Prompt in the page body following the existing format
4. Add at least one Anti-Example
5. Set Status = Draft → review with first real output → promote to Active
6. Create at least one Reference Asset linked to the new profile

---

## Integration with agents

Content pipeline items can be created by agents (e.g., proposal-packager in briefing-agent) when they generate draft content. Pattern:
- Agent creates Content Pipeline item with Status = Briefed or Review
- Agent links Related Style Profile (must exist in Style Profiles DB)
- Human reviews in 📝 Drafts to Review view in Decision Center or 👀 Needs Review in Content Pipeline
- Feedback Status set → feeds back to profile improvement

---

## Integration with Insight Engine

The Insight Engine (Insight Briefs [OS v2]) is the upstream layer that feeds the Design System with content angles derived from external research. The integration points:

- **Brief → Content Pipeline:** An Insight Brief's Comms Angles field maps to a Content Pipeline item's Brief field. When routing a brief to Content Pipeline, link the relevant Style Profile so the content is produced with the correct voice.
- **Brief → Style Profile:** If an Insight Brief reveals new vocabulary patterns or proof points for a specific entity (e.g., EMF circular economy language for iRefill), update the relevant Style Profile's Vocabulary Patterns or Structural Rules fields.

Full Insight Engine reference: `.claude/INSIGHT-ENGINE.md`

**Insight Briefs [OS v2]**
- DB: `04bed3a3-fd1a-4b3a-9964-3cd21562e08a`
- DS: `839cafc7-d52d-442f-a784-197a5ea34810`

---

## Integration with Proposal System + Offer System (Sprint 21)

The Design System is the execution layer for all design outputs requested by the Proposal System and Offer System.

### Proposal → Design
When a Proposal Brief has **Design Asset Requested** set:
1. Identify the asset type: Proposal Deck / One-pager / Executive Brief / Client PDF / Proposal Skeleton
2. Create Content Pipeline item → Platform = `Internal / Memo` → Content Type = `Proposal Deck`
3. Link **Related Style Profile** — use the client's entity voice if CH is pitching on their behalf, or Common House Proposal Style for CH-branded proposals
4. Apply **Common House Proposal Style** rules: scope-specific language, outcome-measurable deliverables, no corporate filler
5. Status: Briefed → Review → Approved

### Offer → Design
When an Offer has **Design Assets Needed** set:
1. Asset types: Sales Deck / One-pager / Offer Card / Proposal Skeleton / Case Study / Pitch Email
2. Create Content Pipeline item → Content Type = `Sales Deck`
3. Link **Related Style Profile** — Common House Voice + Deck Style for CH offers; startup-specific profile for startup offers
4. Offer Cards and Case Studies should surface the named proof points and case evidence from the Offer record
5. Status: Briefed → Review → Approved

### Content Pipeline views for commercial outputs
- 📋 Proposal Requests — filtered by Content Type = Proposal Deck
- 🎁 Offer Requests — filtered by Content Type = Sales Deck
- 🎨 Ready for Design — all Briefed items
- 👀 Proposal & Offer Review — all items at Review status

Full guides: `.claude/PROPOSAL-SYSTEM.md` and `.claude/OFFER-SYSTEM.md`

---

## What is NOT Brand Brain

- Logo files, visual assets, color palettes — these belong in a design system tool (Figma), not in Notion
- Legal boilerplate — not part of voice profiles
- Internal meeting notes or status updates — those live in Projects and Sources, not Content Pipeline
- Raw research analysis or sector reports — those live in Insight Briefs [OS v2], not Content Pipeline
