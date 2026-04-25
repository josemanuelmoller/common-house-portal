/**
 * Read-mirror for hot Notion DBs — reads from Supabase mirror tables (synced
 * every 5 min from Notion via /api/cron/sync-notion-mirror) instead of going
 * to the Notion API on every page load.
 *
 * Drop-in replacements: same return shapes as the original `@/lib/notion/*`
 * functions, so the Hall just swaps the import. Notion remains the system of
 * record — agents and skills still write to Notion. The mirror is read-only.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { DecisionItem } from "@/lib/notion/decisions";
import type { DailyBriefing, MarketSignalBrief } from "@/lib/notion/briefings";
import type { CompetitiveIntelRow } from "@/lib/notion/competitive";

// ─── Decision items ───────────────────────────────────────────────────────────

/** Parse the embedded [MARKER:value] tags from "Proposed Action" / notes_raw. */
function parseDecisionNotes(raw: string | null) {
  if (!raw) {
    return {
      notes: "",
      relatedEntityId: undefined as string | undefined,
      relatedField: undefined as string | undefined,
      relatedResolutionType: undefined as string | undefined,
      relatedSearchDb: undefined as string | undefined,
      relatedFields: undefined as { field: string; label: string }[] | undefined,
      entityAction: undefined as "create_org" | "create_person" | undefined,
      entityName: undefined as string | undefined,
      entityDomain: undefined as string | undefined,
      entityCategory: undefined as string | undefined,
      contactName: undefined as string | undefined,
      contactEmail: undefined as string | undefined,
      personName: undefined as string | undefined,
      personEmail: undefined as string | undefined,
      personOrgId: undefined as string | undefined,
      personOrgName: undefined as string | undefined,
    };
  }

  const m = (re: RegExp) => raw.match(re)?.[1];
  const entityActionRaw = m(/\[ENTITY_ACTION:([^\]]+)\]/);
  const entityAction: "create_org" | "create_person" | undefined =
    entityActionRaw === "create_org" || entityActionRaw === "create_person" ? entityActionRaw : undefined;
  const fieldsMatch = m(/\[RESOLUTION_FIELDS:([^\]]+)\]/);
  const relatedFields = fieldsMatch
    ? fieldsMatch.split("|").map(pair => {
        const sep = pair.indexOf(":");
        return sep === -1
          ? { field: pair, label: pair }
          : { field: pair.slice(0, sep), label: pair.slice(sep + 1) };
      })
    : undefined;

  const stripped = raw
    .replace(/\[ENTITY_ID:[^\]]+\]/g, "")
    .replace(/\[RESOLUTION_FIELD:[^\]]+\]/g, "")
    .replace(/\[RESOLUTION_FIELDS:[^\]]+\]/g, "")
    .replace(/\[RESOLUTION_TYPE:[^\]]+\]/g, "")
    .replace(/\[RESOLUTION_DB:[^\]]+\]/g, "")
    .replace(/\[ENTITY_ACTION:[^\]]+\]/g, "")
    .replace(/\[ORG_NAME:[^\]]+\]/g, "")
    .replace(/\[ORG_DOMAIN:[^\]]+\]/g, "")
    .replace(/\[ORG_CATEGORY:[^\]]+\]/g, "")
    .replace(/\[CONTACT_NAME:[^\]]+\]/g, "")
    .replace(/\[CONTACT_EMAIL:[^\]]+\]/g, "")
    .replace(/\[PERSON_NAME:[^\]]+\]/g, "")
    .replace(/\[PERSON_EMAIL:[^\]]+\]/g, "")
    .replace(/\[PERSON_ORG_ID:[^\]]+\]/g, "")
    .replace(/\[PERSON_ORG_NAME:[^\]]+\]/g, "")
    .trimStart();

  return {
    notes: stripped,
    relatedEntityId:        m(/\[ENTITY_ID:([^\]]+)\]/),
    relatedField:           m(/\[RESOLUTION_FIELD:([^\]]+)\]/),
    relatedResolutionType:  m(/\[RESOLUTION_TYPE:([^\]]+)\]/),
    relatedSearchDb:        m(/\[RESOLUTION_DB:([^\]]+)\]/),
    relatedFields,
    entityAction,
    entityName:             m(/\[ORG_NAME:([^\]]+)\]/),
    entityDomain:           m(/\[ORG_DOMAIN:([^\]]+)\]/),
    entityCategory:         m(/\[ORG_CATEGORY:([^\]]+)\]/),
    contactName:            m(/\[CONTACT_NAME:([^\]]+)\]/),
    contactEmail:           m(/\[CONTACT_EMAIL:([^\]]+)\]/),
    personName:             m(/\[PERSON_NAME:([^\]]+)\]/),
    personEmail:            m(/\[PERSON_EMAIL:([^\]]+)\]/),
    personOrgId:            m(/\[PERSON_ORG_ID:([^\]]+)\]/),
    personOrgName:          m(/\[PERSON_ORG_NAME:([^\]]+)\]/),
  };
}

export async function getDecisionItems(statusFilter?: string): Promise<DecisionItem[]> {
  const sb = getSupabaseServerClient();
  let q = sb.from("notion_decision_items")
    .select("*")
    .order("priority", { ascending: true });
  if (statusFilter) q = q.eq("status", statusFilter);
  const { data, error } = await q;
  if (error) {
    console.warn("[notion-mirror] getDecisionItems falling back: ", error.message);
    return [];
  }
  return (data ?? []).map((r: Record<string, unknown>) => {
    const parsed = parseDecisionNotes(r.notes_raw as string | null);
    return {
      id:               r.id as string,
      title:            (r.title as string) ?? "Untitled",
      decisionType:     (r.decision_type as string) ?? "",
      priority:         (r.priority as string) ?? "",
      status:           (r.status as string) ?? "",
      sourceAgent:      (r.source_agent as string) ?? "",
      requiresExecute:  Boolean(r.requires_execute),
      executeApproved:  Boolean(r.execute_approved),
      dueDate:          (r.due_date as string | null) ?? null,
      notionUrl:        (r.notion_url as string) ?? "",
      category:         (r.category as string | undefined) ?? undefined,
      ...parsed,
    };
  });
}

// ─── Daily briefings ──────────────────────────────────────────────────────────

export async function getDailyBriefing(dateStr?: string): Promise<DailyBriefing | null> {
  const sb = getSupabaseServerClient();
  const target = dateStr ?? new Date().toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("notion_daily_briefings")
    .select("*")
    .eq("brief_date", target)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id:             r.id as string,
    date:           (r.brief_date as string | null) ?? null,
    focusOfDay:     (r.focus_of_day as string) ?? "",
    meetingPrep:    (r.meeting_prep as string) ?? "",
    myCommitments:  (r.my_commitments as string) ?? "",
    followUpQueue:  (r.follow_up_queue as string) ?? "",
    agentQueue:     (r.agent_queue as string) ?? "",
    marketSignals:  (r.market_signals as string) ?? "",
    readyToPublish: (r.ready_to_publish as string) ?? "",
    generatedAt:    (r.generated_at as string | null) ?? null,
    status:         (r.status as string) ?? "",
  };
}

// ─── Latest market signals (most recent briefing with non-empty signals) ─────

export async function getLatestMarketSignals(): Promise<{ text: string; date: string | null; generatedAt: string | null } | null> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("notion_daily_briefings")
    .select("market_signals, brief_date, generated_at, last_edited_at")
    .order("brief_date", { ascending: false })
    .limit(14);
  if (error) return null;
  for (const row of (data ?? []) as { market_signals: string | null; brief_date: string | null; generated_at: string | null; last_edited_at: string | null }[]) {
    if (row.market_signals && row.market_signals.trim().length > 0) {
      return {
        text:        row.market_signals,
        date:        row.brief_date,
        generatedAt: row.generated_at ?? row.last_edited_at ?? null,
      };
    }
  }
  return null;
}

// ─── Recent insight brief sources strip ──────────────────────────────────────

export async function getRecentInsightBriefBriefs(): Promise<MarketSignalBrief[]> {
  const sb = getSupabaseServerClient();
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data, error } = await sb
    .from("notion_insight_briefs")
    .select("id, title, source_link, notion_url, theme, source_type, last_edited_at")
    .gte("last_edited_at", since)
    .order("last_edited_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((r: Record<string, unknown>) => ({
    id:         r.id as string,
    title:      (r.title as string) || "Untitled",
    sourceLink: (r.source_link as string | null) ?? null,
    notionUrl:  (r.notion_url as string) ?? "",
    theme:      r.theme ? [r.theme as string] : [],
    sourceType: (r.source_type as string | null) ?? null,
  }));
}

// ─── Recent competitive intel ────────────────────────────────────────────────

export async function getRecentCompetitiveIntel(lookbackDays = 30): Promise<CompetitiveIntelRow[]> {
  const sb = getSupabaseServerClient();
  const since = new Date(Date.now() - lookbackDays * 86400_000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("notion_competitive_intel")
    .select("*")
    .neq("status", "Archived")
    .gte("date_captured", since)
    .order("date_captured", { ascending: false })
    .limit(50);
  if (error || !data) return [];
  return data.map((r: Record<string, unknown>) => ({
    id:           r.id as string,
    notionUrl:    (r.notion_url as string) ?? "",
    title:        (r.title as string) || "Untitled signal",
    summary:      (r.summary as string) ?? "",
    signalType:   (r.signal_type as string | null) ?? null,
    relevance:    (r.relevance as string | null) ?? null,
    status:       (r.status as string | null) ?? null,
    sourceUrl:    (r.source_url as string | null) ?? null,
    dateCaptured: (r.date_captured as string | null) ?? null,
    entityName:   (r.entity_name as string | null) ?? null,
    entityType:   (r.entity_type as string | null) ?? null,
  }));
}
