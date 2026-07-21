// ─── Hall v2 — Agent Drafts ───────────────────────────────────────────────────
//
// Migrated OFF Notion (2026-06 cutoff). All data now comes from the Supabase
// `agent_drafts` table. Record `id` is the row `notion_id`; the Notion URL is
// reconstructed from it for any legacy deep-link consumer.

export type AgentDraft = {
  id: string;
  title: string;
  draftType: string;    // LinkedIn Post | Follow-up Email | Check-in Email | Delegation Brief
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

// Outbox: draft types that require human sign-off because they leave the building
// (published to LinkedIn, emailed externally, etc.). Internal artifacts like
// "Market Signal" (meeting intel digest) and "Quick Win Scan" (opportunity scan)
// surface elsewhere in the Hall — not in the Outbox.
export const OUTBOX_DRAFT_TYPES = new Set<string>([
  "LinkedIn Post",
  "Follow-up Email",
  "Check-in Email",
  "Delegation Brief",
]);

function notionUrlFrom(notionId: string): string {
  return `https://www.notion.so/${notionId.replace(/-/g, "")}`;
}

export async function getAgentDrafts(statusFilter = "Pending Review"): Promise<AgentDraft[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    const { data, error } = await sb
      .from("agent_drafts")
      .select(
        "notion_id, draft_type, status, title, body_md, target_person_notion_id, target_org_notion_id, notion_created_at"
      )
      .eq("status", statusFilter)
      .order("notion_created_at", { ascending: false })
      .limit(20);

    if (error || !data) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data as any[]).map((row) => {
      const createdAt: string | null = row.notion_created_at ?? null;
      return {
        id:              row.notion_id,
        title:           row.title || "Untitled",
        draftType:       row.draft_type ?? "",
        status:          row.status ?? "",
        voice:           "",
        platform:        "",
        draftText:       row.body_md ?? "",
        relatedEntityId: row.target_person_notion_id ?? null,
        opportunityId:   row.target_org_notion_id ?? null,
        createdDate:     createdAt ? createdAt.slice(0, 10) : null,
        notionUrl:       row.notion_id ? notionUrlFrom(row.notion_id) : "",
      };
    });
  } catch {
    return [];
  }
}

// Outbox-only view: pending drafts whose approval triggers an external action.
export async function getOutboxDrafts(): Promise<AgentDraft[]> {
  const all = await getAgentDrafts("Pending Review");
  return all.filter(d => OUTBOX_DRAFT_TYPES.has(d.draftType));
}
