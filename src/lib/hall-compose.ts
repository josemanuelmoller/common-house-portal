/**
 * hall-compose.ts
 *
 * Generates a `hall_draft` JSONB for a project from its conversational footprint
 * (Fireflies transcripts + ingested sources). Output is proposal-first and
 * never published directly — admin review is required.
 *
 * The compose flow:
 *   1. Load project + its primary org (if any) + people associated with that org
 *   2. Gather source material:
 *        a) Sources rows already in Supabase (linked by project_notion_id or
 *           org_notion_id), last 60 days
 *        b) Recent Fireflies transcripts for any org-associated email
 *           (handles the "meeting hasn't been ingested yet" case)
 *   3. Call Claude with a structured tool-use prompt → returns the draft shape
 *   4. Write to projects.hall_draft + flip status → 'pending_review'
 *
 * Re-runnable: each call overwrites hall_draft. The Hall page reads hall_hero
 * (the published copy), which is untouched until the admin clicks Publish.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

const FIREFLIES_API = "https://api.fireflies.ai/graphql";
const COMPOSE_MODEL = "claude-sonnet-4-6";
const PROMPT_VERSION = "hall-compose-v1";

// ─── Public types — match the JSONB schema documented in the migration ───────

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

export type HallDraft = {
  quote: (HallDraftQuoteCandidate & { candidates?: HallDraftQuoteCandidate[] }) | null;
  angles:    HallDraftAngle[];
  timeline:  HallDraftTimelineItem[];
  hall_text: HallDraftHallText;
  meta: {
    generated_from_source_ids: string[];
    fireflies_transcript_ids:  string[];
    model:                     string;
    prompt_version:            string;
    project_id:                string;
  };
};

export type HallComposeResult =
  | { ok: true; draft: HallDraft; sources_used: number }
  | { ok: false; error: string };

// ─── Source gathering ─────────────────────────────────────────────────────────

interface ProjectContext {
  notion_id:               string;
  name:                    string;
  primary_org_notion_id:   string | null;
  org_name:                string | null;
  org_domain:              string | null;
  org_people_emails:       string[];
}

async function loadProjectContext(
  sb: SupabaseClient,
  projectId: string,
): Promise<ProjectContext | null> {
  const { data: project } = await sb
    .from("projects")
    .select("notion_id, name, primary_org_notion_id")
    .eq("notion_id", projectId)
    .maybeSingle();
  if (!project) return null;

  let orgName: string | null = null;
  let orgDomain: string | null = null;
  let orgEmails: string[] = [];

  if (project.primary_org_notion_id) {
    const { data: hallOrg } = await sb
      .from("hall_organizations")
      .select("name, domain")
      .eq("notion_id", project.primary_org_notion_id)
      .maybeSingle();
    if (hallOrg) {
      orgName = hallOrg.name as string;
      orgDomain = hallOrg.domain as string;

      const { data: people } = await sb
        .from("people")
        .select("email")
        .ilike("email", `%@${orgDomain}`)
        .is("dismissed_at", null)
        .limit(20);
      orgEmails = (people ?? [])
        .map(p => (p.email as string | null)?.toLowerCase())
        .filter((e): e is string => !!e);
    }
  }

  return {
    notion_id: project.notion_id as string,
    name:      project.name as string,
    primary_org_notion_id: project.primary_org_notion_id as string | null,
    org_name:   orgName,
    org_domain: orgDomain,
    org_people_emails: orgEmails,
  };
}

interface SourceMaterial {
  source_id:      string | null;        // null when fetched directly from Fireflies
  origin:         "supabase" | "fireflies";
  fireflies_id:   string | null;
  title:          string;
  date_iso:       string;
  participants:   string[];
  summary:        string | null;
  transcript:     string | null;        // sentences joined; null if not available
}

async function gatherSupabaseSources(
  sb: SupabaseClient,
  ctx: ProjectContext,
): Promise<SourceMaterial[]> {
  const orFilter = ctx.primary_org_notion_id
    ? `project_notion_id.eq.${ctx.notion_id},org_notion_id.eq.${ctx.primary_org_notion_id}`
    : `project_notion_id.eq.${ctx.notion_id}`;

  const since = new Date(Date.now() - 60 * 86400_000).toISOString();
  const { data: sources } = await sb
    .from("sources")
    .select("id, title, source_date, processed_summary, raw_content, source_external_id")
    .or(orFilter)
    .gte("source_date", since)
    .order("source_date", { ascending: false })
    .limit(8);

  return (sources ?? []).map(s => ({
    source_id:    (s.id as string),
    origin:       "supabase" as const,
    fireflies_id: (s.source_external_id as string | null) ?? null,
    title:        (s.title as string) ?? "(untitled)",
    date_iso:     (s.source_date as string) ?? new Date().toISOString(),
    participants: [],
    summary:      (s.processed_summary as string | null) ?? null,
    transcript:   (s.raw_content as string | null) ?? null,
  }));
}

async function gatherFirefliesTranscripts(
  emails: string[],
  alreadyHaveExternalIds: Set<string>,
): Promise<SourceMaterial[]> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey || emails.length === 0) return [];

  // Fetch transcript metadata for each email; merge by id
  const byId = new Map<string, SourceMaterial>();

  for (const email of emails.slice(0, 5)) {  // cap to avoid runaway
    const listQuery = `
      query FF($email: String, $limit: Int) {
        transcripts(participant_email: $email, limit: $limit) {
          id title date participants
          summary { overview shorthand_bullet action_items }
        }
      }`;
    try {
      const res = await fetch(FIREFLIES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: listQuery, variables: { email, limit: 5 } }),
      });
      const j = await res.json().catch(() => ({}));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list = (j?.data?.transcripts ?? []) as any[];
      for (const t of list) {
        if (alreadyHaveExternalIds.has(t.id)) continue;       // skip — already in Supabase
        if (byId.has(t.id)) continue;
        byId.set(t.id, {
          source_id:    null,
          origin:       "fireflies",
          fireflies_id: t.id,
          title:        t.title ?? "(untitled)",
          date_iso:     new Date(Number(t.date)).toISOString(),
          participants: (t.participants ?? []) as string[],
          summary:      t.summary?.overview ?? t.summary?.shorthand_bullet ?? null,
          transcript:   null,                                  // filled below for the freshest few
        });
      }
    } catch (e) {
      console.warn("[hall-compose] fireflies list error for", email, e);
    }
  }

  // Filter to last 30 days, sort newest first, hydrate top 3 with full sentences
  const candidates = Array.from(byId.values())
    .filter(t => Date.now() - new Date(t.date_iso).getTime() < 30 * 86400_000)
    .sort((a, b) => b.date_iso.localeCompare(a.date_iso))
    .slice(0, 5);

  const sentenceQuery = `
    query FF($id: String) {
      transcript(id: $id) {
        id title date
        sentences { text speaker_name start_time }
      }
    }`;
  for (const t of candidates.slice(0, 3)) {
    try {
      const res = await fetch(FIREFLIES_API, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: sentenceQuery, variables: { id: t.fireflies_id } }),
      });
      const j = await res.json().catch(() => ({}));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sentences = (j?.data?.transcript?.sentences ?? []) as any[];
      if (sentences.length > 0) {
        t.transcript = sentences
          .map(s => `[${Math.round(Number(s.start_time) || 0)}s ${s.speaker_name ?? "?"}] ${s.text}`)
          .join("\n");
      }
    } catch (e) {
      console.warn("[hall-compose] fireflies sentences error for", t.fireflies_id, e);
    }
  }

  return candidates;
}

// ─── Prompt + LLM call ────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are composing a Hall draft for a Common House project. The Hall is a per-project page that the external counterpart (client/prospect) WILL SEE — its purpose is to demonstrate that we listened carefully and have a clear, actionable, RESPECTFUL angle on what they want.

Output must be JSON-only via the structured tool. Tone: confident, specific, evidence-based. Spanish if the source material is mostly Spanish, English otherwise. Avoid corporate buzzwords ("synergy", "leverage", "unlock"). No emojis.

# CRITICAL: client-facing positioning (no-embarrassment rule)

The counterpart will read this on their own Hall page. They will feel exposed if we surface their weaknesses verbatim. So:
- REJECT any quote candidate that highlights what the counterpart's organization LACKS, FAILS at, or STRUGGLES with (e.g. "we have no funding", "no clear vision", "we're stuck").
- PREFER quotes that show ambition, opportunity, strategic intent, or openness ("we want to break out of paralysis", "plastic is our lever", "I see this as the connector to our 2027 plan").
- If the counterpart names a problem AND a solution in the same passage, choose the solution-side phrasing.
- If only weakness-framed quotes exist, reformulate the LEAD quote toward aspiration WHILE STAYING VERBATIM (i.e. find a different sentence in the same passage that frames the opportunity).

# CRITICAL: scope discipline (no topic bleed)

You will receive 1 PRIMARY source (the most recent conversation — explicitly marked) plus 0-2 supporting sources (older context). Strict rules:
- The QUOTE must come from the PRIMARY source.
- The 3 ANGLES must reflect themes RAISED IN THE PRIMARY source. A theme that appears only in a supporting source does NOT qualify as a strategic angle for the proposal.
- Supporting sources are background context only — they may inform body text or the timeline, but they do NOT generate net-new angles.
- DO NOT mix unrelated counterparties or workstreams. If the primary source is a 1:1 with person X, do not surface angles from a completely separate meeting (e.g. lobby work, partnership ops with someone else) even if they share an org domain.

# Per-section guidance

QUOTE candidates: return 3 verbatim lines from the counterpart (NOT from CH speakers), all from the PRIMARY source. Each must pass the no-embarrassment rule. If a transcript with timestamps is provided, include timestamp_seconds.

ANGLES: exactly 3, each is a 2-4 word title (uppercase) + 1-2 sentence body. Anchor each angle's body to a specific evidence excerpt FROM THE PRIMARY SOURCE.

TIMELINE: include past meetings (from any source) as 'past', the PRIMARY meeting as 'today', and 1-3 'future' milestones derived from action items in the PRIMARY source.

HALL_TEXT: one or two sentences each. The Hall page is read BY THE COUNTERPART. So:
- welcome_note: address the COUNTERPART ORGANIZATION (not a specific person — multiple people from the same org may access the Hall over time). Use plural / collective form ("Bienvenidos…", "su equipo", "ustedes"). Anchor to the actual triggering event (meeting date, format). Frame as a shared workspace. Avoid third-person blurbs like "the two organizations" or "this partnership" — that reads as press-release copy. Tone: warm but operational. Max 2 sentences. Example shape: "Bienvenidos al espacio compartido entre <OrgName> y <CH/us>. Acá voy estructurando <what>, <what>, <what> a medida que avanzamos."
- challenge = the strategic block they want to overcome, in their own framing (positive — "they want to..." not "they fail at..."). Speak in third person here (this field is internal-coloured even if rendered).
- matters_most = what success looks like for THEM, from their perspective. Third person.
- current_focus = the next concrete piece of work the partnership will tackle. Third person.
- next_milestone = the next dated event we are driving toward (with the actual date if known).

Be concise. Overshooting any field hurts the design.`;
}

const COMPOSE_TOOL = {
  name: "submit_hall_draft",
  description: "Submit the composed Hall draft for admin review.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["quote_candidates", "angles", "timeline", "hall_text"],
    properties: {
      quote_candidates: {
        type: "array",
        minItems: 1,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "speaker_name"],
          properties: {
            text:              { type: "string", maxLength: 240 },
            speaker_name:      { type: "string" },
            speaker_role:      { type: ["string", "null"] },
            timestamp_seconds: { type: ["number", "null"] },
            source_id:         { type: ["string", "null"] },
          },
        },
      },
      angles: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "body"],
          properties: {
            title:            { type: "string", maxLength: 30 },
            body:             { type: "string", maxLength: 280 },
            evidence_excerpt: { type: ["string", "null"] },
            source_id:        { type: ["string", "null"] },
          },
        },
      },
      timeline: {
        type: "array",
        minItems: 1,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["date", "label", "type"],
          properties: {
            date:      { type: "string" },
            label:     { type: "string", maxLength: 80 },
            type:      { type: "string", enum: ["past", "today", "future"] },
            source_id: { type: ["string", "null"] },
          },
        },
      },
      hall_text: {
        type: "object",
        additionalProperties: false,
        required: ["welcome_note", "current_focus", "next_milestone", "challenge", "matters_most"],
        properties: {
          welcome_note:    { type: ["string", "null"] },
          current_focus:   { type: ["string", "null"] },
          next_milestone:  { type: ["string", "null"] },
          challenge:       { type: ["string", "null"] },
          matters_most:    { type: ["string", "null"] },
          obstacles:       { type: ["string", "null"] },
          success:         { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

interface ToolInput {
  quote_candidates: HallDraftQuoteCandidate[];
  angles:    HallDraftAngle[];
  timeline:  HallDraftTimelineItem[];
  hall_text: HallDraftHallText;
}

function buildUserMessage(ctx: ProjectContext, materials: SourceMaterial[]): string {
  const lines: string[] = [];
  lines.push(`PROJECT: ${ctx.name}`);
  if (ctx.org_name) lines.push(`COUNTERPART ORG: ${ctx.org_name} (${ctx.org_domain ?? "—"})`);
  lines.push("");
  lines.push("SOURCE MATERIAL — first listed is the PRIMARY (newest). Others are SUPPORTING context only.");

  materials.forEach((m, idx) => {
    const role = idx === 0 ? "PRIMARY" : "SUPPORTING";
    lines.push("");
    lines.push(`### [${role}] ${m.title}  ·  ${m.date_iso.slice(0, 10)}  ·  origin=${m.origin}`);
    if (m.source_id) lines.push(`source_id: ${m.source_id}`);
    if (m.participants.length) lines.push(`participants: ${m.participants.join(", ")}`);
    if (m.summary) {
      lines.push("--- SUMMARY ---");
      lines.push(m.summary.length > 1500 ? m.summary.slice(0, 1500) + "…" : m.summary);
    }
    if (m.transcript) {
      lines.push("--- TRANSCRIPT (truncated to fit) ---");
      // Larger transcript budget for the PRIMARY (12k) so quote/angles get
      // enough verbatim material; supporting sources get a tight 4k.
      const limit = idx === 0 ? 12000 : 4000;
      const trimmed = m.transcript.length > limit ? m.transcript.slice(0, limit) + "…[truncated]" : m.transcript;
      lines.push(trimmed);
    }
  });
  return lines.join("\n");
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function composeHallDraft(
  sb: SupabaseClient,
  projectId: string,
): Promise<HallComposeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "ANTHROPIC_API_KEY missing" };
  }

  const ctx = await loadProjectContext(sb, projectId);
  if (!ctx) return { ok: false, error: "project not found" };

  const supabaseSources = await gatherSupabaseSources(sb, ctx);
  const haveIds = new Set(
    supabaseSources.map(s => s.fireflies_id).filter((x): x is string => !!x),
  );
  const firefliesSources = await gatherFirefliesTranscripts(ctx.org_people_emails, haveIds);

  // Tight scoping: only the most recent 3 sources cross-origin. The most
  // recent (index 0) is marked as PRIMARY in the prompt; the rest are
  // SUPPORTING context. This prevents Claude from blending unrelated
  // workstreams (e.g. lobby meetings + CFO conversation) into the angles.
  const all = [...firefliesSources, ...supabaseSources]
    .sort((a, b) => b.date_iso.localeCompare(a.date_iso))
    .slice(0, 3);

  if (all.length === 0) {
    return { ok: false, error: "no source material found for this project" };
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const completion = await anthropic.messages.create({
    model:        COMPOSE_MODEL,
    max_tokens:   3000,
    system:       buildSystemPrompt(),
    tools:        [COMPOSE_TOOL] as unknown as Anthropic.Tool[],
    tool_choice:  { type: "tool", name: "submit_hall_draft" },
    messages: [{ role: "user", content: buildUserMessage(ctx, all) }],
  });

  const toolUse = completion.content.find(b => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { ok: false, error: "model did not return tool use" };
  }
  const out = toolUse.input as ToolInput;

  const draft: HallDraft = {
    quote: out.quote_candidates[0]
      ? { ...out.quote_candidates[0], candidates: out.quote_candidates }
      : null,
    angles:    out.angles,
    timeline:  out.timeline,
    hall_text: out.hall_text,
    meta: {
      generated_from_source_ids: all.map(s => s.source_id).filter((x): x is string => !!x),
      fireflies_transcript_ids:  all.map(s => s.fireflies_id).filter((x): x is string => !!x),
      model:          COMPOSE_MODEL,
      prompt_version: PROMPT_VERSION,
      project_id:     projectId,
    },
  };

  const { error: upErr } = await sb
    .from("projects")
    .update({
      hall_draft:               draft,
      hall_draft_status:        "pending_review",
      hall_draft_generated_at:  new Date().toISOString(),
      updated_at:               new Date().toISOString(),
    })
    .eq("notion_id", projectId);
  if (upErr) return { ok: false, error: `db write failed: ${upErr.message}` };

  return { ok: true, draft, sources_used: all.length };
}
