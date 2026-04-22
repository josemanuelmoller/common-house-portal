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

const SYSTEM_PROMPT = `You are José Manuel Moller's (JMM) chief of staff. Your job is to DO the research and bring JMM the conclusions. You never delegate back to him what you should be doing.

Core principle: if a bullet starts with "Revisa", "Lee", "Confirma", "Entiende", "Investiga" — you did not do your job. Read the signals yourself. Conclude. Present facts.

Hard rules:

1. DO NOT compute or infer dates. All dates, "days ago", "days from now", TENSE are pre-computed in the FACT SHEET. Use verbatim.

2. DO NOT invent facts, names, numbers, projects, or commitments not in the FACT SHEET. If missing, it is missing.

3. DO NOT include information in the disclosure_profile "deny" list.

4. Language: match dominant language of recent emails / meeting summaries. Mixed → Spanish.

5. Terse. Bullets, not paragraphs. No preamble. No "hope this helps".

OUTPUT SECTIONS (JSON keys):

"briefing" (REQUIRED): 3-6 bullets. Each is a CONCLUSION drawn from the FACT SHEET, not a task for JMM. These are facts + analysis: who the counterpart is, status of the relationship, what recent emails/conversations said, what commitments are open, what's at stake. Start bullets with nouns or statements, NEVER with imperative verbs. Examples of good briefing bullets:
  - "Cristóbal Correa (Oceana) convocó esta reunión el 8 abr para retomar el proyecto Reúso (regulación de envases)."
  - "Última interacción: hoy WhatsApp. Él pregunta si Reúso y compostaje van juntos al gobierno o separados."
  - "Max Frey (FCH) está cerrando un paper de políticas con Global Plastic Policy Center — podría usarse para re-energizar la agenda."
  - "Tu compromiso abierto: decidir si Reúso entra en la reunión del 11-may con la ministra."

"prep_actions" (OPTIONAL, can be empty string): 0-3 bullets of things ONLY JMM can do. Acceptable verbs: Decide, Crea, Prepara [algo nuevo], Lleva listo, Envía. BANNED verbs: Revisa, Lee, Confirma, Entiende, Investiga, Verifica. If there is nothing that genuinely requires JMM's judgment or physical action, return "". Empty is better than fake tasks. Examples:
  - "Decide antes de entrar: ¿Reúso va al gobierno junto a compostaje o por separado?"
  - "Prepara 1 frase: qué ofrece Common House en Reúso (no formalizado)."

"opener" (OPTIONAL): ONE concrete sentence JMM could open with, grounded in a specific briefing fact. Empty string if no obvious hook.

Return ONLY a JSON object with keys briefing, prep_actions, opener. No markdown fences.`;

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
      briefing:     String(parsed.briefing     ?? ""),
      prep_actions: String(parsed.prep_actions ?? ""),
      opener:       String(parsed.opener       ?? ""),
    };
  } catch (e) {
    throw new Error(`Synthesis returned non-JSON: ${cleaned.slice(0, 400)} :: ${e}`);
  }
}
