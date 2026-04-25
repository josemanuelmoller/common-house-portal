import { requireAdmin } from "@/lib/require-admin";
import { PortalShell } from "@/components/PortalShell";
import { getRecentCompetitiveIntel, getWatchlistEntities } from "@/lib/notion/competitive";
import { CompetitiveIntelClient } from "./CompetitiveIntelClient";

// Build 12-week activity buckets (index 0 = oldest, 11 = this week)
function weeklyBuckets(signals: { dateCaptured: string | null }[]): number[] {
  const now = Date.now();
  const buckets = new Array(12).fill(0);
  for (const s of signals) {
    if (!s.dateCaptured) continue;
    const daysAgo = Math.floor((now - new Date(s.dateCaptured).getTime()) / 86_400_000);
    const weekIdx = 11 - Math.floor(daysAgo / 7);
    if (weekIdx >= 0 && weekIdx < 12) buckets[weekIdx]++;
  }
  return buckets;
}

export default async function CompetitiveIntelPage() {
  await requireAdmin();

  const [signals, entities] = await Promise.all([
    getRecentCompetitiveIntel(84), // 12 weeks
    getWatchlistEntities(),
  ]);

  const newCount = signals.filter((s) => s.status === "New").length;

  // Group signals per entity for waveform cards
  const entitySignals = new Map<string, typeof signals>();
  for (const s of signals) {
    const key = s.entityName ?? "Unknown";
    if (!entitySignals.has(key)) entitySignals.set(key, []);
    entitySignals.get(key)!.push(s);
  }

  const entityStats = entities.map((e) => {
    const esigs = entitySignals.get(e.name) ?? [];
    return {
      ...e,
      totalSignals: esigs.length,
      newSignals:   esigs.filter((s) => s.status === "New").length,
      latestSignal: esigs[0] ?? null,
      weekBuckets:  weeklyBuckets(esigs),
      signals:      esigs,
    };
  });

  return (
    <PortalShell
      eyebrow={{ label: "INTELLIGENCE", accent: `${signals.length} SIGNALS · ${newCount} NEW` }}
      title="Competitive"
      flourish="radar"
      meta={
        <span
          className="text-[10px] tracking-[0.06em] uppercase"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {entities.length} entidades · 12 semanas
        </span>
      }
    >
      <CompetitiveIntelClient
        signals={signals}
        entityStats={entityStats}
        entityCount={entities.length}
        newCount={newCount}
      />
    </PortalShell>
  );
}
