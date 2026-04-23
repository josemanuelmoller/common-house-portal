/**
 * POST /api/plan/objectives/[id]/generate-v1
 *
 * Generate the v1 artifact for a strategic objective that doesn't have one yet.
 *
 * Flow (streamed over SSE):
 *   start → generating (live char count) → parsing → saving:folder → saving:artifact
 *   → saving:version → saving:drive → saving:questions → done
 *
 * Writes created:
 *   - Drive folder path:  CH OS / Plan / {quarter} / {slug}/
 *   - objective_artifacts row
 *   - artifact_versions  row (version_number = 1)
 *   - artifact_questions rows (foundational questions surfaced by the agent)
 *   - objective_artifacts.current_version_id pointer
 *
 * Gates:
 *   - Objective must exist, be status=active
 *   - Objective_type must be one of the supported types in TYPE_TEMPLATES
 *   - Objective must not already have an artifact
 *
 * Auth: adminGuardApi()
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { currentUser } from "@clerk/nextjs/server";
import { supabaseAdmin } from "@/lib/supabase";
import { adminGuardApi } from "@/lib/require-admin";
import {
  buildV1SystemPrompt,
  DEFAULT_ARTIFACT_TYPE,
  TYPE_TEMPLATES,
} from "@/lib/plan-master-prompts";
import {
  ensurePlanFolderPath,
  uploadTextToDriveFolder,
} from "@/lib/drive";
import { objectiveSlug, quarterSlug } from "@/lib/plan";
import { createPlanBlock } from "@/lib/plan-calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = "claude-sonnet-4-6";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, ctx: RouteCtx) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;

  const user = await currentUser();
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const client = supabaseAdmin();

  // 1. Fetch objective + verify eligibility (non-stream errors)
  const { data: objective, error: oErr } = await client
    .from("strategic_objectives")
    .select(
      "id, title, description, tier, area, objective_type, year, quarter, status, notes"
    )
    .eq("id", id)
    .single();
  if (oErr || !objective) {
    return NextResponse.json({ error: oErr?.message ?? "objective not found" }, { status: 404 });
  }
  if (objective.status !== "active") {
    return NextResponse.json(
      { error: `objective status is '${objective.status}' — only 'active' can generate v1` },
      { status: 400 }
    );
  }
  if (!TYPE_TEMPLATES[objective.objective_type]) {
    return NextResponse.json(
      {
        error: `objective_type '${objective.objective_type}' has no template — supported: ${Object.keys(TYPE_TEMPLATES).join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (!objective.description?.trim()) {
    return NextResponse.json(
      {
        error:
          "objective description is empty — add a 1-2 line description to the objective before generating v1",
      },
      { status: 400 }
    );
  }

  // Check no existing artifact
  const { data: existingArtifact, error: eaErr } = await client
    .from("objective_artifacts")
    .select("id")
    .eq("objective_id", id)
    .maybeSingle();
  if (eaErr) return NextResponse.json({ error: eaErr.message }, { status: 500 });
  if (existingArtifact) {
    return NextResponse.json(
      {
        error:
          "objective already has an artifact — use /regenerate to create v2+, or archive the existing one first",
      },
      { status: 400 }
    );
  }

  // 2. Compose user message for the agent
  const qSlug = quarterSlug(objective.year, objective.quarter);
  const oSlug = objectiveSlug(objective.title);
  const artifactTitle = `${objective.title} — v1`;
  const userMessage = `# Objective

Title: ${objective.title}
Tier: ${objective.tier}  ·  Area: ${objective.area}  ·  Type: ${objective.objective_type}  ·  Period: ${qSlug}
Description: ${objective.description}
Notes: ${objective.notes ?? "(none)"}

# Task

Produce v1 of the artifact for this objective as strict JSON per the system format. Write 6-10 foundational open questions that the user must answer before v2 can be produced.`;

  // 3. Stream
  const systemPrompt = buildV1SystemPrompt(objective.objective_type);
  const anthropic = new Anthropic({ apiKey: anthropicKey });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send("start", { model: MODEL, quarter_slug: qSlug, objective_slug: oSlug });

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
        let deltaCount = 0;
        let lastPing = Date.now();

        for await (const event of anthropicStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullText += event.delta.text;
            deltaCount += 1;
            if (deltaCount % 10 === 0 || Date.now() - lastPing > 250) {
              send("token", { chars: fullText.length });
              lastPing = Date.now();
            }
          }
        }

        const finalMessage = await anthropicStream.finalMessage();
        const tokensUsed =
          (finalMessage.usage?.input_tokens ?? 0) +
          (finalMessage.usage?.output_tokens ?? 0);

        send("parsing", { total_chars: fullText.length, tokens: tokensUsed });

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

        // 4. Ensure Drive folder tree
        send("saving", { stage: "folder" });
        let driveFolderId: string | null = null;
        try {
          driveFolderId = await ensurePlanFolderPath(qSlug, oSlug);
        } catch (err) {
          console.error(
            "Drive folder creation failed (non-fatal):",
            err instanceof Error ? err.message : String(err)
          );
        }

        // 5. Insert objective_artifacts row
        send("saving", { stage: "artifact" });
        const artifactType = DEFAULT_ARTIFACT_TYPE[objective.objective_type] ?? "draft_doc";
        const { data: newArtifact, error: naErr } = await client
          .from("objective_artifacts")
          .insert({
            objective_id: objective.id,
            artifact_type: artifactType,
            title: artifactTitle,
            drive_folder_id: driveFolderId,
            status: "draft",
            generated_by: "plan-master-agent",
            evidence_basis: [`strategic_objective:${objective.id.slice(0, 8)}`],
            notes: `v1 generated by plan-master-agent on ${new Date().toISOString().slice(0, 10)}.`,
          })
          .select("*")
          .single();
        if (naErr || !newArtifact) {
          throw new Error(naErr?.message ?? "failed to insert objective_artifacts row");
        }

        // 6. Insert artifact_versions row (v1)
        send("saving", { stage: "version" });
        const { data: newVersion, error: nvErr } = await client
          .from("artifact_versions")
          .insert({
            artifact_id: newArtifact.id,
            version_number: 1,
            content: generated.content,
            summary_of_changes:
              generated.summary_of_changes ?? "Initial draft from objective description.",
            generated_by: "plan-master-agent",
            answers_used: [],
            model: MODEL,
            tokens_used: tokensUsed,
          })
          .select("*")
          .single();
        if (nvErr || !newVersion) {
          throw new Error(nvErr?.message ?? "failed to insert artifact_versions row");
        }

        // 7. Drive upload
        send("saving", { stage: "drive" });
        let driveUploaded = false;
        let driveUrl: string | null = null;
        if (driveFolderId) {
          try {
            const upload = await uploadTextToDriveFolder(
              driveFolderId,
              `${objective.title} — v1`,
              generated.content
            );
            if (upload) {
              await client
                .from("artifact_versions")
                .update({
                  drive_url: upload.webViewLink,
                  drive_file_id: upload.fileId,
                })
                .eq("id", newVersion.id);
              driveUploaded = true;
              driveUrl = upload.webViewLink;
            }
          } catch (err) {
            console.error(
              "Drive upload failed (non-fatal):",
              err instanceof Error ? err.message : String(err)
            );
          }
        }

        // 8. Insert initial questions
        send("saving", { stage: "questions" });
        if (generated.new_questions && generated.new_questions.length > 0) {
          const toInsert = generated.new_questions
            .filter(
              (q) =>
                typeof q.question === "string" && q.question.trim().length > 0
            )
            .map((q) => ({
              artifact_id: newArtifact.id,
              version_introduced: 1,
              question: q.question.trim(),
              rationale: q.rationale ?? null,
              status: "open" as const,
            }));
          if (toInsert.length > 0) {
            const { error: qInsErr } = await client
              .from("artifact_questions")
              .insert(toInsert);
            if (qInsErr) {
              console.error("initial questions insert failed:", qInsErr.message);
            }
          }
        }

        // 9. Backfill current_version_id
        await client
          .from("objective_artifacts")
          .update({
            current_version_id: newVersion.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", newArtifact.id);

        // 10. Propose a 90-min calendar block in the next 7 days (non-fatal)
        send("saving", { stage: "calendar" });
        let calendarEventId: string | null = null;
        let calendarEventLink: string | null = null;
        try {
          const block = await createPlanBlock({
            objectiveTitle: objective.title,
            artifactTitle: artifactTitle,
            driveUrl,
            openQuestions: (generated.new_questions ?? [])
              .map((q) => q.question?.trim())
              .filter((q): q is string => Boolean(q && q.length > 0)),
            userEmail,
          });
          if (block) {
            calendarEventId = block.eventId;
            calendarEventLink = block.eventLink;
            await client
              .from("objective_artifacts")
              .update({ calendar_event_id: block.eventId })
              .eq("id", newArtifact.id);
          }
        } catch (err) {
          console.error(
            "Calendar block creation failed (non-fatal):",
            err instanceof Error ? err.message : String(err)
          );
        }

        send("done", {
          artifact_id: newArtifact.id,
          version_id: newVersion.id,
          drive_uploaded: driveUploaded,
          drive_url: driveUrl,
          questions_count: generated.new_questions?.length ?? 0,
          tokens_used: tokensUsed,
          calendar_event_id: calendarEventId,
          calendar_event_link: calendarEventLink,
        });
        controller.close();
      } catch (err) {
        send("error", {
          error: "v1 generation failed",
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
