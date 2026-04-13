import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

function classifyFile(filename: string): { category: string; documentType: string; priority: string } {
  const name = filename.toLowerCase();
  if (name.includes("pitch") || name.includes("deck"))
    return { category: "Empresa", documentType: "Pitch Deck", priority: "Critical" };
  if (name.includes("financial") || name.includes("model") || name.includes("p&l") || name.includes("pnl"))
    return { category: "Financials", documentType: "Financial Model (3-year)", priority: "Critical" };
  if (name.includes("cap table") || name.includes("captable") || name.includes("cap_table") || name.includes("equity"))
    return { category: "Cap Table", documentType: "Formal Cap Table (certified)", priority: "Critical" };
  if (name.includes("one pager") || name.includes("onepager") || name.includes("summary") || name.includes("executive"))
    return { category: "Empresa", documentType: "Executive Summary", priority: "High" };
  if (name.includes("legal") || name.includes("certificate") || name.includes("incorporation"))
    return { category: "Legal", documentType: "Certificate of Incorporation", priority: "Critical" };
  if (name.includes("team") || name.includes("bio") || name.includes("founders"))
    return { category: "Equipo", documentType: "Bios of Founders", priority: "High" };
  if (name.includes("pilot") || name.includes("traction") || name.includes("results"))
    return { category: "Traccion", documentType: "Pilot Results / Case Study", priority: "Critical" };
  if (name.includes("impact") || name.includes("sustainability"))
    return { category: "Empresa", documentType: "Impact Report / Sustainability Story", priority: "Medium" };
  return { category: "Other", documentType: filename, priority: "Medium" };
}

// POST — upload files
export async function POST(req: NextRequest) {
  await requireAdmin();

  const formData = await req.formData();
  const projectId   = formData.get("projectId") as string;
  const projectName = formData.get("projectName") as string;
  const orgId       = formData.get("orgId") as string | null;

  if (!projectId || !projectName)
    return NextResponse.json({ error: "projectId and projectName required" }, { status: 400 });

  const files = formData.getAll("files") as File[];
  if (!files.length)
    return NextResponse.json({ error: "No files provided" }, { status: 400 });

  const results: { name: string; url: string; category: string; documentType: string; storagePath: string; notionId?: string }[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const storagePath = `${projectId}/${Date.now()}-${file.name}`;
      const buffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("garage-docs")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) { errors.push(`${file.name}: ${uploadError.message}`); continue; }

      const { data: signedData } = await supabase.storage
        .from("garage-docs")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);

      const fileUrl = signedData?.signedUrl ?? "";
      const { category, documentType, priority } = classifyFile(file.name);
      const itemName = `${projectName} — ${category} — ${documentType}`;

      let notionId: string | undefined;
      try {
        const properties: Record<string, unknown> = {
          "Item Name":     { title: [{ text: { content: itemName } }] },
          "Category":      { select: { name: category } },
          "Document Type": { rich_text: [{ text: { content: documentType } }] },
          "Status":        { select: { name: "Complete" } },
          "Priority":      { select: { name: priority } },
          "File URL":      { url: fileUrl },
          "Notes":         { rich_text: [{ text: { content: `Uploaded via portal. Storage path: ${storagePath}` } }] },
        };
        if (orgId) properties["Startup"] = { relation: [{ id: orgId }] };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page = await notion.pages.create({ parent: { database_id: DB.dataRoom }, properties: properties as any });
        notionId = page.id;
      } catch { /* Data Room record failed — file still stored */ }

      results.push({ name: file.name, url: fileUrl, category, documentType, storagePath, notionId });
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ uploaded: results.length, results, errors });
}

// DELETE — remove a specific Data Room item (Notion record + Supabase file)
export async function DELETE(req: NextRequest) {
  await requireAdmin();

  const { notionId, storagePath } = await req.json();

  const errs: string[] = [];

  // Delete Notion record
  if (notionId) {
    try {
      await notion.pages.update({ page_id: notionId, archived: true });
    } catch { errs.push("Failed to archive Notion record"); }
  }

  // Delete from Supabase Storage
  if (storagePath) {
    const { error } = await supabase.storage.from("garage-docs").remove([storagePath]);
    if (error) errs.push(`Storage delete failed: ${error.message}`);
  }

  return NextResponse.json({ ok: errs.length === 0, errors: errs });
}
