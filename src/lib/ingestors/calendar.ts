/**
 * Calendar ingestor — Phase 7 of the normalization architecture.
 *
 * Reads upcoming Google Calendar events and emits ActionSignals for
 * meetings that require action. v1 scope (minimal):
 *   - Meeting <48h away, no description/agenda attached → intent=prep
 *   - Meeting that already happened >24h ago with no Fireflies transcript
 *     observed in hall_transcript_observations → intent=follow_up
 *   - RelationshipSignal (direction=meeting) per attendee for events
 *     that have already happened since last watermark
 *
 * Out of scope v1:
 *   - Pending invite response (intent=approve) — would need to inspect
 *     attendee response status; deferred
 *   - Cadence alerts for dormant VIPs — handled by relationship_signals
 *     downstream aggregator, not this ingestor
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §11 Calendar.
 */

import type { calendar_v3 } from "googleapis";
import { getGoogleCalendarClient, CALENDAR_ID } from "@/lib/google-calendar";
import { getSelfEmails } from "@/lib/hall-self";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildFactors } from "./priority";
import {
  getWatermark,
  startIngestorRun,
  finishIngestorRun,
  persistSignals,
  setWatermark,
  summarizeResult,
} from "./persist";
import type {
  ActionSignal,
  IngestError,
  IngestInput,
  IngestResult,
  RelationshipSignal,
  Signal,
} from "./types";

const INGESTOR_VERSION = "calendar@1.0.0";
const SOURCE_TYPE = "calendar" as const;
const DEFAULT_MAX_ITEMS = 80;
const PREP_WINDOW_HOURS = 48;
const FOLLOWUP_GRACE_HOURS = 24;

type EventInfo = {
  id:           string;
  summary:      string;
  description:  string;
  startMs:      number;
  endMs:        number;
  attendees:    string[];
  htmlLink:     string;
  isRecurring:  boolean;
};

export async function runCalendarIngestor(input: IngestInput): Promise<IngestResult> {
  const startedAt = new Date();
  const errors: IngestError[] = [];
  const signals: Signal[] = [];
  let processed = 0;
  let skipped = 0;
  let toWatermark: string | null = null;
  let fallbackUsed: string | undefined;

  // Watermark semantics: for calendar we read a window around now (past 7d
  // to future 14d), not a strictly-monotonic delta. Watermark = last run's
  // "to" timestamp mainly for observability.
  let since: string | null = null;
  if (input.mode === "backfill") {
    since = input.since ?? null;
  } else {
    since = await getWatermark(SOURCE_TYPE);
    if (!since) {
      fallbackUsed = "no_prior_watermark";
      since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    }
  }

  const runId = await startIngestorRun({
    sourceType: SOURCE_TYPE,
    ingestorVersion: INGESTOR_VERSION,
    sinceWatermark: since,
  });

  try {
    const cal = getGoogleCalendarClient();
    if (!cal) throw new Error("Calendar client unavailable — check GMAIL_* env vars");
    const selfSet = await getSelfEmails();

    const events = await fetchEventsAroundNow(cal, input.maxItems ?? DEFAULT_MAX_ITEMS);

    const now = Date.now();
    const prepCutoff = now + PREP_WINDOW_HOURS * 3_600_000;
    const followupCutoff = now - FOLLOWUP_GRACE_HOURS * 3_600_000;

    // Pre-fetch transcript observations to detect "already has Fireflies transcript"
    const pastEventTitles = events
      .filter(e => e.endMs < now)
      .map(e => e.summary);
    const transcriptedTitles = await getTranscriptedTitles(pastEventTitles);

    // Resolve attendee emails → contact_id once
    const allEmails = Array.from(new Set(events.flatMap(e => e.attendees).map(s => s.toLowerCase())));
    const contactByEmail = await resolveContactsByEmail(allEmails);

    for (const e of events) {
      try {
        if (!e.startMs) { skipped++; continue; }
        if (e.isRecurring) {
          // Skip recurring masters for action emission; they create too much noise
          // and the individual occurrences are what matter.
          skipped++;
          continue;
        }

        // (1) Upcoming meeting within prep window, no agenda → prep
        if (e.startMs > now && e.startMs <= prepCutoff) {
          const hasAgenda = (e.description ?? "").trim().length >= 20;
          if (!hasAgenda) {
            const intent = "prep" as const;
            const factors = buildFactors({
              intent,
              deadline: new Date(e.startMs).toISOString(),
              lastMotionAt: new Date(Math.max(e.startMs - 86_400_000, now - 3600_000)).toISOString(),
              tier: null,
              warmth: null,
              objectiveTier: null,
              founderOwned: false,
            });
            signals.push(buildActionSignal({
              sourceId:      `event:${e.id}:prep`,
              sourceUrl:     e.htmlLink,
              intent,
              subject:       e.summary || "(untitled event)",
              nextAction:    `Prep for "${e.summary}" — draft agenda + context`,
              counterparty:  firstNonSelfAttendeeName(e.attendees, selfSet),
              deadline:      new Date(e.startMs).toISOString(),
              lastMotionAt:  new Date(now).toISOString(),
              factors,
            }));
            processed++;
          } else { skipped++; }
          continue;
        }

        // (2) Past meeting with no Fireflies transcript → follow_up
        if (e.endMs > 0 && e.endMs < followupCutoff) {
          if (transcriptedTitles.has(e.summary)) { skipped++; continue; }
          // Only emit if the meeting had >1 external attendee (solo events are not actionable)
          const externals = e.attendees.filter(a => !selfSet.has(a.toLowerCase()));
          if (externals.length === 0) { skipped++; continue; }

          const intent = "follow_up" as const;
          const factors = buildFactors({
            intent,
            deadline: null,
            lastMotionAt: new Date(e.endMs).toISOString(),
            tier: null,
            warmth: null,
            objectiveTier: null,
            founderOwned: false,
          });
          signals.push(buildActionSignal({
            sourceId:     `event:${e.id}:followup`,
            sourceUrl:    e.htmlLink,
            intent,
            subject:      e.summary || "(untitled event)",
            nextAction:   `Follow up on "${e.summary}" — no transcript yet`,
            counterparty: firstNonSelfAttendeeName(e.attendees, selfSet),
            deadline:     null,
            lastMotionAt: new Date(e.endMs).toISOString(),
            factors,
          }));
          processed++;
        } else {
          skipped++;
        }

        // (3) RelationshipSignal per non-self attendee for past events
        if (e.endMs > 0 && e.endMs < now) {
          for (const emailRaw of e.attendees) {
            const email = emailRaw.toLowerCase();
            if (selfSet.has(email)) continue;
            const contact = contactByEmail.get(email);
            if (!contact?.id) continue;
            const rel: RelationshipSignal = {
              kind: "relationship",
              source_type: SOURCE_TYPE,
              source_id: `event:${e.id}:${contact.id}`,
              emitted_at: new Date().toISOString(),
              ingestor_version: INGESTOR_VERSION,
              related_ids: { contact_id: contact.id },
              payload: {
                contact_id: contact.id,
                direction:  "meeting",
                at:         new Date(e.endMs).toISOString(),
              },
            };
            signals.push(rel);
          }
        }
      } catch (err: unknown) {
        errors.push({ source_id: e.id, message: err instanceof Error ? err.message : String(err) });
      }
    }

    toWatermark = new Date().toISOString();
  } catch (err: unknown) {
    errors.push({ message: err instanceof Error ? err.message : String(err) });
  }

  const { counts, errors: persistErrors } = await persistSignals(signals, { dryRun: input.dryRun ?? false });
  errors.push(...persistErrors);

  const result: IngestResult = {
    source_type: SOURCE_TYPE,
    ingestor_version: INGESTOR_VERSION,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    since_watermark: since,
    to_watermark: toWatermark,
    processed,
    skipped,
    errors,
    fallback_used: fallbackUsed,
    signals,
    dry_run: input.dryRun ?? false,
    run_id: runId,
  };

  await finishIngestorRun({
    runId,
    toWatermark,
    processed,
    skipped,
    errors,
    signalsEmitted: { ...counts, ...summarizeResult(result) },
    fallbackUsed,
    dryRun: input.dryRun ?? false,
  });

  if (!input.dryRun && input.mode === "delta" && toWatermark && errors.length === 0) {
    await setWatermark({
      sourceType: SOURCE_TYPE,
      watermark: toWatermark,
      ingestorVersion: INGESTOR_VERSION,
      runId,
    });
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function fetchEventsAroundNow(cal: calendar_v3.Calendar, maxItems: number): Promise<EventInfo[]> {
  const now = Date.now();
  const timeMin = new Date(now - 7 * 86_400_000).toISOString();
  const timeMax = new Date(now + 14 * 86_400_000).toISOString();
  const res = await cal.events.list({
    calendarId:    CALENDAR_ID,
    timeMin,
    timeMax,
    singleEvents:  true,
    orderBy:       "startTime",
    maxResults:    maxItems,
  });
  const items = res.data.items ?? [];
  const out: EventInfo[] = [];
  for (const ev of items) {
    if (!ev.id) continue;
    const start = ev.start?.dateTime ?? ev.start?.date ?? "";
    const end   = ev.end?.dateTime   ?? ev.end?.date   ?? "";
    const startMs = start ? Date.parse(start) : 0;
    const endMs   = end   ? Date.parse(end)   : 0;
    if (!startMs) continue;
    out.push({
      id:          ev.id,
      summary:     (ev.summary ?? "").trim(),
      description: (ev.description ?? "").trim(),
      startMs,
      endMs,
      attendees:   (ev.attendees ?? []).map(a => a.email ?? "").filter(Boolean),
      htmlLink:    ev.htmlLink ?? "",
      isRecurring: !!ev.recurringEventId,
    });
  }
  return out;
}

async function getTranscriptedTitles(titles: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (titles.length === 0) return out;
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("hall_transcript_observations")
    .select("title")
    .in("title", titles);
  for (const r of (data ?? []) as Array<{ title: string }>) {
    if (r.title) out.add(r.title);
  }
  return out;
}

async function resolveContactsByEmail(emails: string[]): Promise<Map<string, { id: string; email: string }>> {
  const out = new Map<string, { id: string; email: string }>();
  if (emails.length === 0) return out;
  const sb = getSupabaseServerClient();
  const { data } = await sb.from("people").select("id, email").in("email", emails);
  for (const r of (data ?? []) as Array<{ id: string; email: string }>) {
    if (r.email) out.set(r.email.toLowerCase(), { id: r.id, email: r.email });
  }
  return out;
}

function firstNonSelfAttendeeName(attendees: string[], selfSet: Set<string>): string | null {
  for (const e of attendees) {
    if (!selfSet.has(e.toLowerCase())) {
      // Return the local-part of the email as a rough name; better than nothing
      // until we resolve via people table in the caller.
      return e.split("@")[0].replace(/[._-]+/g, " ");
    }
  }
  return null;
}

function buildActionSignal(params: {
  sourceId:     string;
  sourceUrl:    string;
  intent:       "prep" | "follow_up";
  subject:      string;
  nextAction:   string;
  counterparty: string | null;
  deadline:     string | null;
  lastMotionAt: string;
  factors:      ReturnType<typeof buildFactors>;
}): ActionSignal {
  return {
    kind: "action",
    source_type: SOURCE_TYPE,
    source_id: params.sourceId,
    source_url: params.sourceUrl,
    emitted_at: new Date().toISOString(),
    ingestor_version: INGESTOR_VERSION,
    related_ids: {},
    payload: {
      intent: params.intent,
      ball_in_court: "jose",
      owner_person_id: null,
      founder_owned: false,
      next_action:   params.nextAction,
      subject:       params.subject,
      counterparty:  params.counterparty,
      deadline:      params.deadline,
      last_motion_at: params.lastMotionAt,
      consequence:   null,
      priority_factors: params.factors,
    },
  };
}
