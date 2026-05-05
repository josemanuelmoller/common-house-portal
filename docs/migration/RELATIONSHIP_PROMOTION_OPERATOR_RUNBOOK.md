# Relationship-promotion-operator — runbook

**Audience:** Jose Manuel (running it from prod or staging).
**Status:** Built 2026-05-05; live at commit `7e26bfa`. UI binding live at `cf83830`.

---

## What it does in one sentence

Scans `organizations` in Supabase for entities whose evidence supports a relationship-class promotion (Active Client / Partner / Investor / Funder) but whose `relationship_stage` hasn't moved, and creates `decision_items` rows so a human can approve from `/admin/os`.

This is the operator that closes the **Engatel pattern** — paying clients silently classified as Prospect.

## Endpoints

- `POST /api/admin/relationship-promotion/scan`
  Auth: admin session OR `x-agent-key: $CRON_SECRET`
  Body: `{ "mode": "dry_run" | "execute", "since"?: "ISO-date", "limit"?: number, "org_ids"?: string[] }`
  Default: `mode=dry_run`, `limit=25`, `since` = 30 days ago.

## How to run

### Dry-run (safe, recommended first)

```bash
curl -X POST https://portal.wearecommonhouse.com/api/admin/relationship-promotion/scan \
  -H "x-agent-key: $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"mode":"dry_run","limit":50}' | jq
```

Returns a JSON report: `records_inspected`, `candidates_found`, `surfaceable_count`, `top_candidates` (org name, current → proposed, score, signals).
**No writes happen.** Read the `top_candidates` list and decide if the scoring looks right.

### Execute (creates decision_items)

```bash
curl -X POST https://portal.wearecommonhouse.com/api/admin/relationship-promotion/scan \
  -H "x-agent-key: $CRON_SECRET" \
  -H "content-type: application/json" \
  -d '{"mode":"execute","limit":50}' | jq
```

Returns `proposals_created`, `already_proposed`, `recently_rejected`. Each created proposal becomes a row in `decision_items` and surfaces in `/admin/os` under "Relationship classifications".

## How to approve / reject

In the portal:
1. Open `/admin/os`.
2. Top section "Relationship classifications" lists open proposals.
3. Click **Approve as <Class>** → calls `approveRelationshipClassification(decisionId)`. Updates `organizations.relationship_stage`, `relationship_classes`, `engagement_*` + mirrors to `hall_organizations`. Decision goes to `Resolved`.
4. Click **Reject** → optional reason via `prompt()`. Decision goes to `Rejected`. Org won't be re-proposed for 30 days.

## Scoring contract

See `.claude/agents/relationship-promotion-operator.md` for the full scoring table. Quick reference:

| Signal | Weight |
|---|---|
| Active Client engagement | +3 |
| Active Partner / Investor / Funder engagement | +3 |
| Won opportunity | +3 |
| Active project | +2 |
| Billing / invoice / payment evidence | +2 |
| ≥3 validated evidence in 90 days | +1 |
| Recent activity (<30 days) | +1 |

Threshold: `score ≥ 5` → proposal created. `3-4` → logged only. `< 3` → ignored.

## Idempotency

- Re-running with same scope is safe.
- Won't propose the same org twice while the previous proposal is `Open`.
- Won't propose an org rejected within the last 30 days.
- Approving a proposal updates the canonical row; the operator on next run sees the new stage and stops proposing.

## Suggested cadence

- **One-time today:** run `dry_run` then `execute` to surface the backlog (Engateles already in the system silently mis-classified).
- **Recurring:** add to Vercel cron daily at 06:00 UTC alongside the other agent cadences.

## Known limits

- Operator does NOT scan opportunities/projects without a linked `org_notion_id`. Orphan opportunities won't trigger a classification proposal.
- The "billing evidence" signal uses a simple `ILIKE %bill% OR %invoice% OR %payment%` over `evidence_statement`. False positives possible (e.g. "no billing yet"). Score gate (≥5) makes this acceptable.
- Scoring is intentionally conservative; tune weights in `src/app/api/admin/relationship-promotion/scan/route.ts` if too few or too many proposals.

## Verification after first execute

1. `/admin/os` shows the new "Relationship classifications" section above the legacy decision queue.
2. `SELECT count(*) FROM decision_items WHERE entity_action='classify_relationship' AND status='Open';` matches the count in the section header.
3. After approving one: `SELECT relationship_stage, relationship_classes FROM organizations WHERE name = '<approved org>';` should reflect the classification.
4. `hall_organizations` should also have `Client` (or whatever) in `relationship_classes` for the org's domain.
