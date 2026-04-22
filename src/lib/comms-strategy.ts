/**
 * Comms Strategy — Supabase-native access layer.
 *
 * Reads the slow-moving strategy (pillars, audiences, channels) and the monthly
 * pitch queue. Writes happen from two places:
 *   - `propose-content-pitches` skill (creates pitches at status=proposed)
 *   - `/api/approve-pitch` route (moves a pitch to approved/rejected/skipped)
 *
 * Source of truth is Supabase. Notion stores only the redacted drafts in Agent
 * Drafts [OS v2] once a pitch is approved and redacted.
 */

import { supabaseAdmin } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PillarTier = "core" | "building" | "experimental";

export type Pillar = {
  id: string;
  name: string;
  tier: PillarTier;
  description: string | null;
  active: boolean;
  display_order: number;
};

export type Audience = {
  id: string;
  name: string;
  priority: number;
  description: string | null;
  active: boolean;
};

export type Channel = {
  id: string;
  name: string;
  platform: string;
  monthly_cadence: number;
  format_mix: Record<string, number>;
  voice_rules: string | null;
  active: boolean;
};

export type PitchStatus =
  | "proposed"
  | "approved"
  | "drafting"
  | "drafted"
  | "published"
  | "skipped"
  | "rejected";

export type ContentPitch = {
  id: string;
  proposed_for_date: string;          // ISO date
  pillar_id: string | null;
  audience_id: string | null;
  channel_id: string | null;
  trigger: string | null;
  angle: string;
  headline: string | null;
  status: PitchStatus;
  draft_notion_id: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
};

// A pitch joined with the human-readable pillar / audience / channel names —
// what the UI and skills actually want to work with.
export type PitchWithContext = ContentPitch & {
  pillar_name: string | null;
  pillar_tier: PillarTier | null;
  audience_name: string | null;
  channel_name: string | null;
};

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function getActivePillars(): Promise<Pillar[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("comms_pillars")
    .select("id, name, tier, description, active, display_order")
    .eq("active", true)
    .order("display_order", { ascending: true });
  if (error || !data) return [];
  return data as Pillar[];
}

export async function getActiveAudiences(): Promise<Audience[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("comms_audiences")
    .select("id, name, priority, description, active")
    .eq("active", true)
    .order("priority", { ascending: true });
  if (error || !data) return [];
  return data as Audience[];
}

export async function getActiveChannels(): Promise<Channel[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("comms_channels")
    .select("id, name, platform, monthly_cadence, format_mix, voice_rules, active")
    .eq("active", true);
  if (error || !data) return [];
  return data as Channel[];
}

/**
 * Pitches for a date window, joined with pillar/audience/channel names.
 * Default window = today → +30 days.
 */
export async function getPitchesForWindow(
  fromDate?: string,
  toDate?: string
): Promise<PitchWithContext[]> {
  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const from = fromDate ?? today;
  const to   = toDate   ?? in30;

  const { data, error } = await sb
    .from("content_pitches")
    .select(`
      id, proposed_for_date, pillar_id, audience_id, channel_id,
      trigger, angle, headline, status, draft_notion_id, rejected_reason,
      created_at, updated_at,
      comms_pillars(name, tier),
      comms_audiences(name),
      comms_channels(name)
    `)
    .gte("proposed_for_date", from)
    .lte("proposed_for_date", to)
    .order("proposed_for_date", { ascending: true });

  if (error || !data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(row => ({
    id:                row.id,
    proposed_for_date: row.proposed_for_date,
    pillar_id:         row.pillar_id,
    audience_id:       row.audience_id,
    channel_id:        row.channel_id,
    trigger:           row.trigger,
    angle:             row.angle,
    headline:          row.headline,
    status:            row.status,
    draft_notion_id:   row.draft_notion_id,
    rejected_reason:   row.rejected_reason,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
    pillar_name:       row.comms_pillars?.name   ?? null,
    pillar_tier:       row.comms_pillars?.tier   ?? null,
    audience_name:     row.comms_audiences?.name ?? null,
    channel_name:      row.comms_channels?.name  ?? null,
  }));
}

export async function getPitchById(id: string): Promise<PitchWithContext | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("content_pitches")
    .select(`
      id, proposed_for_date, pillar_id, audience_id, channel_id,
      trigger, angle, headline, status, draft_notion_id, rejected_reason,
      created_at, updated_at,
      comms_pillars(name, tier),
      comms_audiences(name),
      comms_channels(name)
    `)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  return {
    id:                row.id,
    proposed_for_date: row.proposed_for_date,
    pillar_id:         row.pillar_id,
    audience_id:       row.audience_id,
    channel_id:        row.channel_id,
    trigger:           row.trigger,
    angle:             row.angle,
    headline:          row.headline,
    status:            row.status,
    draft_notion_id:   row.draft_notion_id,
    rejected_reason:   row.rejected_reason,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
    pillar_name:       row.comms_pillars?.name   ?? null,
    pillar_tier:       row.comms_pillars?.tier   ?? null,
    audience_name:     row.comms_audiences?.name ?? null,
    channel_name:      row.comms_channels?.name  ?? null,
  };
}

// ─── Writes ───────────────────────────────────────────────────────────────────

export type NewPitch = {
  proposed_for_date: string;
  pillar_id: string | null;
  audience_id: string | null;
  channel_id: string | null;
  trigger?: string | null;
  angle: string;
  headline?: string | null;
};

export async function insertPitches(pitches: NewPitch[]): Promise<number> {
  if (pitches.length === 0) return 0;
  const sb = supabaseAdmin();
  const { error, count } = await sb
    .from("content_pitches")
    .insert(pitches, { count: "exact" });
  if (error) throw new Error(`insertPitches: ${error.message}`);
  return count ?? pitches.length;
}

export async function updatePitchStatus(
  id: string,
  status: PitchStatus,
  extra: { draft_notion_id?: string | null; rejected_reason?: string | null } = {}
): Promise<void> {
  const sb = supabaseAdmin();
  const payload: Record<string, unknown> = { status };
  if (extra.draft_notion_id !== undefined) payload.draft_notion_id = extra.draft_notion_id;
  if (extra.rejected_reason !== undefined) payload.rejected_reason = extra.rejected_reason;
  const { error } = await sb
    .from("content_pitches")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(`updatePitchStatus: ${error.message}`);
}

export async function updatePitchAngle(id: string, angle: string, headline?: string | null): Promise<void> {
  const sb = supabaseAdmin();
  const payload: Record<string, unknown> = { angle: angle.slice(0, 1000) };
  if (headline !== undefined) payload.headline = headline?.slice(0, 200) ?? null;
  const { error } = await sb
    .from("content_pitches")
    .update(payload)
    .eq("id", id);
  if (error) throw new Error(`updatePitchAngle: ${error.message}`);
}

// ─── Outcomes (post-publication feedback loop) ────────────────────────────────

export type PitchOutcome = {
  pitch_id:         string;
  published_at:     string | null;
  impressions:      number | null;
  comments_count:   number | null;
  dms_received:     number | null;
  worth_repeating:  boolean | null;
  notes:            string | null;
};

export async function upsertPitchOutcome(
  pitchId: string,
  outcome: Partial<Omit<PitchOutcome, "pitch_id">>
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from("content_pitch_outcomes")
    .upsert({ pitch_id: pitchId, ...outcome }, { onConflict: "pitch_id" });
  if (error) throw new Error(`upsertPitchOutcome: ${error.message}`);
}

export async function getOutcomesForPitches(pitchIds: string[]): Promise<Map<string, PitchOutcome>> {
  if (pitchIds.length === 0) return new Map();
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("content_pitch_outcomes")
    .select("pitch_id, published_at, impressions, comments_count, dms_received, worth_repeating, notes")
    .in("pitch_id", pitchIds);
  if (error || !data) return new Map();
  return new Map((data as PitchOutcome[]).map(o => [o.pitch_id, o]));
}

// ─── Recent published pitches (anti-repetition context for the generator) ────

export async function getRecentlyPublishedPitches(days = 60, limit = 20): Promise<PitchWithContext[]> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const { data, error } = await sb
    .from("content_pitches")
    .select(`
      id, proposed_for_date, pillar_id, audience_id, channel_id,
      trigger, angle, headline, status, draft_notion_id, rejected_reason,
      created_at, updated_at,
      comms_pillars(name, tier),
      comms_audiences(name),
      comms_channels(name)
    `)
    .in("status", ["published", "drafted"])
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map(row => ({
    id:                row.id,
    proposed_for_date: row.proposed_for_date,
    pillar_id:         row.pillar_id,
    audience_id:       row.audience_id,
    channel_id:        row.channel_id,
    trigger:           row.trigger,
    angle:             row.angle,
    headline:          row.headline,
    status:            row.status,
    draft_notion_id:   row.draft_notion_id,
    rejected_reason:   row.rejected_reason,
    created_at:        row.created_at,
    updated_at:        row.updated_at,
    pillar_name:       row.comms_pillars?.name   ?? null,
    pillar_tier:       row.comms_pillars?.tier   ?? null,
    audience_name:     row.comms_audiences?.name ?? null,
    channel_name:      row.comms_channels?.name  ?? null,
  }));
}
