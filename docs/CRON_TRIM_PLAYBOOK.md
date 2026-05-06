# Cron Trim Playbook

How to identify and remove dead cron entries from `vercel.json` based on
runtime telemetry, not assumptions.

## Why this exists

After 2026-05-06, every active cron route in the portal writes to
`routine_runs` via `withRoutineLog`. Before that date, ~17 cron paths
fired silently with no record. Now that all 44 paths have telemetry,
we can use ground truth (did this route actually run last week?) to
decide what to keep, fix, or remove — instead of guessing.

## When to run

- **Weekly** — quick scan for newly broken crons (any routine with
  `error_rate > 50%` over 7d).
- **Monthly** — full trim pass: identify any cron path that has not
  produced a single row in `routine_runs` in the last 30 days, despite
  having a schedule that should have fired.

## The query

Run this on Supabase production:

```sql
-- Routines configured but with zero runs in last 30 days
WITH expected AS (
  SELECT unnest(ARRAY[
    'agent-scorecard', 'classify-workstreams', 'competitive-monitor',
    'contact-news-scan', 'contact-photos-sync',
    'cron-auto-merge-orphan-people', 'cron-observe-calendar',
    'cron-push-pending-to-notion', 'cron-reconcile-classified-domains',
    'cron-run-relationship-promotion-scan', 'cron-sync-notion-mirror',
    'diagnose-agent-errors', 'evidence-to-knowledge',
    'extract-conversation-evidence', 'extract-meeting-evidence',
    'fireflies-sync', 'generate-daily-briefing', 'grant-monitor',
    'grant-radar', 'ingest-calendar', 'ingest-drive', 'ingest-fireflies',
    'ingest-gmail', 'ingest-loops', 'ingest-meetings', 'ingest-whatsapp',
    'knowledge-curator', 'linkedin-enrichment-run',
    'maintenance-stale-decay', 'plan-compute-kpi', 'portfolio-health',
    'project-operator', 'propose-content-pitches', 'reap-stale-drafts',
    'relationship-warmth', 'sweep-replied-threads', 'sync-evidence',
    'sync-loops', 'sync-opportunities', 'sync-organizations',
    'sync-people', 'sync-projects', 'sync-sources', 'validation-operator'
  ]) AS routine_name
),
recent AS (
  SELECT routine_name,
         COUNT(*)                                        AS runs_30d,
         SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors_30d
  FROM routine_runs
  WHERE started_at >= NOW() - INTERVAL '30 days'
  GROUP BY routine_name
)
SELECT e.routine_name,
       COALESCE(r.runs_30d, 0)   AS runs_30d,
       COALESCE(r.errors_30d, 0) AS errors_30d,
       CASE
         WHEN r.runs_30d IS NULL OR r.runs_30d = 0 THEN 'NEVER_FIRED'
         WHEN r.errors_30d * 2 > r.runs_30d         THEN 'MOSTLY_ERRORS'
         WHEN r.errors_30d > 0                      THEN 'SOMETIMES_ERRORS'
         ELSE                                            'HEALTHY'
       END AS state
FROM expected e
LEFT JOIN recent r USING (routine_name)
ORDER BY state DESC, runs_30d ASC;
```

## How to act on the output

| State | Meaning | Action |
|---|---|---|
| `NEVER_FIRED` | Configured cron, but no telemetry in 30d | (1) Confirm the path is in `vercel.json`. (2) Hit the endpoint manually with `CRON_SECRET` to verify it works. (3) If broken, fix or remove from `vercel.json`. |
| `MOSTLY_ERRORS` | Cron is firing but >50% of runs error | Check `routine_runs.error_message` recent rows. Likely an integration regression (env var, schema, third-party) — fix the cause, don't disable. |
| `SOMETIMES_ERRORS` | Occasional errors | Investigate top failure reason; usually transient (network, rate limits). No structural action unless pattern emerges. |
| `HEALTHY` | Routine is firing without errors | No action. |

## What NOT to do

- **Don't delete a `NEVER_FIRED` route just because telemetry is empty.**
  First check whether the route file itself errors at boot or on request
  (an unauthorised early return is success-fast and won't show as error).
- **Don't trim a cron path that has a paired sibling under the dual-ingest
  pattern** (`/api/ingest-X` Notion vs `/api/ingest/X` Supabase). Both are
  load-bearing until the 2026-06-02 freeze cutoff.
- **Don't change schedules in bulk.** Vercel Hobby has cron-frequency
  limits; spreading invocations is fine but compressing them risks
  silent drops.

## Companion dashboard

`/admin/control-plane` already renders the live state of every routine
in `ROUTINE_CATALOG`. Update that catalog when you add a new cron so
the control-plane page reflects it immediately.
