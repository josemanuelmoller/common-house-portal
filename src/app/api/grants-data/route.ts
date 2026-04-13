import { NextResponse } from "next/server";
import { notion, DB } from "@/lib/notion";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function titleOf(page: any): string {
  for (const val of Object.values(page.properties ?? {}) as any[]) {
    if (val?.type === "title" && val?.title?.[0]?.plain_text) {
      return val.title[0].plain_text;
    }
  }
  return "Untitled";
}

// Parse opportunity names in two formats:
//   New:    "Grant — {program} · {startup}"   (mark-grant-interest API)
//   Legacy: "{program} — {startup}"            (Sprint 19 manual records)
function parseOpportunityName(name: string): { program: string; startup: string } {
  // Strip leading "Grant — " prefix if present
  const stripped = name.replace(/^Grant\s*—\s*/i, "");
  // Prefer "·" separator (new format)
  const midDot = stripped.lastIndexOf("·");
  if (midDot !== -1) {
    return {
      program: stripped.slice(0, midDot).trim(),
      startup: stripped.slice(midDot + 1).trim(),
    };
  }
  // Fall back to last " — " separator (legacy format)
  const dashIdx = stripped.lastIndexOf(" — ");
  if (dashIdx !== -1) {
    return {
      program: stripped.slice(0, dashIdx).trim(),
      startup: stripped.slice(dashIdx + 3).trim(),
    };
  }
  return { program: stripped, startup: "" };
}

const STATUS_LABEL: Record<string, string> = {
  "New":        "Nuevo",
  "Qualifying": "Calificando",
  "Active":     "Activo",
  "Stalled":    "En pausa",
};

const PRIORITY_SHORT: Record<string, string> = {
  "P1 — Act Now":       "P1",
  "P2 — This Quarter":  "P2",
  "P3 — Backlog":       "P3",
  "P4 — Watch":         "P4",
};

export async function GET() {
  try {
    const res = await notion.databases.query({
      database_id: DB.opportunities,
      filter: {
        and: [
          { property: "Opportunity Type", select: { equals: "Grant" } },
          { property: "Opportunity Status", select: { does_not_equal: "Closed Lost" } },
          { property: "Opportunity Status", select: { does_not_equal: "Closed Won" } },
        ],
      },
      sorts: [
        { property: "Priority", direction: "ascending" },
        { timestamp: "last_edited_time", direction: "descending" },
      ],
      page_size: 50,
    });

    // Collect unique org IDs to resolve funder names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgIds = [...new Set((res.results as any[])
      .map(p => p.properties["Account / Organization"]?.relation?.[0]?.id)
      .filter(Boolean)
    )];

    // Batch-fetch org names (max 10 concurrent)
    const orgNames: Record<string, string> = {};
    await Promise.all(orgIds.map(async (id) => {
      try {
        const page = await notion.pages.retrieve({ page_id: id as string });
        orgNames[id as string] = titleOf(page);
      } catch { /* skip */ }
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const grants = (res.results as any[]).map((page) => {
      const props = page.properties;
      const name     = titleOf(page);
      const parsed   = parseOpportunityName(name);
      const status   = props["Opportunity Status"]?.select?.name ?? "New";
      const priority = props["Priority"]?.select?.name ?? "";
      const orgId    = props["Account / Organization"]?.relation?.[0]?.id ?? "";
      const funder   = orgNames[orgId] ?? parsed.program;

      return {
        id:         page.id,
        notionUrl:  page.url ?? "",
        name,
        funder,
        program:    parsed.program,
        startup:    parsed.startup,
        status,
        statusLabel: STATUS_LABEL[status] ?? status,
        priority:   PRIORITY_SHORT[priority] ?? priority,
        orgId,
        // Fit score and financials will come from radar agent once it runs
        fitScore:   null as number | null,
        amount:     props["Amount"]?.number ?? null,
        deadline:   props["Deadline"]?.date?.start ?? null,
      };
    });

    return NextResponse.json({ ok: true, grants }, { headers: corsHeaders() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }
}
