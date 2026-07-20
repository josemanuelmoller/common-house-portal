import { NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { syncTimelineMeetingsForProject } from "@/lib/timeline-calendar-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/projects/[id]/client-room/timeline/sync-calendar
 * Admin-only. Pulls the client's calendar meetings (matched by org domain) into
 * the timeline as internal meeting events. Idempotent; never deletes.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const result = await syncTimelineMeetingsForProject(supabaseAdmin(), project.id);
    if (!result.ok) {
      const msg = result.reason === "no_org" ? "No organization linked to this project"
        : result.reason === "no_domain" ? "The linked organization has no email domain (org_domains)"
        : "Google Calendar is not connected (missing credentials)";
      return NextResponse.json({ error: msg, reason: result.reason }, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
