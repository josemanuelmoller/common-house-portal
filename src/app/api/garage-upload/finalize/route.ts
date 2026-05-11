import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { adminGuardApi } from "@/lib/require-admin";
// notion-cutoff-2026-06-02: Notion `Data Room` write removed; canonical write is now to `data_room_documents` (Supabase).
// `notion` and `DB.organizations` are still used for the read-only org-resolution
// fallback (Primary Organization relation on the Notion project page) until that
// read source is migrated to Supabase organizations.
import { notion, DB } from "@/lib/notion";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { classifyFile } from "../classify";

// Storage path validation — admins POST the storagePath back from the client,
// so without this check an attacker with an admin session could ask for a
// signed read URL on any path in any bucket the service-role key can see
// (e.g. ../inbox-captures/foo.png). Lock the path to garage/ prefix and
// reject any traversal or NUL byte tricks.
function assertGarageStoragePath(path: string): void {
  if (typeof path !== "string" || !path) throw new Error("storagePath required");
  if (path.length > 512) throw new Error("storagePath too long");
  if (/[\x00-\x1f\x7f]/.test(path)) throw new Error("storagePath contains control characters");
  if (path.includes("..")) throw new Error("storagePath contains traversal");
  if (path.startsWith("/") || path.startsWith("\\")) throw new Error("storagePath must be relative");
  // Bucket is `garage-docs`, conventional prefix is `garage/` per garage-upload route.
  if (!path.startsWith("garage/")) throw new Error("storagePath must be under garage/");
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}

// POST — after direct browser→Supabase upload, create signed read URLs + Notion Data Room records
// Body: { projectName, orgId?, uploads: Array<{ name, storagePath }> }
export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

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
      assertGarageStoragePath(upload.storagePath);
      // Create a long-lived signed read URL
      const supabase = getSupabase();
      // download:true forces Content-Disposition: attachment on the response,
      // so HTML/SVG uploads (if they ever slip past the bucket mime whitelist)
      // can't render inline with portal cookies.
      const { data: signedData, error: urlError } = await supabase.storage
        .from("garage-docs")
        .createSignedUrl(upload.storagePath, 60 * 60 * 24 * 365 * 10, { download: true });

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
      // notion-cutoff-2026-06-02: replaced by canonical write to data_room_documents (Supabase).
      // Notion → Supabase (data_room_documents) column mapping:
      //   "Item Name"     → doc_name
      //   "Document Type" → doc_type
      //   "File URL"      → drive_url
      //   "Startup"       → org_notion_id (string FK to organizations.notion_id)
      //   "Category"      → payload.category
      //   "Status"        → payload.status   (default "Complete")
      //   "Priority"      → payload.priority
      //   "Notes"         → payload.notes
      //
      // try {
      //   const properties: Record<string, unknown> = {
      //     "Item Name":     { title: [{ text: { content: itemName } }] },
      //     "Category":      { select: { name: category } },
      //     "Document Type": { select: { name: documentType } },
      //     "Status":        { select: { name: "Complete" } },
      //     "Priority":      { select: { name: priority } },
      //     "File URL":      { url: fileUrl || null },
      //     "Notes":         { rich_text: [{ text: { content: `Uploaded via portal. ...` } }] },
      //   };
      //   if (resolvedOrgId) properties["Startup"] = { relation: [{ id: resolvedOrgId }] };
      //   const page = await notion.pages.create({ parent: { database_id: DB.dataRoom }, properties });
      //   notionId = page.id;
      // } catch (notionErr) { ... }
      try {
        const sb = getSupabaseServerClient();
        const { data: row, error: insertErr } = await sb
          .from("data_room_documents")
          .insert({
            doc_name:      itemName,
            doc_type:      documentType,
            drive_url:     fileUrl || null,
            org_notion_id: resolvedOrgId ?? null,
            uploaded_at:   new Date().toISOString(),
            payload: {
              category,
              status:       "Complete",
              priority,
              notes:        `Uploaded via portal. Project: ${projectName}${projectId ? ` (${projectId})` : ""}. Storage path: ${upload.storagePath}`,
              project_notion_id: projectId ?? null,
              storage_path: upload.storagePath,
              file_name:    upload.name,
            },
          })
          .select("id")
          .single();
        if (insertErr) {
          console.error("[finalize] data_room_documents insert failed:", insertErr.message);
          errors.push(`data_room_documents: ${insertErr.message}`);
        } else {
          // Preserve the legacy `notionId` field name in the response so callers
          // (including auto-ingest below) keep working until they migrate.
          notionId = row?.id as string | undefined;
        }
      } catch (dbErr) {
        console.error("[finalize] data_room_documents create failed:", dbErr instanceof Error ? dbErr.message : dbErr);
        errors.push(`data_room_documents: ${dbErr instanceof Error ? dbErr.message : "unknown error"}`);
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
