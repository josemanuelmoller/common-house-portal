# Client Room — base design & structural rules

The client room is rendered by a **single shared component**,
`src/components/client-room/ClientRoomView.tsx`, for every project via
`/hall/[slug]`. It is fully data-driven (logo, billing, presentations, timeline
all come from the `room` object) so **these rules apply to every room, current
and future** — there is no per-client fork. Change the rules here + in
`ClientRoomView`, never by special-casing one room.

## Layout order (top → bottom)
1. **Header** — Common House wordmark (black) + `ROOM LABEL · Project name` (mono, muted) on the left; `Admin preview` chip (admins only) + `Salir →` on the right. Border-bottom ink-0.
2. **Nav** — anchor tabs to each section. Paper-2 background.
3. **Hero** (`#overview`)
   - Eyebrow (mono, muted): `Organization · stage`.
   - Title: Instrument Serif italic, 38→52px, with a **lime `_`** after the name.
   - Welcome note (muted, max 2xl).
   - **Client logo: co-branded on the RIGHT, ~132px tall, centered vertically & horizontally in its space.** Never small in the top-left corner. Stacks above the text on mobile.
4. **Stat band** — 3 stats only, lime top-border, minimalist icon per stat:
   - `Etapa` (stage icon) · `Próximo hito` (target icon) · `Trabajo dedicado` (meeting icon, **double width**).
   - **Do NOT show "Necesita tu input"** here — open-loops/asks are internal-facing, not for the client stat band.
5. **"Lo que escuchamos"** — **full-width elevated band** directly under the stats (NOT a column card). Dark border + **4px lime top bar**, larger title, `Síntesis del análisis` meta, and 4 quadrants (`El reto / Lo que más importa / Lo que puede estorbar / Cómo se ve el éxito`), each with a **2px lime top rule + lime-ink mono label**. This is the analysis summary and must read with more weight than the regular cards.
6. **Two-column grid** (`1.65fr / 1fr`):
   - Left: `Nuestra propuesta`, `Plan y progreso`.
   - Right: `Nuestro trabajo juntos` (timeline), `Acuerdos`, `Administrativo`.

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
