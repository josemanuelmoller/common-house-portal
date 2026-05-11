import "server-only";
import { supabaseAdmin } from "./supabase";
import type {
  StrategicObjective,
  RevenueEvent,
  ObjectiveTier,
  ObjectiveArea,
  ObjectiveType,
  ObjectiveArtifact,
  ObjectiveArtifactWithObjective,
  ArtifactQuestion,
  ArtifactVersion,
  EligibleObjectiveForV1,
} from "./plan-shared";

// Re-export the client-safe surface so server callers can keep importing
// from "@/lib/plan" without change. Client components MUST import from
// "@/lib/plan-shared" — see plan-shared.ts header for why.
export type {
  ObjectiveType,
  ObjectiveTier,
  ObjectiveStatus,
  ObjectiveArea,
  ObjectiveMetricType,
  StrategicObjective,
  RevenueEvent,
  PlanPeriod,
  ArtifactType,
  ArtifactStatus,
  ObjectiveArtifact,
  ObjectiveArtifactWithObjective,
  QuestionStatus,
  ArtifactQuestion,
  ArtifactVersion,
  EligibleObjectiveForV1,
  QuarterRevenueSummary,
} from "./plan-shared";

export {
  objectiveSlug,
  quarterSlug,
  artifactTypeLabel,
  artifactStatusLabel,
  calendarEventUrl,
  summarizeRevenue,
  groupObjectivesByArea,
  areaLabel,
  typeLabel,
  currentQuarter,
} from "./plan-shared";

// ─── Strategic objectives (table: strategic_objectives) ──────────────────────

export async function getObjectivesForYear(year: number): Promise<StrategicObjective[]> {
  const { data, error } = await supabaseAdmin()
    .from("strategic_objectives")
    .select("*")
    .eq("year", year)
    .order("quarter", { ascending: true, nullsFirst: true })
    .order("tier", { ascending: true });
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
