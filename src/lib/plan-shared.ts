/**
 * Client-safe plan types + pure helpers.
 *
 * plan.ts imports supabaseAdmin and runs Supabase queries — that whole module
 * is server-only. Client components (PlanView, ArtifactRow, CreateDraftPanel)
 * need just the types and a few pure label/slug helpers, so they live here.
 *
 * Rule: this file MUST NOT import any node-only module (supabase, googleapis,
 * notion, fs, etc.).
 */

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

export type QuarterRevenueSummary = {
  quarter: number | null;
  target: number | null;
  original_target: number | null;
  sold: number;
  invoiced: number;
  paid: number;
};

// ─── Pure helpers (no I/O, no env reads) ───────────────────────────────────

/**
 * Turn an objective title into a Drive-folder-safe slug.
 * Kebab-case, first 60 chars, ASCII only.
 */
export function objectiveSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
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
