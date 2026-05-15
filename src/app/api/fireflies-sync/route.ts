/**
 * POST /api/fireflies-sync
 *
 * Comprehensive Fireflies sync. One cron, all non-AI writes:
 *
 *   1. sources    — one row per transcript (always), with org_notion_id and
 *                   project_notion_id resolved from Supabase entity index
 *                   (organizations, people, projects). No hard-coded maps.
 *   2. projects   — last_meeting_date forward-bumped on matched projects
 *                   regardless of project_status (a project in "Proposed"
 *                   that has a meeting still benefits from the timestamp).
 *   3. people     — last_contact_date for all participants of every
 *                   transcript, not only matched ones.
 *   4. hall_attendees — observed contacts, dedup by transcript_id.
 *
 * Default (daily cron): reads only yesterday's meetings (delta).
 * Backfill: POST with body { days: 60 } to seed historical data.
 *
 * Auth: x-agent-key OR Vercel cron CRON_SECRET.
 * Called by Vercel cron daily at 06:30 UTC Mon–Fri.
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { isAdminUser, isAdminEmail } from "@/lib/clients";
import { withRoutineLog } from "@/lib/routine-log";
import { observeTranscript } from "@/lib/hall-contact-observers";
import { getSelfEmails } from "@/lib/hall-self";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { loadEntityIndex, resolveOrgId, resolveProjectId } from "@/lib/resolve-meeting-entities";

export const maxDuration = 90;

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

// ─── Auth ─────────────────────────────────────────────────────────────────────

async function authCheck(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;
  const agentKey  = req.headers.get("x-agent-key");
  const cronToken = req.headers.get("authorization");
  if (expected && agentKey  === expected)              return true;
  if (expected && cronToken === `Bearer ${expected}`)  return true;
  try {
    const user = await currentUser();
    if (!user) return false;
    const email = user.primaryEmailAddress?.emailAddress ?? "";
    if (isAdminUser(user.id) || isAdminEmail(email)) return true;
  } catch { /* noop */ }
  return false;
}

// ─── Fireflies ────────────────────────────────────────────────────────────────

interface FirefliesTranscript {
  id:           string;
  title:        string;
  date:         number;           // Unix ms
  meeting_link: string | null;
  participants: string[];
  summary: {
    overview:         string | null;
    shorthand_bullet: string | null;
  } | null;
}

class FirefliesError extends Error {
  constructor(message: string, public readonly detail: unknown) { super(message); }
}

async function getTranscripts(fromDate: string, toDate: string): Promise<FirefliesTranscript[]> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new FirefliesError("FIREFLIES_API_KEY missing", null);

  // Fireflies expects DateTime (ISO-8601), not String. Declaring the
  // variables as String makes Fireflies reject the query with
  // GRAPHQL_VALIDATION_FAILED and the prior catch-all silently returned [].
  const query = `
    query GetTranscripts($fromDate: DateTime, $toDate: DateTime) {
      transcripts(fromDate: $fromDate, toDate: $toDate) {
        id
        title
        date
        meeting_link
        participants
        summary {
          overview
          shorthand_bullet
        }
      }
    }
  `;

  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query, variables: { fromDate, toDate } }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors) {
    throw new FirefliesError(
      `Fireflies API error (HTTP ${res.status})`,
      json?.errors ?? json ?? { http_status: res.status },
    );
  }
  return json?.data?.transcripts ?? [];
}

// ─── Deduplication: CH Sources URLs already in DB ────────────────────────────

async function getExistingSourceUrls(fromDate: string): Promise<Set<string>> {
  const existing = new Set<string>();

  // Supabase canonical (Notion fallback removed 2026-05-15, post Phase 2 backfill).
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("sources")
      .select("source_url")
      .eq("source_platform", "Fireflies")
      .gte("source_date", fromDate)
      .limit(1000);
    for (const row of (data ?? []) as { source_url: string | null }[]) {
      if (row.source_url) existing.add(row.source_url);
    }
  } catch { /* non-fatal */ }

  return existing;
}

// ─── People: update Last Contact Date ────────────────────────────────────────
// Writes directly to Supabase `people` (Notion Contacts is no longer the
// source of truth after contact consolidation).

async function updatePeopleLastContact(emails: string[], dateStr: string): Promise<number> {
  if (emails.length === 0) return 0;
  try {
    const { getSupabaseServerClient } = await import("@/lib/supabase-server");
    const sb = getSupabaseServerClient();
    const lowered = emails.slice(0, 60).map(e => e.toLowerCase());
    // Fetch rows so we can filter "only set if new date is more recent".
    const { data: rows } = await sb
      .from("people")
      .select("id, email, last_contact_date")
      .in("email", lowered);
    let updated = 0;
    for (const r of (rows ?? []) as { id: string; email: string | null; last_contact_date: string | null }[]) {
      if (!r.last_contact_date || r.last_contact_date < dateStr) {
        await sb.from("people").update({ last_contact_date: dateStr, updated_at: new Date().toISOString() }).eq("id", r.id);
        updated++;
      }
    }
    return updated;
  } catch {
    return 0;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

async function _POST(req: NextRequest) {
  if (!(await authCheck(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Parse lookback window — default = yesterday (delta mode)
  let days = 1;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.days === "number" && body.days > 0) days = body.days;
  } catch { /* no body */ }

  // Fireflies expects DateTime (full ISO 8601). Notion's date filter wants
  // YYYY-MM-DD. Keep them as separate strings.
  const now = new Date();
  const fromIso       = new Date(now.getTime() - days * 86_400_000).toISOString();
  const toIso         = now.toISOString();
  const fromDateOnly  = fromIso.slice(0, 10);

  // ── 1. Fetch transcripts from Fireflies ─────────────────────────────────────
  let transcripts: FirefliesTranscript[];
  try {
    transcripts = await getTranscripts(fromIso, toIso);
  } catch (err) {
    const e = err as FirefliesError;
    return NextResponse.json({
      ok: false,
      error: "fireflies_api_error",
      message: e.message,
      detail: e.detail,
      mode: days === 1 ? "delta" : `backfill-${days}d`,
    }, { status: 502 });
  }

  if (transcripts.length === 0) {
    return NextResponse.json({
      ok: true, transcripts: 0, projects_updated: 0, sources_created: 0, people_updated: 0,
      mode: days === 1 ? "delta" : `backfill-${days}d`,
    });
  }

  // ── 2. Load entity index + dedup set ────────────────────────────────────────
  // The index is canonical Supabase (organizations + people + projects). No
  // hard-coded org/project maps — anything that can be resolved by participant
  // email, email domain, or name substring is resolved automatically.
  const sb = getSupabaseServerClient();
  const [idx, alreadyIngested, selfEmails] = await Promise.all([
    loadEntityIndex(sb),
    getExistingSourceUrls(fromDateOnly),
    getSelfEmails(),
  ]);

  // ── 3. Resolve org + project per transcript ─────────────────────────────────
  // Every transcript gets a source row, whether or not we match a project.
  // Unmatched transcripts are still valuable (they contain participants for
  // hall_attendees observation + raw content for future re-extraction). The
  // old behaviour silently discarded them; that is the bug we are killing.
  type Resolved = {
    transcript:  FirefliesTranscript;
    meetingDate: string;
    orgId:       string | null;
    projectId:   string | null;
    orgPath:     string;
    projPath:    string;
  };

  const resolved: Resolved[] = transcripts.map(t => {
    const orgResult  = resolveOrgId(idx, { title: t.title, participantEmails: t.participants, selfEmails });
    const projResult = resolveProjectId(idx, orgResult.orgNotionId, { title: t.title });
    return {
      transcript:  t,
      meetingDate: new Date(t.date).toISOString().slice(0, 10),
      orgId:       orgResult.orgNotionId,
      projectId:   projResult.projectNotionId,
      orgPath:     orgResult.matchPath,
      projPath:    projResult.matchPath,
    };
  });

  // ── 4. Update projects.last_meeting_date for matched projects ───────────────
  const latestByProject = new Map<string, string>();
  for (const r of resolved) {
    if (!r.projectId) continue;
    const cur = latestByProject.get(r.projectId);
    if (!cur || r.meetingDate > cur) latestByProject.set(r.projectId, r.meetingDate);
  }

  let projectsUpdated = 0;
  const projectErrors: string[] = [];
  for (const [projectId, meetingDate] of latestByProject) {
    try {
      // Only bump forward — never overwrite a more recent date with an older one.
      const { data: cur } = await sb
        .from("projects")
        .select("last_meeting_date")
        .eq("notion_id", projectId)
        .maybeSingle();
      const existing = (cur as { last_meeting_date: string | null } | null)?.last_meeting_date ?? null;
      if (existing && existing >= meetingDate) continue;

      const { error: upErr } = await sb
        .from("projects")
        .update({ last_meeting_date: meetingDate, updated_at: new Date().toISOString() })
        .eq("notion_id", projectId);
      if (upErr) projectErrors.push(`${projectId}: ${upErr.message}`);
      else       projectsUpdated++;
    } catch (err) {
      projectErrors.push(`${projectId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 5. Upsert sources (one row per transcript, regardless of match) ────────
  let sourcesCreated = 0;
  let sourcesEnriched = 0;
  const sourceErrors: string[] = [];

  for (const r of resolved) {
    const t = r.transcript;
    const viewerUrl = `https://app.fireflies.ai/view/${t.id}`;
    const summary   = t.summary?.overview || t.summary?.shorthand_bullet || "";

    try {
      // Upsert on source_external_id: extract-meeting-evidence may have
      // created a minimal row hours earlier. Upserting enriches it
      // (project link, org link, summary) instead of failing on the
      // unique index. We always include org_notion_id and project_notion_id
      // — including when they resolve to null — so a previously-unresolved
      // row is *not* left with a stale-incorrect value.
      const { error: insertErr } = await sb
        .from("sources")
        .upsert({
          title:              t.title.slice(0, 200),
          source_type:        "Meeting",
          source_platform:    "Fireflies",
          processing_status:  "Processed",
          source_date:        r.meetingDate,
          source_url:         viewerUrl,
          org_notion_id:      r.orgId,
          project_notion_id:  r.projectId,
          processed_summary:  summary ? summary.slice(0, 2000) : null,
          dedup_key:          `fireflies:${t.id}`,
          source_external_id: t.id,
        }, { onConflict: "source_external_id" });
      if (insertErr) {
        sourceErrors.push(`${t.title}: ${insertErr.message}`);
        continue;
      }

      if (alreadyIngested.has(viewerUrl)) sourcesEnriched++;
      else                                sourcesCreated++;
      alreadyIngested.add(viewerUrl);
    } catch (err) {
      sourceErrors.push(`${t.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── 6. Update CH People "Last Contact Date" ──────────────────────────────────
  // Use all transcripts, not only matched ones — a person we just spoke to
  // is still "recently contacted" even if the meeting did not link to a project.
  const participantEmails = new Map<string, string>();
  for (const r of resolved) {
    for (const email of (r.transcript.participants ?? [])) {
      if (!email.includes("@")) continue;
      const current = participantEmails.get(email);
      if (!current || r.meetingDate > current) participantEmails.set(email, r.meetingDate);
    }
  }

  let peopleUpdated = 0;
  for (const [email, dateStr] of participantEmails) {
    peopleUpdated += await updatePeopleLastContact([email], dateStr);
  }

  // ── 8. Observe contacts into hall_attendees (all transcripts, even unmatched) ─
  //    The registry cares about every person Jose interacted with, not only
  //    those tied to a project. Dedup by transcript_id prevents inflation.
  //    Self identities (Jose's own emails across accounts) are stripped
  //    before credit so the registry never contains him as 'a contact of himself'.
  //    selfEmails was loaded above; reuse it instead of refetching.
  const selfSet = selfEmails;
  let observedContacts = 0;
  for (const t of transcripts) {
    try {
      const emails = (t.participants ?? [])
        .filter(e => e && e.includes("@"))
        .map(e => e.toLowerCase())
        .filter(e => !selfSet.has(e));
      if (emails.length === 0) continue;
      const obs = await observeTranscript({
        transcriptId:      t.id,
        participantEmails: emails,
        title:             t.title,
        meetingAt:         new Date(t.date),
        meetingLink:       t.meeting_link,
      });
      if (obs.newObservation) observedContacts += obs.incremented;
    } catch { /* best-effort */ }
  }

  const errors = [...projectErrors, ...sourceErrors];

  // Match-path distribution: lets us spot regressions (e.g. an unexpected
  // spike in "miss" or in "title-substring" matches) without grepping logs.
  const orgPathCounts: Record<string, number> = {};
  const projPathCounts: Record<string, number> = {};
  for (const r of resolved) {
    const o = r.orgPath.split(":")[0];
    const p = r.projPath.split(":")[0];
    orgPathCounts[o]  = (orgPathCounts[o]  ?? 0) + 1;
    projPathCounts[p] = (projPathCounts[p] ?? 0) + 1;
  }

  return NextResponse.json({
    ok: true,
    mode:             days === 1 ? "delta" : `backfill-${days}d`,
    fromDate:         fromIso,
    toDate:           toIso,
    transcripts:      transcripts.length,
    org_matches:      resolved.filter(r => r.orgId).length,
    project_matches:  resolved.filter(r => r.projectId).length,
    projects_updated: projectsUpdated,
    sources_created:  sourcesCreated,
    sources_enriched: sourcesEnriched,
    people_updated:   peopleUpdated,
    observed_contacts: observedContacts,
    match_paths:      { org: orgPathCounts, project: projPathCounts },
    errors,
  });
}

export const POST = withRoutineLog("fireflies-sync", _POST);
