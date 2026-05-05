/**
 * decision-items.ts — Supabase reader for decision_items rows.
 *
 * Currently exposes only relationship-classification proposals
 * (`entity_action='classify_relationship'`) created by the
 * relationship-promotion-operator. Phase 4 will migrate the rest of the
 * Decision Center reads off Notion and into this module.
 *
 * Read-only. No writes. Server-only.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ClassifyRelationshipPayload = {
  org_id?: string;
  org_notion_id?: string;
  org_name?: string;
  proposed_class?: "Active Client" | "Partner" | "Investor" | "Funder";
  proposed_stage?: string;
  current_stage?: string;
  score?: number;
  signals?: string[];
};

export type ClassifyRelationshipProposal = {
  id: string;
  title: string;
  priority: string | null;
  status: string;
  source_agent: string | null;
  due_date: string | null;
  notes_raw: string | null;
  created_at: string;
  org_notion_id: string | null;
  entity_payload: ClassifyRelationshipPayload;
};

const PRIORITY_RANK: Record<string, number> = {
  "P1 Critical": 0,
  "P2 High":     1,
  "P3 Medium":   2,
  "P4 Low":      3,
};

/**
 * Fetch all open `classify_relationship` proposals from Supabase, sorted by
 * priority then newest-first.
 *
 * Returns an empty list (and logs a warning) if the table is unreachable —
 * surfaces never crash because of an empty Supabase response.
 */
export async function getRelationshipClassificationProposals(): Promise<
  ClassifyRelationshipProposal[]
> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("decision_items")
      .select(
        "id, title, priority, status, source_agent, due_date, notes_raw, created_at, org_notion_id, entity_payload",
      )
      .eq("entity_action", "classify_relationship")
      .eq("status", "Open")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn(
        "[decision-items] supabase read failed:",
        error.message,
      );
      return [];
    }

    type Row = {
      id: string;
      title: string;
      priority: string | null;
      status: string | null;
      source_agent: string | null;
      due_date: string | null;
      notes_raw: string | null;
      created_at: string;
      org_notion_id: string | null;
      entity_payload: unknown;
    };

    const rows = (data as Row[] | null) ?? [];

    return rows
      .map((r) => ({
        id: r.id,
        title: r.title,
        priority: r.priority,
        status: r.status ?? "Open",
        source_agent: r.source_agent,
        due_date: r.due_date,
        notes_raw: r.notes_raw,
        created_at: r.created_at,
        org_notion_id: r.org_notion_id,
        entity_payload: (r.entity_payload ?? {}) as ClassifyRelationshipPayload,
      }))
      .sort((a, b) => {
        const aRank = PRIORITY_RANK[a.priority ?? ""] ?? 99;
        const bRank = PRIORITY_RANK[b.priority ?? ""] ?? 99;
        if (aRank !== bRank) return aRank - bRank;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
  } catch (err) {
    console.warn(
      "[decision-items] getRelationshipClassificationProposals threw:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
