# Tabletop exercises

Monthly 30-min simulated incident, logged here. Three completed
tabletops = sufficient evidence for SOC 2 CC7 (incident response
capability).

## Format

File name: `YYYY-MM-DD-{scenario-slug}.md`.

Each entry includes:
- Scenario (the simulated incident)
- Time started / finished (real wall clock)
- Steps taken (what the founder actually did in the exercise)
- What worked
- What didn't (gaps to fix)
- Action items committed afterwards

## Suggested scenarios

1. **Credential leak (P1)** — `CRON_SECRET` posted to a pastebin
   monitoring tool. Goal: rotate within 30 min, verify nothing
   exploited.
2. **Data breach (P0)** — Supabase logs show queries from an unknown
   IP returning the `opportunities` table. Goal: contain in 1h,
   identify scope in 4h, customer notification draft in 24h.
3. **Agent runaway (P1)** — A scheduled agent loops infinitely calling
   Anthropic. Goal: detect via cost alert, kill cron, prevent
   recurrence.
4. **Vendor outage (P2)** — Supabase down for 2h. Goal: status page
   updated within 30 min, customer notifications drafted, restore
   procedure tested.
5. **Supply chain compromise (P0)** — A dependency in `package.json`
   publishes a malicious version. Goal: detect, pin, rotate any
   exposed secrets.
6. **Insider threat (P0)** — Imagine CH has 5 employees and one of
   them exfiltrates the client list. Goal: detect via audit logs,
   contain, legal escalation.

## Schedule

| Month | Scenario | Status |
|---|---|---|
| 2026-05 | Credential leak (P1) | scheduled 2026-05-31 |
| 2026-06 | Data breach (P0) | scheduled 2026-06-30 |
| 2026-07 | Agent runaway (P1) | scheduled 2026-07-31 |

After three completed exercises, rotate through remaining scenarios
quarterly.
