import { supabaseAdmin } from "./supabase";

export type ObjectiveType =
  | "revenue"
  | "milestone"
  | "asset"
  | "client_goal"
  | "event"
  | "hiring";

export type ObjectiveTier = "high" | "mid" | "low";

export type ObjectiveStatus = "active" | "achieved" | "slipped" | "dropped";

export type ObjectiveArea =
  | "commercial"
  | "partnerships"
  | "product"
  | "brand"
  | "ops"
  | "funding";

export type ObjectiveMetricType =
  | "revenue_sum"
  | "revenue_pipeline"
  | "contracts_count"
  | "client_count_by_type"
  | "milestone_binary"
  | "event_attended"
  | "hiring_filled"
  | "asset_published"
  | "mou_signed"
  | "geo_spread"
  | "custom_sql"
  | "manual";

export type StrategicObjective = {
  id: string;
  year: number;
  quarter: number | null;
  area: ObjectiveArea;
  objective_type: ObjectiveType;
  tier: ObjectiveTier;
  title: string;
  description: string | null;
  target_value: number | null;
  target_unit: string | null;
  current_value: number | null;
  original_target: number | null;
  status: ObjectiveStatus;
  metric_type: ObjectiveMetricType;
  metric_params: Record<string, unknown>;
  linked_opportunities: string[];
  linked_projects: string[];
  linked_people: string[];
  notes: string | null;
  slipped_from_quarter: number | null;
  slipped_from_year: number | null;
  last_computed_at: string | null;
  achieved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RevenueEvent = {
  id: string;
  opportunity_id: string | null;
  organization_id: string | null;
  stage: "sold" | "invoiced" | "paid";
  amount: number;
  currency: string;
  paid_date: string | null;
  invoice_date: string | null;
  due_date: string | null;
  year: number | null;
  quarter: number | null;
};

export type PlanPeriod = {
  year: number;
  quarter: number | null;
};

export async function getObjectivesForYear(year: number): Promise<StrategicObjective[]> {
  const { data, error } = await supabaseAdmin()
    .from("strategic_objectives")
    .select("*")
    .eq("year", year)
    .order("quarter", { ascending: true, nullsFirst: true })
    .order("tier", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`getObjectivesForYear: ${error.message}`);
  return (data ?? []) as StrategicObjective[];
}

export async function getRevenueEventsForYear(year: number): Promise<RevenueEvent[]> {
  const { data, error } = await supabaseAdmin()
    .from("revenue_events")
    .select("*")
    .eq("year", year);
  if (error) throw new Error(`getRevenueEventsForYear: ${error.message}`);
  return (data ?? []) as RevenueEvent[];
}

// ─── Objective artifacts (plan-master-agent output) ──────────────────────────

export type ArtifactType =
  | "draft_doc"
  | "proposal"
  | "brief"
  | "slide_deck"
  | "sheet"
  | "pdf"
  | "other";

export type ArtifactStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "sent"
  | "archived";

export type ObjectiveArtifact = {
  id: string;
  objective_id: string;
  artifact_type: ArtifactType;
  title: string;
  drive_url: string | null;
  drive_file_id: string | null;
  drive_folder_id: string | null;
  status: ArtifactStatus;
  generated_by: string | null;
  evidence_basis: string[];
  calendar_event_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
};

export type ObjectiveArtifactWithObjective = ObjectiveArtifact & {
  objective_title: string;
  objective_tier: ObjectiveTier;
  objective_area: ObjectiveArea;
  objective_type: ObjectiveType;
  objective_year: number;
  objective_quarter: number | null;
  current_version_id: string | null;
  latest_version_number: number | null;
  open_questions_count: number;
  answered_questions_count: number;
};

export type QuestionStatus = "open" | "answered" | "dropped" | "superseded";

export type ArtifactQuestion = {
  id: string;
  artifact_id: string;
  version_introduced: number;
  question: string;
  rationale: string | null;
  status: QuestionStatus;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ArtifactVersion = {
  id: string;
  artifact_id: string;
  version_number: number;
  drive_file_id: string | null;
  drive_url: string | null;
  summary_of_changes: string | null;
  generated_by: string | null;
  content: string | null;
  answers_used: Array<{ question_id: string; question: string; answer: string }>;
  model: string | null;
  tokens_used: number | null;
  created_at: string;
};

export async function getObjectiveArtifacts(): Promise<ObjectiveArtifactWithObjective[]> {
  const client = supabaseAdmin();

  const { data: artifactRows, error } = await client
    .from("objective_artifacts")
    .select(
      `
      *,
      strategic_objectives!inner (
        title, tier, area, objective_type, year, quarter
      )
    `
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getObjectiveArtifacts: ${error.message}`);

  type ArtifactRow = ObjectiveArtifact & {
    current_version_id: string | null;
    strategic_objectives: {
      title: string;
      tier: ObjectiveTier;
      area: ObjectiveArea;
      objective_type: ObjectiveType;
      year: number;
      quarter: number | null;
    };
  };
  const rows = (artifactRows ?? []) as ArtifactRow[];
  if (rows.length === 0) return [];

  const artifactIds = rows.map((r) => r.id);

  // Pull version numbers + question counts in two lightweight side-queries
  const [versionsRes, questionsRes] = await Promise.all([
    client
      .from("artifact_versions")
      .select("artifact_id, version_number")
      .in("artifact_id", artifactIds),
    client
      .from("artifact_questions")
      .select("artifact_id, status")
      .in("artifact_id", artifactIds),
  ]);
  if (versionsRes.error) throw new Error(`artifact_versions: ${versionsRes.error.message}`);
  if (questionsRes.error) throw new Error(`artifact_questions: ${questionsRes.error.message}`);

  const latestByArtifact = new Map<string, number>();
  for (const v of versionsRes.data ?? []) {
    const prev = latestByArtifact.get(v.artifact_id) ?? 0;
    if (v.version_number > prev) latestByArtifact.set(v.artifact_id, v.version_number);
  }
  const countsByArtifact = new Map<string, { open: number; answered: number }>();
  for (const q of questionsRes.data ?? []) {
    const c = countsByArtifact.get(q.artifact_id) ?? { open: 0, answered: 0 };
    if (q.status === "open") c.open += 1;
    else if (q.status === "answered") c.answered += 1;
    countsByArtifact.set(q.artifact_id, c);
  }

  return rows.map((row) => {
    const counts = countsByArtifact.get(row.id) ?? { open: 0, answered: 0 };
    return {
      ...row,
      objective_title: row.strategic_objectives.title,
      objective_tier: row.strategic_objectives.tier,
      objective_area: row.strategic_objectives.area,
      objective_type: row.strategic_objectives.objective_type,
      objective_year: row.strategic_objectives.year,
      objective_quarter: row.strategic_objectives.quarter,
      current_version_id: row.current_version_id,
      latest_version_number: latestByArtifact.get(row.id) ?? null,
      open_questions_count: counts.open,
      answered_questions_count: counts.answered,
    };
  });
}

export type EligibleObjectiveForV1 = {
  id: string;
  year: number;
  quarter: number | null;
  area: ObjectiveArea;
  objective_type: ObjectiveType;
  tier: ObjectiveTier;
  title: string;
  description: string | null;
  has_description: boolean;
};

/**
 * Objectives that are candidates for v1 generation:
 * - status = active
 * - No artifact yet (no row in objective_artifacts)
 * Description can be null — we just flag it for the UI to warn.
 */
export async function getEligibleObjectivesForV1(): Promise<EligibleObjectiveForV1[]> {
  const client = supabaseAdmin();

  const [objectivesRes, artifactsRes] = await Promise.all([
    client
      .from("strategic_objectives")
      .select("id, year, quarter, area, objective_type, tier, title, description")
      .eq("status", "active")
      .order("year", { ascending: true })
      .order("quarter", { ascending: true, nullsFirst: true })
      .order("tier", { ascending: true }),
    client.from("objective_artifacts").select("objective_id"),
  ]);
  if (objectivesRes.error)
    throw new Error(`getEligibleObjectivesForV1 objectives: ${objectivesRes.error.message}`);
  if (artifactsRes.error)
    throw new Error(`getEligibleObjectivesForV1 artifacts: ${artifactsRes.error.message}`);

  const withArtifact = new Set(
    (artifactsRes.data ?? []).map((a) => a.objective_id as string)
  );
  type Row = {
    id: string;
    year: number;
    quarter: number | null;
    area: ObjectiveArea;
    objective_type: ObjectiveType;
    tier: ObjectiveTier;
    title: string;
    description: string | null;
  };
  return ((objectivesRes.data ?? []) as Row[])
    .filter((o) => !withArtifact.has(o.id))
    .map((o) => ({
      ...o,
      has_description: !!o.description?.trim(),
    }));
}

/**
 * Turn an objective title into a Drive-folder-safe slug.
 * Kebab-case, first 60 chars, ASCII only.
 */
export function objectiveSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/**
 * `2026-Q2` or `2026-annual` for a given year + quarter.
 */
export function quarterSlug(year: number, quarter: number | null): string {
  return quarter ? `${year}-Q${quarter}` : `${year}-annual`;
}

export async function getArtifactDetails(artifactId: string): Promise<{
  questions: ArtifactQuestion[];
  versions: ArtifactVersion[];
}> {
  const client = supabaseAdmin();
  const [qRes, vRes] = await Promise.all([
    client
      .from("artifact_questions")
      .select("*")
      .eq("artifact_id", artifactId)
      .order("version_introduced", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("artifact_versions")
      .select("*")
      .eq("artifact_id", artifactId)
      .order("version_number", { ascending: false }),
  ]);
  if (qRes.error) throw new Error(`getArtifactDetails questions: ${qRes.error.message}`);
  if (vRes.error) throw new Error(`getArtifactDetails versions: ${vRes.error.message}`);
  return {
    questions: (qRes.data ?? []) as ArtifactQuestion[],
    versions: (vRes.data ?? []) as ArtifactVersion[],
  };
}

export function artifactTypeLabel(t: ArtifactType): string {
  return {
    draft_doc: "Draft",
    proposal: "Proposal",
    brief: "Brief",
    slide_deck: "Slide deck",
    sheet: "Sheet",
    pdf: "PDF",
    other: "Other",
  }[t];
}

export function artifactStatusLabel(s: ArtifactStatus): string {
  return {
    draft: "Draft",
    in_review: "In review",
    approved: "Approved",
    sent: "Sent",
    archived: "Archived",
  }[s];
}

export function calendarEventUrl(eventId: string): string {
  // Google Calendar event links use base64-encoded eid. The raw event.id from
  // the API can be opened via the /r/eventedit/{id} pattern for the organizer.
  return `https://calendar.google.com/calendar/u/0/r/eventedit/${eventId}`;
}

export type QuarterRevenueSummary = {
  quarter: number | null;
  target: number | null;
  original_target: number | null;
  sold: number;
  invoiced: number;
  paid: number;
};

/** Summarize revenue objectives + actual events per quarter for a given year. */
export function summarizeRevenue(
  objectives: StrategicObjective[],
  events: RevenueEvent[]
): QuarterRevenueSummary[] {
  const revObjectives = objectives.filter(
    (o) => o.objective_type === "revenue" && o.quarter !== null
  );
  return [1, 2, 3, 4].map((q) => {
    const target = revObjectives.find((o) => o.quarter === q);
    const qEvents = events.filter((e) => e.quarter === q);
    const sumStage = (stage: RevenueEvent["stage"]) =>
      qEvents.filter((e) => e.stage === stage).reduce((s, e) => s + Number(e.amount ?? 0), 0);
    return {
      quarter: q,
      target: target?.target_value ?? null,
      original_target: target?.original_target ?? null,
      sold: sumStage("sold"),
      invoiced: sumStage("invoiced"),
      paid: sumStage("paid"),
    };
  });
}

export function groupObjectivesByArea(
  objectives: StrategicObjective[]
): Record<ObjectiveArea, StrategicObjective[]> {
  const areas: ObjectiveArea[] = [
    "commercial",
    "partnerships",
    "product",
    "brand",
    "ops",
    "funding",
  ];
  const out = Object.fromEntries(areas.map((a) => [a, [] as StrategicObjective[]])) as Record<
    ObjectiveArea,
    StrategicObjective[]
  >;
  for (const o of objectives) out[o.area].push(o);
  return out;
}

export function areaLabel(a: ObjectiveArea): string {
  return {
    commercial: "Commercial",
    partnerships: "Partnerships",
    product: "Product",
    brand: "Brand · Community",
    ops: "Ops",
    funding: "Funding",
  }[a];
}

export function typeLabel(t: ObjectiveType): string {
  return {
    revenue: "Revenue",
    milestone: "Milestone",
    asset: "Asset",
    client_goal: "Client goal",
    event: "Event",
    hiring: "Hiring",
  }[t];
}

export function currentQuarter(date: Date = new Date()): PlanPeriod {
  const y = date.getFullYear();
  const q = Math.floor(date.getMonth() / 3) + 1;
  return { year: y, quarter: q };
}
