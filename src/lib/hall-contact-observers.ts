/**
 * hall-contact-observers.ts
 *
 * Cross-channel attendee observation helpers. Every ingest surface
 * (Calendar, Gmail, Fireflies) funnels new touches through these so the
 * hall_attendees registry becomes a single-source view of "who has Jose
 * interacted with, on which channel, how often".
 *
 * Dedup rules:
 *   - Gmail       → key = thread_id. Recording the same thread twice
 *                   is a no-op (attendee_emails stays as first credited).
 *   - Fireflies   → key = transcript_id. Same rule.
 *   - Calendar    → already handled by hall_calendar_events (event_id PK)
 *                   in meeting-classifier.observeAttendees.
 *
 * Counter rules:
 *   - email_thread_count / transcript_count increment once per unique
 *     (email, external_id) pair.
 *   - last_email_at / last_transcript_at always bump on any touch that
 *     is newer than the current stamp (handles out-of-order ingest).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "./supabase-server";

type SBClient = SupabaseClient;

// ─── Shared upsert helper ────────────────────────────────────────────────────
// Apply a per-email patch to the unified `people` table. Splits into INSERT
// (for new emails) vs UPDATE (for existing). This replaces the previous
// per-observer upserts into `hall_attendees`. A partial-unique index on
// lower(email) backs this — rows without an email (WhatsApp-first contacts)
// are allowed and ignored here.
type PeopleEmailPatch = {
  email:    string;
  patch:    Record<string, unknown>;
  /** For inserts: how to hydrate the new row's identity fields. */
  insert_defaults?: Record<string, unknown>;
  /** Tag for auto_suggested on first insert. */
  auto_suggested_source?: string;
};

export async function applyPeopleEmailPatches(
  sb: SBClient,
  patches: PeopleEmailPatch[],
): Promise<void> {
  const emails = [...new Set(patches.map(p => p.email.toLowerCase()).filter(Boolean))];
  if (emails.length === 0) return;
  const nowIso = new Date().toISOString();

  const { data: existing } = await sb
    .from("people")
    .select("id, email")
    .in("email", emails);
  const idByEmail = new Map<string, string>();
  for (const r of (existing ?? []) as { id: string; email: string | null }[]) {
    const em = (r.email ?? "").toLowerCase();
    if (em) idByEmail.set(em, r.id);
  }

  const toInsert: Array<Record<string, unknown>> = [];
  for (const p of patches) {
    const email = p.email.toLowerCase();
    const id = idByEmail.get(email);
    if (id) {
      // Update existing row. Strip undefined so we don't overwrite with nulls.
      const patch: Record<string, unknown> = { ...p.patch, updated_at: nowIso };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
      await sb.from("people").update(patch).eq("id", id);
    } else {
      // Insert new row with identity defaults + first-time observation tag.
      const row: Record<string, unknown> = {
        email,
        full_name:       (p.insert_defaults?.display_name as string | undefined) ?? email,
        ...p.insert_defaults,
        ...p.patch,
        first_seen_at:    nowIso,
        auto_suggested:   p.auto_suggested_source ?? "observer",
        auto_suggested_at: nowIso,
        created_at:       nowIso,
        updated_at:       nowIso,
      };
      // Remove undefined keys
      for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
      toInsert.push(row);
    }
  }
  if (toInsert.length > 0) await sb.from("people").insert(toInsert);
}

// ─── Gmail ───────────────────────────────────────────────────────────────────

export type GmailObservation = {
  threadId:        string;
  attendeeEmails:  string[];   // non-self, lowercased, deduped
  subject:         string;
  lastMessageAt:   Date;
  notionSourceId?: string | null;
};

export async function observeGmailThread(
  obs: GmailObservation,
  sb: SBClient = getSupabaseServerClient(),
): Promise<{ newObservation: boolean; incremented: number }> {
  const emails = [...new Set(obs.attendeeEmails.map(e => e.toLowerCase()).filter(Boolean))];
  if (emails.length === 0) return { newObservation: false, incremented: 0 };
  const nowIso = new Date().toISOString();

  // Fetch prior observation. We need the stored attendee_emails to detect
  // participants who joined AFTER the first observation — otherwise reply
  // storms on outbound-initiated threads leave late-joiners off the register.
  const { data: prior } = await sb
    .from("hall_email_observations")
    .select("thread_id, attendee_emails")
    .eq("thread_id", obs.threadId)
    .maybeSingle();
  const isNew = !prior;
  const priorEmails = new Set<string>(
    ((prior?.attendee_emails as string[] | null) ?? []).map(e => e.toLowerCase())
  );

  // Upsert the thread ledger row with the union of known participants.
  const unionEmails = Array.from(new Set<string>([...priorEmails, ...emails]));
  await sb.from("hall_email_observations").upsert({
    thread_id:        obs.threadId,
    attendee_emails:  unionEmails,
    subject:          obs.subject.slice(0, 500),
    last_message_at:  obs.lastMessageAt.toISOString(),
    notion_source_id: obs.notionSourceId ?? null,
    last_observed_at: nowIso,
  }, { onConflict: "thread_id" });

  // Who should we bump? On a brand-new thread: everyone. On an existing
  // thread: only attendees that weren't recorded last time (diff).
  const bumpEmails = isNew
    ? emails
    : emails.filter(e => !priorEmails.has(e));

  if (bumpEmails.length === 0) return { newObservation: false, incremented: 0 };

  // Read existing email-thread-count from unified `people` table.
  const { data: existing } = await sb
    .from("people")
    .select("email, email_thread_count, last_email_at")
    .in("email", bumpEmails);
  const byEmail = new Map<string, { count: number; last_at: string | null }>();
  for (const r of (existing ?? []) as { email: string | null; email_thread_count: number | null; last_email_at: string | null }[]) {
    const em = (r.email ?? "").toLowerCase();
    if (em) byEmail.set(em, { count: r.email_thread_count ?? 0, last_at: r.last_email_at });
  }

  const patches: PeopleEmailPatch[] = bumpEmails.map(email => {
    const current = byEmail.get(email);
    const newerTime = !current?.last_at || obs.lastMessageAt.toISOString() > current.last_at;
    return {
      email,
      patch: {
        email_thread_count: (current?.count ?? 0) + 1,
        last_email_at:      newerTime ? obs.lastMessageAt.toISOString() : current?.last_at ?? null,
        last_email_subject: newerTime ? obs.subject.slice(0, 500) : undefined,
        last_seen_at:       newerTime ? obs.lastMessageAt.toISOString() : undefined,
      },
      auto_suggested_source: "gmail",
    };
  });

  await applyPeopleEmailPatches(sb, patches);
  return { newObservation: isNew, incremented: bumpEmails.length };
}

// ─── Fireflies ──────────────────────────────────────────────────────────────

export type TranscriptObservation = {
  transcriptId:       string;
  participantEmails:  string[];
  title:              string;
  meetingAt:          Date;
  meetingLink?:       string | null;
  notionSourceId?:    string | null;
};

export async function observeTranscript(
  obs: TranscriptObservation,
  sb: SBClient = getSupabaseServerClient(),
): Promise<{ newObservation: boolean; incremented: number }> {
  const emails = [...new Set(obs.participantEmails.map(e => e.toLowerCase()).filter(Boolean))];
  if (emails.length === 0) return { newObservation: false, incremented: 0 };
  const nowIso = new Date().toISOString();

  const { data: prior } = await sb
    .from("hall_transcript_observations")
    .select("transcript_id")
    .eq("transcript_id", obs.transcriptId)
    .maybeSingle();
  const isNew = !prior;

  await sb.from("hall_transcript_observations").upsert({
    transcript_id:       obs.transcriptId,
    participant_emails:  emails,
    title:               obs.title.slice(0, 500),
    meeting_at:          obs.meetingAt.toISOString(),
    meeting_link:        obs.meetingLink ?? null,
    notion_source_id:    obs.notionSourceId ?? null,
    last_observed_at:    nowIso,
  }, { onConflict: "transcript_id" });

  if (!isNew) return { newObservation: false, incremented: 0 };

  // Read existing transcript counts from unified `people` table.
  const { data: existing } = await sb
    .from("people")
    .select("email, transcript_count, last_transcript_at")
    .in("email", emails);
  const byEmail = new Map<string, { count: number; last_at: string | null }>();
  for (const r of (existing ?? []) as { email: string | null; transcript_count: number | null; last_transcript_at: string | null }[]) {
    const em = (r.email ?? "").toLowerCase();
    if (em) byEmail.set(em, { count: r.transcript_count ?? 0, last_at: r.last_transcript_at });
  }

  const patches: PeopleEmailPatch[] = emails.map(email => {
    const current = byEmail.get(email);
    const newerTime = !current?.last_at || obs.meetingAt.toISOString() > current.last_at;
    return {
      email,
      patch: {
        transcript_count:      (current?.count ?? 0) + 1,
        last_transcript_at:    newerTime ? obs.meetingAt.toISOString() : current?.last_at ?? null,
        last_transcript_title: newerTime ? obs.title.slice(0, 500) : undefined,
        last_seen_at:          newerTime ? obs.meetingAt.toISOString() : undefined,
      },
      auto_suggested_source: "fireflies",
    };
  });

  await applyPeopleEmailPatches(sb, patches);
  return { newObservation: true, incremented: emails.length };
}
