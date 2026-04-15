import { notion, DB, prop, text, select, date, relationFirst } from "./core";

// ─── Hall v2 — Agent Drafts ───────────────────────────────────────────────────

export type AgentDraft = {
  id: string;
  title: string;
  draftType: string;    // LinkedIn Post | Follow-up Email | Check-in Email
  // Full lifecycle: Pending Review → Approved → Sent | Draft Created | Revision Requested | Superseded
  // "Sent" and "Draft Created" are terminal statuses written by /api/send-draft after Gmail delivery.
  // These drafts no longer appear in the default getAgentDrafts("Pending Review") queue.
  status: string;
  voice: string;        // JMM | CH
  platform: string;     // LinkedIn | Email | Internal
  draftText: string;
  relatedEntityId: string | null;   // People DB page ID — recipient for email drafts
  opportunityId: string | null;     // Opportunities DB page ID — source opportunity for follow-ups
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
      opportunityId:   relationFirst(prop(page, "Opportunity")),
      createdDate:     date(prop(page, "Created Date")) ?? (page.created_time?.slice(0, 10) ?? null),
      notionUrl:       page.url ?? "",
    }));
  } catch {
    return [];
  }
}
