/**
 * prep-brief/synthesis.ts
 *
 * Calls Sonnet with a tightly-scoped prompt. The LLM MUST write prose only —
 * no dates, no names not in the fact sheet, no time math. Facts are injected;
 * the model writes the narrative.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { FactSheet, BriefProse } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;

function renderFactSheetForLLM(f: FactSheet): string {
  const lines: string[] = [];
  lines.push("# FACT SHEET (pre-computed, authoritative — use verbatim)");
  lines.push("");
  lines.push(`today: ${f.meta.today_iso} (timezone: ${f.meta.timezone})`);
  lines.push("");
  lines.push("## meeting");
  lines.push(`- title: ${f.meeting.title}`);
  lines.push(`- start: ${f.meeting.start_iso}`);
  lines.push(`- duration_min: ${f.meeting.duration_min}`);
  lines.push(`- days_until_meeting: ${f.meeting.days_until}`);
  lines.push(`- organizer_is_self: ${f.meeting.organizer_is_self}`);
  lines.push(`- description: ${f.meeting.description.slice(0, 400) || "(empty)"}`);
  lines.push("");
  lines.push("## counterpart");
  lines.push(`- full_name: ${f.counterpart.full_name}`);
  lines.push(`- email: ${f.counterpart.email ?? "(not set)"}`);
  lines.push(`- classification: ${f.counterpart.classification ?? "(unknown)"}`);
  lines.push(`- roles: ${f.counterpart.relationship_roles.join(", ") || "(none)"}`);
  lines.push(`- trust_tier: ${f.counterpart.trust_tier}`);
  lines.push(`- last_contact_date: ${f.counterpart.last_contact_date ?? "(unknown)"}`);
  lines.push("");
  lines.push("## disclosure_profile");
  lines.push(`- name: ${f.disclosure.profile_name}`);
  lines.push(`- allow: ${f.disclosure.allow.join(", ")}`);
  lines.push(`- deny (NEVER include these in your prose): ${f.disclosure.deny.join(", ") || "(none)"}`);
  lines.push("");
  lines.push("## last_interaction");
  lines.push(`- kind: ${f.last_interaction.kind}`);
  lines.push(`- date: ${f.last_interaction.date_iso ?? "(none)"}`);
  lines.push(`- days_ago: ${f.last_interaction.days_ago ?? "(n/a)"}`);
  lines.push(`- summary: ${f.last_interaction.summary?.slice(0, 300) ?? "(none)"}`);
  lines.push("");
  lines.push("## open_commitments (each with resolved days_open)");
  if (f.open_commitments.length === 0) {
    lines.push("- (none)");
  } else {
    for (const c of f.open_commitments) {
      lines.push(`- [${c.direction}] "${c.description}" — opened ${c.opened_date ?? "?"} (${c.days_open ?? "?"} days ago, source: ${c.source})`);
    }
  }
  lines.push("");
  lines.push("## personal_events (TENSE IS RESOLVED — use verbatim, do not compute)");
  if (f.personal_events.length === 0) {
    lines.push("- (none)");
  } else {
    for (const e of f.personal_events) {
      lines.push(`- ${e.who} · ${e.event} · date=${e.event_date} · days_from_today=${e.days_from_today} · TENSE=${e.tense}`);
    }
  }
  lines.push("");
  lines.push("## recent_emails (top 5, most recent first)");
  for (const em of f.recent_emails.slice(0, 5)) {
    lines.push(`- [${em.direction}] "${em.subject}" — ${em.days_ago}d ago — ${em.snippet.slice(0, 160)}`);
  }
  lines.push("");
  lines.push("## recent_meetings");
  for (const m of f.recent_meetings.slice(0, 3)) {
    lines.push(`- "${m.title}" — ${m.days_ago}d ago`);
    lines.push(`  summary: ${m.summary.slice(0, 600)}`);
  }
  lines.push("");
  lines.push("## fireflies (past meeting transcripts with counterpart)");
  lines.push(`- transcript_count: ${f.fireflies.transcript_count}`);
  lines.push(`- days_since_last: ${f.fireflies.days_since_last ?? "(n/a)"}`);
  for (const t of f.fireflies.transcripts.slice(0, 3)) {
    lines.push(`- "${t.title}" — ${t.days_ago}d ago`);
    if (t.overview)     lines.push(`  overview: ${t.overview.slice(0, 600)}`);
    if (t.action_items) lines.push(`  action_items: ${t.action_items.slice(0, 500)}`);
  }
  lines.push("");
  lines.push("## whatsapp");
  lines.push(`- clipped_chats: ${f.whatsapp.clipped_chats}`);
  lines.push(`- message_count: ${f.whatsapp.message_count}`);
  lines.push(`- last_message_date: ${f.whatsapp.last_message_date ?? "(none)"}`);
  lines.push(`- days_since_last: ${f.whatsapp.days_since_last ?? "(n/a)"}`);
  lines.push(`- resolution_path: ${f.whatsapp.resolution_path}`);
  for (const s of f.whatsapp.last_snippets) {
    lines.push(`  - [${s.direction}] ${s.text.slice(0, 140)}`);
  }
  lines.push("");
  lines.push("## confidence");
  lines.push(`- intent: ${f.confidence.intent}`);
  lines.push(`- overall: ${f.confidence.overall}`);
  if (f.warnings.length) {
    lines.push("");
    lines.push("## warnings");
    for (const w of f.warnings) lines.push(`- ${w}`);
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are José Manuel Moller's (JMM) chief of staff preparing him to walk into a meeting. Your job is NOT to script the meeting. Your job is to tell JMM exactly what homework he must do BEFORE the meeting so he arrives prepared.

Do NOT write an agenda. Do NOT write minute-by-minute plans. Do NOT write motivational framing. Do NOT suggest what he should "say" beyond a single concrete opener.

Hard rules:

1. DO NOT compute or infer dates, durations, or time deltas. All dates, "days ago", "days from now", and TENSE values are pre-computed in the FACT SHEET. Use them verbatim. If the FACT SHEET says TENSE=future, you MUST speak in the future tense. Never say "hace X días" or "in Y days" unless the exact phrase appears in the FACT SHEET.

2. DO NOT invent facts, names, numbers, projects, or commitments not in the FACT SHEET. If a fact is missing, it is missing — do not make one up.

3. DO NOT include information in the disclosure_profile "deny" list.

4. Language: match the dominant language of recent emails / meeting summaries. Mixed → Spanish.

5. Be terse. Bullets, not paragraphs. No preamble. No "hope this helps".

Output a JSON object with exactly these keys:
{
  "prep_actions": "2-5 concrete to-dos JMM MUST DO before the meeting. Markdown bullets. Every bullet starts with an imperative verb (Envía, Revisa, Prepara, Confirma, Lee, Ten listo). Each must be specific and grounded in the FACT SHEET. Examples: 'Envía el user/pass a Pancho antes de las 14:30', 'Revisa el avance real de los 6 compromisos que quedaron abiertos ayer y ten una línea de update para cada uno', 'Prepara 2 preguntas específicas sobre lo que Pancho dijo del feedback técnico'. If open_commitments.mine_to_them has items, prep_actions MUST reference closing those specific commitments.",
  "key_context":  "3-5 terse bullets of FACTS JMM needs to recall walking in. No prose. No opinion. No emotional language. Short declarative sentences. Examples: 'Última reunión: ayer (Fireflies). Pancho reaccionó con entusiasmo real a la demo.', 'Tú tienes 6 compromisos abiertos desde ayer, ninguno cerrado.', 'Él debe enviar feedback técnico — no lo ha hecho.'",
  "opener":       "ONE concrete sentence JMM could use to open the meeting, grounded in a specific fact. NOT a full script. NOT motivational. If context doesn't suggest an obvious opener, return empty string ''."
}

Return ONLY the JSON object. No markdown fences. No explanation.`;

export async function synthesizeProse(fact: FactSheet): Promise<BriefProse> {
  const userContent = `${renderFactSheetForLLM(fact)}

Produce the JSON brief now.`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });
  const text = res.content[0]?.type === "text" ? res.content[0].text : "";

  // Strip potential fences defensively
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      prep_actions: String(parsed.prep_actions ?? ""),
      key_context:  String(parsed.key_context  ?? ""),
      opener:       String(parsed.opener       ?? ""),
    };
  } catch (e) {
    throw new Error(`Synthesis returned non-JSON: ${cleaned.slice(0, 400)} :: ${e}`);
  }
}
