import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";

const TYPES = new Set(["understanding", "decision", "scope", "timeline", "deliverable", "commercial", "purchase_order", "operational"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: { title?: string; summary?: string; type?: string; share?: boolean; dueAt?: string | null; materialId?: string | null };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const title = body.title?.trim() ?? "";
  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });
  const agreementType = TYPES.has(body.type ?? "") ? body.type! : "operational";
  const me = await currentUser();
  const actor = me?.primaryEmailAddress?.emailAddress ?? me?.id ?? "unknown-admin";
  const now = new Date().toISOString();
  const shared = body.share === true;

  const sb = supabaseAdmin();
  const { data, error } = await sb.from("project_agreements").insert({
    project_id: project.id,
    agreement_type: agreementType,
    title,
    summary: body.summary?.trim() || null,
    status: shared ? "shared" : "draft",
    visibility: shared ? "client" : "internal",
    due_at: body.dueAt || null,
    material_id: body.materialId || null,
    requested_by: actor,
    requested_at: shared ? now : null,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });

  await sb.from("project_agreement_events").insert({
    agreement_id: data.id,
    project_id: project.id,
    action: shared ? "shared" : "created",
    from_status: null,
    to_status: data.status,
    actor_clerk_user_id: me?.id ?? null,
    actor_email: me?.primaryEmailAddress?.emailAddress ?? null,
    agreement_version: data.version,
    snapshot: data,
  });
  return NextResponse.json({ ok: true, agreement: data });
}
