/**
 * POST /api/run-skill/delegate-to-desk
 *
 * Generates a structured delegation brief and saves it to Agent Drafts [OS v2].
 *
 * Assignee lookup: Supabase-first since Wave 5 (2026-04-17).
 * Falls back to Notion databases.query if assignee not yet synced.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminGuardApi } from "@/lib/require-admin";
import { Client } from "@notionhq/client";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_DRAFTS_DB = "9844ece875ea4c618f616e8cc97d5a90";
const PEOPLE_DB = "1bc0f96f33ca4a9e9ff26844377e81de";

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
    // Supabase-first person search
    let sbHit = false;
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
        sbHit = true;
      }
    } catch {
      // Supabase lookup failed or no match — fall through to Notion
    }

    if (!sbHit) {
      // Fallback: person not yet synced to Supabase
      try {
        const peopleRes = await notion.databases.query({
          database_id: PEOPLE_DB,
          filter: { property: "Full Name", rich_text: { contains: assigneeName } },
          page_size: 1,
        });
        if (peopleRes.results.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const person = peopleRes.results[0] as any;
          const props = person.properties;
          resolvedAssignee =
            props["Full Name"]?.rich_text?.[0]?.plain_text ??
            props["Name"]?.title?.[0]?.plain_text ??
            assigneeName;
          assigneeRole   = props["Job Title / Role"]?.rich_text?.[0]?.plain_text ?? "";
          assigneeEmail  = props["Email"]?.email ?? "";
          assigneePageId = person.id;
        }
      } catch {
        // People lookup failed — proceed with name as-is
      }
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
      { error: "Anthropic API error", detail: String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }

  // 4. Save to Agent Drafts [OS v2]
  const taskShort = task.slice(0, 55);
  const draftTitle = resolvedAssignee
    ? `Delegation: ${taskShort} → ${resolvedAssignee} — ${today}`
    : `Delegation: ${taskShort} — ${today}`;

  // Build properties — only include Related Entity if we resolved a page ID
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: Record<string, any> = {
    "Draft Title": { title: [{ text: { content: draftTitle } }] },
    "Type":        { select: { name: "Delegation Brief" } },
    "Status":      { select: { name: "Pending Review" } },
    "Content":     { rich_text: [{ text: { content: draftText.slice(0, 2000) } }] },
    "Source Reference": {
      rich_text: [{
        text: {
          content: [
            resolvedAssignee && `Assignee: ${resolvedAssignee}`,
            dueDate && `Due: ${dueDate}`,
          ].filter(Boolean).join(" · ") || task.slice(0, 100),
        },
      }],
    },
  };

  if (assigneePageId) {
    properties["Related Entity"] = { relation: [{ id: assigneePageId }] };
  }

  let draftPage;
  try {
    draftPage = await notion.pages.create({
      parent: { database_id: AGENT_DRAFTS_DB },
      properties,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "Notion write error", detail: String(e) },
      { status: 500, headers: corsHeaders() }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      draftId: draftPage.id,
      notionUrl: (draftPage as { url?: string }).url ?? "",
      assigneeResolved: !!assigneePageId,
      assigneeName: resolvedAssignee || null,
    },
    { headers: corsHeaders() }
  );
}
