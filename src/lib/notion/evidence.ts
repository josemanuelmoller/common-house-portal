// ─── Evidence queries (Supabase-backed) ───────────────────────────────────────
//
// This module reads exclusively from Supabase (public.evidence). No Notion.
// The `id` field on every returned record is the row's `notion_id` — the stable
// id used by call sites and for URL reconstruction.

const EVIDENCE_COLUMNS =
  "notion_id, title, evidence_statement, evidence_type, validation_status, confidence_level, reusability_level, date_captured, source_excerpt, project_notion_id";

// Internal: full evidence scan — no filter, paginates until all rows are fetched.
// Used only by getProjectsOverview (projects.ts) to build per-project evidence
// counts. Prefer getEvidenceForProject or getAllEvidence for filtered queries.
// Returns raw Supabase rows (project_notion_id / validation_status / evidence_type
// / reusability_level / date_captured) consumed by projects.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllEvidence(): Promise<any[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all: any[] = [];
    const pageSize = 1000;
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await sb
        .from("evidence")
        .select("notion_id, evidence_type, validation_status, reusability_level, date_captured, project_notion_id")
        .range(from, from + pageSize - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  } catch {
    return [];
  }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvidenceRow(r: any): EvidenceItem {
  return {
    id:               (r.notion_id as string) ?? "",
    title:            ((r.title as string | null) ?? (r.evidence_statement as string | null) ?? "") || "",
    type:             (r.evidence_type as string | null) ?? "",
    validationStatus: (r.validation_status as string | null) ?? "",
    confidence:       (r.confidence_level as string | null) ?? "",
    reusability:      (r.reusability_level as string | null) ?? "",
    dateCaptured:     (r.date_captured as string | null) ?? null,
    excerpt:          (r.source_excerpt as string | null) ?? "",
    projectId:        (r.project_notion_id as string | null) ?? null,
  };
}

export async function getEvidenceForProject(projectPageId: string): Promise<EvidenceItem[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("evidence")
      .select(EVIDENCE_COLUMNS)
      .eq("project_notion_id", projectPageId)
      .order("date_captured", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error || !data) return [];
    return data.map(mapEvidenceRow);
  } catch {
    return [];
  }
}

// All evidence — for OS queue, with optional validation status filter
export async function getAllEvidence(validationStatus?: string): Promise<EvidenceItem[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    let q = sb.from("evidence").select(EVIDENCE_COLUMNS);
    if (validationStatus) q = q.eq("validation_status", validationStatus);
    const { data, error } = await q
      .order("date_captured", { ascending: false, nullsFirst: false })
      .limit(100);
    if (error || !data) return [];
    return data.map(mapEvidenceRow);
  } catch {
    return [];
  }
}

// Reusable + Canonical validated evidence — for Knowledge System.
// Includes both "Reusable" and "Canonical" tiers (Canonical = highest reusability level;
// produced by the OS engine's triage-knowledge skill). Filtering only "Reusable" would
// silently omit the most important cross-cutting knowledge items.
export async function getReusableEvidence(): Promise<EvidenceItem[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("evidence")
      .select(EVIDENCE_COLUMNS)
      .in("reusability_level", ["Reusable", "Canonical"])
      .eq("validation_status", "Validated")
      .order("date_captured", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error || !data) return [];
    return data.map(mapEvidenceRow);
  } catch {
    return [];
  }
}
