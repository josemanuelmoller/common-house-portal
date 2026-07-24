/**
 * resolve-meeting-entities.ts
 *
 * Shared, data-driven resolver for "which organization / which project does
 * this meeting (or email thread) belong to?" — replaces the hard-coded
 * ORG_MAP / PROJECT_MAP / PROJECT_KEYWORD_OVERRIDES / DOMAIN_TO_PROJECT
 * dictionaries that lived inside fireflies-sync, extract-meeting-evidence
 * and ingest-gmail.
 *
 * Source of truth: Supabase tables `organizations`, `people`, `projects`.
 *
 * Resolution paths (org), in priority order:
 *   1. participant email → people.email (lowercased) → people.org_notion_id
 *   2. participant email domain → organizations.org_domains (JSON array)
 *   3. transcript title or org_name hint → substring match against organizations.name
 *
 * Resolution paths (project), in priority order:
 *   1. if orgNotionId resolved → projects.primary_org_notion_id == orgId
 *      (prefer most recent last_meeting_date or updated_at; status is NOT
 *      filtered — a project in "Proposed" still receives meetings)
 *   2. transcript title → substring match against projects.name
 *
 * Every resolution returns a `matchPath` string so the caller can log
 * how the match was made (or that it was a miss). This is critical
 * observability — a silent null match is the bug class we are killing.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface EntityIndex {
  /** lowercase email → org_notion_id */
  emailToOrg: Map<string, string>;
  /** lowercase domain → org_notion_id */
  domainToOrg: Map<string, string>;
  /** ordered { lowercaseName, notionId } for org substring match (longer names first) */
  orgsByName: Array<{ name: string; notionId: string }>;
  /** org_notion_id → its projects (sorted by recency) */
  projectsByOrg: Map<string, Array<{ notionId: string; name: string; status: string | null; lastMeetingDate: string | null }>>;
  /** ordered { lowercaseName, notionId } for project substring match (longer first) */
  projectsByName: Array<{ name: string; notionId: string }>;
}

export interface OrgResolveResult {
  orgNotionId: string | null;
  /** Human-readable explanation of which path produced the match (or 'miss'). */
  matchPath: string;
}

export interface ProjectResolveResult {
  projectNotionId: string | null;
  matchPath: string;
}

// ── Loader ──────────────────────────────────────────────────────────────────

/**
 * Load all orgs / people-with-emails / projects from Supabase into
 * in-memory maps. Cost: 3 SELECTs, executed once per handler invocation.
 *
 * If a participant email appears under multiple org_notion_ids across
 * people rows (deduplicated people), the **most frequently occurring**
 * org wins (mode), with stable tiebreak on alphabetical id order.
 */
export async function loadEntityIndex(sb: SupabaseClient): Promise<EntityIndex> {
  const emailToOrg   = new Map<string, string>();
  const domainToOrg  = new Map<string, string>();
  const orgsByName: Array<{ name: string; notionId: string }> = [];
  const projectsByOrg  = new Map<string, Array<{ notionId: string; name: string; status: string | null; lastMeetingDate: string | null }>>();
  const projectsByName: Array<{ name: string; notionId: string }> = [];

  // 1. Organizations: name + domains
  const { data: orgs } = await sb
    .from("organizations")
    .select("notion_id, name, org_domains");

  for (const org of (orgs ?? []) as Array<{ notion_id: string | null; name: string | null; org_domains: string | null }>) {
    if (!org.notion_id) continue;
    if (org.name && org.name.trim().length > 0) {
      orgsByName.push({ name: org.name.toLowerCase(), notionId: org.notion_id });
    }
    if (org.org_domains) {
      try {
        const arr = JSON.parse(org.org_domains) as unknown;
        if (Array.isArray(arr)) {
          for (const d of arr) {
            if (typeof d !== "string") continue;
            const clean = d.toLowerCase().replace(/^@/, "").trim();
            if (clean.length === 0) continue;
            // First-wins on collision; orgs are 67 so collisions are rare,
            // and we explicitly do NOT want to silently overwrite a mapping.
            if (!domainToOrg.has(clean)) domainToOrg.set(clean, org.notion_id);
          }
        }
      } catch { /* skip malformed org_domains */ }
    }
  }
  // Longer names first so "Common House Foundation" wins over "Common".
  orgsByName.sort((a, b) => b.name.length - a.name.length);

  // 2. People: email(s) → org_notion_id (frequency vote on duplicates). One
  //    human can hold several email accounts (people.email_accounts) — map ALL
  //    of them so every address resolves to the person's org.
  const { data: people } = await sb
    .from("people")
    .select("email, email_accounts, org_notion_id")
    .not("org_notion_id", "is", null);

  const emailVotes = new Map<string, Map<string, number>>();
  const castVote = (rawEmail: string | null | undefined, org: string) => {
    if (!rawEmail) return;
    const e = rawEmail.toLowerCase().trim();
    if (e.length === 0 || !e.includes("@")) return;
    let bucket = emailVotes.get(e);
    if (!bucket) { bucket = new Map<string, number>(); emailVotes.set(e, bucket); }
    bucket.set(org, (bucket.get(org) ?? 0) + 1);
  };
  for (const p of (people ?? []) as Array<{ email: string | null; email_accounts: string[] | null; org_notion_id: string | null }>) {
    if (!p.org_notion_id) continue;
    castVote(p.email, p.org_notion_id);
    for (const ea of (p.email_accounts ?? [])) castVote(ea, p.org_notion_id);
  }
  for (const [email, bucket] of emailVotes) {
    let bestOrg: string | null = null;
    let bestCount = -1;
    for (const [org, count] of bucket) {
      if (count > bestCount || (count === bestCount && bestOrg !== null && org < bestOrg)) {
        bestCount = count;
        bestOrg   = org;
      }
    }
    if (bestOrg) emailToOrg.set(email, bestOrg);
  }

  // 3. Projects, ordered by recency for downstream tiebreak
  const { data: projects } = await sb
    .from("projects")
    .select("notion_id, name, project_status, primary_org_notion_id, last_meeting_date, updated_at")
    .order("last_meeting_date", { ascending: false, nullsFirst: false });

  for (const p of (projects ?? []) as Array<{
    notion_id: string | null;
    name: string | null;
    project_status: string | null;
    primary_org_notion_id: string | null;
    last_meeting_date: string | null;
    updated_at: string | null;
  }>) {
    if (!p.notion_id) continue;
    if (p.name && p.name.trim().length > 0) {
      projectsByName.push({ name: p.name.toLowerCase(), notionId: p.notion_id });
    }
    if (p.primary_org_notion_id) {
      let bucket = projectsByOrg.get(p.primary_org_notion_id);
      if (!bucket) {
        bucket = [];
        projectsByOrg.set(p.primary_org_notion_id, bucket);
      }
      bucket.push({
        notionId:        p.notion_id,
        name:            p.name ?? "",
        status:          p.project_status,
        lastMeetingDate: p.last_meeting_date,
      });
    }
  }
  projectsByName.sort((a, b) => b.name.length - a.name.length);

  // Multi-org membership: a project can have SEVERAL stakeholder orgs via
  // project_organization_roles, not just primary_org_notion_id (e.g. COP31 ←
  // climate-champions + climate-action; Upstream PAS ← Shape + NEW ERA +
  // Eunomia). Fold those links into projectsByOrg so a meeting with ANY
  // stakeholder org resolves to the project. That table keys by uuid, so map
  // uuid → notion_id first. Additive + fail-soft.
  try {
    const [orgIdsRes, projIdsRes, rolesRes] = await Promise.all([
      sb.from("organizations").select("id, notion_id"),
      sb.from("projects").select("id, notion_id, name, project_status, last_meeting_date"),
      sb.from("project_organization_roles").select("project_id, organization_id, participation_status"),
    ]);
    const orgNotionByUuid = new Map<string, string>();
    for (const o of (orgIdsRes.data ?? []) as Array<{ id: string; notion_id: string | null }>) {
      if (o.notion_id) orgNotionByUuid.set(o.id, o.notion_id);
    }
    const projByUuid = new Map<string, { notionId: string; name: string; status: string | null; lastMeetingDate: string | null }>();
    for (const p of (projIdsRes.data ?? []) as Array<{ id: string; notion_id: string | null; name: string | null; project_status: string | null; last_meeting_date: string | null }>) {
      if (p.notion_id) projByUuid.set(p.id, { notionId: p.notion_id, name: p.name ?? "", status: p.project_status, lastMeetingDate: p.last_meeting_date });
    }
    for (const r of (rolesRes.data ?? []) as Array<{ project_id: string; organization_id: string; participation_status: string | null }>) {
      if ((r.participation_status ?? "").toLowerCase() === "ended") continue;
      const orgN = orgNotionByUuid.get(r.organization_id);
      const proj = projByUuid.get(r.project_id);
      if (!orgN || !proj) continue;
      let bucket = projectsByOrg.get(orgN);
      if (!bucket) { bucket = []; projectsByOrg.set(orgN, bucket); }
      if (!bucket.some(b => b.notionId === proj.notionId)) bucket.push(proj);
    }
  } catch { /* multi-org is additive — never break resolution over it */ }

  return { emailToOrg, domainToOrg, orgsByName, projectsByOrg, projectsByName };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function domainOf(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).toLowerCase().trim();
}

/**
 * Substring-match a corpus against a list of (lowercase) names.
 * Names shorter than 4 chars are skipped to avoid catastrophic false
 * positives (e.g. an org literally named "AI" matching any sentence).
 */
function findByName(corpus: string, list: Array<{ name: string; notionId: string }>): string | null {
  if (corpus.trim().length === 0) return null;
  const haystack = corpus.toLowerCase();
  for (const item of list) {
    if (item.name.length < 4) continue;
    if (haystack.includes(item.name)) return item.notionId;
  }
  return null;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve the organization for a meeting / thread.
 *
 * `participantEmails` is the strongest signal; if any participant's email
 * is registered under an org, that org wins. The title is only used as a
 * last-resort fallback because titles are often generic ("Pasos a seguir",
 * "May 13, 09:02 AM") and prone to false matches.
 *
 * `selfEmails` (the host's own identities, e.g. josemanuel@…) are excluded
 * from the primary email/domain match and only consulted as a last-resort
 * fallback. Without this, every meeting Jose hosts would resolve to
 * Common House (his own org) instead of the counterpart organization,
 * which is the bug that masked Engatel and a dozen other clients.
 *
 * `orgNameHint` lets LLM-extracted org names also feed the substring path.
 */
export function resolveOrgId(
  idx: EntityIndex,
  input: { title?: string; participantEmails?: string[]; orgNameHint?: string; selfEmails?: Set<string> }
): OrgResolveResult {
  const allEmails = (input.participantEmails ?? [])
    .map(e => e?.toLowerCase().trim())
    .filter((e): e is string => !!e && e.includes("@"));

  const self    = input.selfEmails ?? new Set<string>();
  const nonSelf = allEmails.filter(e => !self.has(e));
  const selfHit = allEmails.filter(e =>  self.has(e));

  // 1. Direct email → people.email (counterpart participants only)
  for (const e of nonSelf) {
    const hit = idx.emailToOrg.get(e);
    if (hit) return { orgNotionId: hit, matchPath: `email:${e}` };
  }

  // 2. Email domain → organizations.org_domains (counterpart participants only)
  for (const e of nonSelf) {
    const d = domainOf(e);
    if (!d) continue;
    const hit = idx.domainToOrg.get(d);
    if (hit) return { orgNotionId: hit, matchPath: `domain:${d}` };
  }

  // 3. Title or org_name hint → organizations.name substring
  const corpus = [input.title ?? "", input.orgNameHint ?? ""].join(" ").trim();
  const nameHit = findByName(corpus, idx.orgsByName);
  if (nameHit) return { orgNotionId: nameHit, matchPath: "name-substring" };

  // 4. Last-resort: self emails (so internal-only meetings still tag the
  //    host's own org rather than nothing).
  for (const e of selfHit) {
    const hit = idx.emailToOrg.get(e);
    if (hit) return { orgNotionId: hit, matchPath: `self-email:${e}` };
  }

  return { orgNotionId: null, matchPath: "miss" };
}

/**
 * Resolve a project given a resolved org and the meeting title.
 *
 * If the org has exactly one project, that wins regardless of title.
 * If the org has multiple, the most recent (by last_meeting_date) wins
 * unless the title clearly names a specific one of them.
 * If no org was resolved, fall back to a project-name substring match
 * on the title.
 */
export function resolveProjectId(
  idx: EntityIndex,
  orgNotionId: string | null,
  input: { title?: string }
): ProjectResolveResult {
  const title = (input.title ?? "").toLowerCase().trim();

  if (orgNotionId) {
    const projects = idx.projectsByOrg.get(orgNotionId) ?? [];

    // Title clearly names a specific one of this org's projects → take that.
    for (const p of projects) {
      if (p.name.length >= 4 && title.includes(p.name.toLowerCase())) {
        return { projectNotionId: p.notionId, matchPath: `org+title:${p.name}` };
      }
    }
    if (projects.length === 1) {
      return { projectNotionId: projects[0].notionId, matchPath: "org-single" };
    }
    if (projects.length > 1) {
      // Already sorted by last_meeting_date DESC NULLS LAST at load time.
      return { projectNotionId: projects[0].notionId, matchPath: "org-recent" };
    }
  }

  const titleHit = findByName(title, idx.projectsByName);
  if (titleHit) return { projectNotionId: titleHit, matchPath: "title-substring" };

  return { projectNotionId: null, matchPath: "miss" };
}
