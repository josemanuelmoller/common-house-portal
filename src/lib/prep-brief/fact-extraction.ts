/**
 * prep-brief/fact-extraction.ts
 *
 * Builds a FactSheet from calendar + gmail + notion + supabase.
 * Every date/tense/delta is computed here in TypeScript.
 * The LLM downstream is forbidden from doing time math.
 *
 * Signal resolution is CONTACT-ROOTED:
 *   meeting → attendees → counterpart(person_id) → all signals keyed on person_id
 */

import { getGoogleCalendarClient } from "@/lib/google-calendar";
import { getGoogleGmailClient } from "@/lib/google-gmail";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { notion } from "@/lib/notion";
import type {
  FactSheet, Counterpart, TrustTier, DisclosureProfile,
  MeetingMeta, OpenCommitment, PersonalEvent,
  EmailThreadSummary, MeetingNoteSummary, WhatsappSignal,
  FirefliesSignal, FirefliesTranscriptRef,
} from "./types";

// ─── Config ──────────────────────────────────────────────────────────────────

const MEETINGS_MASTER_DB = "26c45e5b6633801abde8e1d5ef07a6da"; // Meetings [master]
const DEFAULT_TZ = "Europe/London";

const SELF_EMAILS = new Set([
  "josemanuel@wearecommonhouse.com",
  "josemanuelmoller@gmail.com",
]);

// ─── Date helpers (deterministic, code-only) ─────────────────────────────────

function nowIso(): string { return new Date().toISOString(); }

function todayIso(tz: string = DEFAULT_TZ): string {
  // Intl Date formatted to tz → YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + (fromIso.length === 10 ? "T00:00:00Z" : ""));
  const to   = new Date(toIso   + (toIso.length   === 10 ? "T00:00:00Z" : ""));
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function daysAgoIso(pastIso: string): number {
  return Math.max(0, daysBetween(pastIso.slice(0, 10), todayIso()));
}

function daysUntilIso(futureIso: string): number {
  return daysBetween(todayIso(), futureIso.slice(0, 10));
}

function resolveTense(eventDateIso: string): "past" | "today" | "future" {
  const d = daysBetween(todayIso(), eventDateIso.slice(0, 10));
  if (d < 0) return "past";
  if (d === 0) return "today";
  return "future";
}

// ─── Calendar fetch ──────────────────────────────────────────────────────────

async function fetchCalendarEvent(eventId: string): Promise<MeetingMeta | null> {
  const cal = getGoogleCalendarClient();
  if (!cal) return null;
  const now = new Date();
  const windowStart = new Date(now.getTime() - 7  * 86_400_000).toISOString();
  const windowEnd   = new Date(now.getTime() + 30 * 86_400_000).toISOString();
  const listRes = await cal.events.list({
    calendarId:    "primary",
    timeMin:       windowStart,
    timeMax:       windowEnd,
    singleEvents:  true,
    maxResults:    250,
  });
  const e = (listRes.data.items ?? []).find(it => it.id === eventId);
  if (!e) {
    throw new Error(`Calendar event ${eventId} not found in +/-30d window`);
  }
  if (!e.start?.dateTime || !e.end?.dateTime) return null;
  const start = new Date(e.start.dateTime);
  const end   = new Date(e.end.dateTime);
  const attendees = (e.attendees ?? []).map(a => (a.email ?? "").toLowerCase()).filter(Boolean);
  const organizerEmail = (e.organizer?.email ?? "").toLowerCase();
  return {
    event_id:           e.id ?? eventId,
    title:              e.summary ?? "(untitled)",
    start_iso:          start.toISOString(),
    end_iso:            end.toISOString(),
    duration_min:       Math.round((end.getTime() - start.getTime()) / 60000),
    days_until:         daysUntilIso(start.toISOString()),
    organizer_email:    organizerEmail,
    organizer_is_self:  SELF_EMAILS.has(organizerEmail),
    attendee_emails:    attendees,
    description:        e.description ?? "",
    conference_url:     e.hangoutLink ?? null,
  };
}

// ─── Counterpart resolution ──────────────────────────────────────────────────

type PeopleRow = {
  id: string;
  notion_id: string;
  full_name: string;
  email: string | null;
  aliases: string[] | null;
  person_classification: string | null;
  relationship_roles: string | null;
  contact_warmth: string | null;
  last_contact_date: string | null;
};

type HallAttendeeRow = {
  email: string;
  display_name: string | null;
  relationship_class: string | null;
  relationship_classes: string[] | null;
  last_seen_at: string | null;
  last_meeting_title: string | null;
};

function deriveTrustTier(p: PeopleRow): TrustTier {
  const cls = (p.person_classification ?? "").toLowerCase();
  const roles = (p.relationship_roles ?? "").toLowerCase();
  if (cls === "internal" || roles.includes("founder") || roles.includes("core team")) {
    return "inner";
  }
  const warmth = (p.contact_warmth ?? "").toLowerCase();
  if (warmth === "hot" || warmth === "warm") return "trusted";
  return "external";
}

function deriveTrustTierFromHall(h: HallAttendeeRow): TrustTier {
  const classes = new Set((h.relationship_classes ?? [])
    .map(c => (c ?? "").toLowerCase()));
  const primary = (h.relationship_class ?? "").toLowerCase();
  classes.add(primary);
  if (classes.has("team") || classes.has("family")) return "inner";
  // Partner, Investor, Funder, Client, Portfolio, Vendor → trusted business relationship
  const trustedClasses = ["partner", "investor", "funder", "client", "portfolio", "vendor"];
  if (trustedClasses.some(c => classes.has(c))) return "trusted";
  return "external";
}

function disclosureFor(tier: TrustTier): DisclosureProfile {
  switch (tier) {
    case "inner":
      return {
        profile_name: "inner",
        allow: ["revenue_absolute", "margin", "cap_table", "pipeline_named",
                "challenges_real", "roadmap_detailed", "hitos", "asks", "personal"],
        deny:  [],
      };
    case "trusted":
      return {
        profile_name: "trusted",
        allow: ["revenue_trend", "pipeline_named", "hitos", "asks",
                "roadmap_highlevel", "personal"],
        deny:  ["revenue_absolute", "margin", "cap_table", "challenges_real_detailed"],
      };
    case "external":
    default:
      return {
        profile_name: "external",
        allow: ["hitos", "pipeline_generic", "roadmap_highlevel", "asks"],
        deny:  ["revenue_absolute", "revenue_trend", "margin", "cap_table",
                "pipeline_named", "challenges_real"],
      };
  }
}

async function resolveCounterpart(email: string): Promise<Counterpart> {
  const sb = getSupabaseServerClient();
  const lower = email.toLowerCase().trim();

  // Strategy 1: look up in people (Notion-synced, rich with roles/warmth/aliases)
  let row: PeopleRow | null = null;
  let method: Counterpart["resolution_method"] = "none";
  const byEmail = await sb
    .from("people")
    .select("id, notion_id, full_name, email, aliases, person_classification, relationship_roles, contact_warmth, last_contact_date")
    .eq("email", lower)
    .maybeSingle();
  if (byEmail.data) { row = byEmail.data as PeopleRow; method = "email"; }

  // Strategy 2: people fuzzy on local-part (e.g. jo@morrama.com → "jo" in full_name)
  if (!row) {
    const local = lower.split("@")[0].replace(/\./g, " ");
    if (local.length >= 3) {
      const { data: fuzzy } = await sb
        .from("people")
        .select("id, notion_id, full_name, email, aliases, person_classification, relationship_roles, contact_warmth, last_contact_date")
        .ilike("full_name", `%${local}%`)
        .limit(5);
      if (fuzzy && fuzzy.length === 1) {
        row = fuzzy[0] as PeopleRow;
        method = "fuzzy_name";
      }
    }
  }

  // Strategy 3: hall_attendees — calendar-derived contacts. Cristóbal lives
  // here (Partner/VIP classified) but doesn't have a Notion contact record.
  // Last-resort lookup so the prep-brief still knows who this person is.
  if (!row) {
    const { data: hallRow } = await sb
      .from("hall_attendees")
      .select("email, display_name, relationship_class, relationship_classes, last_seen_at, last_meeting_title, person_notion_id")
      .eq("email", lower)
      .maybeSingle();
    if (hallRow) {
      const h = hallRow as HallAttendeeRow & { person_notion_id: string | null };
      return {
        person_id:          null,  // no people.id for this tier
        notion_id:          h.person_notion_id ?? null,
        full_name:          h.display_name ?? lower,
        email:              lower,
        aliases:            [],
        classification:     h.relationship_class ?? null,
        relationship_roles: h.relationship_classes ?? [],
        contact_warmth:     null,
        last_contact_date:  h.last_seen_at,
        trust_tier:         deriveTrustTierFromHall(h),
        resolution_method:  "email",
      };
    }
  }

  if (!row) {
    return {
      person_id:          null,
      notion_id:          null,
      full_name:          email,
      email:              lower,
      aliases:            [],
      classification:     null,
      relationship_roles: [],
      contact_warmth:     null,
      last_contact_date:  null,
      trust_tier:         "external",
      resolution_method:  "none",
    };
  }

  const tier = deriveTrustTier(row);
  let roles: string[] = [];
  try { roles = JSON.parse(row.relationship_roles ?? "[]"); } catch { /* ignore */ }

  return {
    person_id:          row.id,
    notion_id:          row.notion_id,
    full_name:          row.full_name,
    email:              row.email ?? lower,
    aliases:            row.aliases ?? [],
    classification:     row.person_classification,
    relationship_roles: roles,
    contact_warmth:     row.contact_warmth,
    last_contact_date:  row.last_contact_date,
    trust_tier:         tier,
    resolution_method:  method,
  };
}

// ─── Gmail signal ─────────────────────────────────────────────────────────────

async function fetchRecentEmailThreads(email: string, limit = 8): Promise<EmailThreadSummary[]> {
  const gmail = getGoogleGmailClient();
  if (!gmail) return [];
  try {
    const q = `(from:${email} OR to:${email}) newer_than:180d`;
    const listRes = await gmail.users.threads.list({ userId: "me", q, maxResults: limit });
    const threads = listRes.data.threads ?? [];
    const out: EmailThreadSummary[] = [];
    for (const t of threads) {
      if (!t.id) continue;
      const detail = await gmail.users.threads.get({
        userId: "me",
        id: t.id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });
      const msgs = detail.data.messages ?? [];
      if (!msgs.length) continue;
      const first = msgs[0];
      const last = msgs[msgs.length - 1];
      const headerMap = new Map<string, string>();
      for (const h of last.payload?.headers ?? []) headerMap.set((h.name ?? "").toLowerCase(), h.value ?? "");
      const lastDate = headerMap.get("date")
        ? new Date(headerMap.get("date")!).toISOString()
        : new Date(parseInt(last.internalDate ?? "0", 10)).toISOString();

      // direction
      let outbound = 0, inbound = 0;
      for (const m of msgs) {
        const hs = new Map<string, string>();
        for (const h of m.payload?.headers ?? []) hs.set((h.name ?? "").toLowerCase(), h.value ?? "");
        const from = (hs.get("from") ?? "").toLowerCase();
        if (SELF_EMAILS.has(from.match(/<(.+?)>/)?.[1] ?? from)) outbound++;
        else inbound++;
      }
      const direction: EmailThreadSummary["direction"] =
        outbound && inbound ? "mixed" : outbound ? "outbound" : "inbound";
      void first;

      out.push({
        thread_id:         t.id,
        subject:           headerMap.get("subject") ?? "(no subject)",
        last_message_date: lastDate,
        days_ago:          daysAgoIso(lastDate),
        direction,
        snippet:           (last.snippet ?? "").slice(0, 240),
      });
    }
    out.sort((a, b) => b.last_message_date.localeCompare(a.last_message_date));
    return out;
  } catch (e) {
    console.warn("[prep-brief] gmail fetch failed:", e);
    return [];
  }
}

// ─── Notion meeting-notes signal ──────────────────────────────────────────────

async function fetchRecentMeetingNotes(counterpart: Counterpart, limit = 5): Promise<MeetingNoteSummary[]> {
  const seen = new Set<string>();
  const out: MeetingNoteSummary[] = [];

  // Query variants: full name + first name + "Firstname<>Jose" pattern (Fireflies convention).
  const firstName = counterpart.full_name.split(/\s+/)[0];
  const queries = new Set<string>([counterpart.full_name, firstName, `${firstName}<>Jose`, `${firstName} <> Jose`].filter(Boolean));

  for (const q of queries) {
    try {
      const res = await notion.search({
        query: q,
        filter: { property: "object", value: "page" },
        sort:   { direction: "descending", timestamp: "last_edited_time" },
        page_size: 10,
      });
      for (const r of res.results) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = r as any;
        if (seen.has(p.id)) continue;
        const parentDb = p.parent?.database_id?.replace(/-/g, "") ?? "";

        // Accept pages that are EITHER in Meetings [master] OR have a title
        // matching a meeting-notes naming convention ("X<>Y", "Prep: ...",
        // "@ <date>"). Standalone Fireflies-imported pages sit outside the DB.
        const titleRaw =
          p.properties?.["Meeting name"]?.title?.[0]?.plain_text ||
          p.properties?.Name?.title?.[0]?.plain_text ||
          p.properties?.title?.title?.[0]?.plain_text ||
          "";
        const isMeetingsDb   = parentDb === MEETINGS_MASTER_DB.replace(/-/g, "");
        const looksLikeMeet  = /<>|<\\>|\b(Prep|Meeting|Catch[- ]up|Reuni[oó]n|Sync)\b/i.test(titleRaw);
        if (!isMeetingsDb && !looksLikeMeet) continue;

        const summary =
          p.properties?.Summary?.rich_text?.map((rt: { plain_text: string }) => rt.plain_text).join("") ?? "";
        const dateProp =
          p.properties?.date?.date?.start ||
          p.properties?.Date?.date?.start ||
          p.created_time;
        if (!dateProp) continue;

        // If no summary in properties, try to pull the meeting-notes block
        // from the page content (Fireflies imports put the summary there).
        let finalSummary = summary;
        if (!finalSummary) {
          try {
            const blocks = await notion.blocks.children.list({ block_id: p.id, page_size: 50 });
            const textParts: string[] = [];
            for (const b of blocks.results) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const bb = b as any;
              const t = bb.type;
              const rich =
                bb[t]?.rich_text?.map((rt: { plain_text: string }) => rt.plain_text).join("") ?? "";
              if (rich) textParts.push(rich);
            }
            finalSummary = textParts.join("\n");
          } catch { /* noop */ }
        }

        seen.add(p.id);
        out.push({
          notion_id:    p.id,
          title:        titleRaw || "(untitled)",
          meeting_date: dateProp,
          days_ago:     daysAgoIso(dateProp),
          summary:      finalSummary.slice(0, 5000),
        });
        if (out.length >= limit) break;
      }
      if (out.length >= limit) break;
    } catch (e) {
      console.warn("[prep-brief] notion meeting-notes fetch failed for", q, e);
    }
  }
  // Drop any meeting dated today or in the future (that's the current prep doc, not a past meeting).
  return out.filter(m => m.days_ago > 0);
}

// ─── WhatsApp signal ──────────────────────────────────────────────────────────

async function fetchWhatsappSignal(cp: Counterpart): Promise<WhatsappSignal> {
  const empty: WhatsappSignal = {
    clipped_chats: 0, message_count: 0, last_message_date: null,
    days_since_last: null, last_snippets: [], resolution_path: "none",
  };
  if (!cp.person_id && !cp.full_name) return empty;

  const sb = getSupabaseServerClient();

  // Path 1: FK match — sender_person_id = person_id
  if (cp.person_id) {
    const { data, error } = await sb
      .from("conversation_messages")
      .select("ts, direction, text, source_id")
      .eq("platform", "whatsapp")
      .eq("sender_person_id", cp.person_id)
      .order("ts", { ascending: false })
      .limit(50);
    if (!error && data && data.length > 0) {
      const chats = new Set<string>();
      for (const r of data) if (r.source_id) chats.add(r.source_id as string);
      const last = data[0];
      return {
        clipped_chats:   chats.size,
        message_count:   data.length,
        last_message_date: last.ts as string,
        days_since_last:   daysAgoIso(last.ts as string),
        last_snippets:     data.slice(0, 6).map(r => ({
          ts: r.ts as string, direction: r.direction as "in" | "out",
          text: (r.text as string ?? "").slice(0, 180),
        })),
        resolution_path:   "fk_sender_person_id",
      };
    }
  }

  // Path 2: fuzzy on sender_name against counterpart names/aliases.
  // Postgres ILIKE is accent-sensitive — "Cristobal" won't match "Cristóbal".
  // So we OR ALL viable tokens (≥3 chars) rather than just the longest: the
  // unaccented surname ("Correa") still matches even when the first-name
  // token ("Cristobal") fails on the accent.
  const nameCandidates = [cp.full_name, ...cp.aliases].filter(Boolean);
  const tokenSet = new Set<string>();
  for (const n of nameCandidates) {
    for (const t of n.split(/[\s,.]+/).map(x => x.trim()).filter(x => x.length >= 3)) {
      tokenSet.add(t.toLowerCase());
    }
  }
  const tokens = [...tokenSet];
  if (tokens.length === 0) return empty;
  const orClause = tokens
    .map(t => `sender_name.ilike.%${t.replace(/[,()%]/g, "")}%`)
    .join(",");

  const { data, error } = await sb
    .from("conversation_messages")
    .select("ts, direction, text, source_id, sender_name")
    .eq("platform", "whatsapp")
    .or(orClause)
    .order("ts", { ascending: false })
    .limit(50);
  if (error || !data || data.length === 0) return empty;

  const chats = new Set<string>();
  for (const r of data) if (r.source_id) chats.add(r.source_id as string);
  const last = data[0];
  return {
    clipped_chats:   chats.size,
    message_count:   data.length,
    last_message_date: last.ts as string,
    days_since_last:   daysAgoIso(last.ts as string),
    last_snippets:     data.slice(0, 6).map(r => ({
      ts: r.ts as string, direction: r.direction as "in" | "out",
      text: (r.text as string ?? "").slice(0, 180),
    })),
    resolution_path:   "fuzzy_alias_sender_name",
  };
}

// ─── Fireflies signal ─────────────────────────────────────────────────────────

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

async function fetchFirefliesSignal(counterpartEmail: string, limit = 6): Promise<FirefliesSignal> {
  const empty: FirefliesSignal = {
    transcript_count: 0, last_transcript_date: null, days_since_last: null, transcripts: [],
  };
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey || !counterpartEmail) return empty;

  // Fireflies: transcripts(participant_email: ...) filters to meetings where the
  // email was a participant. Returns oldest-first by default; we sort client-side.
  const query = `
    query FF($email: String, $limit: Int) {
      transcripts(participant_email: $email, limit: $limit) {
        id
        title
        date
        meeting_link
        participants
        summary {
          overview
          shorthand_bullet
          action_items
        }
      }
    }
  `;
  try {
    const res = await fetch(FIREFLIES_API, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables: { email: counterpartEmail, limit } }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.errors) {
      console.warn("[prep-brief] fireflies API error:", json?.errors ?? res.status);
      return empty;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (json?.data?.transcripts ?? []) as Array<any>;
    const transcripts: FirefliesTranscriptRef[] = raw.map(t => {
      const dateIso = new Date(Number(t.date)).toISOString();
      return {
        transcript_id: t.id,
        title:         t.title ?? "(untitled)",
        date_iso:      dateIso,
        days_ago:      daysAgoIso(dateIso),
        meeting_link:  t.meeting_link ?? null,
        participants:  t.participants ?? [],
        overview:      t.summary?.overview ?? null,
        action_items:  t.summary?.action_items ?? t.summary?.shorthand_bullet ?? null,
      };
    });
    transcripts.sort((a, b) => b.date_iso.localeCompare(a.date_iso));
    const last = transcripts[0];
    return {
      transcript_count:     transcripts.length,
      last_transcript_date: last?.date_iso ?? null,
      days_since_last:      last ? daysAgoIso(last.date_iso) : null,
      transcripts,
    };
  } catch (e) {
    console.warn("[prep-brief] fireflies fetch failed:", e);
    return empty;
  }
}

// ─── Fireflies action_items structured extractor ───────────────────────────
// Fireflies emits action items grouped by assignee:
//   **Full Name**
//   Task sentence (HH:MM)
//   Another task (HH:MM)
//   **Other Name**
//   ...
// We parse each group and map to direction: "mine_to_them" if assignee = self,
// else "theirs_to_me" if assignee matches counterpart, else skip.

function extractCommitmentsFromFirefliesActionItems(
  transcripts: FirefliesTranscriptRef[],
  counterpart: Counterpart,
): OpenCommitment[] {
  const out: OpenCommitment[] = [];
  const selfNames = [/jose\s*manuel\s*moller/i, /^jose\b/i, /^jmm\b/i, /^jm\b/i, /^cote\b/i];
  const cpNames   = [counterpart.full_name, ...counterpart.aliases]
    .filter(Boolean)
    .map(n => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"));

  for (const t of transcripts) {
    if (!t.action_items) continue;
    const lines = t.action_items.split(/\r?\n/).map(l => l.trim());
    let currentOwner: "self" | "counterpart" | "other" | null = null;
    for (const line of lines) {
      if (!line) continue;
      // Header: "**Name**" (with optional trailing text)
      const header = /^\*\*(.+?)\*\*\s*$/.exec(line);
      if (header) {
        const name = header[1].trim();
        if (selfNames.some(rx => rx.test(name))) currentOwner = "self";
        else if (cpNames.some(rx => rx.test(name))) currentOwner = "counterpart";
        else currentOwner = "other";
        continue;
      }
      if (!currentOwner || currentOwner === "other") continue;
      // Strip trailing "(HH:MM)" timestamps and leading bullets
      const cleaned = line.replace(/\s*\(\d{1,2}:\d{2}\)\s*$/, "").replace(/^[-*•]\s*/, "").trim();
      if (cleaned.length < 8 || cleaned.length > 260) continue;
      out.push({
        description: cleaned,
        direction:   currentOwner === "self" ? "mine_to_them" : "theirs_to_me",
        opened_date: t.date_iso.slice(0, 10),
        source:      `Fireflies: ${t.title}`,
        days_open:   t.days_ago,
      });
    }
  }
  return out;
}

// ─── Commitment + personal event extraction from meeting summaries ──────────

/**
 * Conservative extraction. We only lift sentences that look like action items
 * ("X to do Y", "[ ] ...", "pendiente:", "TBD"). No NLP — just regex.
 * Date on commitment defaults to the meeting date.
 */
function extractCommitmentsFromMeetingNotes(
  notes: MeetingNoteSummary[],
  counterpartName: string,
): OpenCommitment[] {
  const out: OpenCommitment[] = [];
  for (const n of notes) {
    const lines = n.summary.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (line.length < 12 || line.length > 300) continue;
      // Patterns for action items
      const bullet = /^[-*•]\s*\[ \]\s*(.+)$/i.exec(line);
      const actionItem = /(^|\s)(Jose|Jos[eé] Manuel|JMM|I|Yo|They?|Jo(?:e|hn)?|[A-Z][a-z]+)\s+to\s+(.+)/.exec(line);
      const spanishPend = /^(-|•)\s*(?:pendiente|tarea|acci[oó]n|compromiso)[:\-\s]+(.+)/i.exec(line);

      let desc: string | null = null;
      let direction: OpenCommitment["direction"] | null = null;

      if (bullet) {
        desc = bullet[1].trim();
        const subject = desc.split(/\s+to\s+/i)[0].toLowerCase();
        direction = /jose|jmm|^i\b|yo\b/i.test(subject) ? "mine_to_them" : "theirs_to_me";
      } else if (actionItem) {
        const subject = actionItem[2].toLowerCase();
        desc = `${actionItem[2]} to ${actionItem[3]}`;
        direction = /jose|jmm|^i$|^yo$/i.test(subject) ? "mine_to_them" : "theirs_to_me";
        // Counterpart-subject heuristic
        if (counterpartName.toLowerCase().split(" ").some(t => t && subject.includes(t))) {
          direction = "theirs_to_me";
        }
      } else if (spanishPend) {
        desc = spanishPend[2].trim();
        direction = /jose|env[ií]o|mandar|hago/i.test(desc) ? "mine_to_them" : "theirs_to_me";
      }

      if (desc && direction) {
        out.push({
          description: desc.slice(0, 240),
          direction,
          opened_date: n.meeting_date.slice(0, 10),
          source:      n.title,
          days_open:   daysAgoIso(n.meeting_date),
        });
      }
    }
  }
  // Dedup by description prefix
  const seen = new Set<string>();
  return out.filter(c => {
    const key = c.description.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Pull "personal events" from a summary: marathons, births, travel.
 * Very conservative regex — only lifts lines with a clear date pattern.
 */
function extractPersonalEvents(
  notes: MeetingNoteSummary[],
): PersonalEvent[] {
  const out: PersonalEvent[] = [];
  const triggers = /(marathon|marat[oó]n|baby|born|wedding|travel|trip|birthday|cumplea[nñ]os|bod[ae])/i;
  const monthNames = "(January|February|March|April|May|June|July|August|September|October|November|December|Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)";
  const datePatterns = [
    new RegExp(`${monthNames}\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?`, "i"),
    /(\d{4})-(\d{2})-(\d{2})/,
    /(\d{1,2})\s+de\s+[A-Za-z]+(?:\s+de\s+\d{4})?/i,
  ];
  const monthIdx: Record<string, number> = {
    january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11,
    enero:0,febrero:1,marzo:2,abril:3,mayo:4,junio:5,julio:6,agosto:7,septiembre:8,octubre:9,noviembre:10,diciembre:11,
  };

  for (const n of notes) {
    const lines = n.summary.split(/\r?\n/);
    for (const raw of lines) {
      if (!triggers.test(raw)) continue;
      let found: { iso: string } | null = null;
      for (const pat of datePatterns) {
        const m = pat.exec(raw);
        if (!m) continue;
        if (pat === datePatterns[0]) {
          const month = monthIdx[m[1].toLowerCase()];
          const day = parseInt(m[2], 10);
          const year = m[3] ? parseInt(m[3], 10) : new Date(n.meeting_date).getFullYear();
          if (month !== undefined && day) {
            const d = new Date(Date.UTC(year, month, day));
            found = { iso: d.toISOString().slice(0, 10) };
          }
        } else if (pat === datePatterns[1]) {
          found = { iso: `${m[1]}-${m[2]}-${m[3]}` };
        }
        if (found) break;
      }
      if (!found) continue;

      const who: PersonalEvent["who"] = /(jose|my|mi|joe wife|baby eloisa|i )/i.test(raw) ? "self" : "counterpart";
      out.push({
        event:           raw.trim().slice(0, 140),
        event_date:      found.iso,
        days_from_today: daysBetween(todayIso(), found.iso),
        tense:           resolveTense(found.iso),
        who,
        source:          n.title,
      });
    }
  }
  return out.slice(0, 8);
}

// ─── Main entrypoint ──────────────────────────────────────────────────────────

export type MeetingOverride = {
  event_id?:        string;
  title:            string;
  start_iso:        string;
  end_iso:          string;
  organizer_email:  string;
  attendee_emails:  string[];
  description?:     string;
  conference_url?:  string | null;
};

export async function extractFactSheet(
  eventId: string,
  opts: { tz?: string; meetingOverride?: MeetingOverride } = {},
): Promise<FactSheet> {
  const tz = opts.tz ?? DEFAULT_TZ;
  const warnings: string[] = [];

  // 1. Meeting — try Google Calendar, fall back to override if provided.
  let meeting: MeetingMeta | null = null;
  if (opts.meetingOverride) {
    const o = opts.meetingOverride;
    const start = new Date(o.start_iso);
    const end   = new Date(o.end_iso);
    meeting = {
      event_id:          o.event_id ?? eventId,
      title:             o.title,
      start_iso:         start.toISOString(),
      end_iso:           end.toISOString(),
      duration_min:      Math.round((end.getTime() - start.getTime()) / 60000),
      days_until:        daysUntilIso(start.toISOString()),
      organizer_email:   o.organizer_email.toLowerCase(),
      organizer_is_self: SELF_EMAILS.has(o.organizer_email.toLowerCase()),
      attendee_emails:   o.attendee_emails.map(e => e.toLowerCase()),
      description:       o.description ?? "",
      conference_url:    o.conference_url ?? null,
    };
    warnings.push("Meeting loaded from meetingOverride (spike path, not Calendar API)");
  } else {
    try {
      meeting = await fetchCalendarEvent(eventId);
    } catch (e) {
      throw new Error(`Calendar fetch failed: ${e instanceof Error ? e.message : String(e)}. Consider passing meetingOverride.`);
    }
  }
  if (!meeting) throw new Error(`Calendar event ${eventId} not found or not accessible`);

  // 2. Counterpart — pick first non-self attendee
  const counterpartEmail = meeting.attendee_emails.find(e => !SELF_EMAILS.has(e));
  if (!counterpartEmail) throw new Error("No non-self attendee on this event");
  const counterpart = await resolveCounterpart(counterpartEmail);
  if (counterpart.resolution_method === "none") {
    warnings.push(`Counterpart not in people table: ${counterpartEmail} — signals will be degraded`);
  }
  if (!counterpart.email) warnings.push("Contact has no email stored — only fuzzy name resolution available");
  if (counterpart.aliases.length === 0 && counterpart.resolution_method !== "email") {
    warnings.push("Contact has no aliases — WhatsApp fuzzy fallback may underperform");
  }

  const disclosure = disclosureFor(counterpart.trust_tier);

  // 3. Signals in parallel
  const [emails, meetingNotes, wa, ff] = await Promise.all([
    fetchRecentEmailThreads(counterpartEmail, 8),
    fetchRecentMeetingNotes(counterpart, 5),
    fetchWhatsappSignal(counterpart),
    fetchFirefliesSignal(counterpartEmail, 6),
  ]);

  // 4. Derived facts — meeting-notes AND fireflies transcripts feed extractors.
  const transcriptsAsNotes: MeetingNoteSummary[] = ff.transcripts.map(t => ({
    notion_id:    t.transcript_id,
    title:        t.title,
    meeting_date: t.date_iso,
    days_ago:     t.days_ago,
    summary:      [t.overview ?? "", t.action_items ?? ""].filter(Boolean).join("\n\n").slice(0, 8000),
  }));
  const allNotes = [...meetingNotes, ...transcriptsAsNotes];
  // Structured extractor for Fireflies action_items (name-grouped format)
  const ffCommitments = extractCommitmentsFromFirefliesActionItems(ff.transcripts, counterpart);
  // Regex extractor for unstructured notes (Notion meeting notes, overview prose)
  const regexCommitments = extractCommitmentsFromMeetingNotes(allNotes, counterpart.full_name);
  // Merge, structured wins on description collision
  const seenDesc = new Set<string>();
  const commitments: OpenCommitment[] = [];
  for (const c of [...ffCommitments, ...regexCommitments]) {
    const key = c.description.slice(0, 60).toLowerCase();
    if (seenDesc.has(key)) continue;
    seenDesc.add(key);
    commitments.push(c);
  }
  const personalEvents = extractPersonalEvents(allNotes);

  // 5. Last interaction — whichever signal is most recent
  const candidates: { kind: "meeting" | "email" | "whatsapp"; date: string; summary: string }[] = [];
  if (meetingNotes[0])
    candidates.push({ kind: "meeting",  date: meetingNotes[0].meeting_date,
                      summary: `${meetingNotes[0].title} — ${meetingNotes[0].summary.slice(0, 200)}` });
  if (ff.transcripts[0])
    candidates.push({ kind: "meeting",  date: ff.transcripts[0].date_iso,
                      summary: `${ff.transcripts[0].title} — ${(ff.transcripts[0].overview ?? "").slice(0, 200)}` });
  if (emails[0])
    candidates.push({ kind: "email",    date: emails[0].last_message_date,
                      summary: `${emails[0].subject} — ${emails[0].snippet}` });
  if (wa.last_message_date)
    candidates.push({ kind: "whatsapp", date: wa.last_message_date,
                      summary: wa.last_snippets.map(s => s.text).join(" · ").slice(0, 200) });
  candidates.sort((a, b) => b.date.localeCompare(a.date));
  const last = candidates[0];
  const lastInteraction = last
    ? { kind: last.kind, date_iso: last.date, days_ago: daysAgoIso(last.date), summary: last.summary }
    : { kind: "none" as const, date_iso: null, days_ago: null, summary: null };

  // 6. Confidence — high if we have at least 2 signal sources
  const signalCount =
    (meetingNotes.length > 0 ? 1 : 0) +
    (emails.length > 0 ? 1 : 0) +
    (wa.message_count > 0 ? 1 : 0) +
    (ff.transcript_count > 0 ? 1 : 0);
  const overall = signalCount >= 2 ? "high" : signalCount === 1 ? "medium" : "low";
  const intent  = meetingNotes.length > 0 || emails.length > 0 || ff.transcript_count > 0 ? "medium" : "low";
  // Upgrade intent to high if meeting was organizer=counterpart AND any substantive signal exists
  const intentHigh = !meeting.organizer_is_self && (emails.length > 0 || ff.transcript_count > 0) ? "high" : intent;

  return {
    meta: { generated_at: nowIso(), today_iso: todayIso(tz), timezone: tz },
    meeting,
    counterpart,
    disclosure,
    last_interaction:  lastInteraction,
    open_commitments:  commitments,
    personal_events:   personalEvents,
    recent_emails:     emails,
    recent_meetings:   meetingNotes,
    whatsapp:          wa,
    fireflies:         ff,
    confidence: {
      intent: intentHigh,
      overall,
      reasons: [
        `signals present: notion_meetings=${meetingNotes.length} fireflies=${ff.transcript_count} emails=${emails.length} wa_msgs=${wa.message_count}`,
        `counterpart resolution: ${counterpart.resolution_method}`,
        `wa resolution: ${wa.resolution_path}`,
      ],
    },
    warnings,
  };
}
