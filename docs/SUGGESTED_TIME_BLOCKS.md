# Suggested Time Blocks — design + verification runbook

Feature that proposes **when** to execute the top priorities surfaced in
the Hall. Reads Google Calendar availability + Supabase loops/opportunities
+ upcoming meetings → returns 3–5 specific time blocks with clear outcomes.

## Status

- **Implemented, deployed, type-clean, observability in place.**
- **Blocked on Google OAuth scope** (see below).
- Do not call this feature "done" until the end-to-end checklist below
  passes in production with real calendar data and a real event write.

## Architecture in one picture

```
Hall (/admin)
 └─ <SuggestedTimeBlocks /> (client)                   src/components/SuggestedTimeBlocks.tsx
      ↓ fetch
      GET /api/suggested-time-blocks                   src/app/api/suggested-time-blocks/route.ts
        ├─ hall_preferences       (per-user config)    src/lib/hall-preferences.ts
        ├─ Layer A calendar-slots  (slots)             src/lib/calendar-slots.ts
        │     └─ google-calendar ← google-auth (shared)
        ├─ Layer B time-block-candidates (loops/opps/
        │          meetings → Candidate[])              src/lib/time-block-candidates.ts
        └─ Layer C time-block-matcher (greedy score)    src/lib/time-block-matcher.ts
      ↓ persist
      Supabase: suggested_time_blocks
      ↓ actions
      POST /accept   → Google Calendar events.insert → gcal_event_link
      POST /dismiss  → 24h fingerprint suppression
      POST /snooze   → snoozed_until timestamp
      │
      └─ every step emits hall_events rows + stderr JSON lines
```

## Google integration (shared auth)

| File | Responsibility |
|---|---|
| `src/lib/google-auth.ts`      | Single `getGoogleAuthClient()`; also `classifyGoogleError()` for stable error codes. |
| `src/lib/google-calendar.ts`  | `getGoogleCalendarClient()` (new name) + `getCalendarClient` alias. |
| `src/lib/google-gmail.ts`     | `getGoogleGmailClient()` for future callers. |
| `src/app/api/ingest-gmail/route.ts` | Existing Gmail ingestion — unchanged to avoid breakage. Migrate to the factory when next touched. |

**Required scopes on the Google refresh token**:
- `https://www.googleapis.com/auth/gmail.modify` — existing
- `https://www.googleapis.com/auth/calendar.events` — **new, required for this feature**

If the calendar scope is missing, the GET route returns
`calendar_scope_missing` and the Hall renders:

> Deployed — waiting on Google Calendar consent. Re-authorise with
> calendar.events scope and suggestions will activate automatically.

## User preferences (`hall_preferences`)

Per-user row keyed by email, with safe defaults if the row is missing. Read
via `getHallPreferences(email)`; no UI to edit yet — set directly in Supabase
to override for a user.

Fields:

| Column | Default | Meaning |
|---|---|---|
| `working_day_start`            | 9     | Hour 0–23. |
| `working_day_end`              | 18    | Hour 1–24, must be > start. |
| `working_days`                 | `{1,2,3,4,5}` | ISO day-of-week (1=Mon). |
| `min_slot_minutes`             | 20    | Floor for a usable slot. |
| `prefer_morning_for_deep_work` | true  | +6 score to deep-work slots before 12:00 local. |
| `timezone`                     | `America/Costa_Rica` | IANA tz for all slot math + labels. |
| `lunch_start_hour / _min`      | 12:30 | Lunch block start (set start == end to disable). |
| `lunch_end_hour / _min`        | 13:30 | Lunch block end. |
| `meeting_buffer_minutes`       | 10    | Expand every busy block by this many minutes before carving slots. |

## Observability (`hall_events`)

Every interesting step emits a structured event: one stderr JSON line
(Vercel logs) + one `hall_events` row (Supabase).

Event types:

| Type | Emitted by | Metadata keys |
|---|---|---|
| `stb_requested`              | GET start | — |
| `stb_returned_cached`        | GET (fresh hit) | `count` |
| `stb_returned_fresh`         | GET (new generation) | `count` |
| `stb_calendar_auth_error`    | GET/accept on Google error | `error_code`, `message` |
| `stb_no_valid_slots`         | GET (slot engine returned 0) | `busy_blocks`, `upcoming_meetings` |
| `stb_no_strong_candidates`   | GET (matcher returned 0) | `slots_found`, `candidates_considered` |
| `stb_suggestions_generated`  | GET (pipeline succeeded) | `slots_found`, `candidates_considered`, `loop_candidates`, `opportunity_candidates`, `prep_candidates`, `followup_candidates`, `suppressed_count` |
| `stb_suggestions_matched`    | GET (fresh generation) | `matched`, `mode` |
| `stb_accept`                 | POST accept success | `id`, `task_type`, `duration_min` |
| `stb_accept_error`           | POST accept Google error | `id`, `error_code`, `message` |
| `stb_dismiss`                | POST dismiss | `id` |
| `stb_snooze`                 | POST snooze | `id`, `hours` |

Quick usefulness query (run in Supabase SQL editor):

```sql
-- Acceptance rate over the last 30 days
SELECT
  COUNT(*) FILTER (WHERE event_type = 'stb_returned_fresh')        AS generated_sets,
  COUNT(*) FILTER (WHERE event_type = 'stb_accept')                AS accepted,
  COUNT(*) FILTER (WHERE event_type = 'stb_dismiss')               AS dismissed,
  COUNT(*) FILTER (WHERE event_type = 'stb_snooze')                AS snoozed,
  COUNT(*) FILTER (WHERE event_type = 'stb_calendar_auth_error')   AS auth_errors,
  COUNT(*) FILTER (WHERE event_type = 'stb_no_strong_candidates')  AS no_candidates,
  COUNT(*) FILTER (WHERE event_type = 'stb_no_valid_slots')        AS no_slots
FROM hall_events
WHERE source = 'suggested-time-blocks'
  AND created_at > NOW() - INTERVAL '30 days';
```

## End-to-end verification checklist

Run after granting `calendar.events` scope on the refresh token.

1. **Fetch real suggestions**
   - Load `https://portal.wearecommonhouse.com/admin` while signed in.
   - Confirm the *Suggested time blocks* section shows 1–5 cards (not the red scope banner, not the dashed "no suggestions" row).

2. **Confirm slots are valid**
   - Each card's time window is in the future.
   - No time window overlaps an existing meeting on Google Calendar.
   - No time window is inside 12:30–13:30 local or outside 09:00–18:00 local (unless `hall_preferences` overrides defaults).
   - Durations match the task type (`deep_work` ≥ 90 min; `follow_up` 20–45 min; etc.).

3. **Confirm titles are specific**
   - No title is "Work on X" or "Review project Y".
   - Loop-derived titles carry a verb prefix (Unblock / Decide / Review / Prep / Deliver / Follow up).
   - Opportunity titles contain the `suggested_next_step`.
   - Prep titles: `Prep for "<meeting name>"`.
   - Follow-up titles: `Follow up on "<meeting name>"`.

4. **Click Block time on one suggestion**
   - UI shows a brief "Blocked on calendar" toast.
   - The card disappears from the list.
   - Hit response is 200 with an `event_link`.

5. **Confirm event appears in Google Calendar**
   - Open the `event_link` from the response (or the calendar at the suggested time).
   - Event title = suggestion title.
   - Event description includes `Why now:` and `Expected outcome:` blocks.
   - Event color = sage (colorId 2), distinct from regular meetings.

6. **Refresh Hall and confirm accepted state**
   - Reload `/admin`.
   - The accepted suggestion does not reappear in the list.
   - In Supabase, `suggested_time_blocks.status = 'accepted'` with non-null `gcal_event_id` + `gcal_event_link`.

7. **Test dismiss**
   - Click `Dismiss` on another suggestion.
   - It disappears optimistically.
   - Reload Hall: does not reappear.
   - Supabase: `status = 'dismissed'`, `dismissed_at` set.
   - Within 24h, regenerations should NOT re-propose the same `fingerprint`.

8. **Test snooze**
   - Click `Not now` on another suggestion.
   - It disappears.
   - Supabase: `status = 'snoozed'`, `snoozed_until ≈ now + 24h`.
   - Force-regenerate (delete the remaining `suggested` rows, refresh): the snoozed suggestion should still be suppressed.

9. **Confirm suppressed suggestions do not immediately reappear**
   - After 7–8, regenerate the set (add `?force=1` — currently regenerates on stale cache automatically; can force by expiring existing suggestions in SQL).
   - Verify no card has the `fingerprint` of a dismissed or snoozed suggestion.

10. **Observability sanity**
    - Query `hall_events` for the last 10 minutes:
      `SELECT event_type, metadata, created_at FROM hall_events WHERE source = 'suggested-time-blocks' ORDER BY created_at DESC LIMIT 20;`
    - Expect: `stb_requested` → `stb_suggestions_generated` → `stb_suggestions_matched` → `stb_returned_fresh`, then one of `stb_accept` / `stb_dismiss` / `stb_snooze` per action.

## Remaining blocker

`GMAIL_REFRESH_TOKEN` in Vercel production env currently only has Gmail
scope. Re-authorise the Common House Google account with the added
`https://www.googleapis.com/auth/calendar.events` scope, replace the
env var value (using `printf "%s"` not `echo`, per project rule), then
run steps 1–10.
