/**
 * Client-safe Hall draft types + pure helpers.
 *
 * hall-compose.ts itself imports Anthropic SDK + Supabase types and runs
 * server-side draft composition. Client components only need the shape
 * definitions + `withDraftDefaults` to render persisted drafts.
 *
 * Rule: this file MUST NOT import any node-only module (anthropic, supabase,
 * googleapis, notion, fs, etc.).
 */

export type HallDraftQuoteCandidate = {
  text:               string;
  speaker_name:       string;
  speaker_role:       string | null;
  timestamp_seconds:  number | null;
  source_id:          string | null;
};

export type HallDraftAngle = {
  title:             string;
  body:              string;
  evidence_excerpt:  string | null;
  source_id:         string | null;
};

export type HallDraftTimelineItem = {
  date:      string;
  label:     string;
  type:      "past" | "today" | "future";
  source_id: string | null;
};

export type HallDraftHallText = {
  welcome_note:    string | null;
  current_focus:   string | null;
  next_milestone:  string | null;
  challenge:       string | null;
  matters_most:    string | null;
  obstacles:       string | null;
  success:         string | null;
};

export type HallDraftListeningPoint = {
  point:        string;
  speaker_name: string | null;
  source_id:    string | null;
};

export type HallDraftListening = {
  heard:  HallDraftListeningPoint[];
  needed: HallDraftListeningPoint[];
};

export type HallDraftProposalStatus =
  | "draft" | "preparing" | "ready" | "sent" | "accepted";

export type HallDraftProposal = {
  status:    HallDraftProposalStatus;
  summary:   string | null;
  file_url:  string | null;
  file_name: string | null;
  sent_at:   string | null;
};

export type HallDraftTopic = {
  /** 1-3 word category-like name. Examples: 'Plastic strategy', 'Coalition'. */
  name:   string;
  /** 0-100 relative emphasis in the primary conversation. Used to size radar areas. */
  weight: number;
};

export type HallDraft = {
  quote: (HallDraftQuoteCandidate & { candidates?: HallDraftQuoteCandidate[] }) | null;
  angles:    HallDraftAngle[];
  // listening / proposal / topics added after v1 of the schema. Old drafts
  // loaded from hall_draft / hall_hero may not have them — render code must
  // defensively default via withDraftDefaults() before reading.
  listening?: HallDraftListening;
  timeline:   HallDraftTimelineItem[];
  proposal?:  HallDraftProposal;
  topics?:    HallDraftTopic[];
  hall_text:  HallDraftHallText;
  meta: {
    generated_from_source_ids: string[];
    fireflies_transcript_ids:  string[];
    model:                     string;
    prompt_version:            string;
    project_id:                string;
  };
};

/**
 * Backfill defaults for fields added after v1. Use this when loading an
 * existing hall_draft / hall_hero from Supabase before reading or editing —
 * old persisted drafts won't have listening / proposal, and accessing them
 * directly would throw.
 */
export function withDraftDefaults(d: HallDraft): Required<Pick<HallDraft, "listening" | "proposal" | "topics">> & HallDraft {
  return {
    ...d,
    listening: d.listening ?? { heard: [], needed: [] },
    proposal:  d.proposal  ?? {
      status: "draft", summary: null, file_url: null, file_name: null, sent_at: null,
    },
    topics:    d.topics ?? [],
  };
}

export type HallComposeResult =
  | { ok: true; draft: HallDraft; sources_used: number }
  | { ok: false; error: string };
