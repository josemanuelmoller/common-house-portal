import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/desk-request
 *
 * Creates a new entry in the canonical `content_pipeline_items` Supabase
 * table for Design or Comms desk requests. Replaces the legacy Notion
 * `CH Content Pipeline [OS v2]` write target per the 2026-06-02 cutoff
 * (see docs/SUPABASE_CONSOLIDATION_FREEZE.md §3.4).
 *
 * Body: { deskType: "design" | "comms", contentType: string, description: string, project?: string, channel?: string }
 */
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { deskType, contentType, description, project, channel, styleProfileId } = body;

  if (!description?.trim()) {
    return NextResponse.json({ error: "Description is required" }, { status: 400 });
  }

  const trimmed = description.trim();
  const title = trimmed.slice(0, 120);

  // notion-cutoff-2026-06-02: replaced by canonical write to content_pipeline_items
  // const properties: Record<string, unknown> = {
  //   "Title":  { title: [{ text: { content: title } }] },
  //   "Status": { select: { name: "Draft" } },
  // };
  // if (contentType) properties["Content Type"] = { select: { name: contentType } };
  // if (deskType === "comms" && channel) properties["Platform"] = { select: { name: channel } };
  // if (deskType) properties["Desk"] = { select: { name: deskLabel } };
  // const page = await notion.pages.create({ parent: { database_id: DB.contentPipeline }, properties, ...optional children });

  // Notion → Supabase (content_pipeline_items) column mapping:
  //   Title         → title
  //   Status        → status
  //   Platform      → channel
  //   Description   → body_md (full text); first 120 chars stay as title
  //   Content Type  → payload.content_type   (no dedicated column yet)
  //   Desk          → payload.desk
  //   Project       → payload.project        (relation to projects, free-form for now)
  //   Style Profile → payload.style_profile_id
  const deskLabel = deskType
    ? (
        deskType === "design"   ? "Design"   :
        deskType === "comms"    ? "Comms"    :
        deskType === "insights" ? "Insights" :
        deskType === "grants"   ? "Grants"   :
        deskType.charAt(0).toUpperCase() + deskType.slice(1)
      )
    : null;

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("content_pipeline_items")
    .insert({
      title,
      status:  "Draft",
      channel: deskType === "comms" && channel ? channel : null,
      body_md: trimmed,
      payload: {
        content_type:     contentType ?? null,
        desk:             deskLabel,
        project:          project ?? null,
        style_profile_id: styleProfileId ?? null,
        source:           "desk-request",
      },
    })
    .select("id")
    .single();

  if (error) {
    console.error("[desk-request POST] supabase insert failed:", error.message);
    return NextResponse.json({ error: "Failed to create request", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data?.id ?? null });
}
