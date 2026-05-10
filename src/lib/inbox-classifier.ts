/**
 * inbox-classifier.ts — Fase 4
 *
 * Reads `inbox_items` rows in status='new' and classifies them using Claude
 * (with vision when there is a photo). Updates the row with agent_* fields,
 * status, and routing destination.
 *
 * Routing rules:
 *   - confidence >= 70           → status='classified'
 *   - confidence < 70            → status='needs_review'
 *   - type='reminder' AND due_date → routed to chief_of_staff_tasks
 *   - everything else stays in inbox awaiting user action
 *
 * Cost estimate: ~$0.005 per item (Claude Sonnet 4.6, with vision when photo present).
 *
 * Triggered by:
 *   - cron `/api/cron/run-inbox-classify` (every 15 min, catch-up)
 *   - fire-and-forget after `/api/inbox/quick-capture` returns
 */

import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "./supabase-server";
import {
  signInboxMediaUrl,
  type InboxItem,
  type InboxItemUserType,
} from "./inbox";
import { routeClassifiedItem } from "./inbox-router";
import { notifyP1 } from "./push-notify";

const MODEL = "claude-sonnet-4-6";

export type ClassificationResult = {
  type: InboxItemUserType;
  priority: "P1" | "P2" | "P3";
  due_date: string | null;
  linked_org_id: string | null;
  linked_person_id: string | null;
  linked_project_id: string | null;
  confidence: number;
  reasoning: string;
  ocr_text: string | null;
};

/**
 * Classify a single inbox item end-to-end:
 *   1. Mark status='classifying' (claim it)
 *   2. Build Claude prompt with text + photo (signed URL) + entity context
 *   3. Call Claude, parse JSON
 *   4. Update row with agent_* fields
 *   5. Route if applicable (e.g. reminders → chief_of_staff_tasks)
 */
export async function classifyInboxItem(
  item: InboxItem
): Promise<{ ok: boolean; error?: string; result?: ClassificationResult }> {
  const sb = getSupabaseServerClient();

  // Claim the row to avoid double-processing on concurrent runs
  const { error: claimErr } = await sb
    .from("inbox_items")
    .update({ status: "classifying" })
    .eq("id", item.id)
    .eq("status", "new");
  if (claimErr) return { ok: false, error: `claim: ${claimErr.message}` };

  // Pull entity context (orgs, people, projects)
  const [orgs, people, projects] = await Promise.all([
    sb.from("organizations").select("id, name").not("name", "is", null).limit(200),
    sb.from("people").select("id, full_name").not("full_name", "is", null).limit(300),
    sb.from("projects").select("id, name").not("name", "is", null).limit(100),
  ]);

  // Build user content
  const today = new Date().toISOString().slice(0, 10);
  const userContent: Anthropic.Messages.ContentBlockParam[] = [];

  if (item.raw_text) {
    userContent.push({ type: "text", text: `Note text:\n${item.raw_text}` });
  }
  if (item.transcript) {
    userContent.push({
      type: "text",
      text: `Voice transcript:\n${item.transcript}`,
    });
  }
  if (item.user_notes_to_agent) {
    userContent.push({
      type: "text",
      text: `User comment to you (the agent):\n${item.user_notes_to_agent}`,
    });
  }
  if (item.user_type_override) {
    userContent.push({
      type: "text",
      text: `User pinned a manual type override: "${item.user_type_override}". Respect it unless evidence is overwhelming against it.`,
    });
  }
  if (item.user_due_date) {
    userContent.push({
      type: "text",
      text: `User-provided due date: ${item.user_due_date}`,
    });
  }

  if (item.photo_path) {
    const signed = await signInboxMediaUrl(item.photo_path);
    if (signed.url) {
      userContent.push({
        type: "image",
        source: { type: "url", url: signed.url },
      });
      userContent.push({
        type: "text",
        text: "If the photo contains legible text (whiteboard, document, screenshot), extract it as `ocr_text` in the output.",
      });
    }
  }

  // Entity context (compact)
  const orgList = (orgs.data || [])
    .map((o) => `${o.id}\t${o.name}`)
    .join("\n");
  const peopleList = (people.data || [])
    .map((p) => `${p.id}\t${p.full_name}`)
    .join("\n");
  const projectList = (projects.data || [])
    .map((p) => `${p.id}\t${p.name}`)
    .join("\n");

  userContent.push({
    type: "text",
    text: [
      `Existing entities (link only if confident match):`,
      ``,
      `ORGANIZATIONS:`,
      orgList || "(none)",
      ``,
      `PEOPLE:`,
      peopleList || "(none)",
      ``,
      `PROJECTS:`,
      projectList || "(none)",
      ``,
      `Today is ${today}. Convert relative dates ("mañana", "el viernes", "next week") to absolute YYYY-MM-DD.`,
      ``,
      `Respond with a single JSON object only, no prose. Schema:`,
      `{`,
      `  "type": "reminder" | "read-later" | "client-message" | "reference" | "idea" | "other",`,
      `  "priority": "P1" | "P2" | "P3",`,
      `  "due_date": "YYYY-MM-DD" | null,`,
      `  "linked_org_id": "<uuid from list>" | null,`,
      `  "linked_person_id": "<uuid from list>" | null,`,
      `  "linked_project_id": "<uuid from list>" | null,`,
      `  "confidence": 0-100,`,
      `  "reasoning": "one short sentence",`,
      `  "ocr_text": "<extracted text from photo>" | null`,
      `}`,
    ].join("\n"),
  });

  // Call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await markFailed(item.id, "ANTHROPIC_API_KEY not set");
    return { ok: false, error: "ANTHROPIC_API_KEY not set" };
  }

  const client = new Anthropic({ apiKey });
  let result: ClassificationResult;
  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You are the Common House inbox classifier. You read quick captures (text, photo, voice transcript, user comments) and emit a strict JSON classification. Be conservative with entity links — only link when a name match is unambiguous.",
      messages: [{ role: "user", content: userContent }],
    });

    const textBlock = resp.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from Claude");
    }
    result = parseClaudeJson(textBlock.text);
  } catch (err) {
    await markFailed(item.id, String(err));
    return { ok: false, error: String(err) };
  }

  // Decide status based on confidence
  const status =
    result.confidence >= 70 ? "classified" : "needs_review";

  // Persist agent_* fields
  const { error: updateErr } = await sb
    .from("inbox_items")
    .update({
      agent_type: result.type,
      agent_priority: result.priority,
      agent_due_date: result.due_date,
      agent_linked_org_id: result.linked_org_id,
      agent_linked_person_id: result.linked_person_id,
      agent_linked_project_id: result.linked_project_id,
      agent_confidence: result.confidence,
      agent_reasoning: result.reasoning,
      agent_classified_at: new Date().toISOString(),
      ocr_text: result.ocr_text,
      status,
    })
    .eq("id", item.id);

  if (updateErr) {
    return { ok: false, error: `update: ${updateErr.message}` };
  }

  // Route if classified with enough confidence
  if (status === "classified") {
    try {
      await routeClassifiedItem({ ...item, ...mapResultToFields(result), status });
    } catch (err) {
      // Routing failure isn't fatal — item stays as 'classified'
      // and user can act on it manually.
      console.warn("[inbox-classifier] routing failed:", err);
    }
  }

  // P1 push (only for classified items the agent flagged P1)
  if (status === "classified" && result.priority === "P1") {
    try {
      const title = "P1 — capturado";
      const preview = (item.raw_text || item.transcript || "Item priorizado")
        .replace(/\s+/g, " ")
        .slice(0, 140);
      await notifyP1(
        {
          title,
          body: preview,
          url: "/admin/capture",
        },
        item.user_id || undefined
      );
    } catch (err) {
      console.warn("[inbox-classifier] P1 push failed:", err);
    }
  }

  return { ok: true, result };
}

function mapResultToFields(r: ClassificationResult) {
  return {
    agent_type: r.type,
    agent_priority: r.priority,
    agent_due_date: r.due_date,
    agent_linked_org_id: r.linked_org_id,
    agent_linked_person_id: r.linked_person_id,
    agent_linked_project_id: r.linked_project_id,
    agent_confidence: r.confidence,
    agent_reasoning: r.reasoning,
    ocr_text: r.ocr_text,
  };
}

async function markFailed(id: string, reason: string): Promise<void> {
  const sb = getSupabaseServerClient();
  await sb
    .from("inbox_items")
    .update({
      status: "needs_review",
      agent_reasoning: `Classifier failed: ${reason.slice(0, 280)}`,
    })
    .eq("id", id);
}

const VALID_TYPES = new Set([
  "reminder",
  "read-later",
  "client-message",
  "reference",
  "idea",
  "other",
]);
const VALID_PRIORITIES = new Set(["P1", "P2", "P3"]);

function parseClaudeJson(text: string): ClassificationResult {
  // Strip optional ```json fences
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/```$/, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : cleaned;
  const obj = JSON.parse(jsonStr) as Record<string, unknown>;

  const type = String(obj.type || "other").toLowerCase();
  const priority = String(obj.priority || "P3").toUpperCase();
  const confidence = Number(obj.confidence);

  return {
    type: (VALID_TYPES.has(type) ? type : "other") as InboxItemUserType,
    priority: (VALID_PRIORITIES.has(priority) ? priority : "P3") as
      | "P1"
      | "P2"
      | "P3",
    due_date: obj.due_date && typeof obj.due_date === "string" ? obj.due_date : null,
    linked_org_id:
      obj.linked_org_id && typeof obj.linked_org_id === "string"
        ? obj.linked_org_id
        : null,
    linked_person_id:
      obj.linked_person_id && typeof obj.linked_person_id === "string"
        ? obj.linked_person_id
        : null,
    linked_project_id:
      obj.linked_project_id && typeof obj.linked_project_id === "string"
        ? obj.linked_project_id
        : null,
    confidence: Number.isFinite(confidence)
      ? Math.max(0, Math.min(100, Math.round(confidence)))
      : 50,
    reasoning:
      typeof obj.reasoning === "string" ? obj.reasoning.slice(0, 500) : "",
    ocr_text:
      typeof obj.ocr_text === "string" && obj.ocr_text.trim().length > 0
        ? obj.ocr_text.trim()
        : null,
  };
}
