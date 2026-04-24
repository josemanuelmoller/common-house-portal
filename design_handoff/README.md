# Handoff: The Hall — Redesign (Variant K-v2)

## Overview

The Hall is Common House's daily operations dashboard — an operator's panel that surfaces the single most important decision of the day, upcoming context, and the state of the autonomous agent system. This redesign (Variant K-v2) replaces the previous infinite-scroll, module-grid layout with a **two-column narrative + context layout**, anchored by a prominent "Focus of the Day" section.

## About the Design Files

The files bundled here are **HTML design references** — interactive prototypes that show the intended look, structure, and behavior. They are not production code. **The task is to recreate these designs in the target codebase's existing environment** (React, Next.js, whatever Common House already uses) using its established components, tokens, and patterns. If no environment exists yet, choose the most appropriate framework for the project.

The HTML prototype uses inline React via Babel standalone — this is for preview convenience only and should NOT be copied.

## Fidelity

**High-fidelity.** Colors, typography, spacing, iconography, and interaction states are all final. Recreate pixel-close in the target codebase. The only deliberately placeholder area is copy in the data rows (names, amounts, dates) — those should be wired to real data.

## Design Principles (why this layout)

1. **One decision per day.** The Focus of the Day is the ONLY hero element. Everything else is context for that decision.
2. **Narrative left, context right.** Left column reads like the operator's day, top-to-bottom: focus → time blocks → inbox → commitments. Right column = ambient signals: next meeting, deadlines, time allocation, market signals, agent health.
3. **Lime is reserved.** The brand lime (`#c6f24a` / `#fbfde8` paper) appears ONLY on the focus block and the "now" indicators (live countdowns). It must not leak into regular section accents.
4. **Temporal proximity drives order.** In the right column, things happening sooner live higher. Agents (system-level, least urgent) live at the bottom.
5. **Agent-architecture aesthetic.** Solid-black chips, outline chips, mono typography for data, circular icon containers, thin rules — echoes the "How our OS works" reference diagram.

## Screens / Views

### 1. The Hall (main view)

**Layout:**
- Total width: 1440px design (fluid from 1280+)
- Left sidebar: 240px (existing component — unchanged in this handoff)
- Main area: flex-1
  - Header bar: 48px tall, `border-bottom: 1px solid #0a0a0a`
  - Tabs bar: 38px, `background: #fafaf7`, `border-bottom: 1px solid #e8e8e8`
  - Content grid: `grid-template-columns: 1.55fr 1fr`, vertical divider `1px solid #e8e8e8`
  - Left col padding: `28px 28px 40px 36px`
  - Right col padding: `28px 36px 40px 28px`

**Sections in order:**

#### 1.1 Header (collapsed, single line)
- Left: eyebrow `THE HALL · THU 23 APR` (mono 10px, muted) + greeting `Hi Jose Manuel.` (Inter Tight 16px, weight 500, name bolded 700)
- Right: live time (13px, ink), dot separator, `17 AGENTS ONLINE` (mono 10.5px muted)

#### 1.2 Tabs
- `Today 3` · `Signals 3 new` (count in red `#d93636`) · `Relationships 8` · `Portfolio 15`
- Active tab has `border-bottom: 2px solid #0a0a0a`, inactive muted.
- Counter is mono 10px, subordinate to label.

#### 1.3 Focus of the Day (LEFT col, top)
- Chips row: solid black `FOCUS OF THE DAY` + outline `● LIVE` (green dot pulses)
- Box: `background: #fbfde8`, `border: 1px solid #0a0a0a`, `border-radius: 3px`, padding `26px 28px 24px`
- Top strip inside box: window info (mono, muted) on left, white-pill countdown `Starts in {N} min` on right (updates every 30s)
- Body grid: 72px icon column + flex body
  - Icon: 72×72 circle, `background: #0a0a0a`, lime icon stroke `#c6f24a`, soft drop shadow
  - Title: Inter Tight 26px, weight 700, letter-spacing -0.02em
  - Description: 13.5px, line-height 1.55, max 60ch
  - Meta pills: white with `1px solid #e4e4dd`, 9.5px mono
- Actions: primary black button (`Start 30-min block →`), secondary outline button (`Open evidence · 12`), ghost link right-aligned (`Postpone · Delegate`)

#### 1.4 Suggested Blocks (LEFT col)
- Header: `Suggested blocks` (italic "blocks" in Instrument Serif, same ink color — lime is reserved)
- Rule: `border-bottom: 1px solid #0a0a0a` under h2
- Rows: grid `80px 1fr auto`
  - Time: mono, bold start time, thin end-and-duration below
  - Body: title 13px ink, description 11px muted, tag chip (mono 9px uppercase on `#f2f2ee`)
  - CTA button `Block →`: hidden by default (`opacity: 0`), visible on row hover
- Entire row is clickable with hover background `#fafaf7`

#### 1.5 Inbox (LEFT col)
- 5 items visible, `+ 7 más en inbox →` button below as subtle mono footer
- Each row: 32px circular icon (envelope SVG, muted beige fill) + title/em + mono age (red if >5d)

#### 1.6 Commitments (LEFT col)
- Split 2-column: `I OWE · 5` and `OWED TO ME · 5`
- Column header: muted uppercase tracking label with mono count prefix
- Rows: title + muted subtitle, mono age right-aligned (amber for 3-6d, red for 7+)

#### 1.7 Next Meeting (RIGHT col, top)
- Title with date/time sub-line (mono)
- White-pill countdown `Starts in {N} min` (same component as focus countdown)
- Attendee chips (10.5px on `#f2f2ee` pills)
- Talking points list (arrow bullets in muted gray — NOT lime)

#### 1.8 This Week — Deadline (RIGHT col)
- Amber-bordered card: `border: 1px solid #d98a00`, `background: #fff9ec`
- Clock icon (amber stroke) + title/description + `CLOSES APR 30 · 7 DAYS` meta

#### 1.9 Time Allocation (RIGHT col)
- Grid rows: 80px label, 1fr track, 58px value, 42px status
- Track: 6px tall, `background: #f0f0ea`, fill in `#0a0a0a`, amber target marker line
- Status: mono 9px — `OVER` red, `UNDER` amber, `OK` muted gray

#### 1.10 Market Signals (RIGHT col)
- 3 items, each: category tag (mono 9px on beige) + paragraph + mono age right
- Categories: Policy, Funding, Sector

#### 1.11 Agents (RIGHT col, bottom — system/ambient)
- 3-stat grid: runs, writes, errors (errors in red if >0)
- Agent rows: circular icon + name/status + mono status pill (`OK` green, `WARN` amber, `ERR` red)

## Design Tokens

### Colors
```
/* Ink */
--ink-950: #0a0a0a;   /* primary black, all strong ink */
--ink-800: #2a2a2a;   /* body copy */
--muted-600: #6b6b6b; /* secondary meta */
--muted-500: #9a9a9a; /* tertiary mono/meta */
--line: #e8e8e8;      /* hair-lines between modules */
--line-soft: #f0f0ea; /* hair-lines within a module */
--fill-soft: #f2f2ee; /* chip / pill fills */
--paper: #fafaf7;     /* tabs strip, hover */

/* Brand — RESERVED */
--lime: #c6f24a;      /* icon stroke on focus only */
--lime-paper: #fbfde8;/* focus block background only */
--lime-ink: #4d6b0b;  /* countdown dots only */

/* Semantic */
--danger: #d93636;
--warn: #d98a00;
--warn-paper: #fff9ec;
--ok: #2f9e44;
--info: #2458d6;
```

### Typography
- **Display / UI / Body**: `Inter Tight` (Google Fonts, weights 400/500/600/700)
- **Italic accents in h2**: `Instrument Serif` italic 400 — NOTE: same ink color, NOT lime
- **Data / meta / counters**: `JetBrains Mono` (weights 400/500)

### Spacing
- Section vertical gap: `margin-bottom: 28px` between boxes
- Header padding: `padding-bottom: 8px` with `border-bottom: 1px solid #0a0a0a`, then `margin-bottom: 14px`
- Row padding: 10-14px vertical
- Grid gap: 0 (use internal padding on columns)

### Borders & Radii
- Section rules: `1px solid #0a0a0a` under h2
- Inter-row rules: `1px solid #f0f0ea`
- Chip radius: `100px` (pill)
- Card radius: `3px` (very tight — matches the architecture aesthetic)

### Chips
- **Dark chip**: `background: #0a0a0a; color: #fff; padding: 3px 10px; border-radius: 100px; font: 700 9.5px JBMono; letter-spacing: 0.14em; text-transform: uppercase`
- **Outline chip**: `background: #fff; color: #0a0a0a; padding: 2px 9px; border: 1px solid #0a0a0a; border-radius: 100px; font: same as dark`
- **Live dot inside outline chip**: 6×6 circle `#2f9e44`, `animation: pulse 1.6s ease-in-out infinite` (opacity 1 → 0.4 → 1)

### Icon containers
- Standard: 32×32 circle, `background: #f2f2ee`, `border: 1px solid #e4e4dd`
- Focus: 72×72 circle, `background: #0a0a0a`, icon stroke `#c6f24a`, `box-shadow: 0 6px 20px rgba(10,10,10,0.12)`
- Stroke width: 1.6 on all line icons

## Interactions & Behavior

- **Live clock**: current time ticks in header; `Starts in N min` countdowns on focus block and next meeting update every 30 seconds.
- **Pulse animation**: LIVE dot and countdown dots pulse (1.6s ease-in-out, opacity 0.4 ↔ 1).
- **Row hover**: Suggested Blocks rows show subtle `#fafaf7` background + reveal CTA button (`opacity 0 → 1`, 120ms transition).
- **Button hover**: primary `#0a0a0a → #2a2a2a`, outline `#fff → #f2f2ee`, ghost `#6b6b6b → #0a0a0a`.
- **Tabs**: switching tabs changes the left column's top section (Today → Signals view, etc.) — out of scope for this handoff; implement only the Today tab for now.
- **Tab counters**: `Signals 3 new` count is red when there are new items in the last 24h; otherwise muted.

## State Requirements

| State | Purpose |
|---|---|
| `now: Date` | Ticking clock, countdowns |
| `focus: {title, description, startTime, windowMin, evidenceCount, agents[]}` | Focus of the day |
| `nextMeeting: {title, sub, startTime, durationMin, attendees[], talkingPoints[]}` | Right col meeting card |
| `suggestedBlocks: Block[]` | Left col blocks (time, title, desc, tag) |
| `inbox: {items: InboxItem[], total: number}` | 5 visible + overflow count |
| `commitments: {iOwe: [], owed: []}` | Two-column split |
| `deadline: {title, desc, closesAt}` | Single weekly deadline |
| `allocation: {label, actual, target}[]` | 6 rows |
| `signals: {category, text, ageHours}[]` | 3 latest |
| `agents: {status: {runs, writes, errors}, items: AgentHealth[]}` | Footer |

## Files in this Bundle

- `The Hall Redesign.html` — full prototype with all variants
- `components/VariantK2.jsx` — **the recommended variant (reference this one)**
- `components/VariantK.jsx`, `VariantL.jsx`, `VariantM.jsx` — alternatives explored
- `components/Sidebar.jsx` — existing sidebar component
- `styles/variant-k2.css` — **all tokens and component styles for K-v2**
- `styles/hall-system.css` — shared system tokens

## Open Questions for Product

1. Focus of the day — auto-generated by ops-manager agent, or user-pinned? (Design supports both.)
2. Tab switching — should the right column change too, or stay stable?
3. Mobile: this design is desktop-first (1280+). Mobile rules to be defined.
