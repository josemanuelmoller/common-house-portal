import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export function classifyFile(filename: string): { category: string; documentType: string; priority: string } {
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

// POST — generate signed upload URLs so the browser uploads directly to Supabase
// Body: { projectId, files: Array<{ name: string; type: string }> }
// Returns: { results: Array<{ name, storagePath, signedUrl }> }
export async function POST(req: NextRequest) {
  await requireAdmin();

  const { projectId, files } = await req.json() as {
    projectId: string;
    files: { name: string; type: string }[];
  };

  if (!projectId || !files?.length)
    return NextResponse.json({ error: "projectId and files required" }, { status: 400 });

  const results: { name: string; storagePath: string; signedUrl: string; error?: string }[] = [];

  for (const file of files) {
    const storagePath = `${projectId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${file.name}`;
    const { data, error } = await supabase.storage
      .from("garage-docs")
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      results.push({ name: file.name, storagePath, signedUrl: "", error: error?.message ?? "Failed to create upload URL" });
    } else {
      results.push({ name: file.name, storagePath, signedUrl: data.signedUrl });
    }
  }

  return NextResponse.json({ results });
}

// DELETE — remove a specific Data Room item (Notion record + Supabase file)
export async function DELETE(req: NextRequest) {
  await requireAdmin();

  const { notionId, storagePath } = await req.json();
  const errs: string[] = [];

  if (notionId) {
    try {
      await notion.pages.update({ page_id: notionId, archived: true });
    } catch { errs.push("Failed to archive Notion record"); }
  }

  if (storagePath) {
    const { error } = await supabase.storage.from("garage-docs").remove([storagePath]);
    if (error) errs.push(`Storage delete failed: ${error.message}`);
  }

  return NextResponse.json({ ok: errs.length === 0, errors: errs });
}
