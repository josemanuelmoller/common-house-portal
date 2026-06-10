/**
 * hall-config.ts — operator-tunable configuration that previously lived as
 * hardcoded literals scattered across route files (founder-owned track
 * patterns in sync-loops, default timezone in prep-brief, …).
 *
 * One jsonb value per key in public.hall_config. Reads are cached in-memory
 * for 5 minutes — config changes (rare) propagate on the next cold read;
 * hot loops never pay a SELECT per item. Every getter falls back to its
 * compiled default when the table is unreachable, so config can never take
 * a surface down.
 */

import { getSupabaseServerClient } from "./supabase-server";

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: unknown; loadedAt: number }>();

export async function getHallConfig<T>(key: string, fallback: T): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.loadedAt < TTL_MS) return hit.value as T;
  try {
    const sb = getSupabaseServerClient();
    const { data } = await sb
      .from("hall_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const value = (data?.value ?? fallback) as T;
    cache.set(key, { value, loadedAt: Date.now() });
    return value;
  } catch {
    return fallback;
  }
}

// ── Typed accessors for the known keys ──────────────────────────────────────

/** Compiled defaults mirror the pre-config hardcoded values. */
const DEFAULT_FOUNDER_PATTERNS = [
  "\\bcop\\s*31\\b",
  "zero\\s*waste\\s*forum",
  "\\bzwf\\b",
  "zero\\s*waste\\s*districts?",
  "china\\s*zero\\s*waste",
  "egypt.*reuse|reuse.*egypt",
  "reuse\\s*for\\s*all",
];

/** Strategic tracks Jose leads directly — matched against entity names. */
export async function getFounderOwnedPatterns(): Promise<RegExp[]> {
  const sources = await getHallConfig<string[]>("founder_owned_patterns", DEFAULT_FOUNDER_PATTERNS);
  const out: RegExp[] = [];
  for (const s of sources) {
    try {
      out.push(new RegExp(s, "i"));
    } catch {
      // A malformed pattern in config must not kill the whole list.
      console.warn(`[hall-config] invalid founder_owned_pattern skipped: ${s}`);
    }
  }
  return out;
}

export async function getDefaultTimezone(): Promise<string> {
  return getHallConfig<string>("default_timezone", "Europe/London");
}
