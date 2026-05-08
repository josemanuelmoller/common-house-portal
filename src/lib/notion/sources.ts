import { notion, DB, prop, text, select, date, relationFirst } from "./core";

// ─── Sources queries ──────────────────────────────────────────────────────────
//
// `local-*` projectIds: read from Supabase directly. These are projects born
// outside the legacy Notion path (e.g. prospects created by the Hall pipeline,
// workroom-bridge auto-creation, manual SQL inserts) and therefore have no
// Notion mirror. Same routing pattern as `getProjectById` in projects.ts.

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
function parseSource(page: any): SourceItem {
  return {
    id: page.id,
    title: text(prop(page, "Source Title")) || "Untitled",
    sourceType: select(prop(page, "Source Type")),
    status: select(prop(page, "Processing Status")),
    dateIngested: (page.created_time as string) ?? null,
    projectId: relationFirst(prop(page, "Linked Projects")),
  };
}

async function getSourcesForProjectFromSupabase(projectId: string): Promise<SourceItem[]> {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("sources")
    .select("id, title, source_type, processing_status, source_date, project_notion_id, created_at")
    .eq("project_notion_id", projectId)
    .order("source_date", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error || !data) return [];
  return data.map(r => ({
    id:           (r.id as string),
    title:        (r.title as string) || "Untitled",
    sourceType:   (r.source_type as string) || "",
    status:       (r.processing_status as string) || "",
    dateIngested: (r.source_date as string | null) ?? (r.created_at as string | null) ?? null,
    projectId:    (r.project_notion_id as string | null) ?? null,
  }));
}

export async function getSourcesForProject(projectPageId: string): Promise<SourceItem[]> {
  if (projectPageId.startsWith("local-")) {
    return getSourcesForProjectFromSupabase(projectPageId);
  }
  try {
    const res = await notion.databases.query({
      database_id: DB.sources,
      filter: { property: "Linked Projects", relation: { contains: projectPageId } },
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 50,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.results.map((page: any) => parseSource(page));
  } catch {
    return [];
  }
}

export async function getAllSources(): Promise<SourceItem[]> {
  try {
    const all: SourceItem[] = [];
    let cursor: string | undefined;
    do {
      const res = await notion.databases.query({
        database_id: DB.sources,
        sorts: [{ timestamp: "created_time", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const page of res.results as any[]) {
        all.push({ ...parseSource(page), projectId: relationFirst(prop(page, "Linked Projects")) });
      }
      cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
    } while (cursor);
    return all;
  } catch {
    return [];
  }
}

async function getDocumentsForProjectFromSupabase(projectId: string): Promise<DocumentItem[]> {
  const sb = await getSupabase();
  // Fetch all sources for the project and filter client-side. Avoids fragile
  // PostgREST .or() syntax with spaces in values like "Google Drive".
  const { data, error } = await sb
    .from("sources")
    .select("id, title, source_url, source_platform, source_type, source_date")
    .eq("project_notion_id", projectId)
    .order("source_date", { ascending: false, nullsFirst: false })
    .limit(100);
  if (error || !data) return [];
  return data
    .filter(r => r.source_type === "Document" || r.source_platform === "Google Drive")
    .map(r => ({
      id:         (r.id as string),
      title:      (r.title as string) || "Untitled document",
      url:        (r.source_url as string) || "",
      platform:   (r.source_platform as string) || "",
      sourceDate: (r.source_date as string | null) ?? null,
    }))
    .filter(d => d.url);
}

export async function getDocumentsForProject(projectPageId: string): Promise<DocumentItem[]> {
  if (projectPageId.startsWith("local-")) {
    return getDocumentsForProjectFromSupabase(projectPageId);
  }
  try {
    const res = await notion.databases.query({
      database_id: DB.sources,
      filter: {
        and: [
          { property: "Linked Projects", relation: { contains: projectPageId } },
          {
            or: [
              { property: "Source Type",     select: { equals: "Document" }     },
              { property: "Source Platform", select: { equals: "Google Drive" } },
            ],
          },
        ],
      },
      sorts: [{ property: "Source Date", direction: "descending" }],
      page_size: 50,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[])
      .map(page => ({
        id:         page.id,
        title:      text(prop(page, "Source Title")) || "Untitled document",
        url:        (page.properties?.["Source URL"]?.url as string) ?? "",
        platform:   select(prop(page, "Source Platform")),
        sourceDate: date(prop(page, "Source Date")),
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
    const cutoff = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const res = await notion.databases.query({
      database_id: DB.sources,
      filter: {
        and: [
          // Meeting or Fireflies source type/platform
          {
            or: [
              { property: "Source Type",     select: { equals: "Meeting" }    },
              { property: "Source Platform", select: { equals: "Fireflies" }  },
            ],
          },
          // Must have a processed summary (means OS engine has run on it)
          { property: "Processed Summary", rich_text: { is_not_empty: true } },
          // Within lookback window (Source Date)
          { property: "Source Date", date: { on_or_after: cutoff } },
        ],
      },
      sorts: [{ property: "Source Date", direction: "descending" }],
      page_size: 30,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (res.results as any[]).map(page => ({
      id:               page.id,
      title:            text(prop(page, "Source Title")) || "Untitled meeting",
      sourceDate:       date(prop(page, "Source Date")),
      processedSummary: text(prop(page, "Processed Summary")) || "",
      url:              page.properties?.["Source URL"]?.url ?? null,
      projectId:        relationFirst(prop(page, "Linked Projects")),
    })).filter(m => m.processedSummary.length > 0);
  } catch {
    return [];
  }
}

async function getSourceActivityFromSupabase(projectId: string): Promise<SourceActivity> {
  const sb = await getSupabase();
  const { data, error } = await sb
    .from("sources")
    .select("id, title, source_type, source_platform, source_url, source_date, processed_summary")
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
        id:               (r.id as string),
        title:            (r.title as string) || "Untitled",
        date:             (r.source_date as string | null) ?? null,
        url:              (r.source_url as string) || "",
        platform,
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
}

export async function getSourceActivity(projectId: string): Promise<SourceActivity> {
  if (projectId.startsWith("local-")) {
    return getSourceActivityFromSupabase(projectId);
  }
  try {
    const res = await notion.databases.query({
      database_id: DB.sources,
      filter: { property: "Linked Projects", relation: { contains: projectId } },
      sorts: [{ property: "Source Date", direction: "descending" }],
      page_size: 100,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pages = res.results as any[];

    const meetings: MeetingItem[] = [];
    let emailCount = 0;
    let documentCount = 0;
    let otherCount = 0;

    for (const page of pages) {
      const sourceType = select(prop(page, "Source Type"));
      const platform   = select(prop(page, "Source Platform"));

      const isMeeting  = sourceType.includes("Meeting") || platform === "Fireflies";
      const isEmail    = sourceType.includes("Email")   || platform === "Gmail";
      const isDocument = sourceType === "Document"      || platform === "Google Drive";

      if (isMeeting) {
        meetings.push({
          id:               page.id,
          title:            text(prop(page, "Source Title")) || "Untitled",
          date:             date(prop(page, "Source Date")),
          url:              page.properties?.["Source URL"]?.url ?? "",
          platform,
          // "Processed Summary" is written by the OS engine after meeting intake.
          // It may be empty for older sources that were ingested before the field was populated.
          processedSummary: text(prop(page, "Processed Summary")) || undefined,
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
      totalCount: pages.length,
    };
  } catch {
    return { meetings: [], emailCount: 0, documentCount: 0, otherCount: 0, totalCount: 0 };
  }
}
