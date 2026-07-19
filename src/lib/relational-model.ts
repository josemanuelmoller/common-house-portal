/**
 * relational-model.ts — ADR-001 canonical service layer.
 *
 * Single typed source of truth for the "nature / relationship / opportunity /
 * project / role" model (see docs/architecture/ADR-001-relational-network-model.md).
 *
 * Server-only. Validation mirrors the DB CHECK constraints (defense in depth):
 * if you change a vocabulary here, change the matching migration constraint too.
 *
 * These helpers deliberately do NOT touch legacy columns (org_category,
 * relationship_stage, relationship_classes, engagements, people.org_notion_id).
 * Legacy stays readable for compatibility; this is the new write path.
 */

import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/* ------------------------------------------------------------------ */
/* Vocabularies (keep in lock-step with the DB CHECK constraints)      */
/* ------------------------------------------------------------------ */

export const RELATIONSHIP_TYPES = [
  "portfolio",
  "client",
  "partner",
  "vendor",
  "investor",
  "funder",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Allowed non-null states per relationship type. `client` must be null. */
export const RELATIONSHIP_STATES_BY_TYPE: Record<RelationshipType, readonly string[]> = {
  portfolio: ["accompanied", "followed"],
  partner: ["exploring", "active", "paused", "not_current"],
  vendor: ["active", "paused", "not_current"],
  investor: ["active", "inactive"],
  funder: ["active", "inactive"],
  client: [], // state must be null — activity derives from opportunities/projects
};

export const PROJECT_ROLES = [
  "client",
  "sponsor",
  "delivery_lead",
  "technology_provider",
  "implementation_partner",
  "co_development_partner",
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PARTICIPATION_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

export const OPPORTUNITY_CANONICAL_STAGES = [
  "exploration",
  "proposal",
  "won",
  "lost",
  "not_now",
] as const;
export type OpportunityCanonicalStage = (typeof OPPORTUNITY_CANONICAL_STAGES)[number];

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** Thrown on invalid input. API routes should map this to HTTP 400. */
export class RelationalValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelationalValidationError";
  }
}

function assertEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string
): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new RelationalValidationError(
      `invalid ${field}: ${String(value)} (allowed: ${allowed.join(", ")})`
    );
  }
  return value as T;
}

/** Validate a (type, state) pair against the per-type rules. Returns the normalized state (or null). */
export function validateRelationshipState(
  type: RelationshipType,
  state: string | null | undefined
): string | null {
  const s = state == null || state === "" ? null : state;
  if (s === null) {
    return null; // null is always permitted (type known, sub-state unspecified)
  }
  const allowed = RELATIONSHIP_STATES_BY_TYPE[type];
  if (allowed.length === 0) {
    throw new RelationalValidationError(
      `relationship_type '${type}' does not take a state (got '${s}')`
    );
  }
  if (!allowed.includes(s)) {
    throw new RelationalValidationError(
      `invalid relationship_state '${s}' for type '${type}' (allowed: ${allowed.join(", ")})`
    );
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* Row shapes                                                          */
/* ------------------------------------------------------------------ */

export type OrganizationRelationship = {
  id: string;
  organization_id: string;
  relationship_type: RelationshipType;
  relationship_state: string | null;
  started_at: string;
  ended_at: string | null;
  source_refs: unknown[];
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectOrganizationRole = {
  id: string;
  project_id: string;
  organization_id: string;
  role: ProjectRole;
  participation_status: ParticipationStatus;
  started_at: string | null;
  ended_at: string | null;
  source_refs: unknown[];
  client_visible: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonOrganizationMembership = {
  id: string;
  person_id: string;
  organization_id: string;
  title: string | null;
  area: string | null;
  is_primary: boolean;
  started_at: string | null;
  ended_at: string | null;
  source_refs: unknown[];
  confidence: number | null;
  confirmed_at: string | null;
  confirmed_by: string | null;
  created_at: string;
  updated_at: string;
};

/* ------------------------------------------------------------------ */
/* Organization relationships                                          */
/* ------------------------------------------------------------------ */

export async function listOrgRelationships(
  organizationId: string,
  opts: { includeEnded?: boolean } = {}
): Promise<OrganizationRelationship[]> {
  const sb = getSupabaseServerClient();
  let q = sb
    .from("organization_relationships")
    .select("*")
    .eq("organization_id", organizationId)
    .order("started_at", { ascending: false });
  if (!opts.includeEnded) q = q.is("ended_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as OrganizationRelationship[];
}

/**
 * Create — or, if an active relationship of this type already exists, update its
 * state — for an organization. Idempotent per (org, type). Logs an event.
 * Never guesses: `state` may be null ("type known, sub-state unspecified").
 */
export async function upsertOrgRelationship(input: {
  organizationId: string;
  relationshipType: RelationshipType;
  relationshipState?: string | null;
  sourceRefs?: unknown[];
  notes?: string | null;
  actor: string;
}): Promise<OrganizationRelationship> {
  const type = assertEnum(input.relationshipType, RELATIONSHIP_TYPES, "relationship_type");
  const state = validateRelationshipState(type, input.relationshipState ?? null);
  const sb = getSupabaseServerClient();

  const { data: existing, error: exErr } = await sb
    .from("organization_relationships")
    .select("*")
    .eq("organization_id", input.organizationId)
    .eq("relationship_type", type)
    .is("ended_at", null)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existing) {
    const prevState = (existing as OrganizationRelationship).relationship_state;
    const patch: Record<string, unknown> = { relationship_state: state, updated_by: input.actor };
    if (input.notes !== undefined) patch.notes = input.notes;
    if (input.sourceRefs !== undefined) patch.source_refs = input.sourceRefs;
    const { data, error } = await sb
      .from("organization_relationships")
      .update(patch)
      .eq("id", (existing as OrganizationRelationship).id)
      .select("*")
      .single();
    if (error) throw error;
    if (prevState !== state) {
      await logRelationshipEvent({
        relationshipId: data.id,
        organizationId: input.organizationId,
        eventType: "state_changed",
        fromState: prevState,
        toState: state,
        actor: input.actor,
      });
    }
    return data as OrganizationRelationship;
  }

  const { data, error } = await sb
    .from("organization_relationships")
    .insert({
      organization_id: input.organizationId,
      relationship_type: type,
      relationship_state: state,
      source_refs: input.sourceRefs ?? [],
      notes: input.notes ?? null,
      created_by: input.actor,
      updated_by: input.actor,
    })
    .select("*")
    .single();
  if (error) throw error;
  await logRelationshipEvent({
    relationshipId: data.id,
    organizationId: input.organizationId,
    eventType: "created",
    toState: state,
    actor: input.actor,
  });
  return data as OrganizationRelationship;
}

export async function endOrgRelationship(
  relationshipId: string,
  actor: string,
  reason?: string
): Promise<void> {
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("organization_relationships")
    .update({ ended_at: new Date().toISOString(), updated_by: actor })
    .eq("id", relationshipId)
    .is("ended_at", null)
    .select("organization_id, relationship_state")
    .maybeSingle();
  if (error) throw error;
  if (!data) return; // already ended / not found — no-op
  await logRelationshipEvent({
    relationshipId,
    organizationId: data.organization_id,
    eventType: "ended",
    fromState: data.relationship_state,
    actor,
    detail: reason ? { reason } : {},
  });
}

async function logRelationshipEvent(e: {
  relationshipId: string;
  organizationId: string;
  eventType: "created" | "state_changed" | "ended" | "reactivated" | "note";
  fromState?: string | null;
  toState?: string | null;
  actor: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb.from("organization_relationship_events").insert({
    organization_relationship_id: e.relationshipId,
    organization_id: e.organizationId,
    event_type: e.eventType,
    from_state: e.fromState ?? null,
    to_state: e.toState ?? null,
    actor: e.actor,
    detail: e.detail ?? {},
  });
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Project ↔ organization roles                                        */
/* ------------------------------------------------------------------ */

export async function listProjectOrgRoles(
  projectId: string,
  opts: { includeEnded?: boolean } = {}
): Promise<ProjectOrganizationRole[]> {
  const sb = getSupabaseServerClient();
  let q = sb
    .from("project_organization_roles")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (!opts.includeEnded) q = q.is("ended_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ProjectOrganizationRole[];
}

export async function addProjectOrgRole(input: {
  projectId: string;
  organizationId: string;
  role: ProjectRole;
  participationStatus?: ParticipationStatus;
  clientVisible?: boolean;
  sourceRefs?: unknown[];
  notes?: string | null;
  actor: string;
}): Promise<ProjectOrganizationRole> {
  const role = assertEnum(input.role, PROJECT_ROLES, "role");
  const status = assertEnum(
    input.participationStatus ?? "active",
    PARTICIPATION_STATUSES,
    "participation_status"
  );
  const sb = getSupabaseServerClient();
  const { data, error } = await sb
    .from("project_organization_roles")
    .insert({
      project_id: input.projectId,
      organization_id: input.organizationId,
      role,
      participation_status: status,
      client_visible: input.clientVisible ?? false,
      source_refs: input.sourceRefs ?? [],
      notes: input.notes ?? null,
      created_by: input.actor,
      updated_by: input.actor,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as ProjectOrganizationRole;
}

export async function endProjectOrgRole(id: string, actor: string): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("project_organization_roles")
    .update({
      ended_at: new Date().toISOString(),
      participation_status: "completed",
      updated_by: actor,
    })
    .eq("id", id)
    .is("ended_at", null);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Person ↔ organization memberships                                   */
/* ------------------------------------------------------------------ */

export async function listPersonOrgMemberships(
  personId: string,
  opts: { includeEnded?: boolean } = {}
): Promise<PersonOrganizationMembership[]> {
  const sb = getSupabaseServerClient();
  let q = sb
    .from("person_organization_memberships")
    .select("*")
    .eq("person_id", personId)
    .order("is_primary", { ascending: false });
  if (!opts.includeEnded) q = q.is("ended_at", null);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PersonOrganizationMembership[];
}

/**
 * Upsert an active membership for (person, org). If marking primary, callers are
 * responsible for demoting any prior primary first (enforced by a partial unique
 * index — a second active primary will error, by design).
 */
export async function upsertPersonOrgMembership(input: {
  personId: string;
  organizationId: string;
  title?: string | null;
  area?: string | null;
  isPrimary?: boolean;
  confidence?: number | null;
  confirmedBy?: string | null;
  sourceRefs?: unknown[];
}): Promise<PersonOrganizationMembership> {
  const sb = getSupabaseServerClient();
  const { data: existing, error: exErr } = await sb
    .from("person_organization_memberships")
    .select("id")
    .eq("person_id", input.personId)
    .eq("organization_id", input.organizationId)
    .is("ended_at", null)
    .maybeSingle();
  if (exErr) throw exErr;

  const row: Record<string, unknown> = {
    person_id: input.personId,
    organization_id: input.organizationId,
    title: input.title ?? null,
    area: input.area ?? null,
    is_primary: input.isPrimary ?? false,
    confidence: input.confidence ?? null,
    confirmed_by: input.confirmedBy ?? null,
    confirmed_at: input.confirmedBy ? new Date().toISOString() : null,
    source_refs: input.sourceRefs ?? [],
  };

  if (existing) {
    const { data, error } = await sb
      .from("person_organization_memberships")
      .update(row)
      .eq("id", (existing as { id: string }).id)
      .select("*")
      .single();
    if (error) throw error;
    return data as PersonOrganizationMembership;
  }
  const { data, error } = await sb
    .from("person_organization_memberships")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data as PersonOrganizationMembership;
}

/* ------------------------------------------------------------------ */
/* Opportunity linking + canonical stage                               */
/* ------------------------------------------------------------------ */

export async function linkOpportunityOrg(
  opportunityId: string,
  organizationId: string | null
): Promise<void> {
  const sb = getSupabaseServerClient();
  const { error } = await sb
    .from("opportunities")
    .update({ organization_id: organizationId })
    .eq("id", opportunityId);
  if (error) throw error;
}

export async function setOpportunityCanonicalStage(
  opportunityId: string,
  stage: OpportunityCanonicalStage | null,
  extra?: { closedReason?: string | null; nextRevisitAt?: string | null }
): Promise<void> {
  if (stage !== null) assertEnum(stage, OPPORTUNITY_CANONICAL_STAGES, "canonical_stage");
  const sb = getSupabaseServerClient();
  const patch: Record<string, unknown> = { canonical_stage: stage };
  if (extra?.closedReason !== undefined) patch.closed_reason = extra.closedReason;
  if (extra?.nextRevisitAt !== undefined) patch.next_revisit_at = extra.nextRevisitAt;
  const { error } = await sb.from("opportunities").update(patch).eq("id", opportunityId);
  if (error) throw error;
}

/**
 * Best-effort mapping from the legacy `opportunities.status` to a canonical stage,
 * used only for DISPLAY defaulting when `canonical_stage` is null. An explicit
 * `canonical_stage` always wins. Ambiguous legacy values (e.g. "Stalled", "Active")
 * map to `exploration` conservatively — see ADR §8 open questions.
 */
export function deriveCanonicalStage(status: string | null | undefined): OpportunityCanonicalStage {
  switch ((status ?? "").trim().toLowerCase()) {
    case "proposal sent":
      return "proposal";
    case "won":
      return "won";
    case "lost":
    case "closed lost":
      return "lost";
    // new, qualifying, active, stalled, and anything unknown → exploration
    default:
      return "exploration";
  }
}
