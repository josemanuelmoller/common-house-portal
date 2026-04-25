# Portal design system — K-v2

The Common House admin portal uses a dedicated design system called **K-v2**.
It's a sub-system of the Common House brand: the brand itself (logo, typography,
brand-CH cream/lime/dark) stays untouched on artifacts, marketing, and public
documents. K-v2 is the operator surface — denser, faster, ink-only with one
reserved accent.

If you are building a NEW page or component for `/admin/*`, read this doc and
use the patterns below. Do **not** copy styling from older pages — many predate
K-v2 and still have inline brand hexes.

## Hard rules

1. **Use `<PortalShell>` for every new admin page.** It mounts the Sidebar,
   handles mobile-aware margin (`md:ml-60`), renders the K-v2 thin 1-line
   header, and applies `px-4 sm:px-9` body padding. You should NOT scaffold a
   page from `<div className="flex min-h-screen">…</div>` by hand.

2. **Use `<HallSection>` for sub-sections inside the page.** It draws the
   K-v2 h2 (19px Inter Tight 700 + optional Instrument Serif italic flourish
   + 1px ink-0 underline + optional mono meta). Don't roll your own section
   header.

3. **Use the CSS variables (`--hall-*`) and `--font-hall-{sans,display,mono}`
   font variables.** Never hard-code `#131218`, `#c8f55a`, `#EFEFEA`,
   `#E0E0D8`, or `Space Grotesk`. The legacy brand hexes are visually similar
   but they polluted the codebase before; we do not add new instances.

4. **Lime is reserved.** `--hall-lime` (`#c6f24a`) appears ONLY on:
   - The Focus-of-the-day hero card on `/admin`
   - LIVE pulse indicators (countdown dots, "Fresh" market signals)
   - The Common House brand logo (lime variant)
   No other surface uses lime as a background. For action buttons use
   `.hall-btn-primary` (solid ink-0), not lime.

5. **Mobile-first responsive.** Test every page below 640px width.
   - Padding: `px-4 sm:px-9` (the shell does this for you)
   - Stat strips: provide a compact `metaMobile` to PortalShell or
     hide the strip with `hidden sm:flex`
   - Tab bars: wrap them in `overflow-x-auto`
   - Multi-column rows: `flex-col sm:flex-row` so children stack on mobile
     and align horizontally on desktop
   - Wide grids: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-N`

## Tokens

All defined in `src/app/globals.css` under `:root`.

### Ink + paper
| Token | Value | Use |
|---|---|---|
| `--hall-ink-0` | `#0a0a0a` | Headings, primary text, h2 underlines, primary button bg |
| `--hall-ink-3` | `#2a2a2a` | Body copy, secondary emphasis |
| `--hall-muted-2` | `#6b6b6b` | Secondary text, mono meta default |
| `--hall-muted-3` | `#9a9a9a` | Tertiary text, placeholder, divider labels |
| `--hall-paper-0` | `#ffffff` | Page background |
| `--hall-paper-1` | `#fafaf7` | Tabs strip, hover bg, soft accent |
| `--hall-paper-2` | `#f4f4ef` | Subtle warm bg |
| `--hall-line` | `#e8e8e8` | Section dividers |
| `--hall-line-soft` | `#f0f0ea` | Row dividers inside a section |

### Brand (RESERVED — see rule #4)
| Token | Value | Use |
|---|---|---|
| `--hall-lime` | `#c6f24a` | Focus-of-day card stroke, LIVE pulse dots ONLY |
| `--hall-lime-paper` | `#fbfde8` | Focus-of-day card background ONLY |
| `--hall-lime-soft` | `#e7f9a8` | "Fresh" market-signal pill, VIP indicator |
| `--hall-lime-ink` | `#4d6b0b` | Lime-pill text |

### Semantic
| Token | Value | Use |
|---|---|---|
| `--hall-danger` | `#d93636` | P1, blocked, overdue, errors |
| `--hall-danger-soft` | `#ffe8e4` | Soft danger backgrounds |
| `--hall-warn` | `#d98a00` | Update needed, near-deadline, warnings |
| `--hall-warn-paper` | `#fff9ec` | Deadline card background |
| `--hall-warn-soft` | `#fff2d6` | Soft warn backgrounds |
| `--hall-ok` | `#2f9e44` | Healthy, complete, accepted |
| `--hall-ok-soft` | `#e4f6e3` | Soft ok backgrounds |
| `--hall-info` | `#2458d6` | Decisions, neutral signals |
| `--hall-info-soft` | `#e3ecff` | Soft info backgrounds |

## Fonts

Loaded via `next/font/google` in `src/app/layout.tsx` and exposed as CSS vars
on `<html>`. The body's default `font-family` is already Inter Tight, so
inheritance just works inside `<PortalShell>`.

| Variable | Family | Use |
|---|---|---|
| `--font-hall-sans` | Inter Tight 400/500/600/700 | Body, headings, UI |
| `--font-hall-display` | Instrument Serif italic 400 | Section flourish (h2 italic word) |
| `--font-hall-mono` | JetBrains Mono 400/500/700 | Counts, dates, eyebrows, status pills |

For mono metadata in JSX:

```tsx
<span style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)" }}>
  {count} TOTAL
</span>
```

## Atom utility classes (in `globals.css`)

```css
.hall-btn-primary  /* solid ink-0, white text, 3px radius */
.hall-btn-outline  /* ink-0 border, paper-0 bg, 3px radius */
.hall-btn-ghost    /* transparent, muted text */
.hall-chip-dark    /* mono 9.5px 700 uppercase, ink-0 bg, lime-paper text */
.hall-chip-outline /* mono 9.5px 700 uppercase, ink-0 border, supports .hall-live-dot */
.hall-pulse        /* 1.6s pulse animation for LIVE dots */
.hall-flourish     /* shorthand for inline italic Instrument Serif */
```

Buttons accept inline style overrides for size:

```tsx
<button className="hall-btn-primary" style={{ padding: "5px 12px", fontSize: 11 }}>
  Block →
</button>
```

## `<PortalShell>` API

```tsx
<PortalShell
  eyebrow={{ label: "KNOWLEDGE", accent: `${total} NODES` }}
  title="Knowledge"
  flourish="tree"
  meta={<HallLiveClock initialIso={now} />}
  metaMobile={<span style={{ fontFamily: "var(--font-hall-mono)" }}><b>{total}</b></span>}
  subtitle="Synthesis from validated evidence across all projects."
  tabs={<HallTabs badges={…}>…</HallTabs>}
  narrow={false}
  bodySpacing={7}
  bodyBleed={false}
>
  <HallSection title="Overview">…</HallSection>
  <HallSection title="Recent" flourish="activity">…</HallSection>
</PortalShell>
```

| Prop | Type | Default | Notes |
|---|---|---|---|
| `eyebrow` | `{ label, accent? }` | — | Mono uppercase. Hidden below `sm` to save horizontal space. |
| `title` | `ReactNode` | required | 16px Inter Tight medium. |
| `flourish` | `string` | — | Italic Instrument Serif appended to title. |
| `period` | `boolean` | `true` | Adds "." after title. |
| `meta` | `ReactNode` | — | Right-side header content (desktop). |
| `metaMobile` | `ReactNode` | — | Optional compact mobile-only override. If omitted, `meta` shows on both. |
| `subtitle` | `ReactNode` | — | One-paragraph context line below the header. |
| `tabs` | `ReactNode` | — | Tab nav rendered between header and body. |
| `narrow` | `boolean` | `false` | Caps body to `max-w-5xl`. |
| `bodySpacing` | `5\|6\|7\|8` | `7` | Vertical gap between top-level body children (Tailwind `space-y-N`). |
| `bodyBleed` | `boolean` | `false` | When `true`, body has no horizontal padding. Useful for full-bleed grids. |
| `bodyClassName` | `string` | — | Extra className for the body container. |

## `<HallSection>` API

```tsx
<HallSection title="Suggested" flourish="blocks" meta="3 PROPOSED · TODAY & TOMORROW">
  <SuggestedTimeBlocks />
</HallSection>
```

| Prop | Type | Notes |
|---|---|---|
| `title` | `string` | h2 text. |
| `flourish` | `string` | Italic Instrument Serif word (e.g. "blocks"). |
| `meta` | `string` | Right-side mono uppercase meta. |
| `tab` | `string` | Pass through `data-hall-tab` for tab-scoped visibility. |
| `children` | `ReactNode` | Section body. |

## Mobile cookbook

### Stat strip in header
```tsx
meta={
  <div className="flex items-center gap-4 text-[10px]" style={{ fontFamily: "var(--font-hall-mono)" }}>
    <Stat label="OBSERVED" value={total} />
    <span>·</span>
    <Stat label="UNTAGGED" value={untagged} color="var(--hall-warn)" />
  </div>
}
metaMobile={
  <span className="text-[10px]" style={{ fontFamily: "var(--font-hall-mono)" }}>
    <b>{total}</b>
    {untagged > 0 && <> · <b style={{ color: "var(--hall-warn)" }}>{untagged}</b></>}
  </span>
}
```

### Tab bar that may overflow
```tsx
<div className="flex items-center gap-1 overflow-x-auto" style={{ borderBottom: "1px solid var(--hall-line)" }}>
  {tabs.map(t => <Link key={t.key} href={t.href}>{t.label}</Link>)}
</div>
```

### Two-column row that should stack on mobile
```tsx
<div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
  <div className="flex-1 min-w-0">…name + stats…</div>
  <div className="shrink-0">…actions…</div>
</div>
```

### Wide multi-column grid
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">…</div>
```

### Long table → list rows on mobile
Use `flex flex-col sm:grid sm:grid-cols-[…]` on the row, hide column-only
cells with `hidden sm:block`, and emit a mobile-only meta strip with
`flex sm:hidden`.

## When NOT to use `<PortalShell>`

- `/sign-in` — Clerk full-page modal.
- `/vitrina`, `/garage`, `/hall`, `/dashboard`, `/library`, `/residents`,
  `/workroom`, `/living-room` — public surfaces with their own chrome
  (no Sidebar, custom hero). They still use `--hall-*` tokens but not
  the shell layout.
- Embedded iframes / modal overlays.

## Updating the design system

The design system source-of-truth lives in:
- `src/app/globals.css` — tokens + atoms
- `src/app/layout.tsx` — fonts
- `src/components/PortalShell.tsx` — page layout
- `src/components/HallSection.tsx` — sub-section header
- `design_handoff/` — original handoff (reference, do not edit)

If you change a token, update both `globals.css` and this doc in the same
commit. Don't fork the design — there is one K-v2.
