import { getSupabaseServerClient } from "@/lib/supabase-server";

// ─── Knowledge Assets ─────────────────────────────────────────────────────────
//
// Migrated OFF Notion (2026-06 cutoff). Reads now come from the Supabase
// `knowledge_assets` table. That table is currently empty (a backfill runs
// later), so this getter returns [] gracefully until it is populated.
// Record `id` is the row `notion_id`.

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
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("knowledge_assets")
      .select(
        "notion_id, title, asset_type, status, last_evidence_at, notion_created_at, payload"
      )
      .order("last_evidence_at", { ascending: false, nullsFirst: false })
      .limit(50);

    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (row.payload ?? {}) as Record<string, any>;
      return {
        id: row.notion_id,
        name: row.title || "Untitled",
        // No categorical/multi-select field survived the migration — surfaced
        // via payload tags when present, otherwise empty.
        category: Array.isArray(payload.tags) ? payload.tags.join(", ") : "",
        assetType: row.asset_type ?? "",
        status: row.status ?? "",
        lastUpdated: row.last_evidence_at ?? row.notion_created_at ?? null,
        portalVisibility: payload.portal_visibility ?? "admin-only",
        sourceFileUrl: payload.source_file_url ?? undefined,
      };
    });
  } catch {
    return [];
  }
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
