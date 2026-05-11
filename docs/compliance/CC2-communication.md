# CC2 — Communication and Information

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

## Scope

How CH communicates security changes, incidents, and policies — both
internally (single owner today) and externally (customers, partners,
researchers).

## Control statement

Security communication channels are documented, monitored, and have
defined response SLAs.

## Channels

| Channel | Purpose | SLA | Endpoint |
|---|---|---|---|
| `security@wearecommonhouse.com` | External security reports, customer security questions | Ack ≤ 24h, triage ≤ 72h | Gmail filter → founder inbox + label `security` |
| `/security` (`/security.txt`) | Responsible-disclosure policy | N/A (static) | `src/app/security/page.tsx` |
| `/trust` | Public trust pack | N/A (static) | `src/app/trust/page.tsx` |
| `/status` | Live uptime + incidents | 10-min refresh | `src/app/status/page.tsx` |
| Customer incident notifications | Material incident affecting customer data | ≤ 72h from confirmed breach | Email, signed by founder |

## Internal communication

Today: single owner. All decisions documented in:
- Git commits + PR descriptions
- `docs/` folder
- This compliance pack

When CH hires a second person, add: weekly security sync (15 min, Friday),
shared `docs/INCIDENT_RESPONSE.md` runbook, on-call rotation in Clerk.

## External communication standards

- Customer notification of a confirmed breach must include: scope of data
  exposed, root cause (as known), remediation taken, future-prevention
  steps, contact for further questions. Template in
  [INCIDENT_RESPONSE.md](../INCIDENT_RESPONSE.md).
- Status page updates within 30 minutes of confirmed user-facing impact.
- No marketing language in security comms. Plain facts.

## Honest gaps

- No 24/7 monitoring today; UptimeRobot-equivalent runs every 10 min via
  GitHub Actions but no human is paged at 3am.
- No formal customer notification list (no enterprise customers yet).

## Evidence

- Workflow: `.github/workflows/uptime-check.yml`.
- Public surfaces: `/status`, `/trust`, `/security` (deployed to
  `portal.wearecommonhouse.com`).

## Next review

2026-08-11.
