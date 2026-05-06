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
 * See .claude/agents/relationship-promotion-operator.md for the full contract.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Mode = "dry_run" | "execute";
type Body = {
  mode?: Mode;
  since?: string;
  limit?: number;
  org_ids?: string[];
};

type Signal = {
  name: string;
  weight: number;
  proposes_class?: "Active Client" | "Partner" | "Investor" | "Funder";
};

type Candidate = {
  org_id: string;
  org_notion_id: string | null;
  org_name: string;
  current_stage: string | null;
  proposed_class: "Active Client" | "Partner" | "Investor" | "Funder";
  score: number;
  signals: Signal[];
};

const DEFAULT_LIMIT = 25;
const DEFAULT_LOOKBACK_DAYS = 30;

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

  let body: Body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const mode: Mode = body.mode === "execute" ? "execute" : "dry_run";
  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), 100);
  const since =
    body.since ??
    new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const sb = getSupabaseServerClient();

  // 1. Fetch candidate organizations (recent activity OR explicit list)
  const orgQuery = sb
    .from("organizations")
    .select("id, notion_id, name, relationship_stage, relationship_classes, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (body.org_ids?.length) orgQuery.in("id", body.org_ids);
  else orgQuery.gte("updated_at", since);
  const { data: orgs, error: orgErr } = await orgQuery;
  if (orgErr) return NextResponse.json({ error: "orgs query failed", detail: orgErr.message }, { status: 502 });
  if (!orgs || orgs.length === 0) {
    return NextResponse.json({
      ok: true,
      mode,
      records_inspected: 0,
      candidates_found: 0,
      proposals_created: 0,
      already_proposed: 0,
      recently_rejected: 0,
      top_candidates: [],
      errors: [],
    });
  }

  // 2. Score each org
  const candidates: Candidate[] = [];
  const errors: string[] = [];

  for (const org of orgs) {
    if (!org.notion_id) continue; // skip orphans without a stable id
    const signals: Signal[] = [];
    try {
      // Engagement signals
      const { data: engs } = await sb
        .from("engagements")
        .select("engagement_type, relationship_status, engagement_value")
        .eq("org_notion_id", org.notion_id)
        .eq("relationship_status", "Active");
      for (const e of engs ?? []) {
        if (e.engagement_type === "Client") signals.push({ name: "active_client_engagement", weight: 3, proposes_class: "Active Client" });
        else if (e.engagement_type === "Partner") signals.push({ name: "active_partner_engagement", weight: 3, proposes_class: "Partner" });
        else if (e.engagement_type === "Investor") signals.push({ name: "active_investor_engagement", weight: 3, proposes_class: "Investor" });
        else if (e.engagement_type === "Funder") signals.push({ name: "active_funder_engagement", weight: 3, proposes_class: "Funder" });
      }

      // Won opportunity signal
      const { count: wonCount } = await sb
        .from("opportunities")
        .select("*", { count: "exact", head: true })
        .eq("org_notion_id", org.notion_id)
        .eq("status", "Won");
      if ((wonCount ?? 0) > 0) signals.push({ name: "won_opportunity", weight: 3, proposes_class: "Active Client" });

      // Active project signal
      const { count: activeProjectCount } = await sb
        .from("projects")
        .select("*", { count: "exact", head: true })
        .eq("primary_org_notion_id", org.notion_id)
        .in("project_status", ["In progress", "Active"]);
      if ((activeProjectCount ?? 0) > 0) signals.push({ name: "active_project", weight: 2 });

      // Validated evidence count
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { count: validatedCount } = await sb
        .from("evidence")
        .select("*", { count: "exact", head: true })
        .eq("org_notion_id", org.notion_id)
        .eq("validation_status", "Validated")
        .gte("date_captured", ninetyDaysAgo.slice(0, 10));
      if ((validatedCount ?? 0) >= 3) signals.push({ name: "evidence_volume", weight: 1 });

      // Billing signal
      const { count: billingCount } = await sb
        .from("evidence")
        .select("*", { count: "exact", head: true })
        .eq("org_notion_id", org.notion_id)
        .eq("validation_status", "Validated")
        .or("evidence_statement.ilike.%bill%,evidence_statement.ilike.%invoice%,evidence_statement.ilike.%payment%");
      if ((billingCount ?? 0) > 0) signals.push({ name: "billing_evidence", weight: 2 });
    } catch (e) {
      errors.push(`org ${org.id}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    if (signals.length === 0) continue;

    const score = signals.reduce((s, x) => s + x.weight, 0);
    // Proposed class = highest-weight engagement signal, fallback Active Client
    const proposed_class =
      signals.find((s) => s.proposes_class && s.weight >= 3)?.proposes_class ?? "Active Client";

    // Skip orgs whose stage already matches the proposal
    const proposed_stage = proposed_class;
    if (org.relationship_stage === proposed_stage) continue;

    candidates.push({
      org_id: org.id,
      org_notion_id: org.notion_id,
      org_name: org.name,
      current_stage: org.relationship_stage,
      proposed_class,
      score,
      signals,
    });
  }

  // 3. Surface only score >= 5 (proposal threshold per agent contract)
  const surfaceable = candidates.filter((c) => c.score >= 5);

  // 4. In execute mode, dedupe against existing open proposals + recent rejections
  let proposals_created = 0;
  let already_proposed = 0;
  let recently_rejected = 0;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  if (mode === "execute") {
    for (const c of surfaceable) {
      // Already-open proposal?
      const { count: openCount } = await sb
        .from("decision_items")
        .select("*", { count: "exact", head: true })
        .eq("entity_action", "classify_relationship")
        .eq("org_notion_id", c.org_notion_id ?? "")
        .eq("status", "Open");
      if ((openCount ?? 0) > 0) {
        already_proposed++;
        continue;
      }
      // Recently rejected?
      const { count: rejectedCount } = await sb
        .from("decision_items")
        .select("*", { count: "exact", head: true })
        .eq("entity_action", "classify_relationship")
        .eq("org_notion_id", c.org_notion_id ?? "")
        .gte("rejected_at", thirtyDaysAgo);
      if ((rejectedCount ?? 0) > 0) {
        recently_rejected++;
        continue;
      }
      // Insert proposal
      const { error: insertErr } = await sb.from("decision_items").insert({
        title: `Classify ${c.org_name} as ${c.proposed_class}?`,
        decision_type: "Relationship Classification",
        priority: c.score >= 7 ? "P2 High" : "P3 Medium",
        status: "Open",
        source_agent: "relationship-promotion-operator",
        requires_execute: true,
        execute_approved: false,
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        category: "classify_relationship",
        entity_action: "classify_relationship",
        entity_id: c.org_id,
        entity_table: "organizations",
        resolution_field: "relationship_stage",
        resolution_type: "set_classification",
        resolution_target_table: "organizations",
        entity_payload: {
          org_id: c.org_id,
          org_notion_id: c.org_notion_id,
          org_name: c.org_name,
          proposed_class: c.proposed_class,
          proposed_stage: c.proposed_class,
          score: c.score,
          signals: c.signals,
        },
        org_notion_id: c.org_notion_id,
        notes_raw: c.signals.map((s) => `+${s.weight} ${s.name}`).join(", "),
      });
      if (insertErr) {
        errors.push(`insert decision_item for ${c.org_name}: ${insertErr.message}`);
      } else {
        proposals_created++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    mode,
    records_inspected: orgs.length,
    candidates_found: candidates.length,
    surfaceable_count: surfaceable.length,
    proposals_created,
    already_proposed,
    recently_rejected,
    top_candidates: candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((c) => ({
        org_name: c.org_name,
        current_stage: c.current_stage,
        proposed_class: c.proposed_class,
        score: c.score,
        signals: c.signals.map((s) => `+${s.weight} ${s.name}`),
      })),
    errors,
  });
}
