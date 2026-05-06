/**
 * GET/POST /api/portfolio-health
 *
 * Weekly portfolio pulse for Common House.
 *
 * Phase 1 — Relationship at-risk scan:
 *   - Reads Supabase `people` (contact_warmth in Cold/Dormant)
 *   - Reports top at-risk contacts that may need warming up
 *   - Note: warmth itself is computed by /api/relationship-warmth (bi-weekly).
 *     This route surfaces the result, it does not recompute.
 *
 * Phase 2 — Startup opportunity coverage gap:
 *   - Reads Supabase `organizations` (org_category = Startup, active relationship)
 *   - Reads open Notion Opportunities by Type (CH Sale | Investor Match | Grant)
 *   - For each startup, identifies missing opportunity types
 *   - Flags stale opportunities (status=New, > 45 days old)
 *
 * Output is saved to Agent Drafts [OS v2].
 *
 * Auth: x-agent-key / CRON_SECRET header OR authenticated admin session.
 * Called by Vercel cron weekly Mondays at 06:30 UTC.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { withRoutineLog } from "@/lib/routine-log";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createPageWithMirror } from "@/lib/notion-mirror-push";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && agentKey === expected) return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const { userId } = await auth();
    if (userId && isAdminUser(userId)) return true;
  } catch { /* no-op */ }
  return false;
}

// ─── Notion helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const text = (p: any): string => p?.title?.[0]?.plain_text ?? p?.rich_text?.[0]?.plain_text ?? "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sel  = (p: any): string => p?.select?.name ?? "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const relIds = (p: any): string[] => Array.isArray(p?.relation) ? p.relation.map((r: { id: string }) => r.id) : [];

// ─── Data fetchers ────────────────────────────────────────────────────────────

interface Person {
  id:               string;
  name:             string;
  email:            string | null;
  warmth:           string | null;
  lastContactDate:  string | null;
  daysSinceContact: number | null;
}

async function fetchAtRiskPeople(): Promise<Person[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("people")
    .select("id, full_name, display_name, email, contact_warmth, last_contact_date")
    .is("dismissed_at", null)
    .in("contact_warmth", ["Cold", "Dormant"]);

  if (error) {
    console.error("[portfolio-health] people fetch failed:", error.message);
    return [];
  }
  const today = Date.now();
  return (data ?? []).map(p => {
    const last = p.last_contact_date ? new Date(p.last_contact_date).getTime() : null;
    return {
      id:    p.id,
      name:  (p.full_name ?? p.display_name ?? "").trim(),
      email: p.email ?? null,
      warmth: p.contact_warmth ?? null,
      lastContactDate: p.last_contact_date ?? null,
      daysSinceContact: last ? Math.round((today - last) / 86400_000) : null,
    };
  }).filter(p => p.name !== "");
}

interface StartupOrg {
  notionId:           string;
  name:               string;
  relationshipStage:  string | null;
  startupStage:       string | null;
}

async function fetchActiveStartups(): Promise<StartupOrg[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("organizations")
    .select("notion_id, name, relationship_stage, startup_stage, org_category")
    .eq("org_category", "Startup");

  if (error) {
    console.error("[portfolio-health] startups fetch failed:", error.message);
    return [];
  }
  return (data ?? []).map(o => ({
    notionId:          o.notion_id,
    name:              o.name,
    relationshipStage: o.relationship_stage,
    startupStage:      o.startup_stage,
  }));
}

interface OppRow {
  id:               string;
  name:             string;
  type:             string;          // CH Sale | Investor Match | Grant | Partnership
  status:           string;
  scope:            string;
  followUp:         string;
  createdTime:      string;
  ageDays:          number;
  organisationIds:  string[];
}

async function fetchOpenOpportunities(types: string[]): Promise<OppRow[]> {
  const OPEN = new Set(["New", "Qualifying", "Active", "Engaged", "Proposal Sent"]);
  const today = Date.now();

  // Fetch all open opps in matching types.
  const all: OppRow[] = [];
  for (const t of types) {
    const res = await notion.databases.query({
      database_id: DB_OPPORTUNITIES,
      filter: { property: "Opportunity Type", select: { equals: t } },
      page_size: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (res.results as any[])) {
      const status = sel(p.properties["Opportunity Status"]);
      if (status && !OPEN.has(status)) continue;
      const createdTime = p.created_time ?? new Date().toISOString();
      all.push({
        id:               p.id,
        name:             text(p.properties["Opportunity Name"]),
        type:             sel(p.properties["Opportunity Type"]),
        status,
        scope:            sel(p.properties["Scope"]),
        followUp:         sel(p.properties["Follow-up Status"]),
        createdTime,
        ageDays:          Math.round((today - new Date(createdTime).getTime()) / 86400_000),
        organisationIds:  relIds(p.properties["Organization"]),
      });
    }
  }
  return all;
}

// ─── Gap analysis ─────────────────────────────────────────────────────────────

interface StartupGap {
  org:               StartupOrg;
  hasChSale:         boolean;
  hasInvestorMatch:  boolean;
  hasGrant:          boolean;
  missingTypes:      string[];
  staleNew:          number;        // open at status=New for > 45 days
}

const STALE_NEW_DAYS = 45;

function analyseStartupGaps(startups: StartupOrg[], opps: OppRow[], checks: { ch_sale: boolean; investor_match: boolean; grant: boolean }): StartupGap[] {
  // Index opps by org id
  const oppsByOrg = new Map<string, OppRow[]>();
  for (const o of opps) {
    for (const orgId of o.organisationIds) {
      const cur = oppsByOrg.get(orgId) ?? [];
      cur.push(o);
      oppsByOrg.set(orgId, cur);
    }
  }

  return startups.map(s => {
    const list = oppsByOrg.get(s.notionId) ?? [];
    const types = new Set(list.map(o => o.type));
    const hasChSale        = types.has("CH Sale");
    const hasInvestorMatch = types.has("Investor Match");
    const hasGrant         = types.has("Grant");

    const missing: string[] = [];
    if (checks.ch_sale        && !hasChSale)        missing.push("CH Sale");
    if (checks.investor_match && !hasInvestorMatch) missing.push("Investor Match");
    if (checks.grant          && !hasGrant)         missing.push("Grant");

    const staleNew = list.filter(o => o.status === "New" && o.ageDays > STALE_NEW_DAYS).length;

    return {
      org: s,
      hasChSale,
      hasInvestorMatch,
      hasGrant,
      missingTypes: missing,
      staleNew,
    };
  });
}

// ─── Render markdown ──────────────────────────────────────────────────────────

function fmt(n: number | null): string { return n == null ? "—" : String(n); }

function render(
  atRisk:     Person[],
  startups:   StartupOrg[],
  gaps:       StartupGap[],
  opps:       OppRow[]
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];

  const fullCovered  = gaps.filter(g => g.missingTypes.length === 0);
  const partial      = gaps.filter(g => g.missingTypes.length > 0 && g.missingTypes.length < 3);
  const zeroCoverage = gaps.filter(g => g.missingTypes.length === 3);
  const totalMissing = gaps.reduce((a, g) => a + g.missingTypes.length, 0);
  const missingByType = {
    chSale:    gaps.filter(g => g.missingTypes.includes("CH Sale")).length,
    investor:  gaps.filter(g => g.missingTypes.includes("Investor Match")).length,
    grant:     gaps.filter(g => g.missingTypes.includes("Grant")).length,
  };
  const totalStaleNew = gaps.reduce((a, g) => a + g.staleNew, 0);

  lines.push(`# Portfolio Health — Common House OS v2`);
  lines.push(`Generated: ${today}`);
  lines.push("");
  lines.push("## Verdict");
  lines.push(`- Active startups scanned: **${startups.length}**`);
  lines.push(`- 🟢 Fully covered (CH Sale + Investor Match + Grant): ${fullCovered.length}`);
  lines.push(`- 🟡 Partial coverage: **${partial.length}**`);
  lines.push(`- 🔴 Zero opportunities (all 3 types missing): **${zeroCoverage.length}**`);
  lines.push(`- Open opportunities total: ${opps.length}`);
  lines.push(`- Stale opportunities (Status=New, > ${STALE_NEW_DAYS}d): **${totalStaleNew}**`);
  lines.push(`- Cold/Dormant contacts: **${atRisk.length}**`);
  lines.push("");

  // P1: zero coverage startups
  if (zeroCoverage.length) {
    lines.push("## 🔴 P1 — Active startups with **zero** open opportunities");
    for (const g of zeroCoverage) {
      lines.push(`- **${g.org.name}**${g.org.startupStage ? ` (${g.org.startupStage})` : ""}${g.org.relationshipStage ? ` · ${g.org.relationshipStage}` : ""}`);
    }
    lines.push("");
    lines.push("> Human action: investigate why these have no commercial activity. Run `/startup-opportunity-scout` per startup or trigger via portfolio review.");
    lines.push("");
  }

  // Partial coverage
  if (partial.length) {
    lines.push("## 🟡 Coverage gaps by startup");
    lines.push("");
    lines.push("| Startup | CH Sale | Investor Match | Grant | Missing |");
    lines.push("|---|---|---|---|---|");
    for (const g of partial.sort((a, b) => b.missingTypes.length - a.missingTypes.length)) {
      lines.push(`| ${g.org.name} | ${g.hasChSale ? "✅" : "—"} | ${g.hasInvestorMatch ? "✅" : "—"} | ${g.hasGrant ? "✅" : "—"} | ${g.missingTypes.join(", ")} |`);
    }
    lines.push("");
    lines.push(`**Missing by type:** CH Sale: ${missingByType.chSale} · Investor Match: ${missingByType.investor} · Grant: ${missingByType.grant}  ·  Total gap slots: ${totalMissing}`);
    lines.push("");
  }

  // Stale opportunities
  if (totalStaleNew > 0) {
    const staleStartups = gaps.filter(g => g.staleNew > 0);
    lines.push(`## 🟡 Stale opportunities (Status=New, > ${STALE_NEW_DAYS}d)`);
    for (const g of staleStartups) {
      lines.push(`- ${g.org.name}: ${g.staleNew} stale`);
    }
    lines.push("");
    lines.push("> Human action: move forward (Qualifying / Active) or close out. Stale `New` opportunities pollute the pipeline.");
    lines.push("");
  }

  // At-risk contacts
  if (atRisk.length) {
    const dormant = atRisk.filter(p => p.warmth === "Dormant");
    const cold    = atRisk.filter(p => p.warmth === "Cold");
    lines.push("## ⚪ Cold + Dormant contacts");
    lines.push(`- Cold (31–60d): **${cold.length}**`);
    lines.push(`- Dormant (60d+ or never): **${dormant.length}**`);
    lines.push("");
    if (cold.length) {
      lines.push("**Top Cold contacts (warm-up candidates):**");
      const top = cold.sort((a, b) => (a.daysSinceContact ?? 0) - (b.daysSinceContact ?? 0)).slice(0, 10);
      for (const p of top) lines.push(`- ${p.name}${p.email ? ` <${p.email}>` : ""} — last contact ${fmt(p.daysSinceContact)}d ago`);
      lines.push("");
    }
    lines.push("> Human action: pick 2–3 from Cold list per week and queue a check-in via `/draft-checkin`.");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`_skill_contract: startups=${startups.length}, p1_zero_coverage=${zeroCoverage.length}, partial=${partial.length}, missing_total=${totalMissing}, stale_new=${totalStaleNew}, at_risk_contacts=${atRisk.length}_`);
  return lines.join("\n");
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  if (!await authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const checks = {
    ch_sale:        body?.opportunity_scope?.checks?.ch_sale        !== false,
    investor_match: body?.opportunity_scope?.checks?.investor_match !== false,
    grant:          body?.opportunity_scope?.checks?.grant          !== false,
  };
  const mode = body.mode ?? "execute";

  const enabledTypes: string[] = [];
  if (checks.ch_sale)        enabledTypes.push("CH Sale");
  if (checks.investor_match) enabledTypes.push("Investor Match");
  if (checks.grant)          enabledTypes.push("Grant");

  // 1. Fetch in parallel
  const [atRisk, startups, opps] = await Promise.all([
    fetchAtRiskPeople().catch(e => { console.error("[portfolio-health] people:", e); return [] as Person[]; }),
    fetchActiveStartups().catch(e => { console.error("[portfolio-health] startups:", e); return [] as StartupOrg[]; }),
    fetchOpenOpportunities(enabledTypes).catch(e => { console.error("[portfolio-health] opps:", e); return [] as OppRow[]; }),
  ]);

  // 2. Gap analysis
  const gaps = analyseStartupGaps(startups, opps, checks);

  // 3. Render
  const markdown = render(atRisk, startups, gaps, opps);

  // 4. Persist
  let draftId: string | null = null;
  if (mode === "execute" && (startups.length > 0 || atRisk.length > 0)) {
    const today = new Date().toISOString().slice(0, 10);
    const created = await createPageWithMirror({
      table: "notion_agent_drafts",
      fields: {
        title:      `Portfolio Health — ${today}`,
        draft_type: "Health Report",
        status:     "Pending Review",
        draft_text: markdown.slice(0, 1990),
      },
      mirrorOnly: { created_date: today },
    });
    if (created.ok) draftId = created.id ?? null;
    else console.error("[portfolio-health] draft create failed:", created.error);
  }

  const zeroCoverage = gaps.filter(g => g.missingTypes.length === 3).length;
  const partial      = gaps.filter(g => g.missingTypes.length > 0 && g.missingTypes.length < 3).length;
  const totalStaleNew = gaps.reduce((a, g) => a + g.staleNew, 0);

  return NextResponse.json({
    ok:               true,
    mode,
    run_date:         new Date().toISOString(),
    records_read:     atRisk.length + startups.length + opps.length,
    records_written:  draftId ? 1 : 0,
    counts: {
      at_risk_contacts:  atRisk.length,
      startups_scanned:  startups.length,
      opportunities:     opps.length,
      p1_zero_coverage:  zeroCoverage,
      partial_coverage:  partial,
      stale_new:         totalStaleNew,
    },
    p1_zero_coverage_startups: gaps.filter(g => g.missingTypes.length === 3).map(g => ({ name: g.org.name, notion_id: g.org.notionId })),
    draft_id:         draftId,
    markdown,
  });
}

async function _handler(req: NextRequest): Promise<Response> {
  if (req.method === "GET") {
    const cronReq = new Request(req.url, {
      method:  "POST",
      headers: req.headers,
      body:    JSON.stringify({ mode: "execute" }),
    }) as NextRequest;
    return _POST(cronReq);
  }
  return _POST(req);
}

export const POST = withRoutineLog("portfolio-health", _handler);
export const GET  = POST;
