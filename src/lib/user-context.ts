/**
 * user-context — grounds AI prompts in two layers so Claude never invents
 * facts about a contact:
 *
 *   1. USER IDENTITY (global) — who the user is and what organisations they
 *      own. Prevents Claude from confusing "Francisco is a co-founder of
 *      Common House" (true — shared stake) with "Francisco works at Moller
 *      Upstream" (false — that's only the user's company).
 *
 *   2. CONTACT CORRECTIONS (per-contact) — user-verified corrections about
 *      a specific contact. Every time the user clicks "This is wrong →" on
 *      an AI output, the correction lands here and gets prepended to all
 *      future prompts for that contact so Claude self-corrects persistently.
 *
 * Both are returned as pre-formatted strings ready to paste at the top of a
 * Claude system prompt. Safe to call when tables are empty — returns "".
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";

// ─── User identity ───────────────────────────────────────────────────────────

export type UserIdentity = {
  user_email:        string;
  user_name:         string | null;
  user_aliases:      string[];
  user_own_orgs:     string[];
  user_role_context: string | null;
};

/**
 * Returns the single user_identity row, or null if none configured.
 * (Single-tenant portal — we always return the only row that exists.)
 */
export async function getUserIdentity(): Promise<UserIdentity | null> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("user_identity")
    .select("user_email, user_name, user_aliases, user_own_orgs, user_role_context")
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    user_email:        data.user_email as string,
    user_name:         (data.user_name as string | null) ?? null,
    user_aliases:      (data.user_aliases as string[] | null) ?? [],
    user_own_orgs:     (data.user_own_orgs as string[] | null) ?? [],
    user_role_context: (data.user_role_context as string | null) ?? null,
  };
}

/**
 * Formats the user identity for use as a prompt prefix. Pass this before the
 * core task instructions in any Claude system prompt. Returns "" if no
 * identity is configured.
 */
export function formatUserIdentityContext(id: UserIdentity | null): string {
  if (!id) return "";
  const lines: string[] = [];
  lines.push("━━━ USER CONTEXT (this is WHO you are assisting) ━━━");
  if (id.user_name) lines.push(`The user is ${id.user_name}.`);
  if (id.user_aliases.length > 0) {
    lines.push(`They may be addressed as: ${id.user_aliases.join(", ")}.`);
  }
  if (id.user_own_orgs.length > 0) {
    lines.push(`Their own organisations (they OWN or CO-OWN these — do NOT attribute them to OTHER contacts unless evidence explicitly says that contact is also a founder/employee/stakeholder):`);
    for (const o of id.user_own_orgs) lines.push(`  • ${o}`);
  }
  if (id.user_role_context) {
    lines.push(`Role context: ${id.user_role_context}`);
  }
  lines.push("");
  lines.push("RULE: When you summarise, extract loops, or characterise a DIFFERENT person, their organisations are separate from the user's. Only link the user's orgs to a contact if there's explicit evidence of a shared stake (e.g. 'co-founder of X', 'partner at X alongside the user').");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  return lines.join("\n");
}

// ─── Per-contact corrections ─────────────────────────────────────────────────

export type ContactCorrection = {
  id:              string;
  what_was_wrong:  string;
  correct_info:    string;
  applies_to:      Array<"summary" | "open_loops" | "news" | "enrichment" | "any">;
  created_at:      string;
  actor:           string;
};

export async function getContactCorrections(personId: string): Promise<ContactCorrection[]> {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("people")
    .select("corrections")
    .eq("id", personId)
    .maybeSingle();
  const raw = (data?.corrections as ContactCorrection[] | null) ?? [];
  return raw;
}

/**
 * Formats the per-contact corrections ledger for a specific prompt context
 * (summary/open_loops/news/enrichment). Returns corrections tagged with
 * `applies_to: "any"` as well as corrections tagged with the given context.
 */
export function formatContactCorrections(
  corrections: ContactCorrection[],
  context: "summary" | "open_loops" | "news" | "enrichment",
): string {
  const relevant = corrections.filter(c =>
    c.applies_to.includes("any") || c.applies_to.includes(context)
  );
  if (relevant.length === 0) return "";

  const lines: string[] = [];
  lines.push("━━━ USER-VERIFIED CORRECTIONS about this contact ━━━");
  lines.push("These are facts the user has explicitly corrected. Respect them over anything in the raw data below. Do not contradict these.");
  lines.push("");
  for (const c of relevant) {
    lines.push(`• DO NOT: ${c.what_was_wrong}`);
    lines.push(`  CORRECT: ${c.correct_info}`);
  }
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  return lines.join("\n");
}

/**
 * One-stop builder for the "prompt prefix" used by any AI contact endpoint.
 * Fetches user identity + contact corrections in parallel and returns the
 * combined block ready to prepend.
 */
export async function buildPromptPrefix(opts: {
  personId: string;
  context:  "summary" | "open_loops" | "news" | "enrichment";
}): Promise<string> {
  const [identity, corrections] = await Promise.all([
    getUserIdentity(),
    getContactCorrections(opts.personId),
  ]);
  const parts = [
    formatUserIdentityContext(identity),
    formatContactCorrections(corrections, opts.context),
  ].filter(Boolean);
  return parts.join("\n");
}
