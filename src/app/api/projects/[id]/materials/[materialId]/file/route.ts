import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveClientRoomProject } from "@/lib/client-room";
import { resolveAccessForSlug } from "@/lib/require-client-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/projects/[id]/materials/[materialId]/file[?download=1]
 *
 * Streams a room document (PDF/PPTX) stored in the private `room-docs` bucket,
 * same-origin so the client can preview it in the room without a Google/Drive
 * login. Access: admins always; clients only when the material is visibility
 * 'client' and they hold a grant for the room's slug. `?download=1` forces a
 * download; otherwise it renders inline.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; materialId: string }> }) {
  const { id, materialId } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: material } = await supabaseAdmin()
    .from("project_materials")
    .select("id, title, provider, external_id, mime_type, visibility")
    .eq("id", materialId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!material || material.provider !== "supabase" || !material.external_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const access = await resolveAccessForSlug(project.hall_slug ?? "");
  if (access.kind === "denied") {
    return NextResponse.json({ error: "Unauthorized" }, { status: access.reason === "unauthenticated" ? 401 : 403 });
  }
  if (access.kind !== "admin" && material.visibility !== "client") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: blob, error } = await supabaseAdmin().storage.from("room-docs").download(material.external_id as string);
  if (error || !blob) return NextResponse.json({ error: "File unavailable" }, { status: 502 });

  const buffer = Buffer.from(await blob.arrayBuffer());
  const download = new URL(_req.url).searchParams.get("download") === "1";
  const mime = (material.mime_type as string | null) ?? "application/pdf";
  const ext = mime.includes("presentation") ? "pptx" : "pdf";
  const safeName = String(material.title).replace(/[^a-zA-Z0-9 ._-]/g, "").trim() || "documento";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(buffer.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safeName}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
