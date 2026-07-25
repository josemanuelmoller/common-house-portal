# Rooms overview curation — 2026-07-25

## Purpose

This note records the production change made after comparing the Claude artifact
`8841f312-4639-4dab-9d38-7576f567f270` with the actual work-room surface, not the
older client/pre-sale room.

The canonical comparison route was:

`/rooms/7408f148-de21-4333-b90f-f5c0f050aa12?v=am2`

Do not use `/hall/...` or `/admin/projects/.../client-room` when evaluating this
work-room experience. Those are different products/surfaces.

## Problem observed in production

The work-room implementation was already functionally very close to the
prototype. Auto Mercado had real phases, deliverables, tasks, decisions,
meetings, role previews, languages and AI-generated state proposals.

The main UX problem was curation:

- all 20 pending AI suggestions rendered at once in the overview;
- semantically overlapping suggestions appeared more than once;
- the next milestone title was truncated manually to 15 characters;
- the milestone date used a partial numeric format such as `07-31`.

The issue was therefore density and editorial hierarchy, not missing room
functionality.

## Implementation

Changed file:

`src/app/rooms/[projectId]/RoomClient.tsx`

Implemented:

1. Suggestions are sorted newest-first.
2. Suggestions are tokenized and compared for semantic overlap.
3. Common English/Spanish stop words and generic proposal labels are ignored.
4. A small alias map normalizes terms such as `delivery`/`arrival`,
   `delayed`/`delay` and `regulatory`/`regulation`.
5. Deduplication only occurs inside the same action class:
   `decision`, `state`, `task` or generic `suggestion`.
   A state change must never hide a distinct decision merely because both refer
   to the same project event.
6. The overview renders the five newest non-duplicate suggestions initially.
7. Remaining curated suggestions are available through `Ver todas`; the control
   changes to `Ver menos` when expanded.
8. The header continues to show the total pending database count. This preserves
   operational visibility even when the presentation is curated.
9. The next milestone uses `fmtDay(...)`, displays a localized date and renders
   the complete title without the old 15-character substring.
10. Compact statistic cards allow wrapped milestone text instead of forcing an
    ellipsis.

## Production result

For Auto Mercado at verification time:

- total pending suggestions: 20;
- curated distinct suggestions: 19;
- suggestions initially visible: 5;
- `Ver todas (19)` expanded successfully;
- `Ver menos` appeared after expansion;
- next milestone rendered as:
  `31 jul · Aprobación de inocuidad (Ministerio de Salud)`.

## Delivery record

- Feature commit: `5505062` — `fix(rooms): curate AI suggestions in overview`
- Pull request: https://github.com/josemanuelmoller/common-house-portal/pull/107
- Merge commit on `main`: `79a665d410d5c50027a80313f85a46b4b4c8536c`
- Vercel project: `common-house-portal`
- Vercel project ID: `prj_itWMsxreLyWwhUO7Jd9ICOe1z2GL`
- Production domain: https://portal.wearecommonhouse.com
- Production deployment verified: `dpl_HHsQ9g2ieu7ZYg7jia9QYypUK7jp`

## Validation performed

- `npm run build` passed.
- Next.js production compilation passed.
- TypeScript passed during the build and in GitHub Actions.
- Targeted ESLint for `RoomClient.tsx` passed.
- API-auth, secret-scan and error-leak CI checks passed.
- Vercel production deployment reached `Ready`.
- The exact Auto Mercado room was opened through the authenticated production
  Chrome session and the rendered milestone, five-item limit and show-all/show-
  less interaction were verified.

## CI audit exception

The PR's `npm audit (high+)` job reported 10 high findings against a baseline of
7. The PR did not modify `package.json` or `package-lock.json`; the failure was
advisory drift on the dependency graph already present in `main`. The merge was
performed with an admin override after confirming that the room change introduced
no dependency changes. Do not interpret that override as an audit fix.

## Future guidance

- Keep the overview curated. Detailed queues belong behind progressive
  disclosure.
- Prefer fixing proposal generation/deduplication upstream if duplicate volume
  grows; the client-side layer is a presentation safeguard, not a replacement
  for clean proposal data.
- Test deduplication against real rooms before changing similarity thresholds.
- Preserve action-type boundaries when grouping suggestions.
- Verify every user-visible room change on the production `/rooms/[projectId]`
  route because localhost cannot reuse the production Clerk session.
