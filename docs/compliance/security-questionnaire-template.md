# Security questionnaire — canned answers

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

Pre-filled answers to the questions B2B procurement teams ask. Updated
each time a real questionnaire surfaces a new question. Saves 4-8h per
deal.

This is intended for: SIG Lite, CAIQ Lite, customer-specific vendor
forms. NOT a substitute for a signed DPA.

---

## Company & governance

**Q: Company legal name, registered address, primary contact for
security?**
A: Common House Ltd, [registered address on file], security contact:
`security@wearecommonhouse.com`, primary: Jose Manuel Moller.

**Q: Number of employees with access to customer data?**
A: 1 (founder). Documented in [CC1](CC1-control-environment.md).

**Q: SOC 2 Type II?**
A: In progress. Controls documented and operating; Type II audit on
roadmap when customer-driven. Trust pack at
`portal.wearecommonhouse.com/trust`. Manual control documentation at
`docs/compliance/`.

**Q: ISO 27001?**
A: No. SOC 2 path chosen for US/UK market focus.

---

## Authentication & access

**Q: How do employees authenticate to production?**
A: Clerk (founder portal access) with passkey (WebAuthn) MFA. Other
vendor consoles: Google OAuth + account-level MFA on the Google account
(Advanced Protection enrolled). See
[CC6](CC6-logical-access.md).

**Q: Is MFA enforced?**
A: Yes, on every production system. WebAuthn preferred; TOTP as backup.

**Q: How are API keys / secrets managed?**
A: Stored in Vercel project environment variables (production scope).
Never committed. Pattern-scanned on every commit via `check-secrets.sh`
and CI. Rotation log in `docs/SECURITY_MODEL.md`.

**Q: How is access reviewed?**
A: Monthly review of vendor account lists (Clerk, Supabase, Vercel,
GitHub, Notion, Anthropic, Google Workspace). Documented in
[CC6](CC6-logical-access.md).

---

## Data protection

**Q: Where is data stored?**
A: Supabase (US-East). See [data-inventory.md](data-inventory.md) for
table-by-table breakdown.

**Q: Encryption at rest?**
A: Yes — Supabase native (AES-256). Supabase Storage same.

**Q: Encryption in transit?**
A: Yes — TLS 1.3 enforced via HSTS preload at portal.wearecommonhouse.com.
Internal vendor calls (Supabase, Anthropic, Notion) all HTTPS.

**Q: Data residency?**
A: US (Supabase US-East). EU customers: documented and acceptable for
current customer base; EU residency planned when EU revenue justifies.

**Q: How long is data retained?**
A: See [data-inventory.md](data-inventory.md). Indefinite by default;
deletion on request within 30 days.

**Q: Backup procedures?**
A: Supabase 7-day point-in-time recovery (continuous). Weekly export to
Cloudflare R2 (secondary, ~90 days). See
[A1-availability.md](A1-availability.md).

---

## Vulnerability management

**Q: How are vulnerabilities tracked?**
A: Dependabot weekly scans + `npm audit` baseline pinning in CI (fails
on new high/critical CVE). Quarterly DIY pen-test using OWASP ZAP +
Nuclei + Semgrep (free, self-hosted).

**Q: When was the last pen-test?**
A: 2026-05 — initial DIY pen-test using OWASP ZAP + Nuclei + AI red team.
Findings remediated through 5 waves of security work. Trust pack
references commit history.

**Q: Bug bounty / responsible disclosure?**
A: Yes — `security@wearecommonhouse.com` / `/security`. Hall-of-fame
recognition, no monetary bounty at current stage. SLA: ack ≤ 24h.

---

## Incident response

**Q: Do you have an incident response plan?**
A: Yes — `docs/INCIDENT_RESPONSE.md`. Severity matrix, communication
templates, tabletop exercises monthly.

**Q: How will you notify us of an incident?**
A: Material incident affecting your data: email to your designated
contact within 72 hours of confirmation, per GDPR Art. 33 timing. Plus
public status page at `portal.wearecommonhouse.com/status` within 30 min.

**Q: Have you had a breach in the last 12 months?**
A: No.

---

## Operations

**Q: How is code deployed?**
A: GitHub PR → 5 CI security gates → Vercel auto-deploy on merge to
`main`. Single reviewer (founder); CI gates non-bypassable. See
[CC8](CC8-change-management.md).

**Q: Production change frequency?**
A: 1-5 production deploys per week, typical.

**Q: How is downtime communicated?**
A: Status page at `portal.wearecommonhouse.com/status`. SLO target
99.5% monthly.

---

## Sub-processors

**Q: Who are your sub-processors?**
A: See [vendors.md](vendors.md). Vercel, Supabase, Clerk, Anthropic,
GitHub, Google Workspace, Cloudflare, Notion (read-only, sunset 2026-06).

**Q: Will you notify us of sub-processor changes?**
A: Yes — 30-day notice via email to designated contact.

---

## Insurance

**Q: Do you carry cyber insurance?**
A: Not at current stage. Will procure when customer contracts
require coverage > $1M or when CH ARR exceeds [threshold].

---

## Compliance

**Q: GDPR compliant?**
A: GDPR is not a certification — self-attest. CH has documented
Art. 30 record of processing, lawful bases, sub-processor list, DSAR
procedure, breach notification timing. See data-inventory.md and
vendors.md.

**Q: CCPA / CPRA?**
A: Same — self-attest. No California consumer-direct relationships at
current stage.

**Q: HIPAA?**
A: Not applicable — CH does not process health data.

**Q: PCI DSS?**
A: Not applicable — CH does not store cardholder data.

---

## Next review

2026-08-11.
