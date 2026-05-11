# A1 — Availability

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

## Scope

How CH keeps the portal accessible and recoverable from outages.

## Control statement

`portal.wearecommonhouse.com` is hosted on Vercel with regional
redundancy, monitored every 10 minutes, and recoverable from the last
seven days of Supabase point-in-time backups.

## Hosting

- **Frontend:** Vercel (Hobby tier today). Regional edge serving.
- **Database:** Supabase (Free tier, `commonhouse` project,
  `rjcsasbaxihaubkkkxrt`). 7-day point-in-time recovery included.
- **DNS:** Cloudflare (Free tier). DNSSEC enabled.
- **CDN/WAF:** Cloudflare Free tier delivers managed WAF + DDoS at L3/L4
  and basic L7 (full L7 rules require Pro). Acceptable for stage.

## Target SLOs (informational, no customer contract today)

| Metric | Target | Source |
|---|---|---|
| Monthly availability | 99.5% (≈ 3.6h downtime/mo) | uptime-check workflow |
| API p95 latency | < 800ms | Vercel analytics (free tier) |
| RPO (Recovery Point Objective) | ≤ 24h | Supabase 7-day PITR |
| RTO (Recovery Time Objective) | ≤ 4h | Vercel rollback + Supabase restore |

## Backups

| Asset | Primary | Secondary | Cadence | Retention |
|---|---|---|---|---|
| Supabase Postgres | Supabase PITR | Weekly export → Cloudflare R2 free tier | Continuous + Weekly | 7d + ~90d |
| Supabase Storage (library-docs, garage-docs) | Supabase native | (planned) weekly export | Native only today | 7d |
| Code | GitHub `main` | Local clone on founder Mac | On commit | Indefinite |
| Vercel deployments | Vercel internal | (none) | On deploy | 30d rollback window |

## Capacity planning

- Vercel free tier: 100 GB/mo bandwidth, 100h compute, 1000 build minutes.
  Current usage: <5% of all metrics.
- Supabase free tier: 500MB DB, 1GB storage, 5GB egress. Current usage:
  ~12% DB, ~30% storage.
- Upgrade triggers documented in `MEMORY.md` (project_hosting_plan).

## Honest gaps

- No multi-region failover. Vercel + Supabase outage = portal outage.
  Mitigation: documented status page + customer notification template;
  acceptable for current stage with no enterprise SLA contracts.
- Cloudflare WAF is L3/L4 only on free tier. L7 paid features
  (advanced rate limiting, custom WAF rules) deferred.

## Evidence

- `.github/workflows/uptime-check.yml`
- `/status` — public uptime page
- Supabase project dashboard (screenshot on file)
- Vercel project dashboard (screenshot on file)

## Next review

2026-08-11.
