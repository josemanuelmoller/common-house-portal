# Compliance — Common House

This folder is the **manual SOC 2 readiness pack**. We're not paying Vanta or
Drata. Each Trust Service Criterion is documented by hand and pointed at
real evidence in the repo (commits, workflows, runtime logs, screenshots).

When a B2B prospect asks "are you SOC 2?" the honest answer is:

> "We have the controls documented and operating. Type II audit is on the
> roadmap once revenue justifies the CPA cost. Here's our trust pack."

That pack is this folder + `docs/SECURITY_MODEL.md` + `/trust` on the portal.

## Status (2026-05-11)

| Criterion | Status | File |
|---|---|---|
| CC1 — Control Environment | drafted | [CC1-control-environment.md](./CC1-control-environment.md) |
| CC2 — Communication | drafted | [CC2-communication.md](./CC2-communication.md) |
| CC6 — Logical Access | drafted | [CC6-logical-access.md](./CC6-logical-access.md) |
| CC7 — System Operations | drafted | [CC7-system-operations.md](./CC7-system-operations.md) |
| CC8 — Change Management | drafted | [CC8-change-management.md](./CC8-change-management.md) |
| A1 — Availability | drafted | [A1-availability.md](./A1-availability.md) |
| Vendor Inventory | drafted | [vendors.md](./vendors.md) |
| Data Inventory (PII map) | drafted | [data-inventory.md](./data-inventory.md) |
| Security Questionnaire (canned answers) | drafted | [security-questionnaire-template.md](./security-questionnaire-template.md) |
| Tabletop exercises log | empty | [tabletops/](./tabletops/) |

## How to use this folder

1. **Adding evidence:** Each control file has an `Evidence` section. Append
   commits, PR links, screenshots (in `evidence/screenshots/`), or runtime log
   excerpts (in `evidence/logs/`). Never paste real secrets — redact.

2. **Updating a control:** Bump the `Last reviewed` date at the top. Quarterly
   review of every file is the minimum cadence to satisfy SOC 2 Type II.

3. **Annual review ritual (Q1 of each year):** Re-run the Fase 2 DIY pen-test
   from the security roadmap, refresh each control file, document the diff,
   and commit.

## What this folder is NOT

- **Not legal advice.** When you sign your first $50K+ B2B contract, get a
  privacy attorney to review the DPA and privacy policy.
- **Not a substitute for a Type II audit.** When a customer requires SOC 2
  Type II for procurement, you'll hire a CPA firm. This folder cuts that
  audit from 6 months to ~30 days.
- **Not GDPR/CCPA certification.** Those don't exist; you self-attest. But
  the data inventory and DPA templates here are what regulators expect.

## Owners

- Single owner today: Jose Manuel Moller (`josemanuelmoller@gmail.com`).
- This makes CC1 (Control Environment) the weakest link until CH has a
  second employee. Documented honestly in CC1.
