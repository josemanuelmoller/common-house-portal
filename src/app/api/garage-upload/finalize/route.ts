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

  const { projectName, projectId, orgId, uploads } = await req.json() as {
    projectName: string;
    projectId?: string;
    orgId?: string;
    uploads: { name: string; storagePath: string }[];
  };

  if (!projectName || !uploads?.length)
    return NextResponse.json({ error: "projectName and uploads required" }, { status: 400 });

  // Resolve orgId — if not passed by client, look it up from the project's Primary Organization.
  // This ensures Data Room records are always linked to the startup even when the client
  // didn't have orgId available (e.g. org linked after upload UI was rendered).
  let resolvedOrgId = orgId;
  if (!resolvedOrgId && projectId) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const projectPage: any = await notion.pages.retrieve({ page_id: projectId });
      const orgRelation: { id: string }[] = projectPage.properties?.["Primary Organization"]?.relation ?? [];
      if (!orgRelation.length) {
        // Fallback: name-based search in CH Organizations
        const projectPageName: string =
          projectPage.properties?.["Project Name"]?.title?.[0]?.plain_text ?? projectName;
        const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, "");
        const needle = normalize(projectPageName);
        const searchRes = await notion.databases.query({
          database_id: DB.organizations,
          filter: { property: "Name", title: { contains: projectPageName.split(" ")[0] } },
          page_size: 10,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const org of searchRes.results as any[]) {
          const orgName: string = org.properties?.["Name"]?.title?.[0]?.plain_text ?? "";
          const hay = normalize(orgName);
          if (hay === needle || hay.includes(needle) || needle.includes(hay)) {
            resolvedOrgId = org.id;
            break;
          }
        }
      } else {
        resolvedOrgId = orgRelation[0].id;
      }
    } catch { /* non-fatal */ }
  }

  const results: {
    name: string; url: string; category: string; documentType: string;
    storagePath: string; notionId?: string;
  }[] = [];
  const errors: string[] = [];

  for (const upload of uploads) {
    try {
      // Create a long-lived signed read URL
      const { data: signedData, error: urlError } = await supabase.storage
        .from("garage-docs")
        .createSignedUrl(upload.storagePath, 60 * 60 * 24 * 365 * 10);

      if (urlError || !signedData?.signedUrl) {
        const msg = urlError?.message ?? "no signed URL returned";
        console.error(`[finalize] createSignedUrl failed for ${upload.storagePath}:`, msg);
        errors.push(`${upload.name}: Failed to create read URL — ${msg}`);
        continue;
      }

      const fileUrl = signedData.signedUrl;
      const { category, documentType, priority } = classifyFile(upload.name);
      const itemName = `${projectName} — ${category} — ${documentType}`;

      let notionId: string | undefined;
      try {
        const properties: Record<string, unknown> = {
          "Item Name":     { title: [{ text: { content: itemName } }] },
          "Category":      { select: { name: category } },
          "Document Type": { select: { name: documentType } },
          "Status":        { select: { name: "Complete" } },
          "Priority":      { select: { name: priority } },
          "File URL":      { url: fileUrl || null },
          "Notes":         { rich_text: [{ text: { content: `Uploaded via portal. Project: ${projectName}${projectId ? ` (${projectId})` : ""}. Storage path: ${upload.storagePath}` } }] },
        };
        if (resolvedOrgId) properties["Startup"] = { relation: [{ id: resolvedOrgId }] };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const page = await notion.pages.create({ parent: { database_id: DB.dataRoom }, properties: properties as any });
        notionId = page.id;
      } catch (notionErr) {
        console.error("[finalize] Notion create failed:", notionErr instanceof Error ? notionErr.message : notionErr);
        errors.push(`Notion: ${notionErr instanceof Error ? notionErr.message : "unknown error"}`);
      }

      results.push({ name: upload.name, url: fileUrl, category, documentType, storagePath: upload.storagePath, notionId });
    } catch (err) {
      errors.push(`${upload.name}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  // Auto-ingest PDFs in background — fire and forget, doesn't block the response
  const pdfUploads = results.filter(r =>
    r.name.toLowerCase().endsWith(".pdf") && r.notionId && r.storagePath
  );
  if (pdfUploads.length > 0 && projectId) {
    // Derive base URL from the incoming request — avoids needing NEXT_PUBLIC_APP_URL env var
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
      ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`;
    const ingestUrl = `${appUrl}/api/garage-ingest`;
    const agentKey  = process.env.CRON_SECRET ?? "";

    for (const upload of pdfUploads) {
      // Non-blocking background ingest
      fetch(ingestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-agent-key": agentKey },
        body: JSON.stringify({
          fileUrl:     upload.url,
          fileName:    upload.name,
          projectId,
          projectName,
          orgId,
          mode: "execute",
        }),
      }).catch(() => { /* silence — ingest failure shouldn't block upload */ });
    }
  }

  return NextResponse.json({ uploaded: results.length, results, errors, autoIngestTriggered: pdfUploads.length });
}
