import { NextRequest, NextResponse } from "next/server";
import { resolveClientRoomProject } from "@/lib/client-room";
import { resolveAccessForSlug } from "@/lib/require-client-access";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * POST /api/projects/[id]/analytics
 * Ingests a batch of room analytics events for the current authenticated user.
 * Access-gated: only someone with a grant (or an admin) can emit events for a
 * room. Every event is attributed to the real email + role — this is identified
 * relationship analytics, not anonymous tracking. Admin previews are flagged
 * (is_admin) so they can be excluded from client-facing stats.
 *
 * Designed to be called with navigator.sendBeacon on pagehide, so it reads the
 * body defensively (sendBeacon may send text/plain).
 */

const ALLOWED = new Set(["visit", "section_view", "material_open", "heartbeat", "session_end"]);
const MAX_EVENTS = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const access = await resolveAccessForSlug(project.hall_slug ?? "");
  if (access.kind === "denied") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const isAdmin = access.kind === "admin";
  const actorEmail = (access.email ?? "").trim().toLowerCase() || null;
  const actorRole = isAdmin ? "admin" : access.kind === "client" ? access.grant.role : null;

  let body: {
    sessionId?: string;
    path?: string;
    referrer?: string;
    events?: Array<{ type?: string; target?: string; durationMs?: number; metadata?: Record<string, unknown> }>;
  };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : null;
  const events = Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : [];
  if (!sessionId || events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 400) ?? null;
  const now = new Date().toISOString();

  const rows = events
    .filter((e) => e && typeof e.type === "string" && ALLOWED.has(e.type))
    .map((e) => ({
      occurred_at: now,
      session_id: sessionId,
      actor_email: actorEmail,
      actor_role: actorRole,
      is_admin: isAdmin,
      area: "room",
      project_id: project.id,
      slug: project.hall_slug ?? null,
      event_type: e.type as string,
      target: typeof e.target === "string" ? e.target.slice(0, 200) : null,
      duration_ms: Number.isFinite(e.durationMs) ? Math.max(0, Math.min(86_400_000, Math.round(e.durationMs as number))) : null,
      path: typeof body.path === "string" ? body.path.slice(0, 300) : null,
      referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 300) : null,
      user_agent: userAgent,
      metadata: e.metadata && typeof e.metadata === "object" ? e.metadata : {},
    }));

  if (rows.length === 0) return NextResponse.json({ ok: true, inserted: 0 });

  const { error } = await supabaseAdmin().from("portal_analytics_events").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true, inserted: rows.length });
}
