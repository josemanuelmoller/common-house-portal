import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";
import { resolveClientRoomProject } from "@/lib/client-room";
import { makeUsageAccumulator, computeAnthropicCost } from "@/lib/anthropic-cost";
import { runStateRefreshForProject } from "@/lib/state-refresh";

export const maxDuration = 120;

/**
 * POST /api/admin/projects/[id]/state/refresh
 * Admin-triggered incremental refresh for a single project. Generates pending
 * proposals from new validated evidence; applies nothing.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await adminGuardApi();
  if (guard) return guard;
  const { id } = await ctx.params;
  const project = await resolveClientRoomProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: { lookbackDays?: number } = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const lookbackDays = typeof body.lookbackDays === "number" && body.lookbackDays > 0
    ? Math.min(body.lookbackDays, 180)
    : undefined;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const usageAcc = makeUsageAccumulator();
  try {
    const result = await runStateRefreshForProject(project.id, { lookbackDays, anthropic, usageAcc });
    return NextResponse.json({ ok: true, ...result, costUsd: computeAnthropicCost(usageAcc, "claude-sonnet-4-6") });
  } catch (err) {
    return apiError(err, { route: "[/api/admin/projects/[id]/state/refresh]", status: 502 });
  }
}
