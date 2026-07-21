import { NextResponse } from "next/server"
import {
  getAllProjects,
  getDecisionItems,
  getContentPipeline,
  getAgentDrafts,
  getAllEvidence,
} from "@/lib/notion"
import { getSupabaseServerClient } from "@/lib/supabase-server"

function relDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return "Hoy"
  if (diffDays === 1) return "Ayer"
  const MO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
  return `${d.getDate()} ${MO[d.getMonth()]}`
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 60) return `hace ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h}h`
  return `hace ${Math.floor(h / 24)}d`
}

// Wave 5 CR5: previously this route returned `Access-Control-Allow-Origin: *`,
// which let any origin scrape the entire CH portfolio + decision pipeline from
// a victim's browser. Lock to portal origin + the public marketing site;
// server-to-server scrapers (curl) still work, but the browser cannot share
// the response cross-origin with hostile JavaScript.
const ALLOWED_HALL_ORIGINS = new Set<string>([
  "https://portal.wearecommonhouse.com",
  "https://wearecommonhouse.com",
  "https://www.wearecommonhouse.com",
  "http://localhost:3000",
])

function corsHeadersFor(req: Request) {
  const origin = req.headers.get("origin") ?? ""
  const allow = ALLOWED_HALL_ORIGINS.has(origin) ? origin : ""
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "s-maxage=180, stale-while-revalidate=60",
  }
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeadersFor(req) })
}

export async function GET(req: Request) {
  try {
    // Reads migrated OFF Notion → Supabase getters (post-cutoff). Each getter
    // swallows its own errors and returns [] so one failing source never blanks
    // out the whole Hall dashboard. `sourceErrors` is retained for agentPulse.
    const sourceErrors: Record<string, boolean> = {}

    const [allProjects, decisionItems, contentItems, draftItems, evidenceItems] = await Promise.all([
      getAllProjects(),               // Active projects, ordered by last status update
      getDecisionItems("Open"),       // decision_items where status = Open
      getContentPipeline("Review"),   // content_pipeline_items where status = Review
      getAgentDrafts("Pending Review"), // agent_drafts where status = Pending Review
      getAllEvidence("New"),          // evidence where validation_status = New
    ])

    // Parse projects (cap at 20 to match the previous page_size).
    const projects = allProjects.slice(0, 20).map(pr => {
      const workspace = pr.primaryWorkspace || "hall"
      return {
        id: pr.id,
        name: pr.name,
        stage: pr.stage,
        type: workspace === "garage" ? "Garage" : workspace === "workroom" ? "Workroom" : "Hall",
        lastUpdate: relDate(pr.lastUpdate),
        geography: pr.geography[0] ?? "",
        updateNeeded: pr.updateNeeded,
      }
    })

    // Parse decision items — surface P1 Critical/High at top.
    // Priority values in Decision Items [OS v2]: "P1 Critical" | "High" | "Medium" | "Low"
    const PRIORITY_ORDER: Record<string, number> = { "P1 Critical": 0, High: 1, Medium: 2, Low: 3 }
    const decisions = decisionItems
      .slice(0, 10)
      .map(d => ({
        id: d.id,
        title: d.title,
        priority: d.priority || "Normal",
        type: d.decisionType || "",
        category: "Decisions" as const,
      }))
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))

    // Counts (cap content/drafts to the previous page_size fetch limits).
    const contentInReview = Math.min(contentItems.length, 5)
    const agentDraftsPending = Math.min(draftItems.length, 5)
    const evidenceNewCount = evidenceItems.length

    // Build pending items (top decisions + summary rows for other queues)
    const pendingItems = decisions.slice(0, 3).map(d => ({
      id: d.id,
      title: d.title,
      priority: d.priority,
      category: "Decisions",
    }))

    // Stats
    const workroomCount = projects.filter(p => p.type === "Workroom").length
    const garageCount   = projects.filter(p => p.type === "Garage").length
    const pendingTotal  = decisions.length + contentInReview + agentDraftsPending

    const pendingParts: string[] = []
    if (decisions.length)     pendingParts.push(`${decisions.length} Decisiones`)
    if (contentInReview)      pendingParts.push(`${contentInReview} Content`)
    if (agentDraftsPending)   pendingParts.push(`${agentDraftsPending} Drafts`)
    if (evidenceNewCount > 0) pendingParts.push(`${evidenceNewCount}+ Evidencia`)

    const stats = {
      activeProjects: projects.length,
      workrooms: workroomCount,
      garage: garageCount,
      pendingCount: pendingTotal,
      pendingBreakdown: pendingParts.join(" · ") || "Todo al día",
    }

    // Agent pulse from Supabase (agent_runs table). Uses server helper which
    // falls back from SUPABASE_SERVICE_KEY to SUPABASE_ANON_KEY when service key
    // is absent — agent_runs is RLS-readable by anon, so the fallback is valid.
    let agentPulse: { agent: string; status: string; timeAgo: string }[] = []
    try {
      const supabase = getSupabaseServerClient()
      const { data, error } = await supabase
        .from("agent_runs")
        .select("agent_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100)

      if (error) {
        sourceErrors.agentPulse = true
        console.error("[hall-data] agent_runs query failed:", error.message)
      } else if (data) {
        const seen = new Set<string>()
        agentPulse = data
          .filter(row => {
            if (seen.has(row.agent_name)) return false
            seen.add(row.agent_name)
            return true
          })
          .slice(0, 5)
          .map(row => ({
            agent: row.agent_name,
            status: row.status as string,
            timeAgo: timeAgo(row.created_at as string),
          }))
      }
    } catch (err) {
      sourceErrors.agentPulse = true
      console.error("[hall-data] supabase client unavailable:", err)
    }

    return NextResponse.json(
      {
        projects,
        pendingItems,
        contentInReview,
        agentDraftsPending,
        evidenceNew: evidenceNewCount,
        agentPulse,
        stats,
        fetchedAt: new Date().toISOString(),
        ...(Object.keys(sourceErrors).length ? { sourceErrors } : {}),
      },
      { headers: corsHeadersFor(req) }
    )
  } catch (err) {
    console.error("[hall-data] unexpected error:", err)
    return NextResponse.json(
      { error: "Failed to fetch hall data" },
      { status: 500, headers: corsHeadersFor(req) }
    )
  }
}
