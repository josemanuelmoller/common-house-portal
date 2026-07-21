import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";

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
  const guard = await adminGuardApi();
  if (guard) return guard;

  try {
    const { getSupabaseServerClient } = await import("@/lib/supabase-server");
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("opportunities")
      .select("notion_id, title, status, priority, org_notion_id, org_name, value_estimate, expected_close_date")
      .eq("opportunity_type", "Grant")
      .not("status", "in", '("Closed Lost","Closed Won")')
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    const grants = (data ?? []).map((row) => {
      const name     = (row.title as string) ?? "Untitled";
      const parsed   = parseOpportunityName(name);
      const status   = (row.status as string) ?? "New";
      const priority = (row.priority as string) ?? "";
      const orgId    = (row.org_notion_id as string) ?? "";
      // Funder resolved directly from the org_name column (no page retrieval needed).
      const funder   = (row.org_name as string) ?? parsed.program;
      const notionId = row.notion_id as string;
      const notionUrl = notionId ? `https://www.notion.so/${notionId.replace(/-/g, "")}` : "";

      return {
        id:         notionId,
        notionUrl,
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
        amount:     (row.value_estimate as number | null) ?? null,
        deadline:   (row.expected_close_date as string | null) ?? null,
      };
    });

    return NextResponse.json({ ok: true, grants }, { headers: corsHeaders() });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}
