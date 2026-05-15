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

  // 1. Fetch candidate organizations.
  //
  //    If org_ids is explicit, honour it. Otherwise fetch candidates whose
  //    canonical derived state ALREADY suggests a promotion: any row where
  //    v_org_status.relationship_type is a real type (not Prospect, not
  //    Archived). Filtering by `organizations.updated_at` was broken — Phase
  //    1 cleanups touched engagements and projects, not the org row itself,
  //    so the most obvious mismatches (Engatel with raw_stage='Prospect' but
  //    derived='Client') never entered the scan window.
  //
  //    The since/lookback param remains accepted for backwards compat but
  //    is unused in the canonical-view path.
  let orgs: Array<{
    id: string;
    notion_id: string | null;
    name: string;
    relationship_stage: string | null;
    relationship_classes: string[] | null;
    updated_at: string | null;
  }> | null = null;
  if (body.org_ids?.length) {
    const r = await sb
      .from("organizations")
      .select("id, notion_id, name, relationship_stage, relationship_classes, updated_at")
      .in("id", body.org_ids)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (r.error) return NextResponse.json({ error: "orgs query failed", detail: r.error.message }, { status: 502 });
    orgs = r.data ?? [];
  } else {
    // Get notion_ids whose derived type is meaningful (not Prospect/Archived)
    // AND whose raw stage doesn't already match — that IS the candidate set.
    const { data: statusRows, error: statusErr } = await sb
      .from("v_org_status")
      .select("notion_id, relationship_type, raw_relationship_stage")
      .not("relationship_type", "in", "(Prospect,Archived)");
    if (statusErr) return NextResponse.json({ error: "status view failed", detail: statusErr.message }, { status: 502 });
    const interestingIds = (statusRows ?? [])
      .filter((s: { notion_id: string; relationship_type: string; raw_relationship_stage: string | null }) => {
        const rs  = s.raw_relationship_stage;
        const rt  = s.relationship_type;
        if (rs === rt) return false;
        if (rs === "Active Client" && rt === "Client") return false;  // vocabulary equivalent
        return true;
      })
      .map((s: { notion_id: string }) => s.notion_id);
    if (interestingIds.length === 0) {
      orgs = [];
    } else {
      const r = await sb
        .from("organizations")
        .select("id, notion_id, name, relationship_stage, relationship_classes, updated_at")
        .in("notion_id", interestingIds)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (r.error) return NextResponse.json({ error: "orgs query failed", detail: r.error.message }, { status: 502 });
      orgs = r.data ?? [];
    }
  }
  const orgErr = null;
  if (orgErr) return NextResponse.json({ error: "orgs query failed", detail: "unreachable" }, { status: 502 });

  // 1b. Load canonical derived status for each candidate. v_org_status
  // computes relationship_type from real signals (engagements + projects);
  // any mismatch with raw_relationship_stage is the promotion trigger.
  const candidateNotionIds = (orgs ?? [])
    .map((o) => o.notion_id)
    .filter((v): v is string => !!v);
  const statusByNotion = new Map<
    string,
    { relationship_type: string; operational_state: string }
  >();
  if (candidateNotionIds.length > 0) {
    const { data: statusRows } = await sb
      .from("v_org_status")
      .select("notion_id, relationship_type, operational_state")
      .in("notion_id", candidateNotionIds);
    for (const r of (statusRows ?? []) as Array<{
      notion_id: string;
      relationship_type: string;
      operational_state: string;
    }>) {
      statusByNotion.set(r.notion_id, {
        relationship_type: r.relationship_type,
        operational_state: r.operational_state,
      });
    }
  }
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

    // Canonical signal: derived relationship_type from v_org_status. If the
    // derived type is not 'Prospect'/'Archived' and it doesn't match the raw
    // stage, that alone is a strong promotion signal (weight 4, dominant).
    const derived = statusByNotion.get(org.notion_id);
    if (
      derived &&
      derived.relationship_type !== "Prospect" &&
      derived.relationship_type !== "Archived" &&
      derived.relationship_type !== org.relationship_stage &&
      // Don't double-fire "Active Client" stage when derived says Client —
      // these mean the same thing in the legacy stage vocabulary.
      !(derived.relationship_type === "Client" && org.relationship_stage === "Active Client")
    ) {
      signals.push({
        name: `derived_${derived.relationship_type.toLowerCase()}_via_canonical_view`,
        weight: 4,
        proposes_class:
          derived.relationship_type === "Client"  ? "Active Client" :
          derived.relationship_type === "Partner" ? "Partner" :
          derived.relationship_type === "Funder"  ? "Funder" :
          derived.relationship_type === "Investor"? "Investor" :
          undefined,
      });
    }

    if (signals.length === 0) continue;

    const score = signals.reduce((s, x) => s + x.weight, 0);
    // Proposed class — prefer the canonical-view derivation when present,
    // else the highest-weight engagement signal, else default Active Client.
    const proposed_class =
      signals.find((s) => s.name.startsWith("derived_") && s.proposes_class)?.proposes_class ??
      signals.find((s) => s.proposes_class && s.weight >= 3)?.proposes_class ??
      "Active Client";

    // Skip orgs whose stage already matches the proposal
    const proposed_stage = proposed_class;
    if (org.relationship_stage === proposed_stage) continue;
    // Also skip if the canonical view says Client and the stage is already
    // "Active Client" (legacy vocabulary equivalent).
    if (proposed_class === "Active Client" && org.relationship_stage === "Active Client") continue;

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
