/**
 * POST /api/plan/compute-kpi
 *
 * Nightly KPI computation for strategic_objectives. For each active objective
 * with a non-manual metric_type, dispatches to a handler that queries the
 * relevant source (revenue_events, opportunities, organizations, people) and
 * writes the result to current_value + last_computed_at.
 *
 * Handlers implemented in v1:
 *   revenue_sum, revenue_pipeline, contracts_count, client_count_by_type,
 *   geo_spread, hiring_filled.
 *
 * Handlers deferred (require integrations not yet wired):
 *   event_attended (Calendar attendance), asset_published (Notion),
 *   mou_signed (evidence), milestone_binary / manual / custom_sql (manual).
 *
 * Auth: CRON_SECRET via Bearer or x-agent-key.
 *
 * Writes: strategic_objectives.current_value, strategic_objectives.last_computed_at
 * Does NOT write: status (achieved is an explicit human decision, not auto-flip)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authCheck(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const agentKey = req.headers.get("x-agent-key");
  if (agentKey === secret) return true;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return false;
}

// ─── country → continent mapping ─────────────────────────────────────────────
// Conservative mapping. Turkey is placed in Asia (transcontinental — convention
// needed for the "Venta 3 continentes" KPI to tell Europe from Asia).

const CONTINENT: Record<string, string> = {
  // Europe
  "España": "Europe", "Spain": "Europe", "ES": "Europe",
  "Reino Unido": "Europe", "UK": "Europe", "United Kingdom": "Europe", "GB": "Europe",
  "Francia": "Europe", "France": "Europe", "FR": "Europe",
  "Alemania": "Europe", "Germany": "Europe", "DE": "Europe",
  "Italia": "Europe", "Italy": "Europe", "IT": "Europe",
  "Países Bajos": "Europe", "Netherlands": "Europe", "NL": "Europe",
  "Bélgica": "Europe", "Belgium": "Europe", "BE": "Europe",
  "Suecia": "Europe", "Sweden": "Europe", "SE": "Europe",
  "Suiza": "Europe", "Switzerland": "Europe", "CH": "Europe",
  "Irlanda": "Europe", "Ireland": "Europe", "IE": "Europe",
  "Portugal": "Europe", "PT": "Europe",
  // Americas
  "Estados Unidos": "Americas", "USA": "Americas", "US": "Americas", "United States": "Americas",
  "Canadá": "Americas", "Canada": "Americas", "CA": "Americas",
  "México": "Americas", "Mexico": "Americas", "MX": "Americas",
  "Brasil": "Americas", "Brazil": "Americas", "BR": "Americas",
  "Argentina": "Americas", "AR": "Americas",
  "Chile": "Americas", "CL": "Americas",
  "Colombia": "Americas", "CO": "Americas",
  "Perú": "Americas", "Peru": "Americas", "PE": "Americas",
  "Costa Rica": "Americas", "CR": "Americas",
  "Venezuela": "Americas", "VE": "Americas",
  "Uruguay": "Americas", "UY": "Americas",
  // Asia
  "Turquía": "Asia", "Turkey": "Asia", "TR": "Asia",
  "China": "Asia", "CN": "Asia",
  "Japón": "Asia", "Japan": "Asia", "JP": "Asia",
  "India": "Asia", "IN": "Asia",
  "Singapur": "Asia", "Singapore": "Asia", "SG": "Asia",
  "Corea del Sur": "Asia", "South Korea": "Asia", "KR": "Asia",
  "Tailandia": "Asia", "Thailand": "Asia", "TH": "Asia",
  "Vietnam": "Asia", "VN": "Asia",
  "Israel": "Asia", "IL": "Asia",
  // Africa
  "Nigeria": "Africa", "NG": "Africa",
  "Kenia": "Africa", "Kenya": "Africa", "KE": "Africa",
  "Sudáfrica": "Africa", "South Africa": "Africa", "ZA": "Africa",
  "Egipto": "Africa", "Egypt": "Africa", "EG": "Africa",
  "Marruecos": "Africa", "Morocco": "Africa", "MA": "Africa",
  // Oceania
  "Australia": "Oceania", "AU": "Oceania",
  "Nueva Zelanda": "Oceania", "New Zealand": "Oceania", "NZ": "Oceania",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function quarterOf(d: string | null): number | null {
  if (!d) return null;
  const dd = new Date(d);
  if (isNaN(dd.getTime())) return null;
  return Math.floor(dd.getMonth() / 3) + 1;
}

function yearOf(d: string | null): number | null {
  if (!d) return null;
  const dd = new Date(d);
  if (isNaN(dd.getTime())) return null;
  return dd.getFullYear();
}

type MetricParams = Record<string, string | number | undefined>;

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleRevenueSum(db: SupabaseClient, p: MetricParams): Promise<number> {
  const stage = (p.stage as string) ?? "paid";
  let q = db.from("revenue_events").select("amount, paid_amount, stage").eq("stage", stage);
  if (p.year !== undefined) q = q.eq("year", p.year);
  if (p.quarter !== undefined) q = q.eq("quarter", p.quarter);
  const { data, error } = await q;
  if (error) throw new Error(`revenue_sum: ${error.message}`);
  return (data ?? []).reduce((s, r) => {
    const v = stage === "paid" ? Number(r.paid_amount ?? r.amount ?? 0) : Number(r.amount ?? 0);
    return s + (isFinite(v) ? v : 0);
  }, 0);
}

async function handleRevenuePipeline(db: SupabaseClient, p: MetricParams): Promise<number> {
  const minValue = Number(p.min_value ?? 0);
  let q = db.from("opportunities").select("value_estimate, status, is_active, is_archived")
    .eq("is_archived", false);
  if (p.is_active_only !== "false") q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(`revenue_pipeline: ${error.message}`);
  return (data ?? [])
    .filter((r) => Number(r.value_estimate ?? 0) >= minValue)
    .reduce((s, r) => s + Number(r.value_estimate ?? 0), 0);
}

function matchStatus(status: string | null, filter: string): boolean {
  if (!status) return false;
  return status.toLowerCase().includes(filter.toLowerCase());
}

async function handleContractsCount(db: SupabaseClient, p: MetricParams): Promise<number> {
  const stage = (p.stage as string) ?? "won";
  const { data, error } = await db.from("opportunities")
    .select("id, status, expected_close_date, org_notion_id");
  if (error) throw new Error(`contracts_count: ${error.message}`);
  let items = (data ?? []).filter((o) => matchStatus(o.status, stage));
  if (p.country) {
    const { data: orgs, error: oerr } = await db.from("organizations")
      .select("notion_id, country").eq("country", p.country);
    if (oerr) throw new Error(`contracts_count(orgs): ${oerr.message}`);
    const orgIds = new Set((orgs ?? []).map((o) => o.notion_id));
    items = items.filter((i) => i.org_notion_id && orgIds.has(i.org_notion_id));
  }
  if (p.year !== undefined || p.quarter !== undefined) {
    items = items.filter((i) => {
      const y = yearOf(i.expected_close_date);
      const q = quarterOf(i.expected_close_date);
      if (p.year !== undefined && y !== Number(p.year)) return false;
      if (p.quarter !== undefined && q !== Number(p.quarter)) return false;
      return true;
    });
  }
  return items.length;
}

async function handleClientCountByType(db: SupabaseClient, p: MetricParams): Promise<number> {
  const stage = (p.stage as string) ?? "won";
  // Get orgs matching category first
  let orgQuery = db.from("organizations").select("notion_id, org_category");
  if (p.org_category) {
    orgQuery = orgQuery.ilike("org_category", `%${p.org_category}%`);
  }
  const { data: orgs, error: oerr } = await orgQuery;
  if (oerr) throw new Error(`client_count_by_type(orgs): ${oerr.message}`);
  const orgIds = new Set((orgs ?? []).map((o) => o.notion_id).filter(Boolean));
  if (orgIds.size === 0) return 0;

  const { data: opps, error: perr } = await db.from("opportunities")
    .select("org_notion_id, status, expected_close_date");
  if (perr) throw new Error(`client_count_by_type(opps): ${perr.message}`);

  const distinctOrgs = new Set<string>();
  for (const o of opps ?? []) {
    if (!o.org_notion_id || !orgIds.has(o.org_notion_id)) continue;
    if (!matchStatus(o.status, stage)) continue;
    if (p.year !== undefined && yearOf(o.expected_close_date) !== Number(p.year)) continue;
    if (p.quarter !== undefined && quarterOf(o.expected_close_date) !== Number(p.quarter)) continue;
    distinctOrgs.add(o.org_notion_id);
  }
  return distinctOrgs.size;
}

async function handleGeoSpread(db: SupabaseClient, p: MetricParams): Promise<number> {
  const stage = (p.stage as string) ?? "won";
  const { data: opps, error: perr } = await db.from("opportunities")
    .select("org_notion_id, status, expected_close_date");
  if (perr) throw new Error(`geo_spread(opps): ${perr.message}`);

  const wonOrgIds = new Set<string>();
  for (const o of opps ?? []) {
    if (!o.org_notion_id || !matchStatus(o.status, stage)) continue;
    if (p.year !== undefined && yearOf(o.expected_close_date) !== Number(p.year)) continue;
    wonOrgIds.add(o.org_notion_id);
  }
  if (wonOrgIds.size === 0) return 0;

  const { data: orgs, error: oerr } = await db.from("organizations")
    .select("notion_id, country")
    .in("notion_id", [...wonOrgIds]);
  if (oerr) throw new Error(`geo_spread(orgs): ${oerr.message}`);

  const continents = new Set<string>();
  for (const o of orgs ?? []) {
    if (!o.country) continue;
    const c = CONTINENT[o.country.trim()];
    if (c) continents.add(c);
  }
  return continents.size;
}

async function handleHiringFilled(db: SupabaseClient, p: MetricParams): Promise<number> {
  const role = p.role as string | undefined;
  if (!role) return 0;
  let q = db.from("people").select("id, job_title, rol_interno");
  const { data, error } = await q;
  if (error) throw new Error(`hiring_filled: ${error.message}`);
  const r = role.toLowerCase();
  return (data ?? []).filter(
    (p) =>
      (p.job_title && p.job_title.toLowerCase().includes(r)) ||
      (p.rol_interno && p.rol_interno.toLowerCase().includes(r))
  ).length;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

type MetricType =
  | "revenue_sum"
  | "revenue_pipeline"
  | "contracts_count"
  | "client_count_by_type"
  | "geo_spread"
  | "hiring_filled"
  | "milestone_binary"
  | "event_attended"
  | "asset_published"
  | "mou_signed"
  | "custom_sql"
  | "manual";

const DEFERRED: MetricType[] = [
  "milestone_binary",
  "event_attended",
  "asset_published",
  "mou_signed",
  "custom_sql",
  "manual",
];

async function dispatch(
  db: SupabaseClient,
  metricType: MetricType,
  params: MetricParams
): Promise<number | null> {
  if (DEFERRED.includes(metricType)) return null;
  switch (metricType) {
    case "revenue_sum":          return handleRevenueSum(db, params);
    case "revenue_pipeline":     return handleRevenuePipeline(db, params);
    case "contracts_count":      return handleContractsCount(db, params);
    case "client_count_by_type": return handleClientCountByType(db, params);
    case "geo_spread":           return handleGeoSpread(db, params);
    case "hiring_filled":        return handleHiringFilled(db, params);
    default:                     return null;
  }
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();

  const { data: objectives, error: objErr } = await db
    .from("strategic_objectives")
    .select("id, metric_type, metric_params, current_value, status")
    .eq("status", "active");

  if (objErr) {
    return NextResponse.json({ error: objErr.message }, { status: 500 });
  }

  const stats = {
    total: (objectives ?? []).length,
    computed: 0,
    skipped_deferred: 0,
    skipped_same_value: 0,
    errors: 0,
    error_details: [] as Array<{ id: string; message: string }>,
  };

  const nowIso = new Date().toISOString();

  for (const obj of objectives ?? []) {
    try {
      const result = await dispatch(
        db,
        obj.metric_type as MetricType,
        (obj.metric_params ?? {}) as MetricParams
      );
      if (result === null) {
        stats.skipped_deferred += 1;
        continue;
      }
      if (Number(obj.current_value ?? NaN) === result) {
        // value unchanged — still bump last_computed_at so we know the handler ran
        await db
          .from("strategic_objectives")
          .update({ last_computed_at: nowIso })
          .eq("id", obj.id);
        stats.skipped_same_value += 1;
        continue;
      }
      const { error: upErr } = await db
        .from("strategic_objectives")
        .update({ current_value: result, last_computed_at: nowIso })
        .eq("id", obj.id);
      if (upErr) throw upErr;
      stats.computed += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      stats.errors += 1;
      stats.error_details.push({ id: obj.id, message: msg });
    }
  }

  return NextResponse.json({ ok: true, at: nowIso, stats });
}

// Allow GET for easy cron-without-body triggers
export async function GET(req: NextRequest) {
  return POST(req);
}
