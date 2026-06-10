/**
 * relationship-promotion-scan.ts
 *
 * Core logic of the relationship-promotion-operator scan, extracted from
 * /api/admin/relationship-promotion/scan so the daily cron wrapper can call
 * it DIRECTLY instead of via an internal HTTP fetch to `req.nextUrl.origin`.
 *
 * Why: cron invocations arrive on the generated *.vercel.app deployment URL,
 * which sits behind Vercel Authentication (Standard Protection). The old
 * wrapper's internal fetch to that origin received the auth interstitial,
 * `upstream.ok` was false, and the cron logged "HTTP 502" every single day
 * while doing zero work. Calling the function in-process removes the network
 * hop, the auth coupling, and half the timeout budget.
 *
 * Behaviour is unchanged from the route version:
 *  - dry_run (default): returns the candidate report; writes nothing.
 *  - execute: inserts decision_items rows for candidates with score >= 5,
 *    skipping orgs with an open classify_relationship proposal or a
 *    rejection in the last 30 days.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

export type PromotionScanMode = "dry_run" | "execute";

export type PromotionScanOptions = {
  mode?: PromotionScanMode;
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

export type PromotionScanResult =
  | {
      ok: true;
      mode: PromotionScanMode;
      records_inspected: number;
      candidates_found: number;
      surfaceable_count: number;
      proposals_created: number;
      already_proposed: number;
      recently_rejected: number;
      top_candidates: Array<{
        org_name: string;
        current_stage: string | null;
        proposed_class: string;
        score: number;
        signals: string[];
      }>;
      errors: string[];
    }
  | { ok: false; error: string; detail?: string };

const DEFAULT_LIMIT = 25;

export async function runPromotionScan(opts: PromotionScanOptions): Promise<PromotionScanResult> {
  const mode: PromotionScanMode = opts.mode === "execute" ? "execute" : "dry_run";
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), 100);

  const sb = getSupabaseServerClient();

  // 1. Fetch candidate organizations — explicit org_ids, or any org whose
  //    canonical derived state (v_org_status) suggests a promotion.
  let orgs: Array<{
    id: string;
    notion_id: string | null;
    name: string;
    relationship_stage: string | null;
    relationship_classes: string[] | null;
    updated_at: string | null;
  }> | null = null;

  if (opts.org_ids?.length) {
    const r = await sb
      .from("organizations")
      .select("id, notion_id, name, relationship_stage, relationship_classes, updated_at")
      .in("id", opts.org_ids)
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (r.error) return { ok: false, error: "orgs query failed", detail: r.error.message };
    orgs = r.data ?? [];
  } else {
    const { data: statusRows, error: statusErr } = await sb
      .from("v_org_status")
      .select("notion_id, relationship_type, raw_relationship_stage")
      // Portfolio is orthogonal to the funnel — excluded here too.
      .not("relationship_type", "in", "(Prospect,Archived,Portfolio)");
    if (statusErr) return { ok: false, error: "status view failed", detail: statusErr.message };
    const interestingIds = (statusRows ?? [])
      .filter((s: { notion_id: string; relationship_type: string; raw_relationship_stage: string | null }) => {
        const rs = s.raw_relationship_stage;
        const rt = s.relationship_type;
        if (rs === rt) return false;
        if (rs === "Active Client" && rt === "Client") return false; // vocabulary equivalent
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
      if (r.error) return { ok: false, error: "orgs query failed", detail: r.error.message };
      orgs = r.data ?? [];
    }
  }

  // 1b. Canonical derived status for each candidate.
  const candidateNotionIds = (orgs ?? [])
    .map((o) => o.notion_id)
    .filter((v): v is string => !!v);
  const statusByNotion = new Map<string, { relationship_type: string; operational_state: string }>();
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
    return {
      ok: true,
      mode,
      records_inspected: 0,
      candidates_found: 0,
      surfaceable_count: 0,
      proposals_created: 0,
      already_proposed: 0,
      recently_rejected: 0,
      top_candidates: [],
      errors: [],
    };
  }

  // 2. Score each org. The candidate set is small (canonical-view mismatches),
  //    so the per-org signal queries stay sequential and well under budget.
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

    // Canonical signal: derived relationship_type from v_org_status.
    // 'Portfolio' is deliberately excluded (orthogonal axis, not funnel).
    const derived = statusByNotion.get(org.notion_id);
    const derivedStage:
      | "Active Client" | "Partner" | "Investor" | "Funder" | null =
        derived?.relationship_type === "Client"   ? "Active Client" :
        derived?.relationship_type === "Partner"  ? "Partner" :
        derived?.relationship_type === "Funder"   ? "Funder" :
        derived?.relationship_type === "Investor" ? "Investor" :
        null;
    if (
      derived &&
      derivedStage &&
      derivedStage !== org.relationship_stage &&
      !(derivedStage === "Active Client" && org.relationship_stage === "Active Client")
    ) {
      signals.push({
        name: `derived_${derived.relationship_type.toLowerCase()}_via_canonical_view`,
        weight: 4,
        proposes_class: derivedStage,
      });
    }

    if (signals.length === 0) continue;

    const score = signals.reduce((s, x) => s + x.weight, 0);
    const proposed_class =
      signals.find((s) => s.name.startsWith("derived_") && s.proposes_class)?.proposes_class ??
      signals.find((s) => s.proposes_class && s.weight >= 3)?.proposes_class ??
      "Active Client";

    const proposed_stage = proposed_class;
    if (org.relationship_stage === proposed_stage) continue;
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

  return {
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
  };
}
