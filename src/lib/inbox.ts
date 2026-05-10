/**
 * inbox.ts — server-side helpers for `inbox_items` (Quick Capture / Share Target).
 *
 * All functions use the service-role Supabase client. Never import this from
 * a "use client" component.
 */

import { getSupabaseServerClient } from "./supabase-server";
import { randomUUID } from "node:crypto";

export type InboxItemSource = "quick_capture" | "share_target" | "voice_capture";

export type InboxItemUserType =
  | "reminder"
  | "read-later"
  | "client-message"
  | "reference"
  | "idea"
  | "other";

export type InboxItemStatus =
  | "new"
  | "classifying"
  | "classified"
  | "needs_review"
  | "pending_action"
  | "done"
  | "archived";

export type InboxItem = {
  id: string;
  created_at: string;
  updated_at: string;
  source: InboxItemSource;
  client_capture_id: string | null;
  raw_text: string | null;
  user_notes_to_agent: string | null;
  user_type_override: InboxItemUserType | null;
  user_due_date: string | null;
  photo_path: string | null;
  audio_path: string | null;
  ocr_text: string | null;
  transcript: string | null;
  agent_type: InboxItemUserType | null;
  agent_priority: "P1" | "P2" | "P3" | null;
  agent_due_date: string | null;
  agent_linked_org_id: string | null;
  agent_linked_person_id: string | null;
  agent_linked_project_id: string | null;
  agent_confidence: number | null;
  agent_reasoning: string | null;
  agent_classified_at: string | null;
  status: InboxItemStatus;
  routed_to_table: string | null;
  routed_to_id: string | null;
  routed_at: string | null;
  user_id: string | null;
};

const INBOX_BUCKET = "inbox-captures";

const VALID_USER_TYPES: InboxItemUserType[] = [
  "reminder",
  "read-later",
  "client-message",
  "reference",
  "idea",
  "other",
];

export function isValidUserType(v: unknown): v is InboxItemUserType {
  return typeof v === "string" && (VALID_USER_TYPES as string[]).includes(v);
}

const VALID_STATUSES: InboxItemStatus[] = [
  "new",
  "classifying",
  "classified",
  "needs_review",
  "pending_action",
  "done",
  "archived",
];

export function isValidStatus(v: unknown): v is InboxItemStatus {
  return typeof v === "string" && (VALID_STATUSES as string[]).includes(v);
}

/**
 * Upload a media file to the inbox-captures Storage bucket.
 * Returns the storage path (not a URL — read paths sign on demand).
 */
export async function uploadInboxMedia(
  file: File,
  userId: string | null,
  kind: "photo" | "audio"
): Promise<{ path: string | null; error: string | null }> {
  try {
    const sb = getSupabaseServerClient();
    const ext = guessExt(file, kind);
    const safeUser = (userId || "anon").replace(/[^A-Za-z0-9_-]/g, "_");
    const path = `${safeUser}/${kind}/${Date.now()}-${randomUUID()}.${ext}`;

    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await sb.storage.from(INBOX_BUCKET).upload(path, buf, {
      contentType: file.type || (kind === "photo" ? "image/jpeg" : "audio/webm"),
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) return { path: null, error: error.message };
    return { path, error: null };
  } catch (err) {
    return { path: null, error: String(err) };
  }
}

function guessExt(file: File, kind: "photo" | "audio"): string {
  const fromType = (file.type || "").split("/")[1];
  if (fromType) return fromType.replace("jpeg", "jpg").replace("x-m4a", "m4a");
  return kind === "photo" ? "jpg" : "webm";
}

export type CreateInboxInput = {
  source: InboxItemSource;
  client_capture_id?: string | null;
  raw_text?: string | null;
  user_notes_to_agent?: string | null;
  user_type_override?: InboxItemUserType | null;
  user_due_date?: string | null;
  photo_path?: string | null;
  audio_path?: string | null;
  user_id?: string | null;
};

/**
 * Insert a new inbox row. Idempotent on `client_capture_id`:
 * if a row with that client id already exists, returns the existing row.
 */
export async function createInboxItem(
  input: CreateInboxInput
): Promise<{ row: InboxItem | null; error: string | null; deduplicated: boolean }> {
  try {
    const sb = getSupabaseServerClient();

    // Dedup by client_capture_id (offline queue retries)
    if (input.client_capture_id) {
      const { data: existing } = await sb
        .from("inbox_items")
        .select("*")
        .eq("client_capture_id", input.client_capture_id)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return { row: existing as InboxItem, error: null, deduplicated: true };
      }
    }

    const payload = {
      source: input.source,
      client_capture_id: input.client_capture_id ?? null,
      raw_text: input.raw_text ?? null,
      user_notes_to_agent: input.user_notes_to_agent ?? null,
      user_type_override: input.user_type_override ?? null,
      user_due_date: input.user_due_date ?? null,
      photo_path: input.photo_path ?? null,
      audio_path: input.audio_path ?? null,
      user_id: input.user_id ?? null,
      status: "new" as const,
    };

    const { data, error } = await sb
      .from("inbox_items")
      .insert(payload)
      .select("*")
      .single();

    if (error) return { row: null, error: error.message, deduplicated: false };
    return { row: data as InboxItem, error: null, deduplicated: false };
  } catch (err) {
    return { row: null, error: String(err), deduplicated: false };
  }
}

export type ListInboxFilter = {
  status?: InboxItemStatus[];
  limit?: number;
  offset?: number;
  userId?: string | null;
};

export async function listInboxItems(
  filter: ListInboxFilter = {}
): Promise<{ rows: InboxItem[]; error: string | null }> {
  try {
    const sb = getSupabaseServerClient();
    let q = sb
      .from("inbox_items")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter.status && filter.status.length > 0) {
      q = q.in("status", filter.status);
    }
    if (filter.userId) {
      q = q.eq("user_id", filter.userId);
    }
    if (filter.limit) q = q.limit(filter.limit);
    if (filter.offset)
      q = q.range(filter.offset, filter.offset + (filter.limit ?? 50) - 1);

    const { data, error } = await q;
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as InboxItem[], error: null };
  } catch (err) {
    return { rows: [], error: String(err) };
  }
}

export type UpdateInboxInput = Partial<{
  status: InboxItemStatus;
  user_type_override: InboxItemUserType | null;
  user_due_date: string | null;
  user_notes_to_agent: string | null;
  raw_text: string | null;
}>;

export async function updateInboxItem(
  id: string,
  patch: UpdateInboxInput
): Promise<{ row: InboxItem | null; error: string | null }> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("inbox_items")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) return { row: null, error: error.message };
    return { row: data as InboxItem, error: null };
  } catch (err) {
    return { row: null, error: String(err) };
  }
}

/** Generate a signed URL for a stored media path (1h expiry). */
export async function signInboxMediaUrl(
  path: string
): Promise<{ url: string | null; error: string | null }> {
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb.storage
      .from(INBOX_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (error) return { url: null, error: error.message };
    return { url: data?.signedUrl ?? null, error: null };
  } catch (err) {
    return { url: null, error: String(err) };
  }
}
