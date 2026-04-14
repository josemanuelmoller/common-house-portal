import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

const ORGS_DB = "bef1bb86ab2b4cd280b6b33f9034b96c";

// Verified property names from Notion schema (2026-04-13)
// Opportunity Status: New | Qualifying | Active | Stalled | Closed Won | Closed Lost
// Priority: P1 — Act Now | P2 — This Quarter | P3 — Backlog | P4 — Watch
// Account / Organization: relation to CH Organizations
// Opportunity Type: Grant | CH Sale | Partnership | Investor Match | etc.

const PRIORITY_MAP: Record<string, string> = {
  "P1": "P1 — Act Now",
  "P2": "P2 — This Quarter",
  "P3": "P3 — Backlog",
  "P4": "P4 — Watch",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const funderName: string = body.funder ?? "";
  const program: string = body.program ?? "";
  const startup: string = body.startup ?? "CH";
  const priority: string = body.priority ?? ""; // "P1"|"P2"|"P3"|"P4"|"" (no priority)

  if (!funderName.trim()) {
    return NextResponse.json(
      { error: "funder is required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  // 1. Look up funder org in CH Organizations
  let funderPageId = "";
  try {
    const orgsRes = await notion.databases.query({
      database_id: ORGS_DB,
      filter: { property: "Name", title: { contains: funderName } },
      page_size: 1,
    });
    if (orgsRes.results.length > 0) {
      funderPageId = orgsRes.results[0].id;
    }
  } catch {
    // Org lookup failed — proceed without relation
  }

  const opportunityName = program
    ? `Grant — ${program} · ${startup}`
    : `Grant — ${funderName} · ${startup}`;

  // 2. Search for existing Grant opportunity for this funder to avoid duplicates
  let existingId = "";
  try {
    const existing = await notion.databases.query({
      database_id: DB.opportunities,
      filter: { property: "Opportunity Name", title: { contains: `Grant — ${funderName}` } },
      page_size: 1,
    });
    if (existing.results.length > 0) {
      existingId = existing.results[0].id;
    }
  } catch {
    // Lookup failed — proceed to create
  }

  // 3. Build properties using verified field names
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: Record<string, any> = {
    "Opportunity Status": { select: { name: "Qualifying" } },
    "Follow-up Status":   { select: { name: "Needed" } },
    "Opportunity Type":   { select: { name: "Grant" } },
    "Trigger / Signal":   { rich_text: [{ text: { content: `Editado desde Grants Desk — ${today}` } }] },
  };

  // Priority: only set if non-empty; map short code to full Notion value
  const fullPriority = priority ? PRIORITY_MAP[priority] : null;
  if (fullPriority) {
    props["Priority"] = { select: { name: fullPriority } };
  }

  // Link funder org if resolved
  if (funderPageId) {
    props["Account / Organization"] = { relation: [{ id: funderPageId }] };
  }

  let opportunityPage;
  try {
    if (existingId) {
      opportunityPage = await notion.pages.update({ page_id: existingId, properties: props });
    } else {
      opportunityPage = await notion.pages.create({
        parent: { database_id: DB.opportunities },
        properties: {
          "Opportunity Name": { title: [{ text: { content: opportunityName.slice(0, 100) } }] },
          ...props,
        },
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Notion write failed", detail: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      opportunityId: opportunityPage.id,
      notionUrl: (opportunityPage as { url?: string }).url ?? "",
      funderResolved: !!funderPageId,
      updated: !!existingId,
      opportunityName,
    },
    { headers: corsHeaders() }
  );
}
