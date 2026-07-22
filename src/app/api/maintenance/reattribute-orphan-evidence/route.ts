/**
 * POST/GET /api/maintenance/reattribute-orphan-evidence
 *
 * Systemic fix for the attribution rot: ~80% of `evidence` rows carry
 * project_notion_id = NULL, so project surfaces (Garage/accompaniment, STB,
 * project-operator) under-count real activity. Root cause is not the
 * resolver (src/lib/resolve-meeting-entities.ts is sound) but empty linkage
 * data (org_domains, projects.primary_org_notion_id, people↔org). Once that
 * data is populated, replaying the EXACT production resolver over the orphans
 * recovers their project attribution.
 *
 * This route reuses loadEntityIndex / resolveOrgId / resolveProjectId — the
 * same code extract-meeting-evidence uses at ingest — so a re-attributed row
 * matches what a fresh ingest would have produced. No LLM, pure lookups.
 *
 * Resolution per orphan (first confident hit wins):
 *   1. evidence.org_notion_id already set  → resolveProjectId(org, title)
 *   2. else resolveOrgId(meeting attendee emails + title/statement) → project
 * A null project is left null — no guess beats a correct null.
 *
 * Dry-run is the DEFAULT. Pass ?execute=true to write. Auth: CRON_SECRET via
 * x-agent-key or Authorization: Bearer.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
import { loadEntityIndex, resolveOrgId, resolveProjectId } from "@/lib/resolve-meeting-entities";
import { loadActiveProjects, inferProjectFromText } from "@/lib/project-context";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authCheck(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  if (req.headers.get("x-agent-key") === expected) return true;
  if (req.headers.get("authorization") === `Bearer ${expected}`) return true;
  return false;
}

type EvRow = { id: string; title: string | null; evidence_statement: string | null; org_notion_id: string | null; source_id: string | null };
type SrcRow = { id: string; title: string | null; org_notion_id: string | null; source_external_id: string | null };

async function handle(req: NextRequest) {
  if (!authCheck(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const execute = url.searchParams.get("execute") === "true";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "5000", 10) || 5000, 20000);

  const sb = getSupabaseServerClient();
  const [idx, selfEmails, activeProjects] = await Promise.all([loadEntityIndex(sb), getSelfEmails(), loadActiveProjects()]);

  // active project notion_ids (only attribute to a real target)
  const activeProjectIds = new Set<string>();
  for (const list of idx.projectsByOrg.values()) for (const p of list) activeProjectIds.add(p.notionId);
  for (const p of idx.projectsByName) activeProjectIds.add(p.notionId);

  // 1. Page through orphaned evidence
  const orphans: EvRow[] = [];
  const PAGE = 1000;
  for (let from = 0; orphans.length < limit; from += PAGE) {
    const { data, error } = await sb
      .from("evidence")
      .select("id, title, evidence_statement, org_notion_id, source_id")
      .is("project_notion_id", null)
      .order("date_captured", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    const rows = (data ?? []) as EvRow[];
    orphans.push(...rows);
    if (rows.length < PAGE) break;
  }

  // 2. Load the parent sources (title, org, external id for attendee lookup)
  const sourceIds = Array.from(new Set(orphans.map(o => o.source_id).filter((x): x is string => !!x)));
  const srcById = new Map<string, SrcRow>();
  for (let i = 0; i < sourceIds.length; i += 500) {
    const { data } = await sb
      .from("sources")
      .select("id, title, org_notion_id, source_external_id")
      .in("id", sourceIds.slice(i, i + 500));
    for (const s of (data ?? []) as SrcRow[]) srcById.set(s.id, s);
  }

  // 3. Attendee emails — join sources→transcripts by source_external_id, WITH a
  //    title fallback. Many sources carry a NULL/mismatched external_id (the
  //    same fragility getAttendeesByMeeting handles in the ingestor), so match
  //    by title too. hall_transcript_observations is small (~140 rows) → load all.
  const emailsByTranscriptId = new Map<string, string[]>();
  const emailsByTitle = new Map<string, string[]>();
  {
    const { data } = await sb
      .from("hall_transcript_observations")
      .select("transcript_id, title, participant_emails");
    for (const o of (data ?? []) as Array<{ transcript_id: string; title: string | null; participant_emails: string[] | null }>) {
      const emails = (o.participant_emails ?? []).filter(Boolean);
      if (o.transcript_id) emailsByTranscriptId.set(o.transcript_id, emails);
      if (o.title) emailsByTitle.set(o.title, emails);
    }
  }

  // 4. Resolve each orphan
  const updates: Array<{ id: string; project: string }> = [];
  const byProject = new Map<string, number>();
  let viaText = 0, viaOrg = 0, viaResolve = 0;
  for (const ev of orphans) {
    const src = ev.source_id ? srcById.get(ev.source_id) : undefined;
    const evText = [ev.title ?? "", ev.evidence_statement ?? ""].join(" ").slice(0, 600);
    const corpus = [evText, src?.title ?? ""].join(" ").slice(0, 700);

    // Per-evidence FIRST: if this atomic claim's own text names a specific
    // active project, that wins. This is what splits a multi-project meeting —
    // a Celia meeting yields Expo claims → Expo and DRS claims → Upstream PAS.
    let pid: string | null = inferProjectFromText(activeProjects, evText)?.notion_id ?? null;
    let matchedVia: "text" | "org" | "resolve" = "text";

    if (!pid) {
      // Fallback: the meeting's org → project (incl. multi-org stakeholders
      // folded into the index via project_organization_roles).
      let orgId = ev.org_notion_id ?? src?.org_notion_id ?? null;
      matchedVia = "org";
      if (!orgId) {
        const emails = (src?.source_external_id ? emailsByTranscriptId.get(src.source_external_id) : undefined)
          ?? (src?.title ? emailsByTitle.get(src.title) : undefined)
          ?? [];
        orgId = resolveOrgId(idx, { title: corpus, participantEmails: emails, selfEmails }).orgNotionId;
        matchedVia = "resolve";
      }
      pid = resolveProjectId(idx, orgId, { title: corpus }).projectNotionId;
    }

    if (!pid || !activeProjectIds.has(pid)) continue;
    updates.push({ id: ev.id, project: pid });
    byProject.set(pid, (byProject.get(pid) ?? 0) + 1);
    if (matchedVia === "text") viaText++; else if (matchedVia === "org") viaOrg++; else viaResolve++;
  }

  // 5. Apply (or report)
  let applied = 0;
  if (execute && updates.length) {
    for (const u of updates) {
      const { error } = await sb.from("evidence").update({ project_notion_id: u.project }).eq("id", u.id);
      if (!error) applied++;
    }
  }

  // Label the per-project counts with project names for a readable dry-run
  const nameByNotion = new Map<string, string>();
  for (const list of idx.projectsByOrg.values()) for (const p of list) nameByNotion.set(p.notionId, p.name);
  const perProject = Array.from(byProject.entries())
    .map(([pid, n]) => ({ project: nameByNotion.get(pid) ?? pid, notion_id: pid, count: n }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    mode: execute ? "execute" : "dry-run",
    scanned: orphans.length,
    resolvable: updates.length,
    applied,
    matched_via: { evidence_text: viaText, evidence_or_source_org: viaOrg, attendee_or_title_resolve: viaResolve },
    per_project: perProject,
  });
}

export const GET = handle;
export const POST = handle;
