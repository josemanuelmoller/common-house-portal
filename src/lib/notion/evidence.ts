import { notion, DB, prop, text, select, date, relationFirst } from "./core";

// ─── Evidence queries ─────────────────────────────────────────────────────────

// Internal: full evidence cursor scan — no filter, paginates until all records
// are fetched. Used only by getProjectsOverview (projects.ts) to build per-project
// evidence counts. Prefer getEvidenceForProject or getAllEvidence for filtered queries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllEvidence(): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  let cursor: string | undefined;
  do {
    const res = await notion.databases.query({
      database_id: DB.evidence,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    all.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return all;
}

export type EvidenceItem = {
  id: string;
  title: string;
  type: string;
  validationStatus: string;
  confidence: string;
  reusability: string;
  dateCaptured: string | null;
  excerpt: string;
  projectId: string | null;
  projectName?: string;
};

async function getEvidenceForProjectFromSupabase(projectId: string): Promise<EvidenceItem[]> {
  const { getSupabaseServerClient } = await import("../supabase-server");
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("evidence")
    .select("id, title, evidence_statement, evidence_type, validation_status, confidence_level, reusability_level, date_captured, source_excerpt, project_notion_id")
    .eq("project_notion_id", projectId)
    .order("date_captured", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error || !data) return [];
  return data.map(r => ({
    id:               (r.id as string),
    title:            ((r.title as string | null) ?? (r.evidence_statement as string | null) ?? "") || "",
    type:             (r.evidence_type as string | null) ?? "",
    validationStatus: (r.validation_status as string | null) ?? "",
    confidence:       (r.confidence_level as string | null) ?? "",
    reusability:      (r.reusability_level as string | null) ?? "",
    dateCaptured:     (r.date_captured as string | null) ?? null,
    excerpt:          (r.source_excerpt as string | null) ?? "",
    projectId:        (r.project_notion_id as string | null) ?? null,
  }));
}

export async function getEvidenceForProject(projectPageId: string): Promise<EvidenceItem[]> {
  if (projectPageId.startsWith("local-")) {
    return getEvidenceForProjectFromSupabase(projectPageId);
  }
  const res = await notion.databases.query({
    database_id: DB.evidence,
    filter: { property: "Project", relation: { contains: projectPageId } },
    sorts: [{ property: "Date Captured", direction: "descending" }],
    page_size: 50,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    title: text(prop(page, "Evidence Title")),
    type: select(prop(page, "Evidence Type")),
    validationStatus: select(prop(page, "Validation Status")),
    confidence: select(prop(page, "Confidence Level")),
    reusability: select(prop(page, "Reusability Level")),
    dateCaptured: date(prop(page, "Date Captured")),
    excerpt: text(prop(page, "Source Excerpt")),
    projectId: relationFirst(prop(page, "Project")),
  }));
}

// All evidence — for OS queue, with optional validation status filter
export async function getAllEvidence(validationStatus?: string): Promise<EvidenceItem[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = validationStatus
    ? { property: "Validation Status", select: { equals: validationStatus } }
    : undefined;

  const res = await notion.databases.query({
    database_id: DB.evidence,
    filter,
    sorts: [{ property: "Date Captured", direction: "descending" }],
    page_size: 100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    title: text(prop(page, "Evidence Title")),
    type: select(prop(page, "Evidence Type")),
    validationStatus: select(prop(page, "Validation Status")),
    confidence: select(prop(page, "Confidence Level")),
    reusability: select(prop(page, "Reusability Level")),
    dateCaptured: date(prop(page, "Date Captured")),
    excerpt: text(prop(page, "Source Excerpt")),
    projectId: relationFirst(prop(page, "Project")),
  }));
}

// Reusable + Canonical validated evidence — for Knowledge System.
// Includes both "Reusable" and "Canonical" tiers (Canonical = highest reusability level;
// produced by the OS engine's triage-knowledge skill). Filtering only "Reusable" would
// silently omit the most important cross-cutting knowledge items.
export async function getReusableEvidence(): Promise<EvidenceItem[]> {
  const res = await notion.databases.query({
    database_id: DB.evidence,
    filter: {
      and: [
        {
          or: [
            { property: "Reusability Level", select: { equals: "Reusable" } },
            { property: "Reusability Level", select: { equals: "Canonical" } },
          ],
        },
        { property: "Validation Status", select: { equals: "Validated" } },
      ],
    },
    sorts: [{ property: "Date Captured", direction: "descending" }],
    page_size: 50,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.results.map((page: any) => ({
    id: page.id,
    title: text(prop(page, "Evidence Title")),
    type: select(prop(page, "Evidence Type")),
    validationStatus: select(prop(page, "Validation Status")),
    confidence: select(prop(page, "Confidence Level")),
    reusability: select(prop(page, "Reusability Level")),
    dateCaptured: date(prop(page, "Date Captured")),
    excerpt: text(prop(page, "Source Excerpt")),
    projectId: relationFirst(prop(page, "Project")),
  }));
}
