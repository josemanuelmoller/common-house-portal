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
import type { AgentDraft } from "@/lib/notion/drafts";
import { OUTBOX_DRAFT_TYPES } from "@/lib/notion/drafts";
import type { ProjectCard } from "@/lib/notion/projects";
import type { WarmthRecord } from "@/lib/notion/people";
import type { OpportunityItem, CandidateItem, ReadyContent } from "@/lib/notion";

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

// ─── Agent drafts ─────────────────────────────────────────────────────────────

export async function getAgentDrafts(statusFilter = "Pending Review"): Promise<AgentDraft[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("notion_agent_drafts")
    .select("*")
    .eq("status", statusFilter)
    .order("created_date", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((r: Record<string, unknown>) => ({
    id:              r.id as string,
    title:           (r.title as string) || "Untitled",
    draftType:       (r.draft_type as string) ?? "",
    status:          (r.status as string) ?? "",
    voice:           (r.voice as string) ?? "",
    platform:        (r.platform as string) ?? "",
    draftText:       (r.draft_text as string) ?? "",
    relatedEntityId: (r.related_entity_id as string | null) ?? null,
    opportunityId:   (r.opportunity_id as string | null) ?? null,
    createdDate:     (r.created_date as string | null) ?? null,
    notionUrl:       (r.notion_url as string) ?? "",
  }));
}

export async function getOutboxDrafts(): Promise<AgentDraft[]> {
  const all = await getAgentDrafts("Pending Review");
  return all.filter(d => OUTBOX_DRAFT_TYPES.has(d.draftType));
}

// ─── Projects + evidence/source counts ───────────────────────────────────────
//
// Reads from the existing `projects` (Wave 5 ingestor populated) + `evidence` +
// `sources` tables. Computes per-project counts in JS after a single batch fetch.

const NOTION_PAGE_BASE = "https://www.notion.so/";

function notionUrlFromId(notionId: string | null): string {
  if (!notionId) return "";
  return NOTION_PAGE_BASE + notionId.replace(/-/g, "");
}

// Statuses included by getProjectsOverview. Most surfaces only want Active;
// the Workrooms surface also wants pre-active prospects: "Proposed" (formal
// proposal sent) AND "Not started" (still pre-sale / qualifying — no project
// work yet, but already on the radar). Both buckets render under "Prospects".
type ProjectStatusFilter = readonly string[];
const ACTIVE_ONLY: ProjectStatusFilter = ["Active"];
const ACTIVE_AND_PROPOSED: ProjectStatusFilter = ["Active", "Proposed", "Not started"];

async function _projectsOverview(statuses: ProjectStatusFilter): Promise<ProjectCard[]> {
  const sb = getSupabaseServerClient();
  const [projRes, evRes, srcRes] = await Promise.all([
    sb.from("projects")
      .select("notion_id, name, project_status, current_stage, status_summary, draft_status_update, last_status_update, last_meeting_date, update_needed, geography, themes, hall_welcome_note, hall_current_focus, hall_next_milestone, hall_challenge, hall_matters_most, hall_obstacles, hall_success, primary_workspace, engagement_stage, engagement_model, workroom_mode, hall_mode, grant_eligible")
      .in("project_status", statuses as string[])
      .order("last_status_update", { ascending: false, nullsFirst: false }),
    sb.from("evidence")
      .select("project_notion_id, evidence_type, validation_status, reusability_level, date_captured"),
    sb.from("sources")
      .select("project_notion_id, source_type, source_platform"),
  ]);

  if (projRes.error) {
    console.warn("[notion-mirror] getProjectsOverview projects:", projRes.error.message);
    return [];
  }

  const evidence = (evRes.data ?? []) as {
    project_notion_id: string | null;
    evidence_type: string | null;
    validation_status: string | null;
    reusability_level: string | null;
    date_captured: string | null;
  }[];
  const sources = (srcRes.data ?? []) as {
    project_notion_id: string | null;
    source_type: string | null;
    source_platform: string | null;
  }[];

  // Group by project_notion_id once
  const evByProj = new Map<string, typeof evidence>();
  for (const e of evidence) {
    if (!e.project_notion_id) continue;
    const arr = evByProj.get(e.project_notion_id) ?? [];
    arr.push(e);
    evByProj.set(e.project_notion_id, arr);
  }
  const srcByProj = new Map<string, typeof sources>();
  for (const s of sources) {
    if (!s.project_notion_id) continue;
    const arr = srcByProj.get(s.project_notion_id) ?? [];
    arr.push(s);
    srcByProj.set(s.project_notion_id, arr);
  }

  return ((projRes.data ?? []) as Record<string, unknown>[]).map(p => {
    const id = p.notion_id as string;
    const projEv  = evByProj.get(id)  ?? [];
    const projSrc = srcByProj.get(id) ?? [];

    const validated = projEv.filter(e => e.validation_status === "Validated" || e.validation_status === "Reviewed");

    const emailCount    = projSrc.filter(s => (s.source_type ?? "").includes("Email")   || s.source_platform === "Gmail").length;
    const meetingCount  = projSrc.filter(s => (s.source_type ?? "").includes("Meeting") || s.source_platform === "Fireflies").length;
    const documentCount = projSrc.filter(s => s.source_type === "Document"              || s.source_platform === "Google Drive").length;

    const lastEvidenceDate = projEv.reduce<string | null>((latest, e) => {
      const d = e.date_captured;
      if (!d) return latest;
      if (!latest) return d;
      return d > latest ? d : latest;
    }, null);

    return {
      id,
      name:               (p.name as string) ?? "",
      status:             (p.project_status as string) ?? "",
      stage:              (p.current_stage as string) ?? "",
      statusSummary:      (p.status_summary as string) ?? "",
      draftUpdate:        (p.draft_status_update as string) ?? "",
      lastUpdate:         (p.last_status_update as string | null) ?? null,
      lastMeetingDate:    (p.last_meeting_date as string | null) ?? null,
      updateNeeded:       Boolean(p.update_needed),
      // geography / themes are stored as a single text in Supabase; expose as 1-element array.
      geography:          p.geography ? [(p.geography as string)] : [],
      themes:             p.themes ? [(p.themes as string)] : [],
      hallWelcomeNote:    (p.hall_welcome_note as string) ?? "",
      hallCurrentFocus:   (p.hall_current_focus as string) ?? "",
      hallNextMilestone:  (p.hall_next_milestone as string) ?? "",
      hallChallenge:      (p.hall_challenge as string) ?? "",
      hallMattersMost:    (p.hall_matters_most as string) ?? "",
      hallObstacles:      (p.hall_obstacles as string) ?? "",
      hallSuccess:        (p.hall_success as string) ?? "",
      primaryWorkspace:   (p.primary_workspace as string) ?? "hall",
      engagementStage:    (p.engagement_stage as string) ?? "",
      engagementModel:    (p.engagement_model as string) ?? "",
      workroomMode:       (p.workroom_mode as string) ?? "",
      hallMode:           (p.hall_mode as string | undefined) ?? "explore",
      grantEligible:      Boolean(p.grant_eligible),
      // Aggregates
      evidenceCount:      projEv.length,
      validatedCount:     validated.length,
      blockerCount:       validated.filter(e => e.evidence_type === "Blocker").length,
      sourcesCount:       projSrc.length,
      emailCount,
      meetingCount,
      documentCount,
      decisionCount:      validated.filter(e => e.evidence_type === "Decision").length,
      dependencyCount:    validated.filter(e => e.evidence_type === "Dependency").length,
      outcomeCount:       validated.filter(e => e.evidence_type === "Outcome").length,
      newEvidenceCount:   projEv.filter(e => e.validation_status === "New").length,
      reusableCount:      validated.filter(e => e.reusability_level === "Reusable" || e.reusability_level === "Canonical").length,
      lastEvidenceDate,
    } satisfies ProjectCard;
  });
}

/** Active projects only — the default for most admin surfaces. */
export function getProjectsOverview(): Promise<ProjectCard[]> {
  return _projectsOverview(ACTIVE_ONLY);
}

/** Active + Proposed — used by Workrooms to show Prospects alongside Clients. */
export function getWorkroomProjectsOverview(): Promise<ProjectCard[]> {
  return _projectsOverview(ACTIVE_AND_PROPOSED);
}

// ─── Opportunities ────────────────────────────────────────────────────────────

export async function getOpportunitiesByScope(): Promise<{ ch: OpportunityItem[]; portfolio: OpportunityItem[] }> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .select("notion_id, title, status, scope, follow_up_status, opportunity_type, opportunity_score, qualification_status, org_name, updated_at")
    .not("status", "in", '("Closed Won","Closed Lost","Stalled")')
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error || !data) return { ch: [], portfolio: [] };

  const all: OpportunityItem[] = data.map((r: Record<string, unknown>) => ({
    id:                  (r.notion_id as string) ?? "",
    name:                (r.title as string) || "Untitled",
    stage:               (r.status as string) ?? "",
    scope:               (r.scope as string) ?? "",
    followUpStatus:      (r.follow_up_status as string) ?? "",
    type:                (r.opportunity_type as string) ?? "",
    orgName:             (r.org_name as string) ?? "",
    lastEdited:          r.updated_at ? (r.updated_at as string).slice(0, 10) : null,
    notionUrl:           notionUrlFromId(r.notion_id as string | null),
    score:               typeof r.opportunity_score === "number" ? (r.opportunity_score as number) : null,
    qualificationStatus: (r.qualification_status as string) || "Not Scored",
  }));
  return {
    ch:        all.filter(o => o.scope === "CH" || o.scope === "Both"),
    portfolio: all.filter(o => o.scope === "Portfolio" || o.scope === "Both"),
  };
}

// ─── Candidate opportunities ─────────────────────────────────────────────────

function parseSignalPrefix(raw: string | null): {
  origins: ("meeting" | "email" | "doc")[];
  ref: string | null;
  signalDate: string | null;
  context: string | null;
} {
  if (!raw) return { origins: [], ref: null, signalDate: null, context: null };
  if (!raw.startsWith("SIGNALS:")) {
    return { origins: [], ref: null, signalDate: null, context: raw || null };
  }
  const parts = raw.split("|");
  const origins: ("meeting" | "email" | "doc")[] = [];
  let ref: string | null = null;
  let signalDate: string | null = null;
  const contextParts: string[] = [];
  for (const part of parts) {
    if (part.startsWith("SIGNALS:")) {
      for (const s of part.slice(8).split(",")) {
        const t = s.trim() as "meeting" | "email" | "doc";
        if (t === "meeting" || t === "email" || t === "doc") origins.push(t);
      }
    } else if (part.startsWith("REF:"))   ref = part.slice(4).trim() || null;
    else if (part.startsWith("DATE:"))    signalDate = part.slice(5).trim() || null;
    else                                   contextParts.push(part);
  }
  return { origins, ref, signalDate, context: contextParts.join(" ").trim() || null };
}

export async function getCandidateOpportunities(): Promise<CandidateItem[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("opportunities")
    .select("notion_id, title, status, opportunity_type, org_name, source_url, trigger_signal, notion_created_at, created_at")
    .eq("status", "New")
    .order("notion_created_at", { ascending: false, nullsFirst: false })
    .limit(15);
  if (error || !data) return [];
  return data.map((r: Record<string, unknown>) => {
    const rawSignal = (r.trigger_signal as string | null) ?? null;
    const { origins, ref, signalDate, context } = parseSignalPrefix(rawSignal);
    return {
      id:            (r.notion_id as string) ?? "",
      name:          (r.title as string) || "Untitled",
      orgName:       (r.org_name as string) ?? "",
      type:          (r.opportunity_type as string) ?? "",
      notionUrl:     notionUrlFromId(r.notion_id as string | null),
      signalContext: context,
      sourceUrl:     (r.source_url as string | null) ?? null,
      createdTime:   (r.notion_created_at as string | null) ?? (r.created_at as string | null) ?? null,
      signalOrigins: origins,
      signalRef:     ref,
      signalDate,
    };
  });
}

// ─── Cold relationships ──────────────────────────────────────────────────────

export async function getColdRelationships(): Promise<WarmthRecord[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("people")
    .select("notion_id, full_name, job_title, email, contact_warmth, last_contact_date")
    .in("contact_warmth", ["Cold", "Dormant"])
    .order("last_contact_date", { ascending: true, nullsFirst: true })
    .limit(20);
  if (error || !data) return [];
  return data
    .map((r: Record<string, unknown>) => ({
      id:              (r.notion_id as string) ?? "",
      name:            (r.full_name as string) ?? "",
      jobTitle:        (r.job_title as string) ?? "",
      email:           (r.email as string) ?? "",
      warmth:          (r.contact_warmth as string) ?? "",
      lastContactDate: (r.last_contact_date as string | null) ?? null,
      notionUrl:       notionUrlFromId(r.notion_id as string | null),
    }))
    .filter(p => p.name.trim() !== "");
}

// ─── Ready-to-publish content ────────────────────────────────────────────────

export async function getReadyContent(): Promise<ReadyContent[]> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("notion_content_pipeline")
    .select("id, title, platform, channel, content_type, publish_window, publish_date, notion_url")
    .eq("status", "Ready to Publish")
    .order("last_edited_at", { ascending: false })
    .limit(10);
  if (error || !data) return [];
  return data.map((r: Record<string, unknown>) => ({
    id:            (r.id as string),
    title:         (r.title as string) || "Untitled",
    platform:      (r.platform as string) || (r.channel as string) || "",
    contentType:   (r.content_type as string) ?? "",
    publishWindow: (r.publish_window as string) || (r.publish_date as string) || "",
    notionUrl:     (r.notion_url as string) ?? "",
  }));
}
