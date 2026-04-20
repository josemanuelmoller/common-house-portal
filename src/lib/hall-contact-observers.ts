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

  // Is this a brand-new thread observation?
  const { data: prior } = await sb
    .from("hall_email_observations")
    .select("thread_id, attendee_emails")
    .eq("thread_id", obs.threadId)
    .maybeSingle();
  const isNew = !prior;

  // Upsert the thread ledger row
  await sb.from("hall_email_observations").upsert({
    thread_id:        obs.threadId,
    attendee_emails:  emails,
    subject:          obs.subject.slice(0, 500),
    last_message_at:  obs.lastMessageAt.toISOString(),
    notion_source_id: obs.notionSourceId ?? null,
    last_observed_at: nowIso,
  }, { onConflict: "thread_id" });

  if (!isNew) return { newObservation: false, incremented: 0 };

  // New thread → bump email_thread_count for each attendee; update last_email_at.
  const { data: existing } = await sb
    .from("hall_attendees")
    .select("email, email_thread_count, last_email_at")
    .in("email", emails);
  const byEmail = new Map<string, { count: number; last_at: string | null }>();
  for (const r of (existing ?? []) as { email: string; email_thread_count: number; last_email_at: string | null }[]) {
    byEmail.set(r.email, { count: r.email_thread_count ?? 0, last_at: r.last_email_at });
  }

  const rows = emails.map(email => {
    const current = byEmail.get(email);
    const newerTime = !current?.last_at || obs.lastMessageAt.toISOString() > current.last_at;
    return {
      email,
      email_thread_count: (current?.count ?? 0) + 1,
      last_email_at:      newerTime ? obs.lastMessageAt.toISOString() : current!.last_at,
      last_email_subject: newerTime ? obs.subject.slice(0, 500) : undefined,
      last_seen_at:       newerTime ? obs.lastMessageAt.toISOString() : undefined,
      updated_at:         nowIso,
    };
  });

  await sb.from("hall_attendees").upsert(rows, { onConflict: "email", ignoreDuplicates: false });
  return { newObservation: true, incremented: emails.length };
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

  const { data: existing } = await sb
    .from("hall_attendees")
    .select("email, transcript_count, last_transcript_at")
    .in("email", emails);
  const byEmail = new Map<string, { count: number; last_at: string | null }>();
  for (const r of (existing ?? []) as { email: string; transcript_count: number; last_transcript_at: string | null }[]) {
    byEmail.set(r.email, { count: r.transcript_count ?? 0, last_at: r.last_transcript_at });
  }

  const rows = emails.map(email => {
    const current = byEmail.get(email);
    const newerTime = !current?.last_at || obs.meetingAt.toISOString() > current.last_at;
    return {
      email,
      transcript_count:      (current?.count ?? 0) + 1,
      last_transcript_at:    newerTime ? obs.meetingAt.toISOString() : current!.last_at,
      last_transcript_title: newerTime ? obs.title.slice(0, 500) : undefined,
      last_seen_at:          newerTime ? obs.meetingAt.toISOString() : undefined,
      updated_at:            nowIso,
    };
  });

  await sb.from("hall_attendees").upsert(rows, { onConflict: "email", ignoreDuplicates: false });
  return { newObservation: true, incremented: emails.length };
}
