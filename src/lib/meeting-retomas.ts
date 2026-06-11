/**
 * meeting-retomas.ts
 *
 * Retoma cards — the light counterpart to STB meeting-prep blocks.
 *
 * Decision model (agreed 2026-06-11):
 *   - Jose OWES the meeting something (open commitment matches) → PREP block
 *     in Suggested Time Blocks. Calendar time is reserved only for owed work.
 *   - Nothing owed, but there IS history with these attendees → RETOMA: an
 *     auto-built read-before-you-walk-in pointer next to the day's agenda.
 *     Costs zero calendar time.
 *   - Nothing owed, no history → NOTHING. No material, no card.
 *
 * A retoma is fully deterministic — no LLM call. It assembles only what the
 * system already knows:
 *   - last touch        (latest transcript / email observation with overlap)
 *   - what was discussed (bullets from sources.processed_summary of that
 *                         transcript, when ingested)
 *   - waiting on them   (open 'chase' items involving the attendees)
 *
 * Uses the SAME open-commitment rows and matcher as the STB prep gate, so
 * prep and retoma can never both fire for one meeting.
 */

import { getSupabaseServerClient } from "./supabase-server";
import {
  commitmentMatchesMeeting,
  fetchOpenCommitmentRows,
  type CommitmentRow,
} from "./time-block-candidates";
import type { UpcomingMeeting } from "./calendar-slots";

export type RetomaInput = {
  eventId: string;
  title: string;
  startMs: number;
  attendeeEmails: string[];   // non-self only
};

export type Retoma = {
  eventId: string;
  lastTouch: { kind: "Meeting" | "Email"; at: string; title: string };
  /** What was discussed last time — from the transcript summary. May be empty. */
  bullets: string[];
  /** Open items where Jose is waiting on the counterpart. May be empty. */
  waitingOnThem: string[];
};

const HORIZON_MS = 48 * 3600_000;   // retomas only for meetings ≤48h out
const MAX_BULLETS = 3;

/** commitmentMatchesMeeting needs an UpcomingMeeting; retomas start from
 *  Supabase calendar rows, so build the minimal shape it actually reads
 *  (title + attendee emails). */
function asMatcherMeeting(m: RetomaInput): UpcomingMeeting {
  return {
    id:             m.eventId,
    title:          m.title,
    description:    "",
    start:          new Date(m.startMs),
    end:            new Date(m.startMs),
    attendeeCount:  m.attendeeEmails.length,
    organizerEmail: null,
    htmlLink:       "",
    attendees:      m.attendeeEmails.map(email => ({
      email: email.toLowerCase(),
      displayName: null,
      responseStatus: "unknown" as const,
      self: false,
    })),
  };
}

/** "- **Topic:** detail" markdown lines → plain bullet strings. Falls back
 *  to sentence-ish lines when the summary isn't bulleted. */
function bulletize(summary: string | null): string[] {
  if (!summary) return [];
  const lines = summary.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const bullets = lines
    .filter(l => /^[-*•·]\s+\S/.test(l))
    .map(l => l.replace(/^[-*•·]\s+/, "").replace(/\*\*/g, "").trim());
  const pool = bullets.length > 0 ? bullets : lines.map(l => l.replace(/\*\*/g, ""));
  return pool
    .filter(Boolean)
    .slice(0, MAX_BULLETS)
    .map(b => (b.length > 150 ? b.slice(0, 147) + "…" : b));
}

type Observation = {
  kind: "Meeting" | "Email";
  at: string;
  title: string;
  participants: string[];
  transcriptId: string | null;
};

export async function buildRetomas(meetings: RetomaInput[]): Promise<Map<string, Retoma>> {
  const out = new Map<string, Retoma>();
  const now = Date.now();
  const inWindow = meetings.filter(
    m => m.startMs > now && m.startMs - now <= HORIZON_MS && m.attendeeEmails.length > 0,
  );
  if (inWindow.length === 0) return out;

  try {
    const sb = getSupabaseServerClient();
    const allEmails = [...new Set(inWindow.flatMap(m => m.attendeeEmails.map(e => e.toLowerCase())))];

    const [openRows, txRes, mailRes, chaseRes] = await Promise.all([
      fetchOpenCommitmentRows(50),
      sb.from("hall_transcript_observations")
        .select("transcript_id,title,meeting_at,participant_emails")
        .overlaps("participant_emails", allEmails)
        .order("meeting_at", { ascending: false })
        .limit(40),
      sb.from("hall_email_observations")
        .select("subject,last_message_at,attendee_emails")
        .overlaps("attendee_emails", allEmails)
        .order("last_message_at", { ascending: false })
        .limit(40),
      // "Waiting on them": chase/nurture intents are excluded from
      // fetchOpenCommitmentRows' block intents but are exactly retoma material.
      sb.from("action_items")
        .select("id, subject, counterparty, next_action, intent, effort, deadline, priority_score, last_motion_at, first_surfaced_at, source_type, source_url, project_id, strategic_objective_id")
        .eq("status", "open")
        .in("intent", ["chase", "nurture"])
        .limit(30),
    ]);

    const observations: Observation[] = [
      ...((txRes.data ?? []) as { transcript_id: string; title: string | null; meeting_at: string | null; participant_emails: string[] | null }[])
        .filter(r => r.meeting_at)
        .map(r => ({
          kind: "Meeting" as const, at: r.meeting_at!, title: r.title ?? "Meeting",
          participants: (r.participant_emails ?? []).map(e => e.toLowerCase()),
          transcriptId: r.transcript_id,
        })),
      ...((mailRes.data ?? []) as { subject: string | null; last_message_at: string | null; attendee_emails: string[] | null }[])
        .filter(r => r.last_message_at)
        .map(r => ({
          kind: "Email" as const, at: r.last_message_at!, title: r.subject ?? "Email",
          participants: (r.attendee_emails ?? []).map(e => e.toLowerCase()),
          transcriptId: null,
        })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const chaseRows = (chaseRes.data ?? []) as unknown as CommitmentRow[];

    // One summary fetch for all the transcripts we might cite.
    const candidates = new Map<string, { meeting: RetomaInput; touch: Observation; meetingTouch: Observation | null; chase: string[] }>();
    for (const m of inWindow) {
      const matcher = asMatcherMeeting(m);

      // Gate 1 — anything owed (same rows + matcher as the STB prep gate)
      // means a PREP block covers this meeting; retoma stays out of the way.
      if (openRows.some(r => commitmentMatchesMeeting(r, matcher))) continue;

      // Gate 2 — material: prior touch with these attendees.
      const emails = new Set(m.attendeeEmails.map(e => e.toLowerCase()));
      const mine = observations.filter(o => o.participants.some(p => emails.has(p)));
      const touch = mine[0];
      if (!touch) continue;
      // Bullets always come from the latest TRANSCRIPT, even when a more
      // recent email is the headline last-touch — "lo último que se habló"
      // means the conversation, not the thread subject line.
      const meetingTouch = mine.find(o => o.kind === "Meeting") ?? null;

      const chase = chaseRows
        .filter(r => commitmentMatchesMeeting(r, matcher))
        .slice(0, 2)
        .map(r => {
          const txt = (r.next_action ?? r.subject).trim();
          return r.counterparty ? `${r.counterparty}: ${txt}` : txt;
        });

      candidates.set(m.eventId, { meeting: m, touch, meetingTouch, chase });
    }
    if (candidates.size === 0) return out;

    const transcriptIds = [...new Set(
      [...candidates.values()].map(c => c.meetingTouch?.transcriptId).filter((t): t is string => !!t),
    )];
    const summaryByTranscript = new Map<string, string>();
    if (transcriptIds.length > 0) {
      const { data: srcs } = await sb
        .from("sources")
        .select("source_external_id,processed_summary")
        .in("source_external_id", transcriptIds);
      for (const s of (srcs ?? []) as { source_external_id: string | null; processed_summary: string | null }[]) {
        if (s.source_external_id && s.processed_summary) {
          summaryByTranscript.set(s.source_external_id, s.processed_summary);
        }
      }
    }

    for (const [eventId, c] of candidates) {
      out.set(eventId, {
        eventId,
        lastTouch: { kind: c.touch.kind, at: c.touch.at, title: c.touch.title },
        bullets: bulletize(c.meetingTouch?.transcriptId ? summaryByTranscript.get(c.meetingTouch.transcriptId) ?? null : null),
        waitingOnThem: c.chase,
      });
    }
  } catch (e) {
    // Retomas are decoration on the agenda — never let them break it, but
    // never fail silently either (AGENTS.md fallback observability rule).
    console.warn("[meeting-retomas] DEGRADED: retoma build failed —", e instanceof Error ? e.message : e);
    return out;
  }
  return out;
}
