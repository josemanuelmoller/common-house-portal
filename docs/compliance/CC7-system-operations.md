# CC7 — System Operations

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

## Scope

How CH detects, responds to, and recovers from security events and
operational incidents.

## Control statement

The portal is monitored continuously; deviations from baseline are
detected and triaged; incidents are recorded and post-mortem'd.

## Detection

| Source | What it detects | Cadence |
|---|---|---|
| GitHub Actions `uptime-check` | Endpoint down / degraded | every 10 min |
| GitHub Actions `security-gates` (PR + push) | Auth gap, leaked err.message, new high-CVE | every PR + on main push |
| Dependabot weekly | New CVEs in dependencies | weekly |
| Vercel runtime logs | 5xx, slow routes, crashes | live (manual review) |
| Supabase advisor (`get_advisors`) | RLS misconfig, slow queries | manual monthly |
| Anthropic Console logs | API key misuse, quota anomaly | manual monthly |

## Response

Severity matrix (full version: [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md)):

| Sev | Examples | Time-to-acknowledge | Time-to-resolve |
|---|---|---|---|
| P0 | Data breach (PII exfil confirmed), production down >1h | ≤ 1h | ≤ 24h, customer-notified ≤72h |
| P1 | Auth bypass, exposed secret, partial outage | ≤ 4h | ≤ 24h |
| P2 | Degraded but operational, single-feature regression | ≤ 24h | ≤ 7d |
| P3 | Cosmetic, internal-only | ≤ 7d | best-effort |

## Recovery

- **Code rollback:** Vercel "promote previous deployment" — single click.
- **Database recovery:** Supabase 7-day point-in-time recovery (free tier).
  Weekly export to Cloudflare R2 free tier extends to ~90 days retention.
- **Secret compromise:** Rotation playbook in `docs/SECURITY_MODEL.md`.
- **Anthropic key compromise:** Revoke + regenerate in console (≤ 5 min);
  redeploy with new key (≤ 5 min).

## Tabletop exercises

Monthly 30-min simulation logged in `docs/compliance/tabletops/`. First
scheduled: 2026-05-31. Three completed tabletops = sufficient evidence
for SOC 2 CC7.

## Honest gaps

- No on-call rotation (single owner). 3am incident likely missed until
  morning. Mitigation: UptimeRobot email-to-SMS gateway when CH adds it.
- No automated runtime anomaly detection (no Datadog/New Relic). Mitigation:
  log drain to Axiom free tier (manual review).

## Evidence

- `.github/workflows/uptime-check.yml` + `/status` page.
- `.github/workflows/security-gates.yml`.
- `docs/INCIDENT_RESPONSE.md` (to be written in Fase 4).
- Tabletop logs in `docs/compliance/tabletops/`.

## Next review

2026-08-11.
