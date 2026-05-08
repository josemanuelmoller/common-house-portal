# OS v2 cadence — Vercel cron schedule

The OS v2 maintenance cadence is wired through `/api/cron/run-os-cycle`,
which orchestrates the operator chain in a single weekday-morning pass.
Legacy per-operator crons remain scheduled and are intentionally redundant
during the transition window.

## Unified cadence (canonical)

| Cron path                  | Schedule          | Steps invoked |
|----------------------------|-------------------|---------------|
| `/api/cron/run-os-cycle`   | `0 3 * * 1-5` UTC | 1. ingest-gmail<br>2. extract-meeting-evidence<br>3. extract-conversation-evidence<br>4. validation-operator<br>5. project-operator<br>6. evidence-to-knowledge<br>7. knowledge-curator |

Each step calls the operator's HTTP route in sequence, with `CRON_SECRET`
authentication and a 600s function timeout. Operators are idempotent and
gate on `validation_status` / `processing_status` deltas, so re-running the
chain is safe.

## Legacy fragmented crons (deprecated, scheduled for removal)

These run alongside `/api/cron/run-os-cycle` during the transition window.
After one stable week of the unified cadence (target: 2026-05-15) they can
be removed in a follow-up commit. Until then, redundancy is acceptable
because operators are no-op on already-processed rows.

| Cron path                          | Schedule          | Replaced by step |
|------------------------------------|-------------------|------------------|
| `/api/ingest-gmail`                | `0 7 * * 1-5`     | run-os-cycle.1   |
| `/api/extract-meeting-evidence`    | `0 2 * * 2-6`     | run-os-cycle.2   |
| `/api/extract-conversation-evidence` | `0 4 * * 1-5`   | run-os-cycle.3   |
| `/api/validation-operator`         | `0 3 * * 1-5`     | run-os-cycle.4   |
| `/api/project-operator`            | `0 5 * * 1-5`     | run-os-cycle.5   |
| `/api/evidence-to-knowledge`       | `0 4 * * 1-5`     | run-os-cycle.6   |
| `/api/knowledge-curator`           | `30 3 * * 1-5`    | run-os-cycle.7   |

## Independent (kept indefinitely)

These do NOT belong in the OS cycle — they have their own cadence rules.

| Cron path                          | Schedule          | Why |
|------------------------------------|-------------------|-----|
| `/api/ingest/gmail`                | `0 8,12,16,20 * * *` | Frequent intake throughout the day |
| `/api/ingest/fireflies`            | `30 9,18 * * *`   | Twice-daily Fireflies pull |
| `/api/ingest/loops`                | `45 9,18 * * *`   | Twice-daily Loops pull |
| `/api/ingest/calendar`             | `0 7,19 * * *`    | Twice-daily Calendar pull |
| `/api/ingest/whatsapp`             | `15 8,17 * * *`   | Twice-daily WhatsApp pull |
| `/api/ingest/drive`                | `0 6 * * *`       | Daily Drive pull |
| `/api/diagnose-agent-errors`       | `30 8,17 * * *`   | Error log scrubber, independent of cycle |
| `/api/maintenance/stale-decay`     | `0 4 * * *`       | Stale-record decay |
| `/api/cron/run-relationship-promotion-scan` | `0 7 * * *` | Daily relationship classifier |
| `/api/cron/auto-merge-orphan-people` | `0 8 * * *`     | Daily de-dup pass |
| `/api/cron/reconcile-classified-domains` | `30 7 * * *` | Daily domain reconciliation |
| `/api/cron/observe-calendar`       | `0 6 * * *`       | Calendar observer |
| `/api/portfolio-health`            | `30 6 * * 1`      | Weekly portfolio scan |
| `/api/grant-monitor`               | `0 7 1 * *`       | Monthly grant scan |
| `/api/agent-scorecard`             | `45 7 1 * *`      | Monthly agent health report |
| `/api/competitive-monitor`         | `0 7 * * 1`       | Weekly competitive scan |
| `/api/relationship-warmth`         | `0 6 * * 1,4`     | Twice-weekly warmth scan |
| `/api/generate-daily-briefing`     | `30 7 * * 1-5`    | Daily briefing assembly |
| `/api/sync-loops` etc.             | various weekday   | Notion → Supabase sync (transitional, removed at 2026-06-02 cutoff) |
| `/api/sweep-replied-threads`       | `15 9,13,17 * * 1-5` | Inbox triage |
| `/api/reap-stale-drafts`           | `30 3 * * *`      | Draft cleanup |
| `/api/plan/compute-kpi`            | `15 3 * * *`      | KPI compute |
| `/api/propose-content-pitches`     | `0 9 * * 5`       | Weekly content seeds |
| `/api/contact-news/scan`           | `0 8 * * 1`       | Weekly contact news |
| `/api/contact-photos/sync`         | `0 7 * * 2`       | Weekly photo sync |
| `/api/linkedin-enrichment/run`     | `15 7 * * 1`      | Weekly LinkedIn enrichment |
| `/api/classify-workstreams`        | `0 3 * * 1-5`     | Daily workstream tagger |
| `/api/fireflies-sync`              | `30 6 * * 1-5`    | Daily Fireflies sync |
