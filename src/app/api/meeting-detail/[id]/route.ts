import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getProjectIdForUser, isAdminUser, isAdminEmail } from "@/lib/clients";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function tryLoadFromSupabase(id: string) {
  if (!UUID_RE.test(id)) return null;
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("sources")
    .select("id, title, source_date, source_url, source_platform, processed_summary, sanitized_notes, project_notion_id, org_notion_id, source_external_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;

  // Build sections from processed_summary / sanitized_notes (no Notion blocks
  // available — these sources never lived in Notion).
  const sections: Array<{ type: "heading" | "paragraph" | "bullet"; text: string }> = [];
  const sourceText =
    (data.processed_summary as string | null) ||
    (data.sanitized_notes  as string | null) ||
    "";
  if (sourceText.trim()) {
    sourceText.split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const isBullet = /^[-•*]\s/.test(trimmed);
      sections.push({
        type: isBullet ? "bullet" : "paragraph",
        text: isBullet ? trimmed.replace(/^[-•*]\s/, "") : trimmed,
      });
    });
  }

  return {
    id,
    title:        (data.title as string) || "Untitled",
    date:         (data.source_date as string | null) ?? null,
    url:          (data.source_url as string | null) ?? null,
    platform:     (data.source_platform as string | null) ?? "",
    attendees:    [] as string[],
    sections,
    projectId:    (data.project_notion_id as string | null) ?? null,
    externalId:   (data.source_external_id as string | null) ?? null,
  };
}

/**
 * GET /api/meeting-detail/[id]
 * Returns meeting source detail. Supabase-first; falls back to Notion only if
 * the id looks like a Notion page ID and isn't found in Supabase.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const email = user.primaryEmailAddress?.emailAddress ?? "";

  const { id } = await params;

  // Supabase-first: covers all sources born in OS v2 (sources.id is uuid).
  const sb = await tryLoadFromSupabase(id);
  if (sb) {
    if (!isAdminUser(user.id) && !isAdminEmail(email)) {
      const userProjectId = getProjectIdForUser(email);
      if (!userProjectId || sb.projectId !== userProjectId) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }
    return NextResponse.json(sb);
  }

  try {
    // Supabase fallback for legacy Notion page IDs: look up the source by its
    // notion_id backref. Sources migrated from Notion retain this column.
    const sb2 = getSupabaseServerClient();
    const { data } = await sb2
      .from("sources")
      .select("title, source_date, source_url, source_platform, processed_summary, sanitized_notes, project_notion_id")
      .eq("notion_id", id)
      .maybeSingle();

    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Project ownership check — non-admin users may only read meetings linked to their project.
    // Without this check, any authenticated client could request any meeting by page ID,
    // leaking content from other projects.
    if (!isAdminUser(user.id) && !isAdminEmail(email)) {
      const userProjectId = getProjectIdForUser(email);

      if (!userProjectId) {
        return NextResponse.json({ error: "No project access" }, { status: 403 });
      }

      // Relation IDs may be stored with or without dashes — normalise before comparing.
      const strip = (s: string) => s.replace(/-/g, "");
      const linkedProject = (data.project_notion_id as string | null) ?? "";

      if (strip(linkedProject) !== strip(userProjectId)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 });
      }
    }

    // Build sections from processed_summary / sanitized_notes (no Notion blocks
    // available — these sources are read from Supabase).
    const sections: Array<{ type: "heading" | "paragraph" | "bullet"; text: string }> = [];
    const sourceText =
      (data.processed_summary as string | null) ||
      (data.sanitized_notes  as string | null) ||
      "";
    if (sourceText.trim()) {
      sourceText.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const isBullet = /^[-•*]\s/.test(trimmed);
        sections.push({
          type: isBullet ? "bullet" : "paragraph",
          text: isBullet ? trimmed.replace(/^[-•*]\s/, "") : trimmed,
        });
      });
    }

    return NextResponse.json({
      id,
      title:     (data.title as string) || "Untitled",
      date:      (data.source_date as string | null) ?? null,
      url:       (data.source_url as string | null) ?? null,
      platform:  (data.source_platform as string | null) ?? "",
      attendees: [] as string[],
      sections,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    );
  }
}
