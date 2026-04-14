import { notion, DB, prop, text, select, date, relationFirst } from "./core";

// ─── Evidence queries ─────────────────────────────────────────────────────────

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

export async function getEvidenceForProject(projectPageId: string): Promise<EvidenceItem[]> {
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
