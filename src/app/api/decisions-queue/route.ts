import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPage = any;

function titleOf(page: AnyPage): string {
  for (const val of Object.values(page.properties ?? {}) as AnyPage[]) {
    if (val?.type === "title" && val?.title?.[0]?.plain_text) {
      return val.title[0].plain_text;
    }
  }
  return "Untitled";
}

function sel(p: AnyPage): string {
  return p?.select?.name ?? "";
}

function text(p: AnyPage): string {
  return p?.rich_text?.[0]?.plain_text ?? "";
}

function dt(p: AnyPage): string | null {
  return p?.date?.start ?? null;
}

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
    const res = await notion.databases.query({
      database_id: DB.decisions,
      filter: { property: "Status", select: { equals: "Open" } },
      sorts: [{ property: "Priority", direction: "ascending" }],
      page_size: 20,
    });

    const PRIORITY_ORDER: Record<string, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

    const items = (res.results as AnyPage[])
      .map(page => {
        const p = page.properties;
        return {
          id: page.id,
          title: titleOf(page),
          priority: sel(p["Priority"]) || "Normal",
          type: sel(p["Type"]) || "",
          status: sel(p["Status"]) || "Open",
          agent: text(p["Source Agent"]) || text(p["Agent"]) || "",
          question: text(p["Question"]) || text(p["Description"]) || "",
          projectName: p["Project"]?.relation?.[0]?.id ? "linked" : "",
          createdAt: relDate(dt(p["Created"]) || page.created_time),
          notionUrl: page.url ?? "",
        };
      })
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));

    return NextResponse.json(
      { ok: true, items, total: items.length },
      { headers: corsHeaders() }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to fetch decisions", detail: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }
}
