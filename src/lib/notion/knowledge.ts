import { notion, DB, prop, text, select, multiSelect } from "./core";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// ─── Knowledge Assets ─────────────────────────────────────────────────────────

export type KnowledgeAsset = {
  id: string;
  name: string;
  category: string;
  assetType: string;
  status: string;
  lastUpdated: string | null;
  portalVisibility?: string;
  sourceFileUrl?: string;
};

export async function getKnowledgeAssets(): Promise<KnowledgeAsset[]> {
  const res = await notion.databases.query({
    database_id: DB.knowledge,
    sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
    page_size: 50,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    name: text(prop(page, "Asset Name")) || "Untitled",
    // "Domain / Theme" is the canonical field (multi_select). "Category"/"Asset Category" don't exist in the schema.
    category: multiSelect(prop(page, "Domain / Theme")).join(", "),
    assetType: select(prop(page, "Asset Type")) || "",
    status: select(prop(page, "Status")) || "",
    lastUpdated: page.last_edited_time ?? null,
    portalVisibility: page.properties["Portal Visibility"]?.select?.name ?? "admin-only",
    sourceFileUrl: page.properties["Source File URL"]?.url ?? null,
  }));
}

// ─── Library ingest ───────────────────────────────────────────────────────────

/**
 * Library ingest writer for knowledge assets.
 *
 * Migrated 2026-06-09 from Notion (`notion.pages.create` against
 * `DB.knowledge`) to Supabase, per the 2026-06-02 deprecation cutoff.
 * Returns the canonical knowledge_assets.id (uuid) — call sites that
 * stored the string verbatim already treat it as opaque.
 *
 * Body composition: keeps the same author intent (summary + bulleted
 * key points + source-note footer) but renders to markdown stored in
 * `body_md`, so the editor in /admin/knowledge-assets/[id] can edit it
 * inline. Source URL + storage path are preserved in `payload` for any
 * downstream consumer that needs the raw context.
 */
export async function createKnowledgeAssetDraft(opts: {
  title: string;
  summary: string;
  keyPoints: string[];
  assetType: string;
  tags: string[];
  sourceNote?: string;
  sourceFileUrl?: string;
  storagePath?: string;
}): Promise<string> {
  const { title, summary, keyPoints, assetType, tags, sourceNote, sourceFileUrl, storagePath } = opts;

  const bodyParts: string[] = [summary];
  if (keyPoints.length > 0) {
    bodyParts.push("");
    bodyParts.push("**Key points**");
    for (const pt of keyPoints.slice(0, 8)) bodyParts.push(`- ${pt}`);
  }
  if (sourceNote || storagePath) {
    bodyParts.push("");
    bodyParts.push([
      sourceNote ? `📎 Source: ${sourceNote}` : null,
      storagePath ? `🗂 storage: ${storagePath}` : null,
    ].filter(Boolean).join("  ·  "));
  }
  const bodyMd = bodyParts.join("\n");

  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("knowledge_assets")
    .insert({
      title,
      asset_type: assetType,
      status:     "Draft",
      summary,
      body_md:    bodyMd,
      payload:    {
        tags: tags.slice(0, 5),
        portal_visibility: "admin-only",
        source_file_url: sourceFileUrl ?? null,
        source_note: sourceNote ?? null,
        storage_path: storagePath ?? null,
        key_points: keyPoints,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`createKnowledgeAssetDraft: ${error?.message ?? "insert returned no row"}`);
  }
  return data.id as string;
}
