/**
 * Drive ingestor — Phase 9 of the normalization architecture.
 *
 * v1 scope: project-scoped watch.
 *   - Read the `Drive Folder ID` field on each active CH Projects [OS v2]
 *     record. Projects without a folder ID are reported in
 *     diagnostics.skipped_unconfigured_projects.
 *   - For each watched folder, list files modifiedTime > watermark.
 *   - Emit ArtifactSignal → artifact_index (upsert by source_type+source_id).
 *   - Emit ActionSignal(intent=review) for newly-shared-with-Jose files
 *     that Jose has not yet opened (heuristic: sharedWithMeTime within
 *     the delta window).
 *
 * v1 does NOT handle the global @mention exception described in the doc
 * (comment mentions). That requires a per-file comments API call which
 * is expensive; deferred to v1.1.
 *
 * See docs/NORMALIZATION_ARCHITECTURE.md §11 Drive.
 */

import { google } from "googleapis";
import { getGoogleAuthClient } from "@/lib/google-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { notion, DB } from "@/lib/notion/core";
import { buildFactors } from "./priority";
import {
  getWatermark,
  startIngestorRun,
  finishIngestorRun,
  persistSignals,
  setWatermark,
  summarizeResult,
} from "./persist";
import type {
  ActionSignal,
  IngestError,
  IngestInput,
  IngestResult,
  Signal,
} from "./types";

const INGESTOR_VERSION = "drive@1.0.0";
const SOURCE_TYPE = "drive" as const;
const DEFAULT_BACKFILL_DAYS = 14;
const PER_FOLDER_MAX = 50;

type NotionProject = {
  id: string;
  name: string;
  driveFolderId: string | null;
};

type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  webViewLink: string;
  owners?: Array<{ emailAddress?: string | null }>;
  sharedWithMeTime?: string | null;
  viewedByMe?: boolean | null;
};

export async function runDriveIngestor(input: IngestInput): Promise<IngestResult> {
  const startedAt = new Date();
  const errors: IngestError[] = [];
  const signals: Signal[] = [];
  const artifactRows: Array<{
    source_type: string; source_id: string; url: string; title: string;
    mime: string; owner_email: string | null;
    project_id: string | null; last_modified_at: string;
  }> = [];
  let processed = 0;
  let skipped = 0;
  let skippedUnconfiguredProjects = 0;
  let toWatermark: string | null = null;
  let fallbackUsed: string | undefined;

  let since: string | null = null;
  if (input.mode === "backfill") {
    since = input.since ?? null;
  } else {
    since = await getWatermark(SOURCE_TYPE);
    if (!since) {
      since = new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 86_400_000).toISOString();
      fallbackUsed = "no_prior_watermark_defaulted_to_14d";
    }
  }

  const runId = await startIngestorRun({
    sourceType: SOURCE_TYPE,
    ingestorVersion: INGESTOR_VERSION,
    sinceWatermark: since,
  });

  try {
    const auth = getGoogleAuthClient();
    if (!auth.ok) throw new Error("Drive client unavailable — check GMAIL_* env vars (shared OAuth token)");
    const drive = google.drive({ version: "v3", auth: auth.client });

    const projects = await loadNotionProjectsWithFolder();
    const watched = projects.filter(p => !!p.driveFolderId);
    skippedUnconfiguredProjects = projects.length - watched.length;

    if (watched.length === 0) {
      fallbackUsed = fallbackUsed
        ? `${fallbackUsed}; no_watched_projects`
        : "no_watched_projects";
      toWatermark = since;
    } else {
      const sb = getSupabaseServerClient();
      // Map Notion project notion_id → Supabase projects.id (uuid) for FK
      const notionIds = watched.map(p => p.id);
      const projectIdByNotionId = await mapNotionProjectIdsToSupabase(sb, notionIds);

      let latest = since ? new Date(since) : new Date(0);

      for (const proj of watched) {
        try {
          const files = await listFolderFiles(drive, proj.driveFolderId!, since);
          for (const f of files) {
            const modifiedMs = Date.parse(f.modifiedTime);
            if (!modifiedMs) continue;
            const modDate = new Date(modifiedMs);
            if (modDate > latest) latest = modDate;

            const projectSupabaseId = projectIdByNotionId.get(proj.id) ?? null;
            const ownerEmail = f.owners?.[0]?.emailAddress ?? null;

            artifactRows.push({
              source_type: SOURCE_TYPE,
              source_id: f.id,
              url: f.webViewLink,
              title: f.name,
              mime: f.mimeType,
              owner_email: ownerEmail,
              project_id: projectSupabaseId,
              last_modified_at: modDate.toISOString(),
            });
            processed++;

            // ActionSignal(intent=review) when: shared with Jose recently, not viewed yet
            const sharedMs = f.sharedWithMeTime ? Date.parse(f.sharedWithMeTime) : 0;
            if (sharedMs && !f.viewedByMe) {
              const factors = buildFactors({
                intent: "review",
                deadline: null,
                lastMotionAt: modDate.toISOString(),
                tier: null,
                warmth: null,
                objectiveTier: null,
                founderOwned: false,
              });
              const sig: ActionSignal = {
                kind: "action",
                source_type: SOURCE_TYPE,
                source_id: `review:${f.id}`,
                source_url: f.webViewLink,
                emitted_at: new Date().toISOString(),
                ingestor_version: INGESTOR_VERSION,
                related_ids: { project_id: projectSupabaseId ?? undefined },
                payload: {
                  intent: "review",
                  ball_in_court: "jose",
                  owner_person_id: null,
                  founder_owned: false,
                  next_action: `Review "${f.name}" (shared on Drive)`,
                  subject: f.name,
                  counterparty: ownerEmail,
                  deadline: null,
                  last_motion_at: modDate.toISOString(),
                  consequence: null,
                  priority_factors: factors,
                },
              };
              signals.push(sig);
            } else {
              skipped++;
            }
          }
        } catch (err: unknown) {
          errors.push({
            source_id: proj.driveFolderId ?? proj.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      toWatermark = latest.toISOString();

      // Persist artifact_index rows (upsert by (source_type, source_id))
      if (artifactRows.length > 0 && !(input.dryRun ?? false)) {
        const { error: upErr } = await sb
          .from("artifact_index")
          .upsert(artifactRows, { onConflict: "source_type,source_id" });
        if (upErr) errors.push({ message: `artifact_index upsert: ${upErr.message}` });
      }
    }
  } catch (err: unknown) {
    errors.push({ message: err instanceof Error ? err.message : String(err) });
  }

  const { counts, errors: persistErrors } = await persistSignals(signals, { dryRun: input.dryRun ?? false });
  errors.push(...persistErrors);

  const result: IngestResult = {
    source_type: SOURCE_TYPE,
    ingestor_version: INGESTOR_VERSION,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    since_watermark: since,
    to_watermark: toWatermark,
    processed,
    skipped: skipped + skippedUnconfiguredProjects,
    errors,
    fallback_used: fallbackUsed,
    signals,
    dry_run: input.dryRun ?? false,
    run_id: runId,
  };

  await finishIngestorRun({
    runId,
    toWatermark,
    processed,
    skipped: result.skipped,
    errors,
    signalsEmitted: {
      ...counts,
      ...summarizeResult(result),
      artifact_rows: artifactRows.length,
      skipped_unconfigured_projects: skippedUnconfiguredProjects,
    },
    fallbackUsed,
    dryRun: input.dryRun ?? false,
  });

  if (!input.dryRun && input.mode === "delta" && toWatermark && errors.length === 0) {
    await setWatermark({
      sourceType: SOURCE_TYPE,
      watermark: toWatermark,
      ingestorVersion: INGESTOR_VERSION,
      runId,
    });
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function loadNotionProjectsWithFolder(): Promise<NotionProject[]> {
  const out: NotionProject[] = [];
  let cursor: string | undefined;
  do {
    const res: {
      results: Array<{ id: string; properties: Record<string, unknown> }>;
      has_more: boolean;
      next_cursor: string | null;
    } = await (notion.databases as unknown as {
      query: (args: unknown) => Promise<{
        results: Array<{ id: string; properties: Record<string, unknown> }>;
        has_more: boolean;
        next_cursor: string | null;
      }>;
    }).query({
      database_id: DB.projects,
      page_size: 100,
      start_cursor: cursor,
      filter: {
        property: "Project Status",
        select: { equals: "Active" },
      },
    });
    for (const p of res.results) {
      const props = p.properties as Record<string, unknown>;
      const name = extractTitle(props["Project Name"]);
      const folder = extractText(props["Drive Folder ID"]);
      out.push({ id: p.id, name, driveFolderId: folder });
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return out;
}

function extractTitle(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";
  const p = prop as { title?: Array<{ plain_text?: string }> };
  return (p.title ?? []).map(t => t.plain_text ?? "").join("").trim();
}

function extractText(prop: unknown): string | null {
  if (!prop || typeof prop !== "object") return null;
  const p = prop as { rich_text?: Array<{ plain_text?: string }> };
  const value = (p.rich_text ?? []).map(t => t.plain_text ?? "").join("").trim();
  return value || null;
}

async function mapNotionProjectIdsToSupabase(
  sb: ReturnType<typeof getSupabaseServerClient>,
  notionIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (notionIds.length === 0) return out;
  const { data } = await sb.from("projects").select("id, notion_id").in("notion_id", notionIds);
  for (const r of (data ?? []) as Array<{ id: string; notion_id: string }>) {
    out.set(r.notion_id, r.id);
  }
  return out;
}

async function listFolderFiles(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  since: string | null
): Promise<DriveFile[]> {
  const sinceClause = since ? ` and modifiedTime > '${escapeDriveTime(since)}'` : "";
  const q = `'${folderId}' in parents and trashed = false${sinceClause}`;
  const res = await drive.files.list({
    q,
    fields: "files(id,name,mimeType,modifiedTime,webViewLink,owners(emailAddress),sharedWithMeTime,viewedByMe)",
    pageSize: PER_FOLDER_MAX,
    orderBy: "modifiedTime desc",
  });
  return (res.data.files ?? []) as unknown as DriveFile[];
}

function escapeDriveTime(iso: string): string {
  // Drive API query language uses ISO timestamps directly; single-quote
  // inside the value needs escaping. ISO timestamps don't contain single
  // quotes, so this is a safety guard only.
  return iso.replace(/'/g, "\\'");
}
