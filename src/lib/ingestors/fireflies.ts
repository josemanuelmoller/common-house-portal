/**
 * Fireflies ingestor — emits ActionSignals from evidence extracted out of
 * meeting transcripts. See docs/NORMALIZATION_ARCHITECTURE.md §11 (Fireflies).
 *
 * Source of truth = validated evidence rows in Supabase `evidence` whose
 * parent `sources.source_platform = 'Fireflies'`. This ingestor does NOT
 * re-read transcripts — extraction already happens upstream via
 * /api/extract-meeting-evidence. Our job is to classify which evidence
 * entries represent a live action and for whom.
 *
 * v1 scope:
 *  - Evidence since watermark, types in the actionable set
 *  - Haiku batch classifies {is_actionable, actor, counterparty, intent,
 *    next_action}
 *  - Emit ActionSignal when actor is named (jose OR specific counterparty)
 *    and is_actionable=true
 *  - Emit RelationshipSignal per meeting attendee (direction=meeting)
 *
 * Out of scope (later):
 *  - Deadline extraction (evidence doesn't store deadlines structurally)
 *  - Cross-source dedup tuning beyond the dedup_key default
 *  - Project/objective linkage (project_id filled when evidence has one)
 */

import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
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

const INGESTOR_VERSION = "fireflies@1.0.0";
const SOURCE_TYPE = "fireflies" as const;
const DEFAULT_MAX_ITEMS = 60;
const DEFAULT_BACKFILL_DAYS = 14;
const ACTIONABLE_EVIDENCE_TYPES = [
  "Dependency",
  "Process Step",
  "Requirement",
  "Decision",
  "Commitment",
  "Outcome",
];

type EvidenceRow = {
  notion_id:           string;
  title:               string;
  evidence_type:       string;
  evidence_statement:  string | null;
  date_captured:       string;
  project_notion_id:   string | null;
  source_notion_id:    string | null;
  // from sources join
  source_url:          string | null;
  source_date:         string | null;
  meeting_title:       string | null;
};

type Classification = {
  is_actionable: boolean;
  actor: "jose" | "counterparty" | "ambiguous" | "none";
  counterparty: string | null;
  intent: "deliver" | "chase" | "follow_up" | "skip";
  next_action: string | null;
};

export async function runFirefliesIngestor(input: IngestInput): Promise<IngestResult> {
  const startedAt = new Date();
  const errors: IngestError[] = [];
  const signals: Signal[] = [];
  let processed = 0;
  let skipped = 0;
  let toWatermark: string | null = null;
  let fallbackUsed: string | undefined;

  // ─── Watermark ────────────────────────────────────────────────────────
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
    const selfSet = await getSelfEmails();

    // ─── Fetch evidence since watermark ─────────────────────────────────
    const rows = await fetchFirefliesEvidenceSince(since, input.maxItems ?? DEFAULT_MAX_ITEMS);
    if (rows.length === 0) {
      toWatermark = since;
    } else {
      // ─── Classify via Haiku (batched) ────────────────────────────────
      const classifications = await classifyBatch(rows, errors);

      // Track latest date_captured for watermark
      let latest = since ? new Date(since) : new Date(0);

      // ─── Gather meeting attendees for RelationshipSignals ────────────
      const meetingIds = Array.from(new Set(rows.map(r => r.source_notion_id).filter((x): x is string => !!x)));
      const attendeesByMeeting = await getAttendeesByMeeting(meetingIds);

      // ─── Resolve emails → people.id (for relationship signals) ───────
      const allEmails = Array.from(new Set(
        Object.values(attendeesByMeeting).flat().map(e => e.toLowerCase())
      ));
      const contactByEmail = await resolvePeopleByEmails(allEmails);

      // ─── Process each evidence row ────────────────────────────────────
      for (const row of rows) {
        const rowDate = new Date(row.date_captured);
        if (rowDate > latest) latest = rowDate;

        const cls = classifications.get(row.notion_id);
        if (!cls || !cls.is_actionable || cls.intent === "skip") { skipped++; continue; }
        if (cls.actor === "ambiguous" || cls.actor === "none") { skipped++; continue; }

        // When actor=counterparty, ball is still 'jose' with intent=chase
        // (Jose's next action is to nudge them) — per architecture doc §8.
        const ball: "jose" | "them" | "team" | "unknown" = "jose";
        const intent = cls.intent; // narrowed to non-'skip' by guard above

        const factors = buildFactors({
          intent,
          deadline: null,
          lastMotionAt: row.date_captured,
          tier: null,
          warmth: null,
          objectiveTier: null,
          founderOwned: false,
        });

        const signal: ActionSignal = {
          kind: "action",
          source_type: SOURCE_TYPE,
          source_id: row.notion_id,
          source_url: row.source_url ?? `https://www.notion.so/${row.notion_id.replace(/-/g, "")}`,
          emitted_at: new Date().toISOString(),
          ingestor_version: INGESTOR_VERSION,
          related_ids: {},
          payload: {
            intent,
            ball_in_court: ball,
            owner_person_id: null,
            founder_owned: false,
            next_action: cls.next_action,
            subject: row.title || row.meeting_title || "(untitled)",
            counterparty: cls.actor === "jose" ? null : cls.counterparty,
            deadline: null,
            last_motion_at: row.date_captured,
            consequence: null,
            priority_factors: factors,
          },
        };
        signals.push(signal);
        processed++;
      }

      // ─── RelationshipSignals per meeting × attendee ──────────────────
      for (const meetingId of meetingIds) {
        const meetingRow = rows.find(r => r.source_notion_id === meetingId);
        const meetingDate = meetingRow?.source_date ?? meetingRow?.date_captured;
        if (!meetingDate) continue;
        const attendees = attendeesByMeeting[meetingId] ?? [];
        for (const emailRaw of attendees) {
          const email = emailRaw.toLowerCase();
          if (selfSet.has(email)) continue; // skip Jose himself
          const contact = contactByEmail.get(email);
          if (!contact?.id) continue;
          const rel: RelationshipSignal = {
            kind: "relationship",
            source_type: SOURCE_TYPE,
            source_id: `meeting:${contact.id}:${meetingId}`,
            emitted_at: new Date().toISOString(),
            ingestor_version: INGESTOR_VERSION,
            related_ids: { contact_id: contact.id },
            payload: {
              contact_id: contact.id,
              direction: "meeting",
              at: new Date(meetingDate).toISOString(),
            },
          };
          signals.push(rel);
        }
      }

      toWatermark = latest.toISOString();
      void sb; // keep import used
    }
  } catch (err: unknown) {
    errors.push({ message: err instanceof Error ? err.message : String(err) });
  }

  // ─── Persist + finalize ────────────────────────────────────────────────
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

// ─── DB helpers ────────────────────────────────────────────────────────────

async function fetchFirefliesEvidenceSince(since: string | null, maxItems: number): Promise<EvidenceRow[]> {
  const sb = getSupabaseServerClient();
  const sinceDate = since ? new Date(since) : new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 86_400_000);
  const sinceDateStr = sinceDate.toISOString().slice(0, 10);

  // Step 1: Get all Fireflies source notion_ids. Most evidence rows lack a
  // linked source_notion_id (manual entries, conversation-derived, etc.), so
  // we must filter at the DB level rather than LIMIT + client-side filter
  // — otherwise the newest orphan rows crowd out the Fireflies ones.
  const { data: srcData, error: srcErr } = await sb
    .from("sources")
    .select("notion_id, source_url, source_date, title")
    .eq("source_platform", "Fireflies");
  if (srcErr) throw new Error(`fetchFirefliesEvidenceSince sources: ${srcErr.message}`);
  const sources = (srcData ?? []) as Array<{ notion_id: string; source_url: string | null; source_date: string | null; title: string | null }>;
  if (sources.length === 0) return [];

  const srcMeta = new Map<string, { url: string | null; date: string | null; title: string | null }>();
  for (const s of sources) srcMeta.set(s.notion_id, { url: s.source_url, date: s.source_date, title: s.title });

  // Step 2: Evidence whose source is one of those Fireflies meetings.
  const { data, error } = await sb
    .from("evidence")
    .select(
      "notion_id, title, evidence_type, evidence_statement, date_captured, " +
      "project_notion_id, source_notion_id"
    )
    .eq("validation_status", "Validated")
    .in("evidence_type", ACTIONABLE_EVIDENCE_TYPES)
    .gte("date_captured", sinceDateStr)
    .in("source_notion_id", Array.from(srcMeta.keys()))
    .order("date_captured", { ascending: false })
    .limit(maxItems);

  if (error) throw new Error(`fetchFirefliesEvidenceSince evidence: ${error.message}`);
  const rows = (data ?? []) as unknown as EvidenceRow[];
  return rows.map(r => {
    const meta = srcMeta.get(r.source_notion_id ?? "");
    return {
      ...r,
      source_url:    meta?.url ?? null,
      source_date:   meta?.date ?? null,
      meeting_title: meta?.title ?? null,
    };
  });
}

async function getAttendeesByMeeting(sourceNotionIds: string[]): Promise<Record<string, string[]>> {
  if (sourceNotionIds.length === 0) return {};
  const sb = getSupabaseServerClient();
  // Map source.notion_id → transcript observation by joining via source_external_id or title.
  // hall_transcript_observations is keyed by transcript_id which isn't the source_notion_id;
  // we join via sources.source_external_id = transcript_id when present, else by title.
  const { data: srcs } = await sb
    .from("sources")
    .select("notion_id, source_external_id, title")
    .in("notion_id", sourceNotionIds);
  const srcByExt = new Map<string, string>();
  const srcByTitle = new Map<string, string>();
  for (const s of (srcs ?? []) as Array<{ notion_id: string; source_external_id: string | null; title: string | null }>) {
    if (s.source_external_id) srcByExt.set(s.source_external_id, s.notion_id);
    if (s.title) srcByTitle.set(s.title, s.notion_id);
  }

  const transcriptIds = Array.from(srcByExt.keys());
  const out: Record<string, string[]> = {};
  if (transcriptIds.length > 0) {
    const { data: obs } = await sb
      .from("hall_transcript_observations")
      .select("transcript_id, title, participant_emails")
      .in("transcript_id", transcriptIds);
    for (const o of (obs ?? []) as Array<{ transcript_id: string; title: string; participant_emails: string[] | null }>) {
      const sid = srcByExt.get(o.transcript_id);
      if (!sid) continue;
      out[sid] = (o.participant_emails ?? []).filter(Boolean);
    }
  }
  // Fallback: title match for any source_notion_id not yet resolved
  const unresolved = sourceNotionIds.filter(id => !(id in out));
  if (unresolved.length > 0) {
    const titles = Array.from(new Set(unresolved.map(id => {
      for (const [title, nid] of srcByTitle.entries()) if (nid === id) return title;
      return "";
    }).filter(Boolean)));
    if (titles.length > 0) {
      const { data: obs2 } = await sb
        .from("hall_transcript_observations")
        .select("title, participant_emails")
        .in("title", titles);
      const byTitle = new Map<string, string[]>();
      for (const o of (obs2 ?? []) as Array<{ title: string; participant_emails: string[] | null }>) {
        byTitle.set(o.title, (o.participant_emails ?? []).filter(Boolean));
      }
      for (const sid of unresolved) {
        for (const [title, nid] of srcByTitle.entries()) {
          if (nid === sid) {
            const emails = byTitle.get(title);
            if (emails) out[sid] = emails;
            break;
          }
        }
      }
    }
  }
  return out;
}

async function resolvePeopleByEmails(emails: string[]): Promise<Map<string, { id: string; email: string }>> {
  const out = new Map<string, { id: string; email: string }>();
  if (emails.length === 0) return out;
  const sb = getSupabaseServerClient();
  const { data } = await sb.from("people").select("id, email").in("email", emails);
  for (const r of (data ?? []) as Array<{ id: string; email: string }>) {
    if (r.email) out.set(r.email.toLowerCase(), { id: r.id, email: r.email });
  }
  return out;
}

// ─── Classification (Haiku batch) ─────────────────────────────────────────

async function classifyBatch(rows: EvidenceRow[], errors: IngestError[]): Promise<Map<string, Classification>> {
  const out = new Map<string, Classification>();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    errors.push({ message: "ANTHROPIC_API_KEY missing — Fireflies classification skipped" });
    return out;
  }
  const anthropic = new Anthropic({ apiKey });

  const items = rows.map((r, i) => ({
    index:     i,
    type:      r.evidence_type,
    title:     r.title,
    statement: (r.evidence_statement ?? "").slice(0, 500),
    meeting:   r.meeting_title ?? "",
  }));

  const prompt = `You are classifying atomic pieces of evidence extracted from Common House meeting transcripts, deciding whether each represents an ACTION that Jose (the founder) should track on his personal desk.

For each item, output a JSON object with:
  - is_actionable (bool): true if SOMEONE SPECIFIC needs to DO something concrete; false if the statement is purely descriptive, a context note, a passive observation, or an aspiration without a named actor.
  - actor: "jose" if Jose is the named actor who committed; "counterparty" if a specific OTHER person was named as responsible; "ambiguous" if the actor is unclear; "none" if no action is required.
  - counterparty (string or null): the name of the other-party actor if actor="counterparty"; null otherwise.
  - intent: "deliver" (Jose will do), "chase" (someone owes Jose, Jose should nudge), "follow_up" (a loose open thread Jose should revisit), or "skip" (not actionable).
  - next_action (string or null): ONE imperative sentence telling Jose what to do next (max 14 words, starts with a verb, no trailing period). Null if intent="skip".

Rules:
- A "Dependency" or "Outcome" without a named actor → is_actionable=false, intent=skip.
- A "Requirement" without a named responsible party → is_actionable=false, intent=skip.
- A "Decision" already made with no follow-up action → is_actionable=false, intent=skip.
- "Jose is tasked with X" → actor=jose, intent=deliver.
- "Carlos is assigned to Y" → actor=counterparty (counterparty="Carlos"), intent=chase.
- "The team should Z" (no specific person) → actor=ambiguous, intent=skip.

Items:
${JSON.stringify(items, null, 2)}

Return ONLY a JSON array: [{"index": <int>, "is_actionable": <bool>, "actor": "...", "counterparty": ..., "intent": "...", "next_action": ...}]. No prose.`;

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    });
    const block = res.content[0];
    if (!block || block.type !== "text") return out;
    const text = block.text.trim();
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return out;
    const parsed = JSON.parse(match[0]) as Array<{
      index: number;
      is_actionable: boolean;
      actor: string;
      counterparty: string | null;
      intent: string;
      next_action: string | null;
    }>;
    for (const row of parsed) {
      const r = rows[row.index];
      if (!r) continue;
      const actor = (row.actor === "jose" || row.actor === "counterparty" || row.actor === "ambiguous") ? row.actor : "none";
      const intent = (["deliver", "chase", "follow_up", "skip"] as const).includes(row.intent as never)
        ? (row.intent as Classification["intent"])
        : "skip";
      out.set(r.notion_id, {
        is_actionable: !!row.is_actionable,
        actor:         actor as Classification["actor"],
        counterparty:  row.counterparty ?? null,
        intent,
        next_action:   (row.next_action ?? "").trim() || null,
      });
    }
  } catch (err: unknown) {
    errors.push({ message: `Fireflies classification failed: ${err instanceof Error ? err.message : String(err)}` });
  }
  return out;
}
