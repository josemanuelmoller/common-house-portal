import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/require-admin";
import { notion, DB } from "@/lib/notion";
import { classifyFile } from "../classify";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// POST — after direct browser→Supabase upload, create signed read URLs + Notion Data Room records
// Body: { projectName, orgId?, uploads: Array<{ name, storagePath }> }
export async function POST(req: NextRequest) {
  await requireAdmin();

  const { projectName, orgId, uploads } = await req.json() as {
    projectName: string;
    orgId?: string;
    uploads: { name: string; storagePath: string }[];
  };

  if (!projectName || !uploads?.length)
    return NextResponse.json({ error: "projectName and uploads required" }, { status: 400 });

  const results: {
    name: string; url: string; category: string; documentType: string;
    storagePath: string; notionId?: string;
  }[] = [];
  const errors: string[] = [];

  for (const upload of uploads) {
    try {
      // Create a long-lived signed read URL
      const { data: signedData } = await supabase.storage
        .from("garage-docs")
        .createSignedUrl(upload.storagePath, 60 * 60 * 24 * 365 * 10);

      const fileUrl = signedData?.signedUrl ?? "";
      const { category, documentType, priority } = classifyFile(upload.name);
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
          "Notes":         { rich_text: [{ text: { content: `Uploaded via portal. Storage path: ${upload.storagePath}` } }] },
        };
        if (orgId) properties["Startup"] = { relation: [{ id: orgId }] };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page = await notion.pages.create({ parent: { database_id: DB.dataRoom }, properties: properties as any });
        notionId = page.id;
      } catch { /* Notion failed — file still stored in Supabase */ }

      results.push({ name: upload.name, url: fileUrl, category, documentType, storagePath: upload.storagePath, notionId });
    } catch (err) {
      errors.push(`${upload.name}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  return NextResponse.json({ uploaded: results.length, results, errors });
}
