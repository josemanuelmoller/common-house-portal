/**
 * POST /api/grant-radar
 *
 * Searches the web for currently open grant calls, ranked by fit for:
 *   1. COMMON HOUSE GRANTS — top 5 for CH as applicant
 *   2. PORTFOLIO GRANTS    — top 5 matching active Garage (startup) projects
 *   3. URGENT DEADLINES    — any closing within 30 days
 *
 * In execute mode, creates Grant opportunity records in Opportunities [OS v2].
 * In dry_run (default), returns proposed opportunities without writing.
 *
 * Uses Anthropic API with web search (anthropic-beta: web-search-2025-03-05).
 *
 * Auth: x-agent-key / CRON_SECRET header OR authenticated admin session.
 * Called by Vercel cron every other Wednesday at 07:00 UTC.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@notionhq/client";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/clients";
import { withRoutineLog } from "@/lib/routine-log";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const notion    = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DB_PROJECTS      = "49d59b18095f46588960f2e717832c5f";
const DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  const expected  = process.env.CRON_SECRET;
  if (expected && agentKey === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`) return true;
  try {
    const { userId } = await auth();
    if (userId && isAdminUser(userId)) return true;
  } catch { /* no-op */ }
  return false;
}

// ─── Notion helpers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const text = (p: any) => p?.title?.[0]?.plain_text ?? p?.rich_text?.[0]?.plain_text ?? "";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sel  = (p: any) => p?.select?.name ?? "";

interface ProjectSummary {
  id: string;
  name: string;
  stage: string;
  workspace: string;   // "hall" | "workroom" | "garage"
  statusSummary: string;
  sector: string;
}

async function fetchActiveProjects(): Promise<{ ch: ProjectSummary[]; startups: ProjectSummary[] }> {
  const ACTIVE = new Set(["Discovery", "Validation", "Execution", "Active"]);

  const res = await notion.databases.query({
    database_id: DB_PROJECTS,
    page_size: 40,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = (res.results as any[])
    .filter(p => ACTIVE.has(sel(p.properties["Stage"])))
    .map(p => ({
      id:            p.id,
      name:          text(p.properties["Project Name"]),
      stage:         sel(p.properties["Stage"]),
      workspace:     sel(p.properties["Primary Workspace"]) || "hall",
      statusSummary: text(p.properties["Status Summary"]).slice(0, 200),
      sector:        sel(p.properties["Sector"]) || sel(p.properties["Tags"]) || "",
    }));

  return {
    ch:       all.filter(p => p.workspace !== "garage"),
    startups: all.filter(p => p.workspace === "garage"),
  };
}

async function dedupeGrantCheck(grantName: string): Promise<boolean> {
  try {
    const res = await notion.databases.query({
      database_id: DB_OPPORTUNITIES,
      filter: {
        and: [
          { property: "Opportunity Type", select: { equals: "Grant" } },
          { property: "Opportunity Name", title: { contains: grantName.slice(0, 40) } },
        ],
      },
      page_size: 1,
    });
    return res.results.length > 0;
  } catch {
    return false;
  }
}

// ─── Grant opportunity record ─────────────────────────────────────────────────

interface GrantOpportunity {
  name: string;
  funder: string;
  program: string;
  summary: string;
  deadline: string | null;
  amount: string | null;
  sourceUrl: string;
  fitScore: number;
  scope: "Common House" | "Portfolio Startup";
  startup?: string;
  urgency: "P1" | "P2" | "P3";
}

async function createGrantOpportunity(opp: GrantOpportunity): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      "Opportunity Name":  { title: [{ text: { content: opp.name.slice(0, 200) } }] },
      "Opportunity Type":  { select: { name: "Grant" } },
      "Opportunity Status":{ select: { name: "New" } },
      "Scope":             { select: { name: opp.scope === "Common House" ? "CH" : "Portfolio" } },
      "Priority":          { select: { name: urgencyToPriority(opp.urgency) } },
      "Source URL":        { url: opp.sourceUrl || null },
      "Why There Is Fit":  { rich_text: [{ text: { content: opp.summary.slice(0, 2000) } }] },
      "Notes":             { rich_text: [{ text: { content: buildNotes(opp) } }] },
      "Trigger / Signal":  { rich_text: [{ text: { content: `Grant Radar — fit score ${opp.fitScore}/100${opp.amount ? ` · ${opp.amount}` : ""}` } }] },
    };

    // Correct field name is "Expected Close Date", not "Deadline"
    if (opp.deadline) {
      properties["Expected Close Date"] = { date: { start: opp.deadline } };
    }

    const page = await notion.pages.create({
      parent: { database_id: DB_OPPORTUNITIES },
      properties,
    });
    return page.id;
  } catch (err) {
    console.error("[grant-radar] create opportunity failed:", err);
    return null;
  }
}

function urgencyToPriority(urgency: "P1" | "P2" | "P3"): string {
  const map: Record<string, string> = {
    P1: "P1 — Act Now",
    P2: "P2 — This Quarter",
    P3: "P3 — Backlog",
  };
  return map[urgency] ?? "P3 — Backlog";
}

function buildNotes(opp: GrantOpportunity): string {
  const lines = [
    `Grant Radar — auto-detected ${new Date().toISOString().slice(0, 10)}`,
    `Funder: ${opp.funder}`,
    `Program: ${opp.program}`,
    opp.amount ? `Amount: ${opp.amount}` : null,
    opp.deadline ? `Deadline: ${opp.deadline}` : null,
    `Fit Score: ${opp.fitScore}/100`,
    opp.scope === "Portfolio Startup" && opp.startup ? `Matched to: ${opp.startup}` : null,
    `Source: ${opp.sourceUrl}`,
    "",
    opp.summary,
  ].filter(Boolean);
  return lines.join("\n").slice(0, 2000);
}

// ─── Claude + web search ──────────────────────────────────────────────────────

async function runGrantRadar(
  chProjects: ProjectSummary[],
  startupProjects: ProjectSummary[],
): Promise<{ opportunities: GrantOpportunity[]; rawReport: string }> {
  const today = new Date().toISOString().slice(0, 10);

  const chContext = chProjects.length > 0
    ? chProjects.map(p => `- ${p.name} [${p.stage}]${p.sector ? ` — ${p.sector}` : ""}${p.statusSummary ? `: ${p.statusSummary.slice(0, 100)}` : ""}`).join("\n")
    : "- Common House (circular economy consultancy and accelerator)";

  const startupContext = startupProjects.length > 0
    ? startupProjects.map(p => `- ${p.name} [${p.stage}]${p.sector ? ` — ${p.sector}` : ""}${p.statusSummary ? `: ${p.statusSummary.slice(0, 100)}` : ""}`).join("\n")
    : "- (no active Garage projects found)";

  const prompt = `You are the Grant Radar Agent for Common House OS v2. Today is ${today}.

## About Common House (CH)
Common House is a UK-based circular economy consultancy and accelerator. It:
- Advises retailers (Co-op, Waitrose, Tesco, Sainsbury's, Morrisons) on refill and reuse systems
- Runs an accelerator for circular economy startups (the Garage)
- Operates across reuse, packaging, sustainability, FMCG, and retail sectors
- Is UK-based with EU reach
- Has previously accessed: Innovate UK, Horizon Europe, SUFI (Sustainable Futures Innovate), WRAP grants

## CH's active projects
${chContext}

## Portfolio startups (Garage)
${startupContext}

---

## Your task
Search the web for **currently open** grant calls (deadline not yet passed as of today ${today}) that are a strong fit for either:
1. Common House as direct applicant/lead
2. One or more of the portfolio startups listed above

Focus on:
- UK grants: Innovate UK, UKRI, WRAP, Nesta, Innovate Edge, Sustainable Markets Initiative, Innovate Edge, DEFRA, DESNZ
- EU grants: Horizon Europe, LIFE Programme, EIT Climate-KIC, EIC Accelerator
- Foundation funding: Ellen MacArthur Foundation, Ellen MacArthur Ocean Plastic, Laudes Foundation, Esmée Fairbairn, Impact on Urban Health
- Sector-specific: circular economy, reuse, packaging, sustainability, retail innovation, climate tech

For each grant found, evaluate:
- Is the deadline genuinely in the future (after ${today})?
- Is CH or a startup structurally eligible?
- What is the fit score 0-100?

---

## Output format
Return a JSON array of grant opportunities found, followed by a human-readable report.

Each JSON object:
{
  "name": "short descriptive name e.g. 'Innovate UK — Smart Sustainable Packaging 2025'",
  "funder": "funder organisation name",
  "program": "grant programme name",
  "summary": "2-3 sentences: what the grant funds + why CH or the startup is a strong fit",
  "deadline": "YYYY-MM-DD or null if unknown",
  "amount": "e.g. '£50K–£500K' or null if unknown",
  "sourceUrl": "direct URL to the grant page or announcement",
  "fitScore": 0-100,
  "scope": "Common House" | "Portfolio Startup",
  "startup": "startup project name if scope is Portfolio Startup, else null",
  "urgency": "P1" (deadline < 30 days) | "P2" (30-90 days) | "P3" (90+ days or unknown)
}

After the JSON, write a human-readable report with:

━━━ COMMON HOUSE GRANTS (top 5) ━━━
[ranked by fit score, focus on CH as applicant]

━━━ PORTFOLIO GRANTS (top 5) ━━━
[ranked by fit score, matched to specific startups]

━━━ URGENT DEADLINES ━━━
[any with deadline within 30 days — P1 only]`;

  // Use Anthropic API with web search beta
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (anthropic as any).beta.messages.create({
    model:      "claude-sonnet-4-5",
    max_tokens: 8192,
    betas:      ["web-search-2025-03-05"],
    tools:      [{ type: "web_search_20250305", name: "web_search", max_uses: 15 }],
    messages:   [{ role: "user", content: prompt }],
  });

  // Extract text blocks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawText = response.content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === "text")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text)
    .join("\n");

  // Parse JSON array
  let opportunities: GrantOpportunity[] = [];
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*?\]/);
    if (jsonMatch) {
      opportunities = JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.warn("[grant-radar] Could not parse JSON opportunities from response");
  }

  return { opportunities, rawReport: rawText };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  if (!await authCheck(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const mode = body.mode ?? "dry_run";

  // 1. Fetch active projects
  const { ch: chProjects, startups } = await fetchActiveProjects().catch(() => ({
    ch: [] as ProjectSummary[],
    startups: [] as ProjectSummary[],
  }));

  // 2. Run grant radar
  const { opportunities, rawReport } = await runGrantRadar(chProjects, startups);

  // 3. Rank + top 5 each section
  const chOpps      = opportunities.filter(o => o.scope === "Common House")
    .sort((a, b) => b.fitScore - a.fitScore).slice(0, 5);
  const startupOpps = opportunities.filter(o => o.scope === "Portfolio Startup")
    .sort((a, b) => b.fitScore - a.fitScore).slice(0, 5);
  const urgent      = opportunities.filter(o => o.urgency === "P1");

  const results = {
    total:            opportunities.length,
    ch_top5:          chOpps.length,
    startup_top5:     startupOpps.length,
    urgent:           urgent.length,
    created:          0,
    duplicate_skipped:0,
    dry_run_proposed: 0,
    errors:           0,
  };

  // 4. Write to Notion (execute mode only)
  if (mode === "execute") {
    const allTop = [...chOpps, ...startupOpps];
    for (const opp of allTop) {
      const isDup = await dedupeGrantCheck(opp.name);
      if (isDup) {
        results.duplicate_skipped++;
        continue;
      }
      const id = await createGrantOpportunity(opp);
      if (id) results.created++;
      else results.errors++;
    }
  } else {
    results.dry_run_proposed = chOpps.length + startupOpps.length;
  }

  return NextResponse.json({
    ok:         true,
    mode,
    run_date:   new Date().toISOString(),
    context: {
      ch_projects:     chProjects.map(p => p.name),
      startup_projects: startups.map(p => p.name),
    },
    results,
    top5_ch:      chOpps,
    top5_startups: startupOpps,
    urgent,
    report: rawReport,
  });
}

// Vercel cron calls GET — inject mode:"execute" and delegate via the same
// observability wrapper so both manual POST and cron GET log runs identically.
async function _handler(req: NextRequest): Promise<Response> {
  if (req.method === "GET") {
    const cronReq = new Request(req.url, {
      method: "POST",
      headers: req.headers,
      body:    JSON.stringify({ mode: "execute" }),
    }) as NextRequest;
    return _POST(cronReq);
  }
  return _POST(req);
}

export const POST = withRoutineLog("grant-radar", _handler);
export const GET = POST;
