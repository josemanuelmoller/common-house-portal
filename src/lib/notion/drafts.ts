import { notion, DB, prop, text, select, date, relationFirst } from "./core";

// ─── Hall v2 — Agent Drafts ───────────────────────────────────────────────────

export type AgentDraft = {
  id: string;
  title: string;
  draftType: string;    // LinkedIn Post | Follow-up Email | Check-in Email
  status: string;       // Pending Review | Approved | Revision Requested | Superseded
  voice: string;        // JMM | CH
  platform: string;     // LinkedIn | Email | Internal
  draftText: string;
  relatedEntityId: string | null;
  createdDate: string | null;
  notionUrl: string;
};

export async function getAgentDrafts(statusFilter = "Pending Review"): Promise<AgentDraft[]> {
  try {
    const res = await notion.databases.query({
      database_id: DB.agentDrafts,
      filter: { property: "Status", select: { equals: statusFilter } },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 20,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:              page.id,
      // "Draft Title" is the canonical title property name — all write paths use this.
      // "Content" is the canonical body field — all write paths use this.
      title:           text(prop(page, "Draft Title")) || "Untitled",
      draftType:       select(prop(page, "Type")),
      status:          select(prop(page, "Status")),
      voice:           select(prop(page, "Voice")),
      platform:        select(prop(page, "Platform")),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      draftText:       (prop(page, "Content")?.rich_text ?? []).map((r: any) => r.plain_text).join(""),
      relatedEntityId: relationFirst(prop(page, "Related Entity")),
      createdDate:     date(prop(page, "Created Date")) ?? (page.created_time?.slice(0, 10) ?? null),
      notionUrl:       page.url ?? "",
    }));
  } catch {
    return [];
  }
}
