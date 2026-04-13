import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Map file extension → Data Room category + document type
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
  if (name.includes("legal") || name.includes("certificate") || name.includes("incorporation") || name.includes("articles"))
    return { category: "Legal", documentType: "Certificate of Incorporation", priority: "Critical" };
  if (name.includes("team") || name.includes("bio") || name.includes("founders"))
    return { category: "Equipo", documentType: "Bios of Founders", priority: "High" };
  if (name.includes("pilot") || name.includes("traction") || name.includes("results") || name.includes("case"))
    return { category: "Traccion", documentType: "Pilot Results / Case Study", priority: "Critical" };
  if (name.includes("impact") || name.includes("sustainability"))
    return { category: "Empresa", documentType: "Impact Report / Sustainability Story", priority: "Medium" };
  return { category: "Other", documentType: filename, priority: "Medium" };
}

export async function POST(req: NextRequest) {
  await requireAdmin();

  const formData = await req.formData();
  const projectId = formData.get("projectId") as string;
  const projectName = formData.get("projectName") as string;
  const orgId = formData.get("orgId") as string | null;

  if (!projectId || !projectName) {
    return NextResponse.json({ error: "projectId and projectName required" }, { status: 400 });
  }

  const files = formData.getAll("files") as File[];
  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const results: { name: string; url: string; category: string; documentType: string; notionId?: string }[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      // 1. Upload to Supabase Storage
      const storagePath = `${projectId}/${Date.now()}-${file.name}`;
      const buffer = await file.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("garage-docs")
        .upload(storagePath, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) {
        errors.push(`${file.name}: ${uploadError.message}`);
        continue;
      }

      // 2. Get a signed URL (valid 10 years)
      const { data: signedData } = await supabase.storage
        .from("garage-docs")
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);

      const fileUrl = signedData?.signedUrl ?? "";

      // 3. Classify the file
      const { category, documentType, priority } = classifyFile(file.name);
      const itemName = `${projectName} — ${category} — ${documentType}`;

      // 4. Create Data Room [OS v2] record in Notion
      let notionId: string | undefined;
      try {
        const properties: Record<string, unknown> = {
          "Item Name": { title: [{ text: { content: itemName } }] },
          "Category":  { select: { name: category } },
          "Document Type": { rich_text: [{ text: { content: documentType } }] },
          "Status":    { select: { name: "Complete" } },
          "Priority":  { select: { name: priority } },
          "File URL":  { url: fileUrl },
        };

        if (orgId) {
          properties["Startup"] = { relation: [{ id: orgId }] };
        }

        const page = await notion.pages.create({
          parent: { database_id: DB.dataRoom },
          properties,
        });
        notionId = page.id;
      } catch {
        // Data Room record creation failed — file still uploaded
      }

      results.push({ name: file.name, url: fileUrl, category, documentType, notionId });
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({
    uploaded: results.length,
    results,
    errors,
  });
}
