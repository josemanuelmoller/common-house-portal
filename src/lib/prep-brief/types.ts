/**
 * prep-brief/types.ts
 *
 * FactSheet contract. Everything the LLM sees is pre-computed here in code:
 * dates, tenses, time deltas, name resolution, disclosure tier.
 * The LLM only writes prose from these facts — it never reasons about time.
 */

export type TrustTier = "inner" | "trusted" | "external";

export type Counterpart = {
  /** Supabase people.id when resolved, else null. */
  person_id: string | null;
  /** Notion page id for Contacts [master]. */
  notion_id: string | null;
  full_name: string;
  email: string | null;
  aliases: string[];
  classification: string | null;       // "Internal" | "External" | null
  relationship_roles: string[];
  contact_warmth: string | null;        // Hot | Warm | Cold | Dormant
  last_contact_date: string | null;     // ISO date
  /** Derived in code from classification + roles — NOT asked of the LLM. */
  trust_tier: TrustTier;
  /** Which resolution path matched — debug + telemetry. */
  resolution_method: "email" | "alias" | "fuzzy_name" | "manual" | "none";
};

export type OpenCommitment = {
  description: string;
  direction: "mine_to_them" | "theirs_to_me";
  /** ISO date when the commitment was made/mentioned. */
  opened_date: string | null;
  /** Human-readable source label. */
  source: string;
  /** Days since opened — pre-computed. */
  days_open: number | null;
};

export type PersonalEvent = {
  /** Short description e.g. "London Marathon", "Baby Eloisa born". */
  event: string;
  /** ISO date. */
  event_date: string;
  /** Negative = past, 0 = today, positive = future. Pre-computed. */
  days_from_today: number;
  /** Pre-computed — LLM must use this verbatim. */
  tense: "past" | "today" | "future";
  /** Who the event belongs to. */
  who: "self" | "counterpart";
  /** Source note for provenance. */
  source: string;
};

export type EmailThreadSummary = {
  thread_id: string;
  subject: string;
  last_message_date: string;       // ISO
  days_ago: number;                 // pre-computed
  direction: "inbound" | "outbound" | "mixed";
  snippet: string;                  // first 200 chars of latest message
};

export type MeetingNoteSummary = {
  notion_id: string;
  title: string;
  meeting_date: string;             // ISO
  days_ago: number;                 // pre-computed
  summary: string;                  // processed summary text
};

export type WhatsappSignal = {
  clipped_chats: number;
  message_count: number;
  last_message_date: string | null;   // ISO
  days_since_last: number | null;
  last_snippets: { ts: string; direction: "in" | "out"; text: string }[];
  resolution_path: "fk_sender_person_id" | "fuzzy_alias_sender_name" | "none";
};

export type FirefliesTranscriptRef = {
  transcript_id:  string;
  title:          string;
  date_iso:       string;             // ISO
  days_ago:       number;              // pre-computed
  meeting_link:   string | null;
  participants:   string[];
  overview:       string | null;       // Fireflies AI summary
  action_items:   string | null;       // shorthand_bullet or action_items extracted
};

export type FirefliesSignal = {
  transcript_count: number;
  last_transcript_date: string | null;  // ISO
  days_since_last: number | null;
  transcripts: FirefliesTranscriptRef[];
};

export type MeetingMeta = {
  event_id: string;
  title: string;
  start_iso: string;
  end_iso: string;
  duration_min: number;
  days_until: number;                 // pre-computed
  organizer_email: string;
  organizer_is_self: boolean;
  attendee_emails: string[];
  description: string;
  conference_url: string | null;
};

export type DisclosureProfile = {
  /** Named profile applied, e.g. "external_warm" or "inner_cofounder". */
  profile_name: string;
  /** Fields the LLM may reference. */
  allow: string[];
  /** Fields the LLM must not reference. */
  deny: string[];
};

export type FactSheet = {
  meta: {
    generated_at: string;             // ISO timestamp
    today_iso: string;                // ISO date, local to user tz
    timezone: string;                  // IANA
  };
  meeting: MeetingMeta;
  counterpart: Counterpart;
  disclosure: DisclosureProfile;
  last_interaction: {
    kind: "meeting" | "email" | "whatsapp" | "none";
    date_iso: string | null;
    days_ago: number | null;
    summary: string | null;
  };
  open_commitments: OpenCommitment[];
  personal_events: PersonalEvent[];
  recent_emails: EmailThreadSummary[];
  recent_meetings: MeetingNoteSummary[];
  whatsapp: WhatsappSignal;
  fireflies: FirefliesSignal;
  confidence: {
    intent: "high" | "medium" | "low";
    overall: "high" | "medium" | "low";
    reasons: string[];
  };
  warnings: string[];                  // e.g. "Contact email not set in people"
};

export type BriefProse = {
  suggested_angle: string;
  agenda_outline: string;              // minute-by-minute plan
  risks: string;
  opening_line: string;                 // suggested opener
};

export type Brief = {
  fact_sheet: FactSheet;
  prose: BriefProse;
  validation: {
    passed: boolean;
    issues: string[];
  };
};
