/**
 * POST /api/plan/artifacts/[id]/regenerate
 *
 * Regenerates an artifact using Claude. Takes:
 *   - current version content
 *   - answered questions (with answers) since last version
 *   - still-open questions (for awareness)
 *   - objective metadata
 *
 * Produces v{N+1} content + new questions. Persists new version row + new
 * question rows. Attempts Drive upload via OAuth helper — if DRIVE_OAUTH_*
 * env vars are configured, v{N+1} lands in the same folder as v1 and the
 * drive_url is backfilled. Otherwise content stays in DB and UI renders an
 * inline preview.
 *
 * Body:  { force?: boolean, additional_notes?: string }
 * Guard: requires ≥3 answered questions since last version unless force=true.
 *
 * Auth: adminGuardApi().
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { adminGuardApi } from "@/lib/require-admin";
import { uploadTextToDriveFolder } from "@/lib/drive";

export const dynamic = "force-dynamic";
// 300s is the Vercel Pro maxDuration ceiling. Sonnet can take 60-120s to
// generate a 7-10k char v{N+1} with full context, and Drive upload adds
// a few seconds on top — 60s was consistently hitting the edge.
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";
const MIN_ANSWERS_PER_REGEN = 3;

const BASE_SYSTEM_PROMPT = `You are the Plan Master Agent — the PM of Common House's strategic plan. Your job is to refine artifact drafts iteratively based on the user's answers to open questions.

Rules of the refinement:
- Preserve everything in the prior version that is still correct. Update sections only where the new answers require change.
- Integrate each answer into the appropriate section of the new version. Never ignore an answer.
- Never invent commercial content — pricing, client commitments, named partnerships, revenue numbers — that is not in the prior version or the answers.
- If the answers unlock deeper decisions, surface them as new open questions. Good new questions are specific and actionable (not philosophical).
- If all major open questions are now resolved and the draft is converging on an approvable state, emit fewer new questions — or none.
- Keep the structure recognizable: same major section headings as the prior version unless an answer explicitly reshaped scope.
- Write in the same language as the prior version (Spanish unless it's clearly English).

Output format — strict JSON only, no prose outside the JSON:
{
  "content": "full text of the new version, including all sections",
  "summary_of_changes": "one paragraph (2-4 sentences) explaining what changed from the prior version and why",
  "new_questions": [
    {
      "question": "specific, actionable question",
      "rationale": "one sentence on why this matters now"
    }
  ]
}

Return valid JSON. No markdown code fences. No commentary before or after.`;

/**
 * Per-type template appendix. Each objective_type gets its own guardrails and
 * artifact shape expectations, added on top of the base system prompt.
 */
const TYPE_TEMPLATES: Record<string, string> = {
  asset: `
# This artifact type: ASSET
An asset is a reusable producible that Common House will operate (a spec, playbook, methodology, offer template). Iteration should converge on something **reusable across clients/contexts**, not bespoke.

Section conventions to preserve when present: Principles / Scope / Methodology / Scoring or Metrics / Deliverable / Pricing or Effort / Validation criteria / Risks.
Good new questions focus on: edge cases, versioning triggers (what would force a v2), ownership after launch, cost to operate.`,

  milestone: `
# This artifact type: MILESTONE
A milestone is a binary outcome to be reached by a date (e.g. "Advisory board live", "MoU signed"). Iteration should converge on a **plan of named steps with owners and a done criterion**.

Section conventions to preserve when present: Done criterion / Pipeline or candidates / Pitch or ask / Process steps / Materials needed / Risks.
Good new questions focus on: bottleneck step, owner of each step, earliest realistic completion date, the one thing blocking right now.`,

  revenue: `
# This artifact type: REVENUE
A revenue objective is a $ target by a deadline ($X by Q2, etc.). The artifact is NOT the money itself — it is the **revenue execution plan**: target accounts, outreach status per account, pitch variants, pipeline health, and a cadence.

Never invent account names, deal sizes, or commitments. Only structure what the prior version + answers contain.
Section conventions to preserve when present: Revenue target and gap / Target accounts (with current stage) / Outreach cadence / Pitch variants per segment / Pipeline health metrics / Risks to the number.
Good new questions focus on: account prioritization, deal-size assumptions, owner of each account, timing of asks, warm-intro paths, what commercial offer each account needs.`,

  client_goal: `
# This artifact type: CLIENT GOAL
A client goal is a specific outcome with a named client ("Close Waitrose P2"). Iteration should converge on a **client-specific plan** — stakeholders, current status, proposed next move, and commercial structure.

Never fabricate client statements or commitments. Only structure what is explicitly in the prior version + answers.
Section conventions to preserve when present: Current relationship status / Stakeholder map / Value proposition for this client / Proposed next move / Commercial structure / Risks.
Good new questions focus on: key stakeholder's real motivation, what would close the deal this quarter, pricing flexibility, commercial format (one-off, retainer, phased).`,

  event: `
# This artifact type: EVENT
An event objective is a named convening (workshop, summit, launch). Iteration should converge on a **run-of-show and invitee plan**.

Never invent sponsors, venues, or speakers. Only structure what is in the prior version + answers.
Section conventions to preserve when present: Event purpose / Invitee list or segments / Agenda/run-of-show / Logistics / Content or speakers / Success criteria / Risks.
Good new questions focus on: one line pitch per invitee segment, key ask of attendees, failure modes, decision gates before committing.`,

  hiring: `
# This artifact type: HIRING
A hiring objective is a role to fill. Iteration should converge on a **job description + sourcing plan + interview rubric**.

Never fabricate candidate profiles or compensation ranges. Structure what is in the prior version + answers.
Section conventions to preserve when present: Role summary / Must-haves vs nice-to-haves / Sourcing channels / Pitch-to-candidate / Interview rubric / Compensation range / Risks.
Good new questions focus on: the one responsibility that would disqualify a candidate, realistic comp range, first 90-day success, warm-intro paths in José's network.`,
};

function buildSystemPrompt(objectiveType: string): string {
  const template = TYPE_TEMPLATES[objectiveType] ?? "";
  return template ? `${BASE_SYSTEM_PROMPT}\n${template}` : BASE_SYSTEM_PROMPT;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;

  let body: { force?: boolean; additional_notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const client = supabaseAdmin();

  // 1. Fetch artifact + objective + current version
  const { data: artifact, error: aErr } = await client
    .from("objective_artifacts")
    .select(
      `
      *,
      strategic_objectives!inner (title, description, tier, area, objective_type, year, quarter, notes)
    `
    )
    .eq("id", id)
    .single();
  if (aErr || !artifact) {
    return NextResponse.json({ error: aErr?.message ?? "artifact not found" }, { status: 404 });
  }

  const { data: versions, error: vErr } = await client
    .from("artifact_versions")
    .select("*")
    .eq("artifact_id", id)
    .order("version_number", { ascending: false });
  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 });
  const latest = versions?.[0];
  if (!latest) {
    return NextResponse.json(
      { error: "no prior version to regenerate from" },
      { status: 400 }
    );
  }
  const nextVersionNumber = latest.version_number + 1;

  // 2. Fetch questions
  const { data: questions, error: qErr } = await client
    .from("artifact_questions")
    .select("*")
    .eq("artifact_id", id)
    .order("version_introduced", { ascending: true });
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 });

  const answered = (questions ?? []).filter((q) => q.status === "answered");
  const openQuestions = (questions ?? []).filter((q) => q.status === "open");
  const answeredSinceLastRegen = answered.filter(
    (q) => q.version_introduced <= latest.version_number
  );

  if (
    answeredSinceLastRegen.length < MIN_ANSWERS_PER_REGEN &&
    !body.force
  ) {
    return NextResponse.json(
      {
        error: `Need at least ${MIN_ANSWERS_PER_REGEN} answered questions to regenerate (have ${answeredSinceLastRegen.length}). Pass force=true to override.`,
        answered_count: answeredSinceLastRegen.length,
      },
      { status: 400 }
    );
  }

  // 3. Compose user message for Claude
  const obj = artifact.strategic_objectives;
  const quarter = obj.quarter ? `${obj.year}-Q${obj.quarter}` : `${obj.year}-annual`;
  const priorContent = latest.content ?? "(previous version content not available in DB — this is v1, uploaded directly to Drive)";

  const answeredSection = answeredSinceLastRegen
    .map(
      (q, i) =>
        `Q${i + 1}. ${q.question}\n   Rationale: ${q.rationale ?? "(none)"}\n   Answer: ${q.answer}`
    )
    .join("\n\n");

  const openSection = openQuestions.length
    ? openQuestions
        .map((q, i) => `- ${q.question}${q.rationale ? ` (${q.rationale})` : ""}`)
        .join("\n")
    : "(none)";

  const userMessage = `# Objective

Title: ${obj.title}
Tier: ${obj.tier}  ·  Area: ${obj.area}  ·  Type: ${obj.objective_type}  ·  Period: ${quarter}
Description: ${obj.description ?? "(none)"}
Notes: ${obj.notes ?? "(none)"}

# Artifact

Title: ${artifact.title}
Type: ${artifact.artifact_type}
Prior version: v${latest.version_number}
Next version: v${nextVersionNumber}

# Prior version content (v${latest.version_number})

${priorContent}

# Answered questions since v${latest.version_number}

${answeredSection || "(none)"}

# Still-open questions (for context, not necessarily addressed yet)

${openSection}
${body.additional_notes ? `\n# Additional notes from user\n\n${body.additional_notes}\n` : ""}

Produce v${nextVersionNumber} as strict JSON per the system format.`;

  // 4. Stream Claude response + do DB writes at end.
  //    Client receives SSE events: { event: "start" | "token" | "done" | "error" }
  //    Heartbeats keep Vercel edge / proxies from closing the stream during
  //    the 40-90s generation window. Client shows token count live for UX.
  const systemPrompt = buildSystemPrompt(obj.objective_type);
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const answersUsed = answeredSinceLastRegen.map((q) => ({
    question_id: q.id,
    question: q.question,
    answer: q.answer,
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send("start", {
          version_number: nextVersionNumber,
          model: MODEL,
        });

        // Stream tokens from Anthropic
        const anthropicStream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 8000,
          system: [
            {
              type: "text",
              text: systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: userMessage }],
        });

        let fullText = "";
        let tokenCount = 0;
        let lastPing = Date.now();

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            tokenCount += 1;
            // Throttle token events to every 10 deltas or 250ms, whichever
            // comes first — keeps the SSE stream alive without flooding.
            if (tokenCount % 10 === 0 || Date.now() - lastPing > 250) {
              send("token", {
                count: tokenCount,
                chars: fullText.length,
              });
              lastPing = Date.now();
            }
          }
        }

        const finalMessage = await anthropicStream.finalMessage();
        const tokensUsed =
          (finalMessage.usage?.input_tokens ?? 0) +
          (finalMessage.usage?.output_tokens ?? 0);

        send("parsing", { total_chars: fullText.length, tokens: tokensUsed });

        // Parse strict JSON
        const raw = fullText.trim();
        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}");
        if (jsonStart === -1 || jsonEnd === -1) {
          throw new Error("No JSON object in Claude response");
        }
        const generated = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
          content: string;
          summary_of_changes?: string;
          new_questions?: Array<{ question: string; rationale?: string }>;
        };
        if (
          typeof generated.content !== "string" ||
          !Array.isArray(generated.new_questions)
        ) {
          throw new Error("Response missing required fields");
        }

        send("saving", { stage: "version" });

        // Insert new version row
        const { data: newVersion, error: nvErr } = await client
          .from("artifact_versions")
          .insert({
            artifact_id: id,
            version_number: nextVersionNumber,
            content: generated.content,
            summary_of_changes: generated.summary_of_changes ?? null,
            generated_by: "plan-master-agent",
            answers_used: answersUsed,
            model: MODEL,
            tokens_used: tokensUsed,
          })
          .select("*")
          .single();
        if (nvErr || !newVersion) {
          throw new Error(nvErr?.message ?? "failed to insert new version");
        }

        // Drive upload
        send("saving", { stage: "drive" });
        let driveUploaded = false;
        let driveUrl: string | null = null;
        if (artifact.drive_folder_id) {
          try {
            const upload = await uploadTextToDriveFolder(
              artifact.drive_folder_id,
              `${artifact.title} — v${nextVersionNumber}`,
              generated.content
            );
            if (upload) {
              const { error: driveBackfillErr } = await client
                .from("artifact_versions")
                .update({
                  drive_url: upload.webViewLink,
                  drive_file_id: upload.fileId,
                })
                .eq("id", newVersion.id);
              if (!driveBackfillErr) {
                driveUploaded = true;
                driveUrl = upload.webViewLink;
              }
            }
          } catch (err) {
            console.error(
              "Drive upload failed (non-fatal):",
              err instanceof Error ? err.message : String(err)
            );
          }
        }

        // Insert new questions
        send("saving", { stage: "questions" });
        if (generated.new_questions && generated.new_questions.length > 0) {
          const toInsert = generated.new_questions
            .filter(
              (q) =>
                typeof q.question === "string" && q.question.trim().length > 0
            )
            .map((q) => ({
              artifact_id: id,
              version_introduced: nextVersionNumber,
              question: q.question.trim(),
              rationale: q.rationale ?? null,
              status: "open" as const,
            }));
          if (toInsert.length > 0) {
            const { error: qInsErr } = await client
              .from("artifact_questions")
              .insert(toInsert);
            if (qInsErr) {
              console.error("new_questions insert failed:", qInsErr.message);
            }
          }
        }

        // Update current_version_id pointer
        await client
          .from("objective_artifacts")
          .update({
            current_version_id: newVersion.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);

        send("done", {
          version_id: newVersion.id,
          version_number: nextVersionNumber,
          drive_uploaded: driveUploaded,
          drive_url: driveUrl,
          new_questions_count: generated.new_questions?.length ?? 0,
          tokens_used: tokensUsed,
        });
        controller.close();
      } catch (err) {
        send("error", {
          error: "Regeneration failed",
          detail: err instanceof Error ? err.message : String(err),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

