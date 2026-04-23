/**
 * user-identity — global + per-contact AI grounding.
 *
 * Two responsibilities:
 *
 * 1. Capa 2 — **getUserIdentity()** returns the singleton row from
 *    `user_identity` describing the user (name, aliases, own orgs).
 *    **renderUserIdentityBlock()** turns it into a system-prompt
 *    fragment that gets prepended to EVERY contact-intelligence prompt.
 *    This prevents Haiku from confusing the user's own company with
 *    the contact's company (e.g. "Moller Upstream" ≠ any contact's
 *    employer unless evidence says so).
 *
 * 2. Capa 3 — **getCorrectionsForPerson(personId)** fetches the per-
 *    contact correction ledger. **renderCorrectionsBlock()** turns it
 *    into a prompt fragment. Every time the user hits "This is wrong"
 *    on an AI output, a correction lands here and future prompts for
 *    that contact will self-correct.
 *
 * Both helpers are cheap — single SELECT each — and the reads are
 * already scoped to a specific person or the singleton, so we don't
 * cache beyond the request.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

// ─── types ───────────────────────────────────────────────────────────────────

export type OwnOrg = {
  name:  string;
  role:  string | null;
  stake: string | null;
  notes: string | null;
};

export type UserIdentity = {
  user_email:         string;
  user_name:          string;
  user_aliases:       string[];
  user_own_orgs:      OwnOrg[];
  user_role_classes:  string[];
  additional_context: string | null;     // maps to DB column user_role_context
};

export type CorrectionScope =
  | "summary"
  | "open_loops"
  | "topics"
  | "news"
  | "enrichment"
  | "general";

export type Correction = {
  id:              string;
  scope:           CorrectionScope;
  what_is_wrong:   string;
  what_is_correct: string;
  created_at:      string;          // ISO
  created_by:      string | null;   // admin email or null
};

// ─── user identity (singleton) ───────────────────────────────────────────────

/**
 * Fetch the primary user_identity row. Callable with an explicit email
 * (e.g. from Clerk) or in "default" mode — the latter returns the most
 * recently updated row. We lean on single-user reality today, but the
 * email arg keeps the door open for multi-user later.
 */
export async function getUserIdentity(userEmail?: string): Promise<UserIdentity | null> {
  const sb = getSupabaseServerClient();
  let q = sb
    .from("user_identity")
    .select("user_email, user_name, user_aliases, user_own_orgs, user_role_classes, user_role_context")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (userEmail) q = q.eq("user_email", userEmail.toLowerCase());
  const { data } = await q.maybeSingle();
  if (!data) return null;
  const row = data as {
    user_email:         string;
    user_name:          string | null;
    user_aliases:       string[] | null;
    user_own_orgs:      unknown;
    user_role_classes:  string[] | null;
    user_role_context:  string | null;
  };
  return {
    user_email:         row.user_email,
    user_name:          row.user_name ?? "",
    user_aliases:       row.user_aliases ?? [],
    user_own_orgs:      normaliseOwnOrgs(row.user_own_orgs),
    user_role_classes:  row.user_role_classes ?? [],
    additional_context: row.user_role_context,
  };
}

function normaliseOwnOrgs(raw: unknown): OwnOrg[] {
  if (!Array.isArray(raw)) return [];
  const out: OwnOrg[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      role:  typeof r.role  === "string" ? r.role  : null,
      stake: typeof r.stake === "string" ? r.stake : null,
      notes: typeof r.notes === "string" ? r.notes : null,
    });
  }
  return out;
}

/**
 * Prompt-ready block describing the user. Prepend to any system prompt
 * that asks Haiku to reason about a contact.
 */
export function renderUserIdentityBlock(id: UserIdentity | null): string {
  if (!id) return "";
  const parts: string[] = [];
  parts.push(`USER CONTEXT (the human you are assisting — NOT the contact being analysed):`);
  const aliasPart = id.user_aliases.length > 0 ? ` (also known as ${id.user_aliases.join(", ")})` : "";
  parts.push(`- Name: ${id.user_name}${aliasPart}`);

  if (id.user_own_orgs.length > 0) {
    parts.push(`- Organisations the user OWNS or CO-OWNS (NEVER attribute any of these to another contact unless the provided data explicitly shows they also work there):`);
    for (const o of id.user_own_orgs) {
      const bits: string[] = [];
      if (o.role)  bits.push(o.role);
      if (o.stake) bits.push(`stake ${o.stake}`);
      const suffix = bits.length > 0 ? ` — ${bits.join(", ")}` : "";
      parts.push(`    • ${o.name}${suffix}${o.notes ? ` (${o.notes})` : ""}`);
    }
  }

  if (id.user_role_classes.length > 0) {
    parts.push(`- The user's own role classes: ${id.user_role_classes.join(", ")}`);
  }

  if (id.additional_context && id.additional_context.trim()) {
    parts.push(`- Additional context: ${id.additional_context.trim()}`);
  }

  parts.push(
    `Rules derived from this:`,
    `  1. Do NOT claim the contact works at, owns, or co-founded any user-owned org unless the provided data explicitly says so.`,
    `  2. Shared ownership with the user (e.g. co-founder relationship) must be stated BIDIRECTIONALLY and with the correct stake.`,
    `  3. If a user-owned org appears in the contact data, assume it is context about the user, not about the contact — unless evidence proves otherwise.`,
  );

  return parts.join("\n");
}

// ─── per-contact corrections ─────────────────────────────────────────────────

/** Fetch the corrections ledger for one contact. Returns []. */
export async function getCorrectionsForPerson(personId: string): Promise<Correction[]> {
  if (!personId) return [];
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("people")
    .select("corrections")
    .eq("id", personId)
    .maybeSingle();
  const raw = (data as { corrections: unknown } | null)?.corrections;
  return normaliseCorrections(raw);
}

export function normaliseCorrections(raw: unknown): Correction[] {
  if (!Array.isArray(raw)) return [];
  const ALLOWED: CorrectionScope[] = ["summary", "open_loops", "topics", "news", "enrichment", "general"];
  const out: Correction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const what_is_wrong   = typeof r.what_is_wrong   === "string" ? r.what_is_wrong.trim()   : "";
    const what_is_correct = typeof r.what_is_correct === "string" ? r.what_is_correct.trim() : "";
    if (!what_is_wrong || !what_is_correct) continue;
    const scope: CorrectionScope = ALLOWED.includes(r.scope as CorrectionScope)
      ? (r.scope as CorrectionScope) : "general";
    out.push({
      id:              typeof r.id         === "string" ? r.id         : crypto.randomUUID(),
      scope,
      what_is_wrong,
      what_is_correct,
      created_at:      typeof r.created_at === "string" ? r.created_at : new Date().toISOString(),
      created_by:      typeof r.created_by === "string" ? r.created_by : null,
    });
  }
  return out;
}

/**
 * Prompt-ready block describing known corrections for a contact. Filter
 * by scope when invoked from a scope-specific prompt (e.g. "summary")
 * to keep the context tight — but ALWAYS include `general` entries.
 */
export function renderCorrectionsBlock(
  corrections: Correction[],
  relevantScopes: CorrectionScope[] = ["summary", "open_loops", "topics", "news", "enrichment", "general"],
): string {
  if (!corrections.length) return "";
  const scopeSet = new Set<CorrectionScope>([...relevantScopes, "general"]);
  const active = corrections.filter(c => scopeSet.has(c.scope));
  if (active.length === 0) return "";

  const lines: string[] = [];
  lines.push(`KNOWN CORRECTIONS for this contact (user-verified — these MUST override any conflicting inference from the data below):`);
  for (const c of active) {
    lines.push(`  • [${c.scope}] Previously claimed: "${c.what_is_wrong}" — CORRECT: "${c.what_is_correct}"`);
  }
  return lines.join("\n");
}

/**
 * Convenience — builds the combined grounding block used by every
 * contact-intelligence route: user identity + per-contact corrections.
 * Returns "" when nothing is configured (caller can safely concat).
 */
export async function buildGroundingPrompt(
  personId: string | null,
  relevantScopes: CorrectionScope[] = ["general"],
): Promise<string> {
  const [identity, corrections] = await Promise.all([
    getUserIdentity(),
    personId ? getCorrectionsForPerson(personId) : Promise.resolve([] as Correction[]),
  ]);
  const idBlock   = renderUserIdentityBlock(identity);
  const corrBlock = renderCorrectionsBlock(corrections, relevantScopes);
  return [idBlock, corrBlock].filter(Boolean).join("\n\n");
}
