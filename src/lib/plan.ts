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
