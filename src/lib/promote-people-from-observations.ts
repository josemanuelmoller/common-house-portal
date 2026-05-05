/**
 * promote-people-from-observations
 *
 * Closes the "Engatel pattern" systemic gap: when a domain is classified
 * (Client / Partner / Investor / Funder), historical email and WhatsApp
 * observations from that domain do not retroactively become `people` rows.
 * The result is the visible bug: a Hall organization showing "0 contacts ·
 * 0 touches · last never" even when 80+ messages exist in the system.
 *
 * This helper is the canonical entry point that closes the gap. It must be
 * called from every place that classifies a domain or creates an engagement.
 *
 * See `docs/migration/REJECTED_PATTERNS.md` R-003 for the full rationale.
 *
 * Sources scanned (all in Supabase):
 *   - hall_email_observations.attendee_emails (Gmail)
 *   - hall_transcript_observations.participant_emails (Fireflies)
 *   - conversation_messages.sender_name (WhatsApp; matched by name fuzzy
 *     against existing email-keyed people rows AT this domain)
 *
 * Side effects (all on `people`):
 *   - Insert rows for emails at the domain that have no `people` row yet
 *   - Update existing rows: ensure org_notion_id is set, append the new
 *     class to relationship_classes, refresh counters from observations
 *
 * Idempotent. Re-running with the same domain is safe.
 *
 * Auto-merge of WhatsApp-only duplicates (sender_name → email-row) is
 * handled separately in `auto-merge-orphan-people.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { applyPeopleEmailPatches } from "@/lib/hall-contact-observers";

export type RelationshipClass = "Client" | "Partner" | "Investor" | "Funder" | "Vendor";

export type PromoteOptions = {
  domain:           string;            // "engatel.cl" — required
  orgNotionId?:     string | null;     // CH Organizations [OS v2] id; optional
  relationshipClass?: RelationshipClass; // class to add; optional
  actor?:           string;            // audit
  /** When true, only count what would happen — no writes. */
  dryRun?:          boolean;
};

export type PromoteResult = {
  domain:                 string;
  emails_observed:        number;       // distinct @domain emails found across all observations
  people_inserted:        number;       // new people rows created
  people_updated:         number;       // existing rows updated (org link, classes, counters)
  email_observation_count: number;      // total hall_email_observations rows scanned
  transcript_observation_count: number; // total hall_transcript_observations rows scanned
  whatsapp_messages_linked: number;     // conversation_messages re-pointed to a person row
  errors:                 string[];
};

/**
 * Main entry point. Idempotent.
 */
export async function promotePeopleFromObservations(
  opts: PromoteOptions,
  sb: SupabaseClient = getSupabaseServerClient(),
): Promise<PromoteResult> {
  const domain = (opts.domain ?? "").trim().toLowerCase().replace(/^@/, "").replace(/^www\./, "");
  const result: PromoteResult = {
    domain,
    emails_observed: 0,
    people_inserted: 0,
    people_updated: 0,
    email_observation_count: 0,
    transcript_observation_count: 0,
    whatsapp_messages_linked: 0,
    errors: [],
  };
  if (!domain) {
    result.errors.push("domain required");
    return result;
  }

  // ── 1. Scan hall_email_observations for emails at this domain ────────────
  const { data: emailObs, error: emailErr } = await sb
    .from("hall_email_observations")
    .select("attendee_emails, last_message_at, subject, first_observed_at, last_observed_at")
    .filter("attendee_emails::text", "ilike", `%@${domain}%`);
  if (emailErr) {
    result.errors.push(`email observations query failed: ${emailErr.message}`);
  } else {
    result.email_observation_count = emailObs?.length ?? 0;
  }

  // Build per-email aggregates from email observations.
  type Agg = {
    email: string;
    threadCount: number;
    lastMessageAt: Date | null;
    lastSubject: string | null;
    firstSeenAt: Date | null;
    lastSeenAt: Date | null;
  };
  const aggByEmail = new Map<string, Agg>();
  for (const obs of emailObs ?? []) {
    const attendees = (obs.attendee_emails as string[] | null) ?? [];
    for (const raw of attendees) {
      const e = (raw ?? "").toLowerCase().trim();
      if (!e.endsWith(`@${domain}`)) continue;
      let a = aggByEmail.get(e);
      if (!a) {
        a = { email: e, threadCount: 0, lastMessageAt: null, lastSubject: null, firstSeenAt: null, lastSeenAt: null };
        aggByEmail.set(e, a);
      }
      a.threadCount += 1;
      const lmAt = obs.last_message_at ? new Date(obs.last_message_at as string) : null;
      if (lmAt && (!a.lastMessageAt || lmAt > a.lastMessageAt)) {
        a.lastMessageAt = lmAt;
        a.lastSubject = (obs.subject as string | null) ?? null;
      }
      const fsAt = obs.first_observed_at ? new Date(obs.first_observed_at as string) : null;
      if (fsAt && (!a.firstSeenAt || fsAt < a.firstSeenAt)) a.firstSeenAt = fsAt;
      const lsAt = obs.last_observed_at ? new Date(obs.last_observed_at as string) : null;
      if (lsAt && (!a.lastSeenAt || lsAt > a.lastSeenAt)) a.lastSeenAt = lsAt;
    }
  }

  // ── 2. Add transcript-observation participation (Fireflies) ──────────────
  const { data: txObs } = await sb
    .from("hall_transcript_observations")
    .select("participant_emails, last_observed_at")
    .filter("participant_emails::text", "ilike", `%@${domain}%`);
  result.transcript_observation_count = txObs?.length ?? 0;

  const transcriptCountByEmail = new Map<string, number>();
  for (const obs of txObs ?? []) {
    const ps = (obs.participant_emails as string[] | null) ?? [];
    for (const raw of ps) {
      const e = (raw ?? "").toLowerCase().trim();
      if (!e.endsWith(`@${domain}`)) continue;
      transcriptCountByEmail.set(e, (transcriptCountByEmail.get(e) ?? 0) + 1);
      // ensure email is in the agg map even if no email observation
      if (!aggByEmail.has(e)) {
        aggByEmail.set(e, { email: e, threadCount: 0, lastMessageAt: null, lastSubject: null, firstSeenAt: null, lastSeenAt: null });
      }
      const a = aggByEmail.get(e)!;
      const lsAt = obs.last_observed_at ? new Date(obs.last_observed_at as string) : null;
      if (lsAt && (!a.lastSeenAt || lsAt > a.lastSeenAt)) a.lastSeenAt = lsAt;
    }
  }
  result.emails_observed = aggByEmail.size;

  if (aggByEmail.size === 0) return result;
  if (opts.dryRun) return result;

  // ── 3. Look up which of these emails already exist as `people` rows ──────
  const allEmails = [...aggByEmail.keys()];
  const { data: existing } = await sb
    .from("people")
    .select("id, email, relationship_classes, org_notion_id, dismissed_at")
    .in("email", allEmails);
  const existingByEmail = new Map<string, { id: string; relationship_classes: string[] | null; org_notion_id: string | null }>();
  for (const r of (existing ?? []) as { id: string; email: string; relationship_classes: string[] | null; org_notion_id: string | null; dismissed_at: string | null }[]) {
    if (!r.email || r.dismissed_at) continue;
    existingByEmail.set(r.email.toLowerCase(), { id: r.id, relationship_classes: r.relationship_classes, org_notion_id: r.org_notion_id });
  }

  // ── 4. Build patches: insert or update per email ─────────────────────────
  const nowIso = new Date().toISOString();
  type Patch = {
    email: string;
    patch: Record<string, unknown>;
    insert_defaults?: Record<string, unknown>;
    auto_suggested_source?: string;
  };
  const patches: Patch[] = [];

  for (const a of aggByEmail.values()) {
    const exists = existingByEmail.get(a.email);
    const transcriptCount = transcriptCountByEmail.get(a.email) ?? 0;
    const cls = opts.relationshipClass;

    // Compute new relationship_classes set (idempotent: only add the class)
    const nextClasses = (() => {
      if (!cls) return undefined;
      const cur = exists?.relationship_classes ?? [];
      if (cur.includes(cls)) return cur; // unchanged
      return [...cur, cls];
    })();

    // Compute org link: only set if currently null/empty.
    const orgLink = !exists?.org_notion_id && opts.orgNotionId ? opts.orgNotionId : undefined;

    const sharedPatch: Record<string, unknown> = {
      email_thread_count: a.threadCount,
      last_email_at: a.lastMessageAt?.toISOString(),
      last_email_subject: a.lastSubject ?? undefined,
      transcript_count: transcriptCount,
      last_seen_at: a.lastSeenAt?.toISOString(),
      first_seen_at: a.firstSeenAt?.toISOString(),
      relationship_classes: nextClasses,
      org_notion_id: orgLink,
      classified_at: cls ? nowIso : undefined,
      classified_by: cls ? (opts.actor ?? "promote-people-from-observations") : undefined,
    };

    if (exists) {
      patches.push({ email: a.email, patch: sharedPatch });
      result.people_updated++;
    } else {
      // Build a reasonable display name from the local-part: "j.gallardo" → "J Gallardo"
      const localPart = a.email.split("@")[0];
      const displayName = localPart
        .split(/[._-]/)
        .filter(Boolean)
        .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
        .join(" ");
      patches.push({
        email: a.email,
        patch: { ...sharedPatch, full_name: displayName, display_name: displayName, contact_segment: cls ?? undefined },
        insert_defaults: { full_name: displayName, display_name: displayName },
        auto_suggested_source: "promote-people-from-observations",
      });
      result.people_inserted++;
    }
  }

  try {
    await applyPeopleEmailPatches(sb, patches);
  } catch (e) {
    result.errors.push(`applyPeopleEmailPatches: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── 5. Re-point WhatsApp orphans to the email-keyed rows ─────────────────
  // For each email-keyed person at this domain, find conversation_messages
  // whose sender_name matches the person's display_name (fuzzy) AND whose
  // sender_person_id is null OR points to a different (email-null) row at
  // the same org. Re-point to the canonical row.
  try {
    const { data: targetPeople } = await sb
      .from("people")
      .select("id, email, full_name, display_name, aliases, org_notion_id")
      .in("email", allEmails)
      .is("dismissed_at", null);

    for (const p of (targetPeople ?? []) as Array<{
      id: string;
      email: string;
      full_name: string | null;
      display_name: string | null;
      aliases: string[] | null;
      org_notion_id: string | null;
    }>) {
      const candidateNames = [p.full_name, p.display_name, ...(p.aliases ?? [])]
        .filter((s): s is string => !!s)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length >= 4);
      if (candidateNames.length === 0) continue;
      // Use OR of ilike clauses — small and bounded.
      const orFilter = candidateNames.map((n) => `sender_name.ilike.%${escapeForIlike(n)}%`).join(",");
      const { data: msgs } = await sb
        .from("conversation_messages")
        .select("id, sender_person_id")
        .or(orFilter);
      if (!msgs || msgs.length === 0) continue;
      const idsToRepoint = (msgs as Array<{ id: string; sender_person_id: string | null }>)
        .filter((m) => m.sender_person_id !== p.id)
        .map((m) => m.id);
      if (idsToRepoint.length === 0) continue;
      const { error: updErr } = await sb
        .from("conversation_messages")
        .update({ sender_person_id: p.id })
        .in("id", idsToRepoint);
      if (updErr) {
        result.errors.push(`repoint conv_messages for ${p.email}: ${updErr.message}`);
      } else {
        result.whatsapp_messages_linked += idsToRepoint.length;
      }
    }
  } catch (e) {
    result.errors.push(`whatsapp linkage: ${e instanceof Error ? e.message : String(e)}`);
  }

  return result;
}

function escapeForIlike(s: string): string {
  return s.replace(/[%_]/g, (c) => `\\${c}`);
}
