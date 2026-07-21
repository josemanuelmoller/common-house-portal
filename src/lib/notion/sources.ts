// ─── Sources queries (Supabase-backed) ────────────────────────────────────────
//
// This module reads exclusively from Supabase (public.sources). No Notion.
// The `id` field on every returned record is the row's `notion_id` — the stable
// id used by call sites and for URL reconstruction.

async function getSupabase() {
  const { getSupabaseServerClient } = await import("../supabase-server");
  return getSupabaseServerClient();
}

export type SourceItem = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  dateIngested: string | null;
  projectId: string | null;
};

export type DocumentItem = {
  id: string;
  title: string;
  url: string;
  platform: string;
  sourceDate: string | null;
};

// ─── Source Activity ──────────────────────────────────────────────────────────

export type MeetingItem = {
  id: string;
  title: string;
  date: string | null;
  url: string;
  platform: string;
  // "Processed Summary" field from CH Sources [OS v2] — populated by the OS engine after meeting intake
  processedSummary?: string;
};

export type SourceActivity = {
  meetings: MeetingItem[];
  emailCount: number;
  documentCount: number;
  otherCount: number;
  totalCount: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSourceRow(r: any): SourceItem {
  return {
    id:           (r.notion_id as string) ?? "",
    title:        (r.title as string) || "Untitled",
    sourceType:   (r.source_type as string) || "",
    status:       (r.processing_status as string) || "",
    dateIngested: (r.notion_created_at as string | null) ?? (r.source_date as string | null) ?? null,
    projectId:    (r.project_notion_id as string | null) ?? null,
  };
}

export async function getSourcesForProject(projectPageId: string): Promise<SourceItem[]> {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from("sources")
      .select("notion_id, title, source_type, processing_status, source_date, notion_created_at, project_notion_id")
      .eq("project_notion_id", projectPageId)
      .order("source_date", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error || !data) return [];
    return data.map(mapSourceRow);
  } catch {
    return [];
  }
}

export async function getAllSources(): Promise<SourceItem[]> {
  try {
    const sb = await getSupabase();
    const all: SourceItem[] = [];
    const pageSize = 1000;
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await sb
        .from("sources")
        .select("notion_id, title, source_type, processing_status, source_date, notion_created_at, project_notion_id")
        .order("notion_created_at", { ascending: false, nullsFirst: false })
        .range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data.map(mapSourceRow));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  } catch {
    return [];
  }
}

export async function getDocumentsForProject(projectPageId: string): Promise<DocumentItem[]> {
  try {
    const sb = await getSupabase();
    // Fetch sources for the project and filter client-side. Avoids fragile
    // PostgREST .or() syntax with spaces in values like "Google Drive".
    const { data, error } = await sb
      .from("sources")
      .select("notion_id, title, source_url, source_platform, source_type, source_date")
      .eq("project_notion_id", projectPageId)
      .order("source_date", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error || !data) return [];
    return data
      .filter(r => r.source_type === "Document" || r.source_platform === "Google Drive")
      .map(r => ({
        id:         (r.notion_id as string) ?? "",
        title:      (r.title as string) || "Untitled document",
        url:        (r.source_url as string) || "",
        platform:   (r.source_platform as string) || "",
        sourceDate: (r.source_date as string | null) ?? null,
      }))
      .filter(d => d.url); // only show docs with an actual URL
  } catch {
    return [];
  }
}

// ─── Meeting Sources for candidate scanning ───────────────────────────────────
// Used by /api/scan-opportunity-candidates to detect opportunity signals in
// recent meeting summaries (Fireflies + manually ingested meetings).

export type MeetingSourceRaw = {
  id: string;
  title: string;
  sourceDate: string | null;       // ISO date from "Source Date" field
  processedSummary: string;        // non-empty by filter
  url: string | null;              // Fireflies or recording URL
  projectId: string | null;        // first linked project (if any)
};

export async function getRecentMeetingSources(lookbackDays: number): Promise<MeetingSourceRaw[]> {
  try {
    const sb = await getSupabase();
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await sb
      .from("sources")
      .select("notion_id, title, source_date, processed_summary, source_url, source_type, source_platform, project_notion_id")
      // Meeting or Fireflies source type/platform
      .or("source_platform.ilike.%fireflies%,source_type.ilike.%meeting%")
      // Within lookback window (Source Date)
      .gte("source_date", cutoff)
      // Must have a processed summary (means OS engine has run on it)
      .not("processed_summary", "is", null)
      .order("source_date", { ascending: false, nullsFirst: false })
      .limit(30);
    if (error || !data) return [];
    return data
      .map(r => ({
        id:               (r.notion_id as string) ?? "",
        title:            (r.title as string) || "Untitled meeting",
        sourceDate:       (r.source_date as string | null) ?? null,
        processedSummary: (r.processed_summary as string | null) || "",
        url:              (r.source_url as string | null) ?? null,
        projectId:        (r.project_notion_id as string | null) ?? null,
      }))
      .filter(m => m.processedSummary.length > 0);
  } catch {
    return [];
  }
}

export async function getSourceActivity(projectId: string): Promise<SourceActivity> {
  try {
    const sb = await getSupabase();
    const { data, error } = await sb
      .from("sources")
      .select("notion_id, title, source_type, source_platform, source_url, source_date, processed_summary, project_notion_id")
      .eq("project_notion_id", projectId)
      .order("source_date", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error || !data) {
      return { meetings: [], emailCount: 0, documentCount: 0, otherCount: 0, totalCount: 0 };
    }

    const meetings: MeetingItem[] = [];
    let emailCount = 0;
    let documentCount = 0;
    let otherCount = 0;

    for (const r of data) {
      const sourceType = (r.source_type as string | null) ?? "";
      const platform   = (r.source_platform as string | null) ?? "";

      const isMeeting  = sourceType.includes("Meeting") || platform === "Fireflies";
      const isEmail    = sourceType.includes("Email")   || platform === "Gmail";
      const isDocument = sourceType === "Document"      || platform === "Google Drive";

      if (isMeeting) {
        meetings.push({
          id:               (r.notion_id as string) ?? "",
          title:            (r.title as string) || "Untitled",
          date:             (r.source_date as string | null) ?? null,
          url:              (r.source_url as string) || "",
          platform,
          // "Processed Summary" is written by the OS engine after meeting intake.
          // It may be empty for older sources that were ingested before the field was populated.
          processedSummary: (r.processed_summary as string | null) || undefined,
        });
      } else if (isEmail) {
        emailCount++;
      } else if (isDocument) {
        documentCount++;
      } else {
        otherCount++;
      }
    }

    return {
      meetings,
      emailCount,
      documentCount,
      otherCount,
      totalCount: data.length,
    };
  } catch {
    return { meetings: [], emailCount: 0, documentCount: 0, otherCount: 0, totalCount: 0 };
  }
}
