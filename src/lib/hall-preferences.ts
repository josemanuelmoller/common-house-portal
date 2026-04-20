/**
 * hall-preferences.ts
 *
 * Per-user Hall scheduling preferences, with safe defaults. Used by Suggested
 * Time Blocks and any future Hall feature that depends on working-hours +
 * calendar policy.
 *
 * Read path: getHallPreferences(email) — always returns a filled record by
 * merging the row (if any) with DEFAULTS. Missing row ⇒ defaults. Read errors
 * ⇒ defaults (never blocks the feature).
 *
 * Write path: saveHallPreferences(email, patch) — upserts a subset of fields.
 * Not yet wired to a UI; the table exists so preferences can be edited
 * directly in Supabase until a settings surface is added.
 */

import { getSupabaseServerClient } from "./supabase-server";

export type HallPreferences = {
  working_day_start:            number;          // hour 0–23
  working_day_end:              number;          // hour 1–24
  working_days:                 number[];        // 0=Sun … 6=Sat (ISO Monday=1 convention)
  min_slot_minutes:             number;
  prefer_morning_for_deep_work: boolean;
  timezone:                     string;
  lunch_start_hour:             number;
  lunch_start_min:              number;
  lunch_end_hour:               number;
  lunch_end_min:                number;
  meeting_buffer_minutes:       number;
};

export const HALL_PREFS_DEFAULTS: HallPreferences = {
  working_day_start:            9,
  working_day_end:              18,
  working_days:                 [1, 2, 3, 4, 5],
  min_slot_minutes:             20,
  prefer_morning_for_deep_work: true,
  timezone:                     process.env.HALL_TIMEZONE || "America/Costa_Rica",
  lunch_start_hour:             12,
  lunch_start_min:              30,
  lunch_end_hour:               13,
  lunch_end_min:                30,
  meeting_buffer_minutes:       10,
};

export async function getHallPreferences(userEmail: string): Promise<HallPreferences> {
  if (!userEmail) return HALL_PREFS_DEFAULTS;
  try {
    const sb = getSupabaseServerClient();
    const { data, error } = await sb
      .from("hall_preferences")
      .select("working_day_start,working_day_end,working_days,min_slot_minutes,prefer_morning_for_deep_work,timezone,lunch_start_hour,lunch_start_min,lunch_end_hour,lunch_end_min,meeting_buffer_minutes")
      .eq("user_email", userEmail)
      .maybeSingle();
    if (error || !data) return HALL_PREFS_DEFAULTS;
    return {
      ...HALL_PREFS_DEFAULTS,
      ...(data as Partial<HallPreferences>),
    };
  } catch {
    return HALL_PREFS_DEFAULTS;
  }
}

export async function saveHallPreferences(userEmail: string, patch: Partial<HallPreferences>): Promise<void> {
  if (!userEmail) return;
  const sb = getSupabaseServerClient();
  await sb
    .from("hall_preferences")
    .upsert({ user_email: userEmail, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_email" });
}
