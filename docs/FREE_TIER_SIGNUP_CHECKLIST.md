# Free-tier signup checklist

Things Claude cannot do for you because they require account creation /
external dashboard configuration. Each item below is on the free tier
of the relevant provider (no credit card needed for most) and unlocks a
specific Fase 1-2 capability.

Order is by impact-per-minute. Do them top-down whenever you have a
15-min window.

---

## Phase 1 — Operational baseline (do this week)

### 1. Cloudflare in front of `portal.wearecommonhouse.com` — 30 min

- Sign up: <https://dash.cloudflare.com/sign-up>
- Add `wearecommonhouse.com` as a site (Free plan).
- Cloudflare gives you 2 nameservers; update them at the domain
  registrar (Namecheap / Squarespace / wherever the domain lives).
- Once active:
  - Turn ON: **Always Use HTTPS**, **Automatic HTTPS Rewrites**, **HSTS**
    (preload enabled — we already preload HSTS at the app level, this is
    a second layer)
  - Turn ON: **Bot Fight Mode** (free)
  - Turn ON: **Browser Integrity Check**
  - Under Security → WAF → Managed Rules: enable **Cloudflare Managed Ruleset**
  - Under Security → DDoS: confirm L3/L4 enabled (default)
- Verify: `https://portal.wearecommonhouse.com` still resolves; check
  `cf-ray` header is present in DevTools.

**Capability unlocked:** L7 WAF, bot filtering, DDoS mitigation. Replaces
a $200/mo enterprise WAF.

### 2. UptimeRobot — 10 min

- Sign up: <https://uptimerobot.com> (free tier: 50 monitors, 5-min interval)
- Add monitors:
  - `https://portal.wearecommonhouse.com` (HTTP)
  - `https://portal.wearecommonhouse.com/api/hall-data` (HTTP, expect 200)
  - `https://portal.wearecommonhouse.com/status` (HTTP, expect 200)
- Notification: email to founder + (optional) Slack webhook.
- Status page: enable the built-in public status page if you want a
  second public-facing endpoint (the GitHub Actions one at `/status`
  is the primary).

**Capability unlocked:** SMS-grade alerting (email-to-SMS gateway via
your carrier) for the cases where the GH Actions monitor catches an
outage but you're not at the keyboard.

**Note:** The GitHub Actions monitor (`.github/workflows/uptime-check.yml`)
is already running every 10 min and writing to `/status`. UptimeRobot
is a redundant second probe. Keep both.

### 3. Axiom log drain from Vercel — 20 min

- Sign up: <https://app.axiom.co/register> (free tier: 500 GB / 30 days)
- Create a dataset called `ch-vercel-prod`.
- Create an API token (read+write scope on that dataset).
- In Vercel project settings → Integrations → Log Drains: add Axiom drain
  with that token.
- Verify: trigger a request to portal, see logs land in Axiom within ~30s.

**Capability unlocked:** Searchable logs beyond Vercel's 1h retention.
Required for SOC 2 CC7 evidence.

### 4. Upstash Redis (for future rate limiting) — 10 min

- Sign up: <https://upstash.com> (free tier: 10K commands/day)
- Create a Redis database, region: `us-east-1` (matches Vercel).
- Copy `REST URL` + `REST TOKEN`.
- Add to Vercel env vars:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

**Capability unlocked:** Backend for `src/lib/rate-limit.ts` (to be
built in Fase 1.2).

---

## Phase 2 — DIY pen-test (weeks 3-5)

### 5. OWASP ZAP — local install — 30 min

- Download: <https://www.zaproxy.org/download/>
- Install. Open ZAP.
- Configure proxy to capture traffic to `portal.wearecommonhouse.com`.
- Run **Automated Scan** against the portal.
- Document findings in `docs/compliance/pentests/2026-Q2-zap-scan.md`.

**Capability unlocked:** ~70% of what Cobalt's automated pen-test
delivers, for $0.

### 6. Nuclei (CLI scanner) — 15 min

- Install via Homebrew: `brew install nuclei` (or download binary).
- Update templates: `nuclei -ut`.
- Scan: `nuclei -u https://portal.wearecommonhouse.com -severity high,critical`.
- Document in same `pentests/` folder.

**Capability unlocked:** 8000+ CVE + misconfig templates.

### 7. Semgrep Community — 15 min

- Install: `pip install semgrep` or `brew install semgrep`.
- Run: `semgrep --config=auto src/`
- Document findings in `docs/compliance/pentests/2026-Q2-semgrep.md`.

**Capability unlocked:** Static analysis for Next.js / React /
TypeScript security patterns.

### 8. Trufflehog (deep history scan) — 10 min

- Install: `brew install trufflehog`.
- Run: `trufflehog filesystem . --since-commit HEAD~500 --no-update`
- Should return nothing (our pattern scanner catches secrets at
  pre-commit). Confirms no historical secret leak.

### 9. HackerOne CVD program — 30 min

- Sign up at <https://www.hackerone.com> (as a program owner).
- Create a private CVD-only program (no monetary pool).
- Scope: `portal.wearecommonhouse.com`, see `/security` policy.
- Reward: hall-of-fame credit, swag.
- Invite ~10 researchers via H1's directory.

**Capability unlocked:** External security review at $0 cost.

---

## Phase 3 — Hardening (weeks 6-9)

### 10. Cloudflare R2 (backup target) — 15 min

- Cloudflare dashboard → R2 → Create bucket `ch-supabase-backup`.
- Generate R2 API token (S3-compatible).
- Add to Vercel env vars:
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME=ch-supabase-backup`

**Capability unlocked:** Weekly Supabase pg_dump → R2 (10 GB free).
Backup cron will be `vercel.json` entry built in Fase 3.

### 11. Better Stack Logs alternative (if Axiom feels limiting) — skip if Axiom works

- Sign up: <https://betterstack.com> (free: 1 GB / 3 days retention)

---

## Phase 4 — Customer-facing (weeks 10-12)

No external signups needed — everything is built in the repo (trust
page, security page, IR plan, tabletops).

---

## Skip list (paid only — do not sign up)

These were in the previous "ambitious paid" plan. Free version skips
them; we'll revisit when revenue justifies:

- ❌ Cobalt pen-test ($5-8K) — replaced by Phase 2 DIY pen-test
- ❌ Vanta SOC 2 platform ($7-15K/yr) — replaced by `docs/compliance/`
- ❌ Drata SOC 2 platform ($7-15K/yr) — same
- ❌ Better Stack status page paid ($30/mo) — using GH Actions free
- ❌ YubiKey hardware ($150) — using Clerk passkeys (free)
- ❌ Cyber insurance — skip until customer contract requires it
- ❌ SOC 2 CPA audit ($8-15K) — skip until customer contract requires it

---

## Done checklist

Track progress by checking these as you complete each signup:

- [ ] Cloudflare site added + WAF enabled
- [ ] UptimeRobot 3 monitors live
- [ ] Axiom log drain receiving Vercel logs
- [ ] Upstash Redis env vars in Vercel
- [ ] OWASP ZAP first scan documented
- [ ] Nuclei first scan documented
- [ ] Semgrep run committed
- [ ] HackerOne CVD program live
- [ ] Cloudflare R2 bucket + tokens in Vercel

When all 9 are checked, you're at the operational baseline of Fase 1 +
ready to start Fase 2's hardening cycle.
