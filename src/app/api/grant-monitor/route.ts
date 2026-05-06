/**
 * GET/POST /api/grant-monitor
 *
 * Monthly grant health monitor for CH and the Garage portfolio.
 *
 * Phase 1 — Grant pipeline scan (always runs):
 *   - Reads active Grant opportunities (Opportunities [OS v2], Type=Grant)
 *   - Categorises by Expected Close Date:
 *       P1   — < 30 days out
 *       WARN — 30–90 days out
 *       OK   — > 90 days
 *   - Reads active CH + Garage projects, cross-refs against open Grant
 *     opportunities, surfaces coverage gaps (entities with NO open grant)
 *
 * Phase 2 — Agreement expiry scan (deferred):
 *   - The original skill scans Agreements & Obligations [OS v2] for
 *     expiring agreement records. That DB ID is not yet hardcoded in
 *     src/lib/notion/core.ts, so this phase is a TODO. When that ID is
 *     wired up, extend fetchExpiringAgreements() below.
 *
 * Output is saved to Agent Drafts [OS v2] in execute mode.
 *
 * Auth: x-agent-key / CRON_SECRET header OR authenticated admin session.
 * Called by Vercel cron on the 1st of each month at 07:00 UTC.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { withRoutineLog } from "@/lib/routine-log";
import { createPageWithMirror } from "@/lib/notion-mirror-push";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB = {
  opportunities: "687caa98594a41b595c9960c141be0c0",
  projects:      "49d59b18095f46588960f2e717832c5f",
};

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
const dateStart = (p: any): string | null => p?.date?.start ?? null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const relIds = (p: any): string[] => Array.isArray(p?.relation) ? p.relation.map((r: { id: string }) => r.id) : [];

// ─── Data fetchers ────────────────────────────────────────────────────────────

interface GrantOpportunity {
  id:           string;
  name:         string;
  status:       string;
  scope:        string;
  closeDate:    string | null;
  daysToClose:  number | null;
  fitScore:     number | null;
  followUp:     string;
  organisationIds: string[];
  projectIds:   string[];
}

async function fetchActiveGrantOpportunities(): Promise<GrantOpportunity[]> {
  const OPEN = new Set(["New", "Qualifying", "Active", "Engaged", "Won", "Closed-Won"]);
  const today = new Date();

  const res = await notion.databases.query({
    database_id: DB.opportunities,
    filter: { property: "Opportunity Type", select: { equals: "Grant" } },
    page_size: 100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[])
    .map(p => {
      const closeDate = dateStart(p.properties["Expected Close Date"]);
      const daysToClose = closeDate
        ? Math.round((new Date(closeDate).getTime() - today.getTime()) / 86400_000)
        : null;
      // Fit Score field name varies — try common variants
      const fitScoreRaw =
          p.properties["Fit Score"]?.number
        ?? p.properties["Opportunity Score"]?.number
        ?? null;
      return {
        id:        p.id,
        name:      text(p.properties["Opportunity Name"]),
        status:    sel(p.properties["Opportunity Status"]),
        scope:     sel(p.properties["Scope"]),
        closeDate,
        daysToClose,
        fitScore:  typeof fitScoreRaw === "number" ? fitScoreRaw : null,
        followUp:  sel(p.properties["Follow-up Status"]),
        organisationIds: relIds(p.properties["Organization"]),
        projectIds:      relIds(p.properties["Linked Projects"]) ?? relIds(p.properties["Project"]),
      };
    })
    .filter(o => o.status === "" || OPEN.has(o.status));
}

interface ProjectSummary {
  id:        string;
  name:      string;
  stage:     string;
  workspace: string;
}

async function fetchActiveProjects(): Promise<ProjectSummary[]> {
  const ACTIVE = new Set(["Discovery", "Validation", "Execution", "Active"]);
  const res = await notion.databases.query({
    database_id: DB.projects,
    page_size: 60,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (res.results as any[])
    .filter(p => {
      const stage =
        sel(p.properties["Current Stage"]) ||
        sel(p.properties["Stage"]);
      return ACTIVE.has(stage);
    })
    .map(p => ({
      id:        p.id,
      name:      text(p.properties["Project Name"]),
      stage:     sel(p.properties["Current Stage"]) || sel(p.properties["Stage"]),
      workspace: sel(p.properties["Primary Workspace"]) || "hall",
    }));
}

// TODO: implement when Agreements [OS v2] DB ID is hardcoded in src/lib/notion/core.ts
// async function fetchExpiringAgreements(_warningDays: number): Promise<…> { … }

// ─── Categorise + gap detection ───────────────────────────────────────────────

interface Categorised {
  p1:        GrantOpportunity[];   // < 30 days
  warn:      GrantOpportunity[];   // 30–90 days
  ok:        GrantOpportunity[];   // > 90 days or no date
  pastDue:   GrantOpportunity[];   // closeDate in past but still open
}

function categorise(opps: GrantOpportunity[], expiryWarningDays: number): Categorised {
  const out: Categorised = { p1: [], warn: [], ok: [], pastDue: [] };
  for (const o of opps) {
    if (o.daysToClose === null) { out.ok.push(o); continue; }
    if (o.daysToClose < 0)        out.pastDue.push(o);
    else if (o.daysToClose < 30)  out.p1.push(o);
    else if (o.daysToClose <= expiryWarningDays) out.warn.push(o);
    else                          out.ok.push(o);
  }
  return out;
}

interface GapEntity {
  projectId:   string;
  projectName: string;
  workspace:   string;
}

function detectCoverageGaps(
  projects: ProjectSummary[],
  opps:     GrantOpportunity[]
): GapEntity[] {
  // A project has coverage if there is at least one open grant opportunity
  // linked to it via the "Linked Projects" / "Project" relation.
  const coveredProjectIds = new Set<string>();
  for (const o of opps) {
    for (const pid of o.projectIds) coveredProjectIds.add(pid);
  }
  return projects
    .filter(p => !coveredProjectIds.has(p.id))
    .map(p => ({ projectId: p.id, projectName: p.name, workspace: p.workspace }));
}

// ─── Render markdown ──────────────────────────────────────────────────────────

function fmtDate(s: string | null): string { return s ? s.slice(0, 10) : "—"; }

function render(
  opps:    GrantOpportunity[],
  cat:     Categorised,
  gaps:    GapEntity[],
  projects: ProjectSummary[],
  windowDays: number
): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Grant Monitor — Common House OS v2`);
  lines.push(`Generated: ${today}  |  Expiry warning window: ${windowDays} days`);
  lines.push("");
  lines.push("## Verdict");
  lines.push(`- Active grant opportunities: **${opps.length}**`);
  lines.push(`- 🔴 Past-due (Close Date passed, still open): **${cat.pastDue.length}**`);
  lines.push(`- 🟠 P1 closing < 30 days: **${cat.p1.length}**`);
  lines.push(`- 🟡 Warning closing 30–${windowDays} days: **${cat.warn.length}**`);
  lines.push(`- 🟢 OK (> ${windowDays} days or no date): ${cat.ok.length}`);
  lines.push(`- Active projects scanned: ${projects.length}`);
  lines.push(`- ⚪ Projects with **no open grant opportunity**: **${gaps.length}**`);
  lines.push("");

  if (cat.pastDue.length) {
    lines.push("## 🔴 Past-due grants (Status mismatch — close date already passed)");
    for (const o of cat.pastDue) {
      lines.push(`- **${o.name}** — closed ${fmtDate(o.closeDate)} (${Math.abs(o.daysToClose ?? 0)}d ago) · status=${o.status} · follow-up=${o.followUp || "—"}`);
    }
    lines.push("");
    lines.push("> Human action: confirm the grant outcome and either set Status to `Closed-Won` / `Closed-Lost` or update Close Date.");
    lines.push("");
  }

  if (cat.p1.length) {
    lines.push("## 🟠 P1 — closing within 30 days");
    for (const o of cat.p1) {
      lines.push(`- **${o.name}** — closes ${fmtDate(o.closeDate)} (${o.daysToClose}d) · ${o.scope}${o.fitScore != null ? ` · fit ${o.fitScore}` : ""} · follow-up=${o.followUp || "—"}`);
    }
    lines.push("");
  }

  if (cat.warn.length) {
    lines.push(`## 🟡 Warning — closing 30–${windowDays} days`);
    for (const o of cat.warn) {
      lines.push(`- ${o.name} — closes ${fmtDate(o.closeDate)} (${o.daysToClose}d)${o.fitScore != null ? ` · fit ${o.fitScore}` : ""}`);
    }
    lines.push("");
  }

  if (gaps.length) {
    lines.push("## ⚪ Coverage gaps — active projects with no open grant opportunity");
    const garage = gaps.filter(g => g.workspace === "garage");
    const hallEt = gaps.filter(g => g.workspace !== "garage");
    if (hallEt.length) {
      lines.push("**Common House projects:**");
      for (const g of hallEt) lines.push(`- ${g.projectName}`);
      lines.push("");
    }
    if (garage.length) {
      lines.push("**Garage portfolio startups:**");
      for (const g of garage) lines.push(`- ${g.projectName}`);
      lines.push("");
    }
    lines.push("> Human action: review whether each entity should have a grant in pipeline. If yes, run `/grant-radar` or `/create-or-update-opportunity` manually.");
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("_Phase 2 (agreement expiry scan over Agreements [OS v2]) deferred — DB ID not yet wired into `src/lib/notion/core.ts`. Add and extend `fetchExpiringAgreements()` to enable._");
  lines.push("");
  lines.push(`_skill_contract: opps_active=${opps.length}, p1=${cat.p1.length}, warn=${cat.warn.length}, past_due=${cat.pastDue.length}, gaps=${gaps.length}_`);

  return lines.join("\n");
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  if (!await authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const expiryWarningDays = typeof body?.grant_scan?.expiry_warning_days === "number"
    ? body.grant_scan.expiry_warning_days : 90;
  const candidates = body?.grant_scan?.candidates ?? "both";  // projects | startups | both
  const mode       = body.mode ?? "execute";

  // 1. Fetch
  const [opps, projectsAll] = await Promise.all([
    fetchActiveGrantOpportunities().catch(e => { console.error("[grant-monitor] opps fetch failed:", e); return [] as GrantOpportunity[]; }),
    fetchActiveProjects().catch(e => { console.error("[grant-monitor] projects fetch failed:", e); return [] as ProjectSummary[]; }),
  ]);

  // 2. Filter projects per candidates param
  const projects = projectsAll.filter(p => {
    if (candidates === "both") return true;
    if (candidates === "startups") return p.workspace === "garage";
    if (candidates === "projects") return p.workspace !== "garage";
    return true;
  });

  // 3. Categorise + detect gaps
  const cat  = categorise(opps, expiryWarningDays);
  const gaps = detectCoverageGaps(projects, opps);

  // 4. Render markdown
  const markdown = render(opps, cat, gaps, projects, expiryWarningDays);

  // 5. Persist to Agent Drafts (execute mode only)
  let draftId: string | null = null;
  if (mode === "execute" && (opps.length > 0 || projects.length > 0)) {
    const today = new Date().toISOString().slice(0, 10);
    const created = await createPageWithMirror({
      table: "notion_agent_drafts",
      fields: {
        title:      `Grant Monitor — ${today}`,
        draft_type: "Health Report",
        status:     "Pending Review",
        draft_text: markdown.slice(0, 1990),
      },
      mirrorOnly: { created_date: today },
    });
    if (created.ok) draftId = created.id ?? null;
    else console.error("[grant-monitor] draft create failed:", created.error);
  }

  return NextResponse.json({
    ok:               true,
    mode,
    run_date:         new Date().toISOString(),
    expiry_warning_days: expiryWarningDays,
    records_read:     opps.length + projects.length,
    records_written:  draftId ? 1 : 0,
    counts: {
      opps_active:    opps.length,
      p1:             cat.p1.length,
      warn:           cat.warn.length,
      ok:             cat.ok.length,
      past_due:       cat.pastDue.length,
      coverage_gaps:  gaps.length,
      projects_scanned: projects.length,
    },
    p1_grants:        cat.p1,
    past_due_grants:  cat.pastDue,
    coverage_gaps:    gaps,
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

export const POST = withRoutineLog("grant-monitor", _handler);
export const GET  = POST;
