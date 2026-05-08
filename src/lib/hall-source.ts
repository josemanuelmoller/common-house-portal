/**
 * hall-source.ts — fallback observability for Hall data routes.
 *
 * Per CLAUDE.md: "Any code path that falls back from a primary data source
 * to a secondary one must emit a visible warning in runtime logs and make
 * the fallback detectable during debugging."
 *
 * Hall API routes call `recordHallSource()` to attach a `_source` marker to
 * their JSON response. Client components use `<DataSourceBadge>` to render
 * it visibly on admin surfaces.
 */

export type HallSourceTier =
  /** Canonical Supabase table read — preferred path. */
  | "supabase"
  /** Notion mirror table read — transitional, removed at 2026-06-02 cutoff. */
  | "notion-mirror"
  /** Direct Notion API read — degraded mode, slow. */
  | "notion-fallback"
  /** Loops engine — for journey-driven content. */
  | "loop-engine"
  /** Unknown / mixed — multi-source view that did not pick one tier. */
  | "mixed";

export type HallSourceMeta = {
  source: HallSourceTier;
  /** Free-text detail visible in admin tooltips and runtime logs. */
  detail?: string;
  /** Optional list of secondary sources used as fallback in this response. */
  fallbacks?: HallSourceTier[];
  /** Timestamp the data was assembled. */
  recorded_at: string;
};

const FALLBACK_TIERS: HallSourceTier[] = ["notion-mirror", "notion-fallback"];

/**
 * Build the `_source` marker for a Hall API response and emit a warning to
 * the runtime log when the primary read failed and a fallback was used.
 */
export function recordHallSource(input: {
  primary: HallSourceTier;
  detail?: string;
  fallbacks?: HallSourceTier[];
}): HallSourceMeta {
  const usedFallback = (input.fallbacks ?? []).some(t => FALLBACK_TIERS.includes(t));
  if (usedFallback) {
    console.warn(
      "[hall-source] degraded path — primary:",
      input.primary,
      "fallbacks:",
      input.fallbacks,
      input.detail ? `detail: ${input.detail}` : "",
    );
  }
  return {
    source: input.primary,
    detail: input.detail,
    fallbacks: input.fallbacks,
    recorded_at: new Date().toISOString(),
  };
}

/** Tier ranking used to pick the "winning" source when multiple modules
 *  contribute. Lower index = stronger signal. */
const TIER_RANK: Record<HallSourceTier, number> = {
  supabase:        0,
  "loop-engine":   1,
  "notion-mirror": 2,
  "notion-fallback": 3,
  mixed:           4,
};

/** Combine multiple per-module markers into one parent marker. The parent
 *  inherits the WORST tier used by any module, so a single notion-fallback
 *  surfaces in the parent badge. */
export function rollupHallSource(parts: HallSourceMeta[]): HallSourceMeta {
  if (parts.length === 0) {
    return { source: "supabase", recorded_at: new Date().toISOString() };
  }
  const worst = parts.reduce((acc, p) =>
    TIER_RANK[p.source] > TIER_RANK[acc.source] ? p : acc,
  );
  const allFallbacks = parts.flatMap(p => p.fallbacks ?? []);
  return {
    source: worst.source,
    detail: parts.length === 1 ? worst.detail : `${parts.length} modules; worst: ${worst.source}`,
    fallbacks: allFallbacks.length > 0 ? Array.from(new Set(allFallbacks)) : undefined,
    recorded_at: new Date().toISOString(),
  };
}
