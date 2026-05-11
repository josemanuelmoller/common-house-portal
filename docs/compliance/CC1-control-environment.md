# CC1 — Control Environment

Last reviewed: 2026-05-11
Owner: Jose Manuel Moller

## Scope

How Common House (CH) is organized, who decides what, and who is
accountable for security and integrity of the portal at
`portal.wearecommonhouse.com`.

## Control statement

CH operates a single-owner control model. All security-relevant decisions
are authorised by the founder and recorded in this repository.

## Implementation today

- **Single admin user:** `josemanuelmoller@gmail.com` is the only Clerk
  account with admin scope. Verified in Clerk dashboard.
- **Source of truth:** all production behavior is defined by code in this
  repository on `main`. No out-of-band production console edits.
- **Audit trail:**
  - Code changes → GitHub PR history + `git log` (cryptographically signed
    by Clerk session + commit signature where present).
  - Production deploys → Vercel deployment log.
  - Secret rotations → `docs/SECURITY_MODEL.md` § "Secret rotation log".

## Honest gaps

1. **Single point of failure:** No second admin. If founder is incapacitated
   the portal has no operator. Mitigation: monthly export of Clerk + Supabase
   + Vercel access lists to a sealed offline document; revisit when CH hires
   second person.
2. **No board / advisor oversight of security:** Not required for current
   stage but flag for re-review when CH raises external capital.

## Evidence

- `docs/SECURITY_MODEL.md` — current trust model + rotation playbooks.
- `.github/workflows/security-gates.yml` — automated enforcement of
  documented controls.
- Clerk admin list (screenshot on file, redacted email PII).

## Next review

2026-08-11 (quarterly).
