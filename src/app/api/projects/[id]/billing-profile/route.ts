import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { clientAccessGuardApi } from "@/lib/require-client-access";
import { resolveClientRoomProject } from "@/lib/client-room";
import { supabaseAdmin } from "@/lib/supabase";
import { apiError } from "@/lib/api-error";

/**
 * Client-submitted billing/invoicing details for a project room.
 *
 * GET  — any client with access (or admin) reads the current profile.
 * PUT  — collaborator/approver (or admin) upserts it. This is the client
 *        feeding us their own invoicing data from inside the room.
 */

const FIELDS: Array<[string, string]> = [
  ["legalName", "legal_name"],
  ["taxId", "tax_id"],
  ["address", "address"],
  ["billingEmail", "billing_email"],
  ["billingContact", "billing_contact"],
  ["poReference", "po_reference"],
  ["notes", "notes"],
];

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const guard = await clientAccessGuardApi(project.id);
  if (guard) return guard;

  const { data, error } = await supabaseAdmin()
    .from("client_billing_profiles")
    .select("legal_name, tax_id, address, billing_email, billing_contact, po_reference, notes, submitted_by_email, updated_at")
    .eq("project_id", project.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ profile: data ?? null });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const guard = await clientAccessGuardApi(project.id, { roles: ["collaborator", "approver"] });
  if (guard) return guard;

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);
  const me = await currentUser();
  const row: Record<string, unknown> = {
    project_id: project.id,
    submitted_by_email: me?.primaryEmailAddress?.emailAddress ?? null,
    updated_at: new Date().toISOString(),
  };
  for (const [key, col] of FIELDS) row[col] = str(body[key]);

  try {
    const { error } = await supabaseAdmin()
      .from("client_billing_profiles")
      .upsert(row, { onConflict: "project_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, { route: "[/api/projects/[id]/billing-profile PUT]" });
  }
}
