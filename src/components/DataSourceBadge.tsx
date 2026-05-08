/**
 * Small visible indicator of which data source backed the current view.
 * Per CLAUDE.md: "For critical Hall surfaces, prefer a visible source
 * indicator when feasible".
 *
 * Render at the top of admin pages that read from the Hall data layer.
 */

import type { HallSourceTier, HallSourceMeta } from "@/lib/hall-source";

const TIER_LABEL: Record<HallSourceTier, { label: string; tone: "ok" | "warn" | "info" | "muted" }> = {
  supabase:          { label: "Supabase",       tone: "ok" },
  "loop-engine":     { label: "Loop engine",    tone: "info" },
  "notion-mirror":   { label: "Notion mirror",  tone: "warn" },
  "notion-fallback": { label: "Notion fallback", tone: "warn" },
  mixed:             { label: "Mixed",          tone: "muted" },
};

const TONE_CLASSES: Record<"ok" | "warn" | "info" | "muted", string> = {
  ok:    "text-[var(--hall-ink-1)] border border-[var(--hall-ink-3)]",
  warn:  "text-amber-700 border border-amber-300 bg-amber-50",
  info:  "text-[var(--hall-ink-1)] border border-[var(--hall-ink-3)] bg-[var(--hall-cream-1)]",
  muted: "text-[var(--hall-ink-2)] border border-[var(--hall-ink-3)]",
};

type Props = {
  meta: HallSourceMeta;
  className?: string;
};

export function DataSourceBadge({ meta, className }: Props) {
  const { label, tone } = TIER_LABEL[meta.source] ?? TIER_LABEL.mixed;
  const tooltip = [
    `Source: ${label}`,
    meta.detail ? meta.detail : null,
    meta.fallbacks && meta.fallbacks.length > 0
      ? `Fallbacks used: ${meta.fallbacks.join(", ")}`
      : null,
    `Assembled: ${new Date(meta.recorded_at).toLocaleString()}`,
  ].filter(Boolean).join("\n");
  return (
    <span
      title={tooltip}
      className={[
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-[var(--font-hall-mono)] uppercase tracking-wide",
        TONE_CLASSES[tone],
        className ?? "",
      ].join(" ")}
    >
      <span aria-hidden>·</span>
      <span>Source: {label}</span>
    </span>
  );
}
