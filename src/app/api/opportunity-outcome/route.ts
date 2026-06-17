/**
 * POST /api/opportunity-outcome
 *
 * Resolves a pipeline opportunity from the Hall's "Por cerrar" strip.
 *
 * Body: { id: string (opportunities.id uuid), outcome: "won" | "lost", amount?: number, currency?: string }
 *
 * - "won"  → opportunities.status = 'Won' + inserts a revenue_events row at
 *            stage 'sold' (source 'hall', external_ref `opp:{id}`) so the
 *            commitment counts against the quarter target immediately. When
 *            the real Xero invoice arrives, the nightly sync supersedes the
 *            manual sold row (see src/lib/xero-sync.ts) — no double counting.
 * - "lost" → opportunities.status = 'Lost'. Row keeps its history; it simply
 *            leaves the pipeline.
 *
 * Idempotent: the revenue event upserts on (source, external_ref), so a retry
 * after a half-failure cannot duplicate the sold amount.
 *
 * Auth: adminGuardApi() — authenticated admin session required.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { id?: string; outcome?: string; amount?: number; currency?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id, outcome } = body;
  if (!id || (outcome !== "won" && outcome !== "lost")) {
    return NextResponse.json({ error: "Body must be { id, outcome: 'won' | 'lost' }" }, { status: 400 });
  }

  const sb = getSupabaseServerClient();

  const { data: opp, error: oppErr } = await sb
    .from("opportunities")
    .select("id, title, org_name, org_notion_id, value_estimate, status")
    .eq("id", id)
    .maybeSingle();
  if (oppErr) return NextResponse.json({ error: oppErr.message }, { status: 500 });
  if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

  if (outcome === "lost") {
    const { error } = await sb
      .from("opportunities")
      .update({ status: "Lost", is_active: false, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, outcome: "lost" });
  }

  // won — the amount must be a real number; value_estimate is the default but
  // the caller may override (e.g. final negotiated figure).
  const amount = Number(body.amount ?? opp.value_estimate ?? 0);
  if (!isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "won requires a positive amount (value_estimate is empty — pass `amount`)" },
      { status: 400 }
    );
  }
  const currency = (body.currency ?? "USD").toUpperCase();

  // Resolve organization uuid for the Xero reconciliation match (best-effort).
  let organizationId: string | null = null;
  if (opp.org_notion_id) {
    const { data: org } = await sb
      .from("organizations")
      .select("id")
      .eq("notion_id", opp.org_notion_id)
      .maybeSingle();
    organizationId = (org?.id as string | undefined) ?? null;
  }
  if (!organizationId && opp.org_name) {
    const { data: org } = await sb
      .from("organizations")
      .select("id")
      .ilike("name", opp.org_name)
      .maybeSingle();
    organizationId = (org?.id as string | undefined) ?? null;
  }

  const now = new Date();
  const { error: revErr } = await sb.from("revenue_events").upsert(
    {
      source: "hall",
      external_ref: `opp:${id}`,
      stage: "sold",
      amount,
      currency,
      opportunity_id: id,
      organization_id: organizationId,
      year: now.getUTCFullYear(),
      quarter: Math.floor(now.getUTCMonth() / 3) + 1,
      notes: `Hall · ${opp.org_name ?? opp.title}`,
      updated_at: now.toISOString(),
    },
    { onConflict: "source,external_ref" }
  );
  if (revErr) return NextResponse.json({ error: `revenue event: ${revErr.message}` }, { status: 500 });

  const { error: updErr } = await sb
    .from("opportunities")
    .update({ status: "Won", updated_at: now.toISOString() })
    .eq("id", id);
  if (updErr) {
    // Revenue row exists but the status didn't move — surface it so the UI can retry.
    return NextResponse.json(
      { error: `revenue event created but status update failed: ${updErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, outcome: "won", amount, currency });
}
