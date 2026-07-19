/**
 * POST /api/run-skill/delegate-to-desk
 *
 * Generates a structured delegation brief and saves it to Agent Drafts [OS v2].
 *
 * Assignee lookup: Supabase canonical (Notion fallback removed 2026-05-15,
 * post Phase 2 backfill).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_DRAFTS_DB = "9844ece875ea4c618f616e8cc97d5a90";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const task: string = body.task ?? "";
  const assigneeName: string = body.assignee ?? "";
  const dueDate: string = body.due_date ?? "";

  if (!task.trim()) {
    return NextResponse.json(
      { error: "task is required" },
      { status: 400, headers: corsHeaders() }
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  // 1. Optionally resolve assignee from CH People
  let resolvedAssignee = assigneeName || "";
  let assigneeRole = "";
  let assigneeEmail = "";
  let assigneePageId = "";

  if (assigneeName) {
    // Supabase canonical person search (Notion fallback removed post-cutoff)
    try {
      const sb = getSupabaseServerClient();
      const { data: sbPerson } = await sb
        .from("people")
        .select("notion_id, full_name, job_title, email")
        .ilike("full_name", `%${assigneeName}%`)
        .limit(1)
        .single();

      if (sbPerson) {
        resolvedAssignee = sbPerson.full_name  ?? assigneeName;
        assigneeRole     = sbPerson.job_title  ?? "";
        assigneeEmail    = sbPerson.email      ?? "";
        assigneePageId   = sbPerson.notion_id  ?? "";
      }
    } catch {
      // Supabase lookup failed or no match — proceed with name as-is
    }
  }

  // 2. Determine language (simple heuristic: if Spanish name/org context → Spanish)
  const spanishSignals = /[áéíóúüñ¿¡]/i.test(task) || /[áéíóúüñ¿¡]/i.test(resolvedAssignee);
  const lang = spanishSignals ? "es" : "en";

  // 3. Generate delegation brief with Anthropic
  const assigneeSection = resolvedAssignee
    ? `Assignee: ${resolvedAssignee}${assigneeRole ? ` (${assigneeRole})` : ""}${assigneeEmail ? ` <${assigneeEmail}>` : ""}`
    : "Assignee: TBD";

  const dueDateSection = dueDate
    ? `Due date: ${dueDate}`
    : "Due date: not specified";

  const prompt = lang === "es"
    ? `Eres el asistente de delegación de José Manuel Moller (JMM). Redacta un delegation brief estructurado para la siguiente tarea.

Tarea: ${task}
${assigneeSection}
${dueDateSection}

Reglas del brief:
- Asunto claro y escaneable (Subject: ...)
- Primera oración: qué necesito que hagas y para cuándo
- 1–2 oraciones: por qué importa / qué desbloquea
- 3 bullets de "definition of done" (resultados concretos y medibles)
- Última oración: cómo escalar si hay blockers
- Firma: José Manuel
- Máximo 10 oraciones totales
- Directo, sin disculpas — esto es una delegación, no un favor
- Si assignee es "TBD", deja el saludo como "[Nombre]"

Output SOLO el mensaje completo (Subject + cuerpo). Nada más.`
    : `You are José Manuel Moller's delegation assistant. Write a structured delegation brief for the following task.

Task: ${task}
${assigneeSection}
${dueDateSection}

Brief rules:
- Clear, scannable subject line (Subject: ...)
- First sentence: what I need you to do and by when
- 1–2 sentences: why this matters / what it unlocks
- 3-bullet definition of done (concrete, measurable outputs)
- Final sentence: how to flag blockers
- Sign off: José Manuel
- Max 10 sentences total
- Direct, no excessive softening — this is a delegation, not a favour ask
- If assignee is "TBD", use "[Name]" as greeting

Output ONLY the full message (Subject + body). Nothing else.`;

  let draftText = "";
  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    });
    draftText = message.content[0].type === "text" ? message.content[0].text : "";
  } catch (e) {
    return NextResponse.json(
      { error: "Anthropic API error" },
      { status: 500, headers: corsHeaders() }
    );
  }

  // 4. Save to Agent Drafts [OS v2]
  const taskShort = task.slice(0, 55);
  const draftTitle = resolvedAssignee
    ? `Delegation: ${taskShort} → ${resolvedAssignee} — ${today}`
    : `Delegation: ${taskShort} — ${today}`;

  // notion-cutoff-2026-06-02: legacy Notion property bag removed; field-level
  // mapping is documented inline below at the canonical insert site.
  // Old Notion shape (for reference):
  //   "Draft Title": { title: [...] }, "Type": { select: { name: "Delegation Brief" } },
  //   "Status": { select: { name: "Pending Review" } }, "Content": { rich_text: [...] },
  //   "Source Reference": { rich_text: [...] }, optionally "Related Entity": { relation: [...] }.

  // notion-cutoff-2026-06-02: replaced by canonical write to agent_drafts (Supabase).
  // Notion → Supabase (agent_drafts) column mapping:
  //   "Draft Title"      → title
  //   "Type"             → draft_type
  //   "Status"           → status
  //   "Content"          → body_md
  //   "Related Entity"   → target_person_notion_id
  //   "Source Reference" → payload.source_reference
  //
  // let draftPage;
  // try {
  //   draftPage = await notion.pages.create({ parent: { database_id: AGENT_DRAFTS_DB }, properties });
  // } catch (e) {
  //   return NextResponse.json({ error: "Notion write error" }, { status: 500, headers: corsHeaders() });
  // }
  void AGENT_DRAFTS_DB; // legacy id retained for traceability; no longer used as a write target.

  const sb = getSupabaseServerClient();
  const { data: insertedRow, error: insertErr } = await sb
    .from("agent_drafts")
    .insert({
      title:      draftTitle,
      draft_type: "Delegation Brief",
      status:     "Pending Review",
      body_md:    draftText.slice(0, 2000),
      target_person_notion_id: assigneePageId || null,
      source_agent: "delegate-to-desk",
      payload: {
        source_reference:
          [
            resolvedAssignee && `Assignee: ${resolvedAssignee}`,
            dueDate && `Due: ${dueDate}`,
          ].filter(Boolean).join(" · ") || task.slice(0, 100),
        assignee_name:  resolvedAssignee || null,
        assignee_role:  assigneeRole     || null,
        assignee_email: assigneeEmail    || null,
        due_date:       dueDate          || null,
        task,
      },
    })
    .select("id")
    .single();

  if (insertErr || !insertedRow) {
    return NextResponse.json(
      { error: "agent_drafts insert error", detail: insertErr?.message ?? "no row returned" },
      { status: 500, headers: corsHeaders() }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      draftId: insertedRow.id,
      notionUrl: "",
      assigneeResolved: !!assigneePageId,
      assigneeName: resolvedAssignee || null,
    },
    { headers: corsHeaders() }
  );
}
