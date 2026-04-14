import { notion, DB, prop, text, select, multiSelect } from "./core";

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const page = await notion.pages.create({
    parent: { database_id: DB.knowledge },
    properties: {
      "Asset Name":        { title: [{ text: { content: title } }] },
      "Asset Type":        { select: { name: assetType } },
      "Domain / Theme":    { multi_select: tags.slice(0, 5).map(t => ({ name: t })) },
      "Status":            { select: { name: "Draft" } },
      "Portal Visibility": { select: { name: "admin-only" } },
      ...(sourceFileUrl ? { "Source File URL": { url: sourceFileUrl } } : {}),
    } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: summary } }] },
      },
      ...(keyPoints.length > 0 ? [
        {
          object: "block" as const,
          type: "bulleted_list_item" as const,
          bulleted_list_item: { rich_text: [{ type: "text" as const, text: { content: "Key points:" } }] },
        },
        ...keyPoints.slice(0, 8).map(pt => ({
          object: "block" as const,
          type: "bulleted_list_item" as const,
          bulleted_list_item: { rich_text: [{ type: "text" as const, text: { content: pt } }] },
        })),
      ] : []),
      ...(sourceNote || storagePath ? [{
        object: "block" as const,
        type: "paragraph" as const,
        paragraph: {
          rich_text: [{ type: "text" as const, text: {
            content: [
              sourceNote ? `📎 Source: ${sourceNote}` : null,
              storagePath ? `🗂 storage: ${storagePath}` : null,
            ].filter(Boolean).join("  ·  "),
          }}],
        },
      }] : []),
    ],
  });

  return page.id;
}
