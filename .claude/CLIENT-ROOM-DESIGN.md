# Lobby (pre-sale) — base design & structural rules

The lobby is rendered by a **single shared component**,
`src/components/client-room/ClientRoomView.tsx`, for every project via
`/lobby/[slug]`. It is fully data-driven (logo, billing, presentations, timeline
all come from the `room` object) so **these rules apply to every lobby, current
and future** — there is no per-client fork. Change the rules here + in
`ClientRoomView`, never by special-casing one lobby.

> **Naming.** Lobby = pre-sale (`/lobby/[slug]`). Sala/Room = execution
> (`/rooms/[projectId]`). "Hall" is internal-only and no longer names this
> surface — the route moved in PR #116.

## Lobby ↔ Sala convergence (2026-07-27)

The lobby wears **the sala's chrome**: same frame, same rail, same signals.
Decided deliberately — closing a deal shouldn't hand the client a different
tool. Any improvement proved here **must be migrated back to `RoomClient`**;
the two surfaces are not allowed to diverge again.

Shared tokens live in `globals.css` as `--lobby-*`. `RoomClient.tsx` still
hardcodes the same values in its local `C` object: when migrating the sala,
delete `C` and point it here — do not duplicate.

## Layout order (top → bottom)
1. **Frame** — the whole surface is an app in a frame: `--lobby-outer` page
   background, max-width 1160, radius 16, 1.5px border. Not a full-bleed page.
2. **Rail** (`LobbyShell`) — 248px sidebar, collapsible to a 66px icon-only rail
   (persisted in `lobby.sidebar.mini`, same behaviour as the sala). Below the
   sections, a greyed **"Sala de trabajo"** group previews what exists once the
   deal closes — no padlocks, no explanatory paragraph: the contrast and the
   label carry it.
   - **The rail only names sections that have content.** An empty entry promises
     a place and delivers a grey sentence; inside the frame that reads as a
     half-built product.
3. **Sticky header** — `COMMON HOUSE × ORG` eyebrow + the active section title
   (scroll-spy) + stage pill + attendee initials.
4. **"Te toca" bar** — the single pending client action, in the chrome, only
   when the viewer can actually act on it. The lobby's equivalent of the sala's
   "Lo mío".
5. **Hero** (`#overview`)
   - Eyebrow: `Organization · stage`.
   - Title: **Instrument Serif italic, 42px, with a lime `_`** — kept on purpose
     when the rest of the chrome moved to the sala's language. The sala titles
     the week's focus (it changes); the lobby titles the relationship (it
     doesn't). Different job, different treatment.
   - **Client logo: co-branded on the RIGHT, 132px tall, centered in its space.**
     Never small in the top-left corner. Stacks above the text on mobile.
6. **Stats** — 3 only, as sala-style cards (white, 1.5px border, radius 12):
   `Etapa` · `Próximo hito` · `Trabajo dedicado` (double width, lime value).
   **Do NOT show "Necesita tu input"** — open-loops/asks are internal-facing.
7. **"Lo que escuchamos"** — full-width card with a **lime-wash header** and the
   4 quadrants (`El reto / Lo que más importa / Lo que puede estorbar / Cómo se
   ve el éxito`), each with a 2px lime top rule + lime-ink label.
8. **Two-column grid** (`1.6fr / 1fr`):
   - Left: `Nuestra propuesta`, `Plan y progreso`.
   - Right: `Nuestro trabajo juntos` (timeline), `Acuerdos`, `Documentos`, `Administrativo`.

## Signals — two, and neither is a count
- **Lime dot** → changed since your last visit. *Not wired yet*: needs the
  viewer's previous visit from `portal_analytics_events`. `LobbyNavItem.isNew`
  exists but nothing sets it — do not fake it.
- **Solid amber badge** → you have to act (open agreements). Filled, not a soft
  pill: a soft pill reads as a tally, and tallies don't ask for anything.

**No inventory counts in the rail.** "Documentos 2" tells nobody anything — if
you open the section you'll count them anyway. Counts inside a card header are
fine: there they're a caption for the list right below.

## Provenance & freshness
Every shared thing says who shared it and how long ago: `Compartido por X · hace
N días`, from `added_by` + `client_visible_at`.

⚠️ `project_materials.added_by` stores **raw handles**, not people —
`josemanuelmoller`, but also `admin` and `claude-code (draft)`. `resolveSharers()`
in `client-room.ts` maps what it can against `people` and collapses everything
else to **"Common House"**. A system handle must never reach a client.

## Agreements — approving is free, rejecting is not
`AgreementResponseActions`: **Aprobar** acts immediately with no friction.
**Pedir cambios** reveals a *required* field asking `¿Qué habría que ajustar?`.
The API rejects `request_changes`/`reject` without a comment.

Every response also writes to `proposal_outcomes` (`proposal_type:
'client_agreement'`) so the feedback loop sees it. Before this, the reason died
in `project_agreements.response_comment` and the platform learned nothing from
lost deals.

## Presentations
- The featured preview is the presentation whose `document_status = 'current'`; render the **PDF** (previews inline + page-turn + download). One deck featured at a time; superseded ones list under "Versiones anteriores".
- **Never expose an editable `.pptx` to the client.** Keep source/editable files `visibility = 'internal'`. Clients get the PDF only.
- No prices in version labels/summaries — version + date only.

## Administrative section
- Common House pay data (legal name, company number, address, billing email) + `Copiar todo`.
- **Bank details are approver-gated and collapsed** behind "Ver detalles bancarios" (`BankReveal`).
- **Client billing form is collapsible** (`ClientBillingForm`) — collapsed to a button by default so the page never runs long. Editable for collaborator/approver, read-only for viewer. Client-submitted data surfaces read-only in admin (`ClientSubmittedBilling`).

## Footer
- Minimal: `Preparado por Common House` · `Confidencial · {org}` + lime isotipo.
- **No SLAs, response-time promises, or security-architecture claims** — the room is near-internal; keep chrome minimal and honest.

## Roles & visibility
- Roles: `viewer` (read) · `collaborator` (respond to operational items) · `approver` (approve commercial/PO items **and** see bank details).
- **Draft-first**: materials, timeline events, and agreements default to `internal` and only show to the client when `visibility = 'client'`. José edits/approves before anything is client-visible.

## Admin console (`/admin/projects/[id]/client-room`)
- Sections use `CollapsibleHallSection` (native `<details>`) to keep the page short. `Onboarding` (readiness) stays open; `Client access` is open by default; the rest start collapsed.
- The onboarding readiness checklist is advisory, not a hard gate — a room can be invited without every check green.

## Analytics (identified)
- The room is authenticated, so analytics are **identified** (every visit → email + role), not anonymous. Tracker: `RoomAnalytics.tsx` (mounted once in `ClientRoomView`) captures `visit`, `section_view` (+ dwell), `material_open` (any `[data-track]` element), and `session_end` (active time), flushing via `sendBeacon`. Ingested at `POST /api/projects/[id]/analytics` (access-gated) into `portal_analytics_events` (generic `area` + nullable `project_id` so it extends portal-wide later).
- Admin previews are flagged `is_admin` and **excluded** from client stats. Dashboard: `RoomAnalyticsPanel` in the room admin ("Analytics" section) — visits, unique visitors, total time, per-visitor, top sections, top docs, recent sessions. Read via `getRoomAnalytics(projectId)`.

## Visual language
- Hall design tokens (`--hall-*`), Inter/Instrument Serif/JetBrains Mono. White & clean — **no dark/space backgrounds**. Lime is the single accent, used sparingly for the one thing that matters. Information-dense, answers a specific question.
