import "server-only";
import { getDriveClientOAuth } from "@/lib/drive";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fireflies → Google Drive backup agent (Phase 1: non-destructive).
 *
 * Why this exists: Fireflies' native Google-Drive sync is unsupervised and
 * incomplete (empirically missed ~40% of one month). The digested layer in
 * Supabase (processed_summary + evidence) is lossy — `sources.raw_content` is
 * never populated, so the verbatim transcript lives ONLY in Fireflies. Before
 * we can delete old meetings from Fireflies to stay under the free-tier
 * storage cap, every meeting must have a verified, complete copy on Drive that
 * we control.
 *
 * This module lists Fireflies, diffs against the `meeting_backups` manifest,
 * and writes any missing meeting to Drive as three files (mirroring the native
 * sync's shape so one continuous store is "easy to digest"):
 *   Transcripts/  <title>-transcript-<iso>-<id>.json   live shape: [{sentence,startTime,endTime,speaker_id,speaker_name}]
 *   Summaries/    <title>-transcript-<iso>-<id>.md      human-readable summary
 *   _full-json/   <date>_<title>_<id>.json              rich original (attendees, emails — superset the resolver needs)
 *
 * It does NOT delete anything and does NOT repoint sources.source_url — those
 * are Phase 3 (deletion), gated on human approval. Text-only: audio (MP3) is
 * left to the native sync.
 */

const FIREFLIES_API = "https://api.fireflies.ai/graphql";
const BACKUP_FOLDER_NAME = "Fireflies Meetings Backup";

// Meetings older than this are eligible to prune from Fireflies (Drive keeps
// the backup). Single source of truth for the status report and the Phase-3
// prune gate. Change here to re-tune how much history stays live in Fireflies.
export const RETENTION_DAYS = 60;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FfSentence {
  index?: number;
  speaker_name?: string | null;
  speaker_id?: number | null;
  text?: string | null;
  start_time?: number | null;
  end_time?: number | null;
}

export interface FfFullTranscript {
  id: string;
  title: string | null;
  date: number | null; // Unix ms
  duration: number | null; // minutes
  transcript_url: string | null;
  host_email: string | null;
  organizer_email: string | null;
  participants: string[] | null;
  meeting_attendees: { displayName: string | null; email: string | null; name: string | null }[] | null;
  summary: Record<string, unknown> | null;
  sentences: FfSentence[] | null;
}

export class FirefliesError extends Error {
  constructor(message: string, public readonly detail: unknown, public readonly rateLimited = false) {
    super(message);
  }
}

// ─── Fireflies API ─────────────────────────────────────────────────────────

function detectRateLimit(errors: unknown): boolean {
  if (!Array.isArray(errors)) return false;
  return errors.some(
    (e) => e && typeof e === "object" && (e as { code?: string }).code === "too_many_requests",
  );
}

async function ffQuery<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new FirefliesError("FIREFLIES_API_KEY missing", null);

  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.errors) {
    const rl = detectRateLimit(json?.errors);
    throw new FirefliesError(`Fireflies API error (HTTP ${res.status})`, json?.errors ?? json, rl);
  }
  return json?.data as T;
}

/** Lightweight listing for reconciliation (id + integrity fields only). */
export async function listFirefliesMeetings(
  fromIso: string,
  toIso: string,
): Promise<{ id: string; title: string | null; date: number | null; duration: number | null }[]> {
  // Fireflies caps `transcripts` at 50 rows per call, so we page with skip
  // until a short page comes back. Without this the agent only ever sees the
  // 50 most-recent meetings in the window and could never reach the OLD ones
  // (>60d) that are the whole point of the prune flow.
  const query = `
    query List($fromDate: DateTime, $toDate: DateTime, $limit: Int, $skip: Int) {
      transcripts(fromDate: $fromDate, toDate: $toDate, limit: $limit, skip: $skip) {
        id title date duration
      }
    }`;
  const PAGE = 50;
  const MAX_PAGES = 30; // safety backstop (1500 meetings)
  const all: { id: string; title: string | null; date: number | null; duration: number | null }[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await ffQuery<{ transcripts: typeof all }>(
      query,
      { fromDate: fromIso, toDate: toIso, limit: PAGE, skip: page * PAGE },
    );
    const rows = data?.transcripts ?? [];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Full transcript (sentences + attendees + summary) for a single meeting. */
export async function getFirefliesFullTranscript(id: string): Promise<FfFullTranscript> {
  const query = `
    query Full($id: String!) {
      transcript(id: $id) {
        id title date duration transcript_url host_email organizer_email participants
        meeting_attendees { displayName email name }
        summary { overview short_summary action_items keywords outline shorthand_bullet bullet_gist gist }
        sentences { index speaker_name speaker_id text start_time end_time }
      }
    }`;
  const data = await ffQuery<{ transcript: FfFullTranscript }>(query, { id });
  if (!data?.transcript) throw new FirefliesError(`Transcript ${id} not found`, null);
  return data.transcript;
}

// ─── Drive ─────────────────────────────────────────────────────────────────

type DriveClient = NonNullable<ReturnType<typeof getDriveClientOAuth>>;

export interface BackupFolders {
  root: string;
  transcripts: string;
  summaries: string;
  fullJson: string;
}

async function findOrCreateFolder(drive: DriveClient, name: string, parentId: string | null): Promise<string> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${parentClause}`;
  const existing = await drive.files.list({ q, fields: "files(id, name)", pageSize: 1 });
  const hit = existing.data.files?.[0];
  if (hit?.id) return hit.id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: parentId ? [parentId] : undefined },
    fields: "id",
  });
  if (!created.data.id) throw new Error(`Failed to create folder: ${name}`);
  return created.data.id;
}

/** Resolve (create on first run) the agent-owned backup folder tree in My Drive. */
export async function resolveBackupFolders(): Promise<BackupFolders | null> {
  const drive = getDriveClientOAuth();
  if (!drive) return null; // OAuth Drive not configured — caller degrades gracefully
  const root = await findOrCreateFolder(drive, BACKUP_FOLDER_NAME, null);
  const [transcripts, summaries, fullJson] = await Promise.all([
    findOrCreateFolder(drive, "Transcripts", root),
    findOrCreateFolder(drive, "Summaries", root),
    findOrCreateFolder(drive, "_full-json", root),
  ]);
  return { root, transcripts, summaries, fullJson };
}

async function uploadRaw(
  drive: DriveClient,
  folderId: string,
  name: string,
  mimeType: string,
  content: string,
): Promise<{ id: string; link: string }> {
  const { Readable } = await import("stream");
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: Readable.from(Buffer.from(content, "utf-8")) },
    fields: "id, webViewLink",
  });
  const id = res.data.id;
  if (!id) throw new Error(`Drive upload returned no id for ${name}`);
  return { id, link: res.data.webViewLink ?? `https://drive.google.com/file/d/${id}/view` };
}

// ─── Formatting (mirror the archive/live shape) ──────────────────────────────

function sanitize(s: string | null | undefined): string {
  if (!s) return "untitled";
  let out = s.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  if (out.length > 90) out = out.slice(0, 90).trim();
  return out || "untitled";
}

function fmtTime(sec: number | null | undefined): string {
  const s = typeof sec === "number" && isFinite(sec) ? sec : 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function buildLiveTranscript(sentences: FfSentence[] | null): string {
  const arr = (sentences ?? []).map((x) => ({
    sentence: x.text ?? "",
    startTime: fmtTime(x.start_time),
    endTime: fmtTime(x.end_time),
    speaker_id: x.speaker_id ?? null,
    speaker_name: x.speaker_name ?? null,
  }));
  return JSON.stringify(arr, null, 2);
}

function summaryField(summary: Record<string, unknown> | null, key: string): string {
  const v = summary?.[key];
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function buildSummaryMd(t: FfFullTranscript): string {
  const date = t.date ? new Date(t.date).toISOString().slice(0, 16).replace("T", " ") : "unknown";
  const attendees = (t.meeting_attendees ?? []).map((a) => a.email).filter(Boolean).join(", ");
  const lines = [
    `# ${t.title ?? "(untitled)"}`,
    "",
    `- **Fecha:** ${date} UTC`,
    `- **Duración:** ${t.duration != null ? Math.round(t.duration * 10) / 10 : "?"} min`,
    `- **Fireflies:** ${t.transcript_url ?? ""}`,
  ];
  if (attendees) lines.push(`- **Asistentes:** ${attendees}`);
  lines.push("");
  const push = (label: string, key: string) => {
    const v = summaryField(t.summary, key);
    if (v) lines.push(`## ${label}`, v, "");
  };
  push("Overview", "overview");
  push("Resumen", "short_summary");
  push("Action items", "action_items");
  push("Keywords", "keywords");
  return lines.join("\n");
}

// ─── Backup one meeting ──────────────────────────────────────────────────────

export interface BackupOutcome {
  id: string;
  title: string;
  status: "backed_up" | "already_current" | "error";
  minutes: number;
  error?: string;
}

function checksumOf(t: FfFullTranscript): string {
  const dur = t.duration != null ? Math.round(t.duration * 100) / 100 : 0;
  const n = (t.sentences ?? []).length;
  return `${dur}:${n}`;
}

export async function backupMeeting(
  sb: SupabaseClient,
  drive: DriveClient,
  folders: BackupFolders,
  id: string,
  existingChecksum: string | null,
): Promise<BackupOutcome> {
  let t: FfFullTranscript;
  try {
    t = await getFirefliesFullTranscript(id);
  } catch (e) {
    const fe = e as FirefliesError;
    throw fe; // let caller stop the run on rate-limit
  }

  const checksum = checksumOf(t);
  const minutes = t.duration ?? 0;
  const title = sanitize(t.title);

  // Idempotent: if we already have this exact version on Drive, skip re-upload.
  if (existingChecksum && existingChecksum === checksum) {
    return { id, title: t.title ?? title, status: "already_current", minutes };
  }

  const iso = (t.date ? new Date(t.date) : new Date(0)).toISOString().replace(/[:]/g, "-");
  const base = `${title}-transcript-${iso}-${id}`;
  const fullName = `${(t.date ? new Date(t.date) : new Date(0)).toISOString().slice(0, 10)}_${title}_${id}.json`;

  const [tr, su, fu] = await Promise.all([
    uploadRaw(drive, folders.transcripts, `${base}.json`, "application/json", buildLiveTranscript(t.sentences)),
    uploadRaw(drive, folders.summaries, `${base}.md`, "text/markdown", buildSummaryMd(t)),
    uploadRaw(drive, folders.fullJson, fullName, "application/json", JSON.stringify(t, null, 2)),
  ]);

  // Link the manifest row back to the digested source, when present.
  let sourceId: string | null = null;
  try {
    const { data } = await sb.from("sources").select("id").eq("source_external_id", id).maybeSingle();
    sourceId = (data as { id: string } | null)?.id ?? null;
  } catch { /* non-fatal */ }

  const meetingDate = t.date ? new Date(t.date).toISOString().slice(0, 10) : null;
  const { error } = await sb.from("meeting_backups").upsert(
    {
      fireflies_id: id,
      title: t.title ?? null,
      meeting_date: meetingDate,
      duration_min: t.duration ?? null,
      sentence_count: (t.sentences ?? []).length,
      checksum,
      drive_folder: BACKUP_FOLDER_NAME,
      drive_transcript_id: tr.id,
      drive_summary_id: su.id,
      drive_fulljson_id: fu.id,
      drive_transcript_link: tr.link,
      source_id: sourceId,
      backed_up_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "fireflies_id" },
  );
  if (error) return { id, title: t.title ?? title, status: "error", minutes, error: error.message };

  return { id, title: t.title ?? title, status: "backed_up", minutes };
}

// ─── Reconcile ───────────────────────────────────────────────────────────────

export interface ReconcileResult {
  ok: boolean;
  execute: boolean;
  window_days: number;
  listed: number;
  already_backed_up: number;
  missing: number;
  backed_up_now: number;
  errors: string[];
  rate_limited: boolean;
  remaining_after_cap: number;
  missing_sample: { id: string; title: string | null; date: string | null }[];
}

/**
 * List Fireflies for the last `days`, diff against the manifest, and back up
 * anything missing or changed (up to `cap` per run to respect rate limits).
 * `execute=false` (default) reports what WOULD be backed up without writing.
 */
export async function reconcile(opts: { days?: number; cap?: number; execute?: boolean }): Promise<ReconcileResult> {
  const days = opts.days ?? 120;
  const cap = opts.cap ?? 24; // fits the edge timeout at concurrency 3 (~5s/meeting)
  const execute = opts.execute ?? false;

  const now = Date.now();
  const fromIso = new Date(now - days * 86_400_000).toISOString();
  const toIso = new Date(now).toISOString();

  const sb = getSupabaseServerClient();
  const listed = await listFirefliesMeetings(fromIso, toIso);

  // Current manifest state for the listed ids.
  const ids = listed.map((m) => m.id);
  const manifest = new Map<string, string | null>();
  if (ids.length) {
    const { data } = await sb.from("meeting_backups").select("fireflies_id, checksum").in("fireflies_id", ids);
    for (const r of (data ?? []) as { fireflies_id: string; checksum: string | null }[]) {
      manifest.set(r.fireflies_id, r.checksum);
    }
  }

  // A meeting needs backup if it's not in the manifest at all. (Checksum drift
  // is caught inside backupMeeting once we fetch the full transcript.)
  const missing = listed.filter((m) => !manifest.has(m.id));

  const result: ReconcileResult = {
    ok: true,
    execute,
    window_days: days,
    listed: listed.length,
    already_backed_up: listed.length - missing.length,
    missing: missing.length,
    backed_up_now: 0,
    errors: [],
    rate_limited: false,
    remaining_after_cap: Math.max(0, missing.length - cap),
    missing_sample: missing.slice(0, 25).map((m) => ({
      id: m.id,
      title: m.title,
      date: m.date ? new Date(m.date).toISOString().slice(0, 10) : null,
    })),
  };

  if (!execute || missing.length === 0) return result;

  const folders = await resolveBackupFolders();
  if (!folders) {
    result.ok = false;
    result.errors.push("DRIVE_OAUTH_* not configured — cannot write to Drive");
    return result;
  }
  const drive = getDriveClientOAuth()!;

  // Back up in small concurrent batches: one meeting is a full-transcript
  // fetch + 3 Drive uploads (~5s each), so sequential is too slow to fit under
  // the edge timeout. Concurrency 3 roughly triples throughput per request.
  const targets = missing.slice(0, cap);
  const CONCURRENCY = 3;
  batches: for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const group = targets.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      group.map((m) => backupMeeting(sb, drive, folders, m.id, manifest.get(m.id) ?? null)),
    );
    for (let k = 0; k < settled.length; k++) {
      const s = settled[k];
      if (s.status === "fulfilled") {
        if (s.value.status === "backed_up") result.backed_up_now++;
        else if (s.value.status === "error") result.errors.push(`${s.value.title}: ${s.value.error}`);
      } else {
        const fe = s.reason as FirefliesError;
        if (fe?.rateLimited) {
          result.rate_limited = true;
          result.errors.push("Fireflies rate limit hit — stopping; will resume next run");
          break batches;
        }
        result.errors.push(`${group[k].id}: ${fe?.message ?? String(fe)}`);
      }
    }
  }
  result.remaining_after_cap = Math.max(0, missing.length - result.backed_up_now);
  return result;
}

// ─── Status report ───────────────────────────────────────────────────────────

export interface StatusReport {
  retention_days: number;
  backed_up_total: number;
  eligible_to_delete: number;
  eligible_minutes: number;
  already_deleted: number;
  cutoff_date: string;
  eligible_sample: { id: string; title: string | null; date: string | null; minutes: number }[];
}

/**
 * Read-only picture for the 30-day review: what is safely on Drive and old
 * enough to prune from Fireflies. Nothing here deletes.
 */
export async function statusReport(retentionDays = RETENTION_DAYS): Promise<StatusReport> {
  const sb = getSupabaseServerClient();
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString().slice(0, 10);

  const { data: backed } = await sb
    .from("meeting_backups")
    .select("fireflies_id, title, meeting_date, duration_min, backed_up_at, deleted_from_fireflies_at")
    .not("backed_up_at", "is", null);

  const rows = (backed ?? []) as {
    fireflies_id: string;
    title: string | null;
    meeting_date: string | null;
    duration_min: number | null;
    deleted_from_fireflies_at: string | null;
  }[];

  const live = rows.filter((r) => !r.deleted_from_fireflies_at);
  const eligible = live.filter((r) => r.meeting_date && r.meeting_date < cutoff);
  const eligibleMinutes = eligible.reduce((s, r) => s + (r.duration_min ?? 0), 0);

  return {
    retention_days: retentionDays,
    backed_up_total: rows.length,
    eligible_to_delete: eligible.length,
    eligible_minutes: Math.round(eligibleMinutes),
    already_deleted: rows.filter((r) => r.deleted_from_fireflies_at).length,
    cutoff_date: cutoff,
    eligible_sample: eligible
      .sort((a, b) => (a.meeting_date ?? "").localeCompare(b.meeting_date ?? ""))
      .slice(0, 25)
      .map((r) => ({ id: r.fireflies_id, title: r.title, date: r.meeting_date, minutes: Math.round(r.duration_min ?? 0) })),
  };
}

// ─── Capture reconcile (Calendar ↔ Fireflies) ────────────────────────────────
// The transcript is the source of truth for "a meeting happened". The calendar
// is used ONE way only — to catch a scheduled meeting that was never captured.
// Every meeting sorts into one of three buckets:
//   matched      — transcript + calendar event (calendar enriches it)
//   spontaneous  — transcript, no calendar event  → first-class, just labelled
//   capture_gap  — calendar event, no transcript  → the only real alert

const MATCH_WINDOW_MS = 30 * 60_000; // ±30 min between event_start and transcript

export interface MiniMeeting { id: string; title: string | null; date: string | null; minutes: number }
export interface CaptureGap { event_id: string; title: string | null; event_start: string; attendees: string[] }
export interface CaptureMatch {
  window_days: number;
  calendar_count: number;
  fireflies_count: number;
  matched: number;
  spontaneous: MiniMeeting[];
  capture_gaps: CaptureGap[];
}

interface CalRow {
  event_id: string;
  event_start: string;
  event_title: string | null;
  attendee_emails: string[] | null;
  is_cancelled: boolean | null;
  attendee_statuses: Record<string, string> | null;
}

export async function computeCaptureMatch(days = 45): Promise<CaptureMatch> {
  const now = Date.now();
  const fromIso = new Date(now - days * 86_400_000).toISOString();
  const toIso = new Date(now).toISOString();

  const sb = getSupabaseServerClient();
  const [ff, calRes, selfEmails] = await Promise.all([
    listFirefliesMeetings(fromIso, toIso),
    sb
      .from("hall_calendar_events")
      .select("event_id, event_start, event_title, attendee_emails, is_cancelled, attendee_statuses")
      .gte("event_start", fromIso)
      .lte("event_start", toIso),
    getSelfEmails(),
  ]);

  const cal = (calRes.data ?? []) as CalRow[];

  // A calendar event counts as a "real meeting" worth capturing when it is not
  // cancelled, Jose did not decline it, and it has at least one non-self
  // attendee (excludes focus blocks / personal holds).
  const declined = (c: CalRow): boolean => {
    const st = c.attendee_statuses ?? {};
    for (const e of selfEmails) if ((st[e] ?? "").toLowerCase() === "declined") return true;
    return false;
  };
  const externalCount = (c: CalRow): number =>
    (c.attendee_emails ?? []).filter((e) => e && !selfEmails.has(e.toLowerCase())).length;

  const realMeetings = cal.filter((c) => !c.is_cancelled && !declined(c) && externalCount(c) >= 1);

  const ffTimes = ff.map((m) => ({ ...m, ms: m.date ? Number(m.date) : 0 }));

  // capture_gaps: real calendar meetings with no transcript within ±30 min.
  const usedFf = new Set<string>();
  const capture_gaps: CaptureGap[] = [];
  for (const c of realMeetings) {
    const startMs = new Date(c.event_start).getTime();
    const hit = ffTimes.find((m) => Math.abs(m.ms - startMs) <= MATCH_WINDOW_MS);
    if (hit) usedFf.add(hit.id);
    else
      capture_gaps.push({
        event_id: c.event_id,
        title: c.event_title,
        event_start: c.event_start,
        attendees: (c.attendee_emails ?? []).filter((e) => e && !selfEmails.has(e.toLowerCase())),
      });
  }

  // spontaneous: transcripts with no calendar event (any, not just "real")
  // within ±30 min — genuine ad-hoc / desktop-recorded meetings.
  const allCalMs = cal.map((c) => new Date(c.event_start).getTime());
  const spontaneous: MiniMeeting[] = ffTimes
    .filter((m) => !allCalMs.some((t) => Math.abs(m.ms - t) <= MATCH_WINDOW_MS))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 50)
    .map((m) => ({ id: m.id, title: m.title, date: m.date ? new Date(m.date).toISOString().slice(0, 10) : null, minutes: Math.round(m.duration ?? 0) }));

  return {
    window_days: days,
    calendar_count: realMeetings.length,
    fireflies_count: ff.length,
    matched: usedFf.size,
    spontaneous,
    capture_gaps: capture_gaps.sort((a, b) => b.event_start.localeCompare(a.event_start)),
  };
}

// ─── Ops snapshot (powers the /admin panel) ──────────────────────────────────

export interface OpsFlag {
  id: string; kind: string; ref: string | null; title: string | null;
  question: string | null; status: string; created_at: string;
}
export interface OpsSnapshot {
  generated_at: string;
  snapshot_age: string | null;
  capture: CaptureMatch | null;
  prune: StatusReport;
  backup: { backed_up_total: number; window_backed_up: number };
  flags: OpsFlag[];
}

/** Daily job: recompute the capture match + health and cache it for the panel. */
export async function runCaptureReconcile(days = 45): Promise<CaptureMatch> {
  const capture = await computeCaptureMatch(days);
  const sb = getSupabaseServerClient();
  const snapshot = { generated_at: new Date().toISOString(), capture };
  await sb.from("fireflies_backup_state").upsert(
    { id: "latest", snapshot, updated_at: new Date().toISOString() },
    { onConflict: "id" },
  );
  return capture;
}

/** Read the whole operational picture for the panel (fast — no live FF calls). */
export async function getOpsSnapshot(): Promise<OpsSnapshot> {
  const sb = getSupabaseServerClient();
  const [{ data: stateRow }, prune, { data: flagRows }, { count: total }] = await Promise.all([
    sb.from("fireflies_backup_state").select("snapshot, updated_at").eq("id", "latest").maybeSingle(),
    statusReport(),
    sb.from("fireflies_backup_flags").select("id, kind, ref, title, question, status, created_at").eq("status", "open").order("created_at", { ascending: false }),
    sb.from("meeting_backups").select("fireflies_id", { count: "exact", head: true }).not("backed_up_at", "is", null),
  ]);

  const snap = (stateRow as { snapshot?: { capture?: CaptureMatch } } | null)?.snapshot ?? {};
  return {
    generated_at: new Date().toISOString(),
    snapshot_age: (stateRow as { updated_at?: string } | null)?.updated_at ?? null,
    capture: snap.capture ?? null,
    prune,
    backup: { backed_up_total: total ?? 0, window_backed_up: 0 },
    flags: (flagRows ?? []) as OpsFlag[],
  };
}

// ─── Prune (delete from Fireflies) — human-gated ─────────────────────────────

async function ffDeleteTranscript(id: string): Promise<void> {
  const query = `mutation Del($id: String!) { deleteTranscript(id: $id) { title } }`;
  await ffQuery(query, { id });
}

export interface PruneResult {
  execute: boolean;
  requested: number;
  processed: { id: string; title: string | null; minutes: number }[];
  skipped: { id: string; reason: string }[];
  minutes_freed: number;
  remaining: number;
  rate_capped: boolean;
}

/**
 * Delete approved meetings from Fireflies. Triple gate per id: backed up on
 * Drive + older than retention + not already deleted. `execute=false` (default)
 * reports exactly what WOULD happen without touching Fireflies. On real
 * deletion it repoints sources.source_url to the Drive copy so UI links survive.
 */
export async function pruneMeetings(opts: { ids: string[]; execute?: boolean }): Promise<PruneResult> {
  const execute = opts.execute ?? false;
  const ids = Array.from(new Set(opts.ids ?? [])).slice(0, 200);
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString().slice(0, 10);
  const DELETE_CAP = 8; // Fireflies deleteTranscript: 10/min — stay under it.

  const sb = getSupabaseServerClient();
  const result: PruneResult = {
    execute, requested: ids.length, processed: [], skipped: [], minutes_freed: 0, remaining: 0, rate_capped: false,
  };
  if (ids.length === 0) return result;

  const { data } = await sb
    .from("meeting_backups")
    .select("fireflies_id, title, meeting_date, duration_min, backed_up_at, deleted_from_fireflies_at, drive_transcript_link, source_id")
    .in("fireflies_id", ids);
  const rows = (data ?? []) as {
    fireflies_id: string; title: string | null; meeting_date: string | null; duration_min: number | null;
    backed_up_at: string | null; deleted_from_fireflies_at: string | null; drive_transcript_link: string | null; source_id: string | null;
  }[];
  const byId = new Map(rows.map((r) => [r.fireflies_id, r]));

  const eligible: typeof rows = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) { result.skipped.push({ id, reason: "not in backup manifest" }); continue; }
    if (!r.backed_up_at) { result.skipped.push({ id, reason: "not backed up to Drive" }); continue; }
    if (!r.meeting_date || r.meeting_date >= cutoff) { result.skipped.push({ id, reason: `newer than retention (${cutoff})` }); continue; }
    if (r.deleted_from_fireflies_at) { result.skipped.push({ id, reason: "already deleted" }); continue; }
    eligible.push(r);
  }

  if (!execute) {
    result.processed = eligible.map((r) => ({ id: r.fireflies_id, title: r.title, minutes: Math.round(r.duration_min ?? 0) }));
    result.minutes_freed = eligible.reduce((s, r) => s + Math.round(r.duration_min ?? 0), 0);
    return result;
  }

  for (const r of eligible) {
    if (result.processed.length >= DELETE_CAP) { result.rate_capped = true; break; }
    try {
      await ffDeleteTranscript(r.fireflies_id);
      // Repoint the digested source's link to the Drive copy so UI links survive.
      if (r.source_id && r.drive_transcript_link) {
        await sb.from("sources").update({ source_url: r.drive_transcript_link, updated_at: new Date().toISOString() }).eq("id", r.source_id);
      }
      await sb.from("meeting_backups").update({ deleted_from_fireflies_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("fireflies_id", r.fireflies_id);
      result.processed.push({ id: r.fireflies_id, title: r.title, minutes: Math.round(r.duration_min ?? 0) });
      result.minutes_freed += Math.round(r.duration_min ?? 0);
    } catch (e) {
      const fe = e as FirefliesError;
      if (fe.rateLimited) { result.rate_capped = true; break; }
      result.skipped.push({ id: r.fireflies_id, reason: fe.message });
    }
  }
  result.remaining = eligible.length - result.processed.length;
  return result;
}

/** Resolve or dismiss a flag the agent raised. */
export async function resolveFlag(id: string, resolution: string, status: "resolved" | "dismissed" = "resolved"): Promise<void> {
  const sb = getSupabaseServerClient();
  await sb.from("fireflies_backup_flags").update({ status, resolution, resolved_at: new Date().toISOString() }).eq("id", id);
}
