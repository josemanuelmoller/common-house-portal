/**
 * POST /api/admin/relationship-promotion/scan
 *
 * Runs the relationship-promotion-operator scan over Supabase organizations.
 * Surfaces candidates whose evidence supports a relationship-class promotion
 * but whose stage hasn't moved (the "Engatel pattern").
 *
 * In dry_run (default): returns the candidate report; writes nothing.
 * In execute: inserts decision_items rows for candidates with score >= 5,
 * skipping orgs that already have an open classify_relationship proposal
 * or were rejected in the last 30 days.
 *
 * Body: { mode?: "dry_run" | "execute", since?: ISO date, limit?: number, org_ids?: string[] }
 *
 * Auth: adminGuardApi() OR x-agent-key: $CRON_SECRET (so it can be cron-invoked).
 *
 * Core logic lives in src/lib/relationship-promotion-scan.ts (shared with the
 * daily cron entrypoint, which calls it in-process).
 *
 * See .claude/agents/relationship-promotion-operator.md for the full contract.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { runPromotionScan, type PromotionScanOptions } from "@/lib/relationship-promotion-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const header = req.headers.get("x-agent-key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === cronSecret;
}

export async function POST(req: NextRequest) {
  // Allow either admin or cron-key — operator can be human-triggered or scheduled.
  const cronOk = isAuthorized(req);
  if (!cronOk) {
    const guard = await adminGuardApi();
    if (guard) return guard;
  }

  let body: PromotionScanOptions;
  try {
    body = (await req.json()) as PromotionScanOptions;
  } catch {
    body = {};
  }

  const result = await runPromotionScan(body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, detail: result.detail }, { status: 502 });
  }
  return NextResponse.json(result);
}
