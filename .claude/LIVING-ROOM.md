# LIVING-ROOM.md — Common House Community Layer
**Sprint 25 · April 2026**

---

## What it is

Living Room is the community layer of Common House.

It answers: **how does life move inside the House — what themes are in motion, what milestones are shareable, who is here and where, and how does the community connect.**

It is NOT:
- an operational dashboard
- an infinite social feed
- a copy of Residents
- a data leak surface

---

## Official difference from Residents

### Residents
Answers: **who is part of the House and what capabilities exist.**
- Capability-driven
- Useful for pre-sales
- More institutional
- Public-safe directory

### Living Room
Answers: **how the community is alive — what's moving, what's shareable, and how to connect.**
- Social and relational
- Activity-based
- Community-oriented
- Curated, not noisy

**They connect but do not merge.**
- Living Room links to Residents for full profiles
- Residents does NOT surface milestone feeds, signals, or geographic views

---

## Navigation placement

```
◈  The Hall           /hall-vitrina        [public-safe]
◉  Residents          /residents           [public-safe]
⌂  Living Room        /living-room         [community-visible / public-safe mix]  ← NEW Sprint 25
◻  Workrooms          /workrooms           [client-only / internal]
◧  Garage             /garage              [client-only / internal]
◫  Control Room       /control-room        [internal-only]
```

**Rule:** Living Room sits between Residents and Workrooms. It is the social bridge between the public directory (Residents) and the operational interior (Workrooms/Garage/Control Room).

---

## Modules

### A. Featured Members
- 3 featured member cards per load (rotates or curates)
- Shows: name, role, location, expertise tags
- Links to full Residents profile
- Visibility: **public-safe**
- Source: CH People [OS v2] · `Visibility = public-safe` filter

### B. What the House is moving this week
- Right-panel block, always present
- 3–4 active themes briefed in 1–2 lines
- Manually curated or auto-populated from Themes in Motion
- Visibility: **public-safe** (no client names, no pipeline amounts)
- Source: manual curation + active themes filter

### C. Shareable Milestones
- Curated milestone cards: 3 recent
- Types: pilot milestone, grant win, speaking engagement, launch, publication, partnership, meaningful progress update
- Not all milestones appear — only those marked `Share to Living Room = yes`
- Each milestone has explicit visibility badge (public / community)
- Source: CH Projects [OS v2] + Content Pipeline [OS v2] · `Share to Living Room = yes`

### D. Themes in Motion
- 6-card grid of active and monitored themes
- Each theme: name, description, expertise tags, status (active / monitoring), member count, project count
- Visibility: **public-safe** (no client names)
- Source: manual curation + Knowledge Assets [OS v2] themes

### E. Community Signals
- 3 curated signal cards per view
- Types: policy update, grant opportunity, sector news, funder announcement, market signal
- NOT automated scraping — curated or agent-flagged
- Each signal has relevance rating and visibility badge
- Source: Insight Briefs [OS v2] marked as community-relevant + manual curation

### F. People by Geography
- 4-card geography breakdown
- Shows region, member count, avatar cluster
- Visibility: **public-safe** (names shown only for public-safe members)
- Source: CH People [OS v2] · `Location` field

### G. Expertise Clusters
- 6 clusters derived from Residents expertise tags
- Shows: cluster name, sub-tags, member count, recent output count
- Links to filtered Residents view
- Source: CH People [OS v2] · expertise tags aggregated

### H. Ways to Connect (CTA strip)
- Bottom-of-page dark strip
- CTAs: Explore members · See who's working on X · Explore themes · View milestones · Request a conversation
- No pseudo-social mechanics — navigation CTAs only

---

## Privacy / Visibility Model

### Definitions

| Level | Label | Meaning |
|-------|-------|---------|
| 🟢 Public-safe | `public` | Can be shown externally, on Hall, in proposals, on social |
| 🔵 Community-visible | `community` | Visible to authenticated members, CH internal use — not public |
| ⚪ Private-only | `private` | Never surfaces in Living Room — internal only |

### What is public-safe in Living Room
- Member names + roles + bios (for members with `Visibility = public-safe`)
- Expertise tags
- Geographic location (city/region level)
- Shareable milestones explicitly marked `public`
- Active themes (topic-level only — no client names)
- Community signals that are already public (news, policy, funder announcements)

### What is community-visible only
- Shareable milestones marked `community` (startup wins with partial context)
- Startup references without full detail
- Grant wins with rounded/anonymized amounts
- Active fundraise references (without named round / investor)

### What is NEVER shown in Living Room (private-only)
- Internal pipeline (client names, stages, probabilities)
- Grant amounts (specific)
- Investor names in active deal
- Decisions awaiting review
- Financial / startup sensitive data
- Agent logs, system health
- P1 signals / blockers
- Anything from Control Room

---

## How content enters Living Room

### Route 1 — Milestones from Projects / Pipeline
- CH team marks a project milestone with `Share to Living Room = yes`
- Team sets `Visibility = public / community`
- (Optional) adds `Community Theme` and `Milestone Type`
- Appears in Shareable Milestones module

### Route 2 — Content / Comms items
- Content Pipeline [OS v2] item marked `Share to Living Room = yes`
- Appears once status = Published or Approved
- Useful for publications, speaking engagements, launch announcements

### Route 3 — Insight Briefs (signals)
- Insight Brief marked `Community Relevant = yes`
- Appears in Community Signals with curated summary
- Visibility set by curator

### Route 4 — Profile updates
- CH People [OS v2] profile updated with new expertise, location, or role
- Living Room picks up automatically from Residents data

### Route 5 — Manual curation
- CH team manually adds themes, signals, or weekly briefing content
- Preferred channel for Themes in Motion and What the House is Moving

### Fields to add on relevant DBs

| DB | New field | Values |
|----|-----------|--------|
| CH Projects [OS v2] | `Share to Living Room` | Yes / No |
| CH Projects [OS v2] | `Milestone Type` | Pilot / Grant win / Launch / Speaking / Publication / Partnership / Progress |
| CH Projects [OS v2] | `Community Theme` | Free text / select |
| Content Pipeline [OS v2] | `Share to Living Room` | Yes / No |
| Insight Briefs [OS v2] | `Community Relevant` | Yes / No |
| CH People [OS v2] | `Visibility` | public-safe / community / private |
| CH People [OS v2] | `Location` | City / Region (already exists or add) |

---

## Connection to Hall

Hall can preview Living Room content (public-safe only) in a teaser block.

### What Hall should preview from Living Room
- 2–3 featured members (same as Living Room Featured Members)
- 2 shareable milestones (public-safe only)
- 2 themes in motion (topic level only)
- 1 signal card (public relevance)

**Rule:** Hall teaser never shows community-visible items. Only public-safe.

### Hall CTA for Living Room
```
See what the community is working on →  [Living Room]
```

---

## Connection to Residents

| From Residents | To Living Room |
|----------------|----------------|
| Full profile cards | Member cards (condensed) |
| Expertise tags | Expertise clusters |
| Geographic data | Geography view |
| Role / type | Featured Member rotation |

| From Living Room | To Residents |
|-----------------|--------------|
| "See full profile" CTA | Links to Residents card |
| Expertise cluster CTA | Links to filtered Residents view |
| Geography card CTA | Links to geography-filtered Residents |

---

## Visibility / access rules (platform level)

| Surface | Who can see |
|---------|-------------|
| Public-safe modules | Anyone (Hall, unauthenticated) |
| Community-visible modules | Authenticated members / CH internal |
| Full Living Room | Authenticated users (community gate) |
| Milestone full context | Depends on visibility flag per item |
| Signals (policy/public) | Public-safe |
| Signals (grant / funder detail) | Community-visible |

---

## Tone rules

- Curated, not scrolled
- Blocks with purpose, not feeds for filling space
- No vanity metrics
- No noise — every item must pass "would a member find this useful or interesting?"
- More magazine layout than social feed

---

## Files

| File | Purpose | Status |
|------|---------|--------|
| `living-room.html` | Living Room mockup — full 7-module layout | ✅ Live |
| `.claude/LIVING-ROOM.md` | This document | ✅ Live |
| `.claude/PLATFORM-IA.md` | Navigation + IA spec (updated Sprint 25) | ✅ Updated |

**Serve at:** `localhost:5500/living-room.html`

---

## Final verdict

`Living Room live as curated community layer. No new DBs required for MVP. 3 new fields across existing DBs. Connects to Hall and Residents cleanly. Proceed.`
