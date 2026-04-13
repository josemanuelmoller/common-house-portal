import { NextResponse } from "next/server"
import { notion, DB } from "@/lib/notion"
import { createClient } from "@supabase/supabase-js"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = any

function text(p: AnyPage): string {
  return p?.rich_text?.[0]?.plain_text ?? p?.title?.[0]?.plain_text ?? ""
}
function sel(p: AnyPage): string {
  return p?.select?.name ?? ""
}
function ms(p: AnyPage): string[] {
  return p?.multi_select?.map((s: AnyPage) => s.name) ?? []
}
function dt(p: AnyPage): string | null {
  return p?.date?.start ?? null
}

function titleOf(page: AnyPage): string {
  // Notion title property — could be named anything; find the "title" type
  const props = page.properties ?? {}
  for (const val of Object.values(props) as AnyPage[]) {
    if (val?.type === "title" && val?.title?.[0]?.plain_text) {
      return val.title[0].plain_text
    }
  }
  return "Untitled"
}

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

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "s-maxage=180, stale-while-revalidate=60",
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function GET() {
  try {
    // Run all Notion queries in parallel
    const [projectsRes, decisionsRes, contentRes, agentDraftsRes, evidenceRes] = await Promise.all([
      notion.databases.query({
        database_id: DB.projects,
        filter: { property: "Project Status", select: { equals: "Active" } },
        sorts: [{ property: "Last Status Update", direction: "descending" }],
        page_size: 20,
      }),
      notion.databases.query({
        database_id: DB.decisions,
        filter: { property: "Status", select: { equals: "Open" } },
        sorts: [{ property: "Priority", direction: "ascending" }],
        page_size: 10,
      }),
      notion.databases.query({
        database_id: DB.contentPipeline,
        filter: { property: "Status", select: { equals: "In Review" } },
        page_size: 5,
      }),
      notion.databases.query({
        database_id: DB.agentDrafts,
        filter: { property: "Status", select: { equals: "Pending Review" } },
        page_size: 5,
      }),
      notion.databases.query({
        database_id: DB.evidence,
        filter: { property: "Validation Status", select: { equals: "New" } },
        page_size: 1, // we only need the count
      }),
    ])

    // Parse projects
    const projects = (projectsRes.results as AnyPage[]).map(page => {
      const p = page.properties
      const workspace = sel(p["Primary Workspace"]) || "hall"
      return {
        id: page.id,
        name: text(p["Project Name"]) || titleOf(page),
        stage: sel(p["Current Stage"]),
        type: workspace === "garage" ? "Garage" : workspace === "workroom" ? "Workroom" : "Hall",
        lastUpdate: relDate(dt(p["Last Status Update"])),
        geography: (ms(p["Geography"])[0]) ?? "",
        updateNeeded: p["Project Update Needed?"]?.checkbox ?? false,
      }
    })

    // Parse decision items — surface Urgent/High at top
    const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 }
    const decisions = (decisionsRes.results as AnyPage[])
      .map(page => {
        const p = page.properties
        return {
          id: page.id,
          title: titleOf(page),
          priority: sel(p["Priority"]) || "Normal",
          type: sel(p["Type"]) || "",
          category: "Decisions" as const,
        }
      })
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))

    // Counts
    const contentInReview = contentRes.results.length
    const agentDraftsPending = agentDraftsRes.results.length
    // Notion doesn't give exact count for filtered queries unless we paginate;
    // use has_more + results.length as a floor estimate
    const evidenceNewCount = evidenceRes.results.length + (evidenceRes.has_more ? 1 : 0)

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

    // Agent pulse from Supabase (agent_runs table)
    let agentPulse: { agent: string; status: string; timeAgo: string }[] = []
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_KEY!
      )
      const { data } = await supabase
        .from("agent_runs")
        .select("agent_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(100)

      if (data) {
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
    } catch {
      // Supabase unavailable — agentPulse stays empty, UI keeps static data
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
      },
      { headers: corsHeaders() }
    )
  } catch (err) {
    console.error("[hall-data] error:", err)
    return NextResponse.json(
      { error: "Failed to fetch hall data" },
      { status: 500, headers: corsHeaders() }
    )
  }
}
