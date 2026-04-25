/**
 * WhatsApp ingestor — Phase 8 of the normalization architecture.
 *
 * Unlike Gmail / Fireflies / Calendar this is NOT a substrate fetcher:
 * the Chrome extension clipper already pushes conversations into
 * `sources` + `conversation_messages`. This ingestor is a POST-PROCESSOR
 * that reads those tables.
 *
 * v2 scope (Phase 13.1) — RELATIONSHIP-ONLY EMISSION
 *   WhatsApp is a conversational channel: replies happen on the phone
 *   throughout the day, and the clipper only captures point-in-time
 *   snapshots — it can't tell whether Jose already responded. Treating
 *   each incoming message as a follow-up action produces false positives
 *   that linger forever. Decision: drop ActionSignal emission entirely.
 *
 *   Still emitted:
 *     - RelationshipSignal per resolved-sender exchange (warmth + cadence)
 *
 *   No longer emitted:
 *     - ActionSignal(intent=reply) — was created in Phase 8, retired here.
 *
 * Sources + conversation_messages writes happen upstream in /api/clipper.
 * This ingestor only reads + emits relationship touches.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §11 WhatsApp.
 */

import { getSupabaseServerClient } from "@/lib/supabase-server";
import { buildFactors } from "./priority";
import {
  loadProjectRoles,
  loadPersonProjectMap,
  effectiveProjectFor,
  passesManagementGate,
} from "./project-roles";
import {
  getWatermark,
  startIngestorRun,
  finishIngestorRun,
  persistSignals,
  setWatermark,
  summarizeResult,
  hasFatalErrors,
  flushPerRowErrorsToDlq,
} from "./persist";
import type {
  ActionSignal,
  IngestError,
  IngestInput,
  IngestResult,
  RelationshipSignal,
  Signal,
} from "./types";

const INGESTOR_VERSION = "whatsapp@2.0.0";
const SOURCE_TYPE = "whatsapp" as const;
const DEFAULT_MAX_SOURCES = 50;
const DEFAULT_BACKFILL_DAYS = 14;

// Messages shorter than this, or matching trivial acknowledgements, don't
// warrant a next_action signal (still counted as a touch via RelationshipSignal).
const TRIVIAL_REPLY_PATTERNS = [
  /^(ok|okay|okey|okok|dale|bien|perfect|perfecto|great|thanks|thank you|gracias|grax|mil gracias|\u{1F44D}|\u{1F44C}|\u{1F64F}|\u{1F680}|\u2764\ufe0f?|\u{1F525}|\u{2713})+[.!?\s]*$/iu,
  /^(yes|sí|si|no|claro|exacto|s\u00ed|ya|listo)[.!?\s]*$/iu,
];

function isSubstantive(text: string | null): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 12) return false;
  if (TRIVIAL_REPLY_PATTERNS.some(rx => rx.test(trimmed))) return false;
  return true;
}

type MessageRow = {
  id:                string;
  source_id:         string;
  ts:                string;
  sender_name:       string | null;
  sender_person_id:  string | null;
  sender_is_self:    boolean | null;
  direction:         string | null;
  text:              string | null;
  platform:          string | null;
};

type SourceMeta = {
  notion_id: string | null;
  title:     string | null;
  source_url:string | null;
};

export async function runWhatsAppIngestor(input: IngestInput): Promise<IngestResult> {
  const startedAt = new Date();
  const errors: IngestError[] = [];
  const signals: Signal[] = [];
  let processed = 0;
  let skipped = 0;
  let toWatermark: string | null = null;
  let fallbackUsed: string | undefined;

  let since: string | null = null;
  if (input.mode === "backfill") {
    since = input.since ?? null;
  } else {
    since = await getWatermark(SOURCE_TYPE);
    if (!since) {
      since = new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 86_400_000).toISOString();
      fallbackUsed = "no_prior_watermark_defaulted_to_14d";
    }
  }

  const runId = await startIngestorRun({
    sourceType: SOURCE_TYPE,
    ingestorVersion: INGESTOR_VERSION,
    sinceWatermark: since,
  });

  try {
    const sb = getSupabaseServerClient();

    // Fetch recent WhatsApp messages since watermark. Platform column on
    // conversation_messages is the source platform tag.
    const { data: msgData, error: msgErr } = await sb
      .from("conversation_messages")
      .select("id, source_id, ts, sender_name, sender_person_id, sender_is_self, direction, text, platform")
      .eq("platform", "whatsapp")
      .gte("ts", since)
      .order("ts", { ascending: true })
      .limit((input.maxItems ?? DEFAULT_MAX_SOURCES) * 40);

    if (msgErr) throw new Error(`fetch conversation_messages: ${msgErr.message}`);
    const messages = (msgData ?? []) as unknown as MessageRow[];

    if (messages.length === 0) {
      toWatermark = since;
    } else {
      // Group by source_id; keep latest message + sender set per source
      const perSource = new Map<string, {
        latest: MessageRow;
        distinctSenders: Set<string>;
        all: MessageRow[];
      }>();
      for (const m of messages) {
        let g = perSource.get(m.source_id);
        if (!g) {
          g = { latest: m, distinctSenders: new Set(), all: [] };
          perSource.set(m.source_id, g);
        }
        if (new Date(m.ts).getTime() >= new Date(g.latest.ts).getTime()) g.latest = m;
        if (m.sender_name) g.distinctSenders.add(m.sender_name.trim().toLowerCase());
        g.all.push(m);
      }

      // Fetch source metadata (title for subject, source_url for deep link)
      const sourceIds = Array.from(perSource.keys());
      const srcMeta = await fetchSources(sourceIds);

      // Phase 11 — Management Level + person→projects map.
      // Resolve each sender_person_id → email so we can lookup the
      // project map (keyed by email).
      const senderIds = Array.from(new Set(
        messages.map(m => m.sender_person_id).filter((x): x is string => !!x)
      ));
      const [projectRoles, peopleProjectMap, emailByPersonId] = await Promise.all([
        loadProjectRoles(),
        loadPersonProjectMap(),
        fetchEmailsByPersonIds(senderIds),
      ]);

      let latestTs = new Date(since ?? 0);

      for (const [sourceId, group] of perSource.entries()) {
        const last = group.latest;
        const lastTs = new Date(last.ts);
        if (lastTs > latestTs) latestTs = lastTs;

        // Heuristic group-chat detection: >2 distinct senders ≈ group
        const isGroup = group.distinctSenders.size > 2;

        // Emit RelationshipSignal for every resolved-sender message
        for (const m of group.all) {
          if (!m.sender_person_id) continue;
          if (m.sender_is_self) continue; // skip self — we only track inbound/outbound touch with others
          const rel: RelationshipSignal = {
            kind: "relationship",
            source_type: SOURCE_TYPE,
            source_id: `wa:${sourceId}:${m.id}`,
            emitted_at: new Date().toISOString(),
            ingestor_version: INGESTOR_VERSION,
            related_ids: { contact_id: m.sender_person_id },
            payload: {
              contact_id: m.sender_person_id,
              direction: m.direction === "out" ? "outbound" : "inbound",
              at: m.ts,
            },
          };
          signals.push(rel);
        }

        // Phase 13.1 — ActionSignal emission RETIRED for WhatsApp.
        // The clipper can't observe Jose's replies (snapshots, not real-time),
        // so each incoming DM was being tracked as a perpetual follow-up
        // even after Jose responded on the phone. WhatsApp is conversational,
        // not transactional — surface it as relationship touches only.
        skipped++;
        // Keep references alive for type-checker (no-ops):
        void isGroup; void last; void srcMeta; void emailByPersonId;
        void peopleProjectMap; void projectRoles;
      }

      toWatermark = latestTs.toISOString();
    }
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

  if (!input.dryRun) {
    await flushPerRowErrorsToDlq({
      sourceType: SOURCE_TYPE,
      ingestorVersion: INGESTOR_VERSION,
      runId,
      errors,
    });
  }

  if (!input.dryRun && input.mode === "delta" && toWatermark && !hasFatalErrors(errors)) {
    await setWatermark({
      sourceType: SOURCE_TYPE,
      watermark: toWatermark,
      ingestorVersion: INGESTOR_VERSION,
      runId,
    });
  }

  return result;
}

async function fetchEmailsByPersonIds(personIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (personIds.length === 0) return out;
  const sb = getSupabaseServerClient();
  const { data } = await sb.from("people").select("id, email").in("id", personIds);
  for (const r of (data ?? []) as Array<{ id: string; email: string | null }>) {
    if (r.email) out.set(r.id, r.email);
  }
  return out;
}

async function fetchSources(sourceIds: string[]): Promise<Map<string, SourceMeta>> {
  const out = new Map<string, SourceMeta>();
  if (sourceIds.length === 0) return out;
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("sources")
    .select("id, notion_id, title, source_url")
    .in("id", sourceIds);
  for (const r of (data ?? []) as Array<{ id: string; notion_id: string | null; title: string | null; source_url: string | null }>) {
    out.set(r.id, { notion_id: r.notion_id, title: r.title, source_url: r.source_url });
  }
  return out;
}
