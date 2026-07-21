import { getAllProjects } from "./projects";

// ─── People & Orgs ────────────────────────────────────────────────────────────
//
// notion-cutoff: this module reads 100% from Supabase. No @notionhq/client,
// no Notion prop helpers. Every record's `id` is the row's `notion_id` so call
// sites keep a stable identifier across the cutover.

export type PersonRecord = {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  classification: "Internal" | "External" | "";
  roles: string[];
  /** "Rol interno" single-select. Source of truth for EIR / Core Team / Advisor /
   *  Contractor / Extended Network / Alumni distinction. Empty when unset. */
  rolInterno: "" | "Core Team" | "EIR" | "Advisor" | "Contractor" | "Extended Network" | "Alumni";
  linkedin?: string;   // populated by getAllPeople() — not always set
  location?: string;   // "City, Country" from People DB — not always set
};

export type OrgRecord = {
  id: string;
  name: string;
  category: string;
  relationshipStage: string;
  website: string;
  location: string;
};

export type ProjectPeople = {
  lead: PersonRecord[];
  team: PersonRecord[];
  primaryOrg: OrgRecord[];
  otherOrgs: OrgRecord[];
};

// ─── Residents — cross-project people aggregation ────────────────────────────

export type ResidentRecord = PersonRecord & {
  projectIds: string[];
  projectNames: string[];
  isLead: boolean;
};

// ─── Relationship warmth ──────────────────────────────────────────────────────

export type WarmthRecord = {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  warmth: string;          // Hot | Warm | Cold | Dormant
  lastContactDate: string | null;
  notionUrl: string;
};

// Columns selected for any people → PersonRecord read.
const PEOPLE_COLS =
  "id, notion_id, full_name, email, job_title, person_classification, relationship_roles, rol_interno, country, city, linkedin, org_notion_id";

// ─── Private mappers / resolvers (Supabase) ──────────────────────────────────

function personRecordFromRow(r: Record<string, unknown>): PersonRecord {
  const classification = r.person_classification as string;
  return {
    id:             (r.notion_id as string) || (r.id as string) || "",
    name:           (r.full_name as string) || (r.email as string) || "",
    jobTitle:       (r.job_title as string) || "",
    email:          (r.email as string) || "",
    classification:
      classification === "Internal" || classification === "External"
        ? (classification as PersonRecord["classification"])
        : "",
    // relationship_roles is a single TEXT column — wrap as [value] when present.
    roles:          (r.relationship_roles as string) ? [r.relationship_roles as string] : [],
    rolInterno:     ((r.rol_interno as string) ?? "") as PersonRecord["rolInterno"],
    linkedin:       (r.linkedin as string) || undefined,
    location:       [r.city as string | null, r.country as string | null].filter(Boolean).join(", ") || undefined,
  };
}

async function resolveOrg(id: string): Promise<OrgRecord | null> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("organizations")
      .select("id, notion_id, name, org_category, relationship_stage, website, country, city")
      .eq("notion_id", id)
      .maybeSingle();
    if (!data) return null;
    return {
      id:                (data.notion_id as string) || (data.id as string) || "",
      name:              (data.name as string) || "",
      category:          (data.org_category as string) || "",
      relationshipStage: (data.relationship_stage as string) || "",
      website:           (data.website as string) || "",
      location:          [data.city as string | null, data.country as string | null].filter(Boolean).join(", "),
    };
  } catch {
    return null;
  }
}

// ─── Public queries ───────────────────────────────────────────────────────────

export async function getProjectPeople(projectId: string): Promise<ProjectPeople> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    // 1. Resolve project → primary org notion_id + lead person notion_id
    const { data: proj } = await sb
      .from("projects")
      .select("primary_org_notion_id, project_lead_notion_id")
      .eq("notion_id", projectId)
      .maybeSingle();
    const primaryOrgId = (proj?.primary_org_notion_id as string | null) ?? null;
    const leadId       = (proj?.project_lead_notion_id as string | null) ?? null;

    // 2. People affiliated via people.org_notion_id = project primary org
    let people: Array<Record<string, unknown>> = [];
    if (primaryOrgId) {
      const { data } = await sb
        .from("people")
        .select(PEOPLE_COLS)
        .eq("org_notion_id", primaryOrgId)
        .is("dismissed_at", null)
        .limit(50);
      people = (data ?? []) as Array<Record<string, unknown>>;
    }

    // 3. Primary org row from organizations
    let primaryOrg: OrgRecord[] = [];
    if (primaryOrgId) {
      const org = await resolveOrg(primaryOrgId);
      if (org) primaryOrg = [org];
    }

    const lead = leadId
      ? people.filter(p => p.notion_id === leadId).map(personRecordFromRow)
      : [];
    const team = people
      .filter(p => p.notion_id !== leadId)
      .map(personRecordFromRow)
      .filter(p => p.name.trim() !== "");

    // otherOrgs has no clean relational source in this branch → empty.
    return { lead, team, primaryOrg, otherOrgs: [] };
  } catch {
    return { lead: [], team: [], primaryOrg: [], otherOrgs: [] };
  }
}

// ─── People — direct DB query (bypasses project-relation dependency) ─────────
//
// Used by The Residents page to surface all CH-network people regardless of
// whether they are linked to an active project. This is the correct source for
// Co-Founders, EIRs, and any people whose primary identity is not project-scoped.
//
// Classification map:
//   Internal + Founder role   → Co-Founders section
//   Internal + other roles    → Core Team section
//   External + Startup Founder → Entrepreneurs in Residence section

export async function getAllPeople(): Promise<PersonRecord[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("people")
      .select(PEOPLE_COLS)
      .is("dismissed_at", null)
      .limit(100);
    return ((data ?? []) as Array<Record<string, unknown>>)
      .map(personRecordFromRow)
      .filter(p => p.name.trim() !== "");
  } catch {
    return [];
  }
}

export async function getAllResidents(): Promise<ResidentRecord[]> {
  try {
    const projects = await getAllProjects();
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();

    // Best-effort affiliation (clean relational source is empty on this branch):
    // a person belongs to a project when people.org_notion_id === the project's
    // primary_org_notion_id; they are lead when people.notion_id === the
    // project's project_lead_notion_id.
    const projectIds = projects.map(p => p.id);

    const metaByProject = new Map<string, { orgId: string | null; leadId: string | null }>();
    if (projectIds.length) {
      const { data: projRows } = await sb
        .from("projects")
        .select("notion_id, primary_org_notion_id, project_lead_notion_id")
        .in("notion_id", projectIds);
      for (const row of (projRows ?? []) as Array<Record<string, unknown>>) {
        metaByProject.set(row.notion_id as string, {
          orgId:  (row.primary_org_notion_id as string | null) ?? null,
          leadId: (row.project_lead_notion_id as string | null) ?? null,
        });
      }
    }

    // Map primary-org notion_id → the projects it fronts (+ that project's lead).
    const orgToAffiliations = new Map<
      string,
      Array<{ projectId: string; projectName: string; leadId: string | null }>
    >();
    for (const project of projects) {
      const meta  = metaByProject.get(project.id);
      const orgId = meta?.orgId ?? null;
      if (!orgId) continue;
      if (!orgToAffiliations.has(orgId)) orgToAffiliations.set(orgId, []);
      orgToAffiliations.get(orgId)!.push({
        projectId:   project.id,
        projectName: project.name,
        leadId:      meta?.leadId ?? null,
      });
    }

    // Fetch all people affiliated to any of those orgs in one query.
    const orgIds = Array.from(orgToAffiliations.keys());
    let people: Array<Record<string, unknown>> = [];
    if (orgIds.length) {
      const { data } = await sb
        .from("people")
        .select(PEOPLE_COLS)
        .in("org_notion_id", orgIds)
        .is("dismissed_at", null)
        .limit(500);
      people = (data ?? []) as Array<Record<string, unknown>>;
    }

    // Aggregate per person across projects.
    const personMap = new Map<string, ResidentRecord>();
    for (const row of people) {
      const record = personRecordFromRow(row);
      if (record.name.trim() === "") continue;

      let entry = personMap.get(record.id);
      if (!entry) {
        entry = { ...record, projectIds: [], projectNames: [], isLead: false };
        personMap.set(record.id, entry);
      }

      const orgId = (row.org_notion_id as string | null) ?? null;
      const affiliations = orgId ? (orgToAffiliations.get(orgId) ?? []) : [];
      for (const aff of affiliations) {
        if (!entry.projectIds.includes(aff.projectId)) {
          entry.projectIds.push(aff.projectId);
          entry.projectNames.push(aff.projectName);
        }
        if (aff.leadId && aff.leadId === record.id) entry.isLead = true;
      }
    }

    return Array.from(personMap.values()).sort((a, b) => {
      if (a.classification === "Internal" && b.classification !== "Internal") return -1;
      if (b.classification === "Internal" && a.classification !== "Internal") return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return [];
  }
}

export async function getColdRelationships(): Promise<WarmthRecord[]> {
  try {
    const { getSupabaseServerClient } = await import("../supabase-server");
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("people")
      .select("id, notion_id, full_name, job_title, email, contact_warmth, last_contact_date")
      .in("contact_warmth", ["Cold", "Dormant"])
      .is("dismissed_at", null)
      .order("last_contact_date", { ascending: true, nullsFirst: false })
      .limit(20);
    return ((data ?? []) as Array<Record<string, unknown>>)
      .map(r => {
        const notionId = (r.notion_id as string) || "";
        return {
          id:              notionId || (r.id as string) || "",
          name:            (r.full_name as string) || (r.email as string) || "",
          jobTitle:        (r.job_title as string) || "",
          email:           (r.email as string) || "",
          warmth:          (r.contact_warmth as string) || "",
          lastContactDate: (r.last_contact_date as string | null) ?? null,
          notionUrl:       notionId ? `https://www.notion.so/${notionId.replace(/-/g, "")}` : "",
        };
      })
      .filter(p => p.name.trim() !== "");
  } catch {
    return [];
  }
}
