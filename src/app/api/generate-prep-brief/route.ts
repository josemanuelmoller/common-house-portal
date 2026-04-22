/**
 * POST /api/generate-prep-brief
 *
 * Project-centric prep brief. Different from src/lib/prep-brief/
 * (which is meeting-event-centric). This one synthesises the strategic state
 * of a client relationship into a single markdown page before you enter a
 * conversation.
 *
 * Signals combined:
 *   - Recent activity (last 30d: meetings, emails, evidence count)
 *   - Open questions (resolution_status = 'open')
 *   - Open decisions linked to the project
 *   - Open concerns grouped by function (from knowledge nodes with matching
 *     workstream tags)
 *   - Commitments — Process Step evidence that reads like a forward commitment
 *   - Workstream coverage: which functions already appeared vs. typical gaps
 *   - Relevant knowledge leaves to refresh before the meeting
 *
 * Persists to public.prep_briefs so UI can list + regenerate.
 *
 * Auth: x-agent-key OR Authorization: Bearer <CRON_SECRET>.
 *
 * Input body:
 *   {
 *     project_id: string,        // Notion project ID (required)
 *     contact_id?: string,       // Notion person ID — scopes to this person's evidence if provided
 *     meeting_datetime?: string, // Optional ISO; used for framing
 *     since_days?: number,       // Default 45
 *     dry_run?: boolean          // No write to prep_briefs
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getAllNodes } from "@/lib/knowledge-nodes";
import { withRoutineLog } from "@/lib/routine-log";
import { adminGuardApi } from "@/lib/require-admin";

export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

/** Accepts either an admin browser session OR a cron/agent secret header. */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const agentKey = req.headers.get("x-agent-key");
  const cronKey  = req.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (expected && (agentKey === expected || cronKey === `Bearer ${expected}`)) return true;
  // Fall back to admin session (admin-triggered from /admin/prep/[id])
  const denied = await adminGuardApi();
  return denied === null;
}

type ProjectRow = {
  notion_id: string;
  name: string | null;
  stage?: string | null;
};

async function _POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const projectId = body.project_id as string | undefined;
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }
  const contactId = body.contact_id as string | undefined;
  const meetingDatetime = body.meeting_datetime as string | undefined;
  const sinceDays = (body.since_days as number | undefined) ?? 45;
  const dryRun = Boolean(body.dry_run);

  const sb = getSupabaseServerClient();
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);

  // ─── Gather signals in parallel ──────────────────────────────────────────
  const [
    { data: projectRows },
    { data: sourcesRows },
    { data: evidenceRows },
    { data: decisionsRows },
    knowledgeNodes,
  ] = await Promise.all([
    sb.from("projects").select("notion_id, name").eq("notion_id", projectId).limit(1),
    sb.from("sources")
      .select("notion_id, title, source_type, workstream, source_date, processed_summary")
      .eq("project_notion_id", projectId)
      .gte("source_date", since)
      .order("source_date", { ascending: false })
      .limit(50),
    sb.from("evidence")
      .select("notion_id, title, evidence_type, evidence_statement, confidence_level, workstream, stakeholder_function, resolution_status, source_notion_id, date_captured")
      .eq("project_notion_id", projectId)
      .eq("validation_status", "Validated")
      .gte("date_captured", since)
      .order("date_captured", { ascending: false })
      .limit(80),
    // Decision items live in Notion; we don't sync them to Supabase yet.
    // Placeholder: empty array. Can wire up later.
    Promise.resolve({ data: [] as { title: string; decision_type: string; priority: string; notes: string }[] }),
    getAllNodes(),
  ]);

  const project = (projectRows?.[0] as ProjectRow | undefined) ?? null;
  if (!project) {
    return NextResponse.json({ error: `Project ${projectId} not found in Supabase` }, { status: 404 });
  }

  const sources  = sourcesRows  ?? [];
  const evidence = evidenceRows ?? [];

  // Derived signals ----------------------------------------------------------
  const workstreamCounts: Record<string, number> = {};
  for (const s of sources) {
    const w = (s as { workstream?: string | null }).workstream;
    if (w) workstreamCounts[w] = (workstreamCounts[w] ?? 0) + 1;
  }

  const openQuestions = evidence.filter(e => e.resolution_status === "open");
  const staleQuestions = evidence.filter(e => e.resolution_status === "stale");

  // Commitment heuristic: Process Step evidence with forward-looking verbs
  const COMMIT_PATTERNS = /\b(will send|will deliver|will confirm|will provide|to send|to deliver|to confirm|enviará|entregar(á|emos)|mandar[aá]|confirmar[aá])\b/i;
  const commitments = evidence.filter(e =>
    e.evidence_type === "Process Step" &&
    COMMIT_PATTERNS.test(`${e.title ?? ""} ${e.evidence_statement ?? ""}`)
  );

  // Knowledge leaves relevant: score each leaf against the project's signal
  // (evidence titles/statements + workstreams + project name). The leaf with
  // the most keyword hits wins. This is much stronger than matching only
  // workstream tags (which rarely overlap with leaf tags in practice).
  const STOP = new Set([
    "the","and","for","with","from","that","this","what","will","have","has","had","about","which","where","when","who","how","why","can","does","did","project","meeting","email","update","sent","sesion","sesión","reunion","reunión","para","por","con","sin","sobre","fwd","also",
  ]);
  const projectName = project?.name ?? "";
  function projectKeywords(): Set<string> {
    const bag: string[] = [];
    bag.push(projectName.toLowerCase());
    for (const s of sources) bag.push((s as { title?: string | null }).title?.toLowerCase() ?? "");
    for (const e of evidence) {
      bag.push((e.title ?? "").toLowerCase());
      bag.push((e.evidence_statement ?? "").slice(0, 300).toLowerCase());
    }
    for (const w of Object.keys(workstreamCounts)) bag.push(w.toLowerCase());
    const text = bag.join(" ").replace(/[^\p{L}\p{N}\s]/gu, " ");
    return new Set(text.split(/\s+/).filter(t => t.length >= 4 && !STOP.has(t)));
  }
  const projKw = projectKeywords();

  function scoreLeaf(n: typeof knowledgeNodes[number]): number {
    const haystack = `${n.path} ${n.title} ${n.summary} ${n.tags.join(" ")} ${n.body_md}`.toLowerCase();
    let score = 0;
    for (const t of projKw) if (haystack.includes(t)) score++;
    return score;
  }
  const leaves = knowledgeNodes.filter(n => !knowledgeNodes.some(c => c.parent_id === n.id));
  const relevantLeaves = leaves
    .map(n => ({ n, score: scoreLeaf(n) }))
    .filter(x => x.score >= 3)               // require meaningful overlap
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(x => x.n);

  // Summarise evidence by function (heat map input)
  const functionHeat: Record<string, number> = {};
  for (const e of evidence) {
    const f = e.stakeholder_function ?? e.workstream;
    if (f) functionHeat[f] = (functionHeat[f] ?? 0) + 1;
  }

  // ─── Build prompt ────────────────────────────────────────────────────────
  const sys = `You are preparing a strategic prep brief for Jose (Common House founder) before a conversation with a client.

The brief is consumed fast — 1-2 minutes of reading before he walks in. It must be decision-supporting, not descriptive.

Structure (markdown):
1. TL;DR (3 sentences max)
2. Open questions (if any) — verbatim or synthesised, with who + when raised
3. Commitments — what we owe / what they owe, with dates
4. Recent activity (last ${sinceDays} days) — signal only, not exhaustive
5. Stakeholder coverage — which functions have spoken; which are silent (gap flag)
6. Relevant knowledge — which leaf pages to refresh before entering
7. Suggested opener — one line we could start the meeting with

Writing style:
- Terse, bullets, no filler.
- Use the actual names (Dixania, Katherine, etc.) from the evidence.
- Every claim must be traceable to an evidence or source in context.
- If a section has no signal, write "—" not fluff.

Output pure markdown. No wrapping prose.`;

  const user = `Project: ${project.name ?? projectId}
${meetingDatetime ? `Meeting at: ${meetingDatetime}\n` : ""}${contactId ? `Scoped to contact: ${contactId}\n` : ""}
Window: last ${sinceDays} days

=== Recent sources (${sources.length}) ===
${sources.slice(0, 20).map(s =>
  `- [${s.source_type ?? "?"}]${s.workstream ? ` [${s.workstream}]` : ""} ${s.title} (${s.source_date ?? "?"})`
).join("\n")}

=== Validated evidence (${evidence.length}) ===
${evidence.slice(0, 30).map(e =>
  `- [${e.evidence_type ?? "?"}]${e.workstream ? ` [${e.workstream}]` : ""}${e.stakeholder_function ? ` [${e.stakeholder_function}]` : ""}${e.resolution_status ? ` [Q:${e.resolution_status}]` : ""} ${e.title} — ${e.evidence_statement?.slice(0, 200) ?? ""}`
).join("\n")}

=== Open questions (${openQuestions.length}) ===
${openQuestions.slice(0, 10).map(e => `- ${e.title} — ${e.evidence_statement?.slice(0, 200) ?? ""}`).join("\n") || "—"}

=== Stale questions (${staleQuestions.length}, > 14d unanswered) ===
${staleQuestions.slice(0, 5).map(e => `- ${e.title}`).join("\n") || "—"}

=== Commitments (forward-looking Process Steps, ${commitments.length}) ===
${commitments.slice(0, 10).map(e => `- ${e.title} — ${e.evidence_statement?.slice(0, 200) ?? ""}`).join("\n") || "—"}

=== Workstream activity (source counts) ===
${Object.entries(workstreamCounts).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "—"}

=== Function heat (evidence counts) ===
${Object.entries(functionHeat).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "—"}

=== Relevant knowledge leaves to refresh ===
${relevantLeaves.map(l => `- ${l.path} | ${l.title} — ${l.summary}`).join("\n") || "—"}

Write the brief now.`;

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: sys,
    messages: [{ role: "user", content: user }],
  });

  const block = res.content.find(b => b.type === "text");
  if (!block || block.type !== "text") {
    return NextResponse.json({ error: "No text response from Claude" }, { status: 500 });
  }
  const content_md = block.text.trim();

  const signals_summary = {
    sources_count: sources.length,
    evidence_count: evidence.length,
    open_questions: openQuestions.length,
    stale_questions: staleQuestions.length,
    commitments: commitments.length,
    workstreams: Object.keys(workstreamCounts),
    functions_heard: Object.keys(functionHeat),
    relevant_leaves: relevantLeaves.map(l => l.path),
  };

  let saved_id: string | null = null;
  if (!dryRun) {
    const { data: inserted } = await sb.from("prep_briefs").insert({
      project_notion_id: projectId,
      contact_notion_id: contactId ?? null,
      meeting_datetime: meetingDatetime ?? null,
      content_md,
      signals_summary,
    }).select("id").single();
    saved_id = (inserted as { id: string } | null)?.id ?? null;
  }

  return NextResponse.json({
    id: saved_id,
    project: project.name ?? projectId,
    signals: signals_summary,
    content_md,
  });
}

export const POST = withRoutineLog("generate-prep-brief", _POST);
export const GET = POST;
