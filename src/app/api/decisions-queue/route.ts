import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function relDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const MO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${d.getDate()} ${MO[d.getMonth()]} ${d.getFullYear()}`;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  try {
    // Read migrated OFF Notion → Supabase `decision_items` (post-cutoff).
    const sb = getSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await sb
      .from("decision_items")
      .select(
        "notion_id, title, priority, decision_type, status, source_agent, notes_raw, notion_url, project_notion_id, created_at"
      )
      .eq("status", "Open")
      .limit(20);

    if (error) throw error;

    // Priority values in Decision Items [OS v2]: "P1 Critical" | "High" | "Medium" | "Low"
    const PRIORITY_ORDER: Record<string, number> = { "P1 Critical": 0, High: 1, Medium: 2, Low: 3 };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = ((data ?? []) as Record<string, any>[])
      .map(r => {
        const notionId: string | null = r.notion_id ?? null;
        return {
          id: notionId ?? (r.id as string),
          title: (r.title as string) || "Untitled",
          priority: (r.priority as string) || "Normal",
          type: (r.decision_type as string) || "",
          status: (r.status as string) || "Open",
          agent: (r.source_agent as string) || "",
          question: (r.notes_raw as string) || "",
          projectName: r.project_notion_id ? "linked" : "",
          createdAt: relDate((r.created_at as string | null) ?? null),
          notionUrl:
            (r.notion_url as string) ||
            (notionId ? `https://www.notion.so/${notionId.replace(/-/g, "")}` : ""),
        };
      })
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

    return NextResponse.json(
      { ok: true, items, total: items.length },
      { headers: corsHeaders() }
    );
  } catch (err) {
    // Do not echo `String(err)` — log detail server-side; return a stable code.
    console.error("[decisions-queue]", err);
    return NextResponse.json(
      { error: "Failed to fetch decisions" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
