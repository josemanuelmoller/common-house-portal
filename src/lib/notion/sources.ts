import { notion, DB, prop, text, select, date, relationFirst } from "./core";

// ─── Sources queries ──────────────────────────────────────────────────────────

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

export async function getSourcesForProject(projectPageId: string): Promise<SourceItem[]> {
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
    const res = await notion.databases.query({
      database_id: DB.sources,
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 100,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return res.results.map((page: any) => ({
      ...parseSource(page),
      projectId: relationFirst(prop(page, "Linked Projects")),
    }));
  } catch {
    return [];
  }
}

export async function getDocumentsForProject(projectPageId: string): Promise<DocumentItem[]> {
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

export async function getSourceActivity(projectId: string): Promise<SourceActivity> {
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
