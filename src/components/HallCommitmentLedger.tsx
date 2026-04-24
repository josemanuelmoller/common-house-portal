import { getCommitmentActions } from "@/lib/action-items";
import { HallCommitmentLedgerRows, type CommitmentLite } from "./HallCommitmentLedgerRows";

/**
 * Commitment ledger — Phase 5 of the normalization architecture
 * (docs/NORMALIZATION_ARCHITECTURE.md §15).
 *
 * Data source: the normalized `action_items` layer, populated by Gmail,
 * Fireflies, and future ingestors. No substring parsing, no evidence scan —
 * the classification (actor = jose vs counterparty) happens at INGEST time
 * in the Fireflies ingestor (src/lib/ingestors/fireflies.ts).
 *
 * Buckets:
 *   I OWE      = intent ∈ {deliver, follow_up, close_loop} (owner='jose')
 *   OWED TO ME = intent='chase' (owner='others' — Jose chases the counterparty)
 */

export async function HallCommitmentLedger() {
  const all = await getCommitmentActions(60);

  const toLite = (c: (typeof all)[number]): CommitmentLite => ({
    id:        c.actionItemId,
    title:     c.title,
    snippet:   c.snippet,
    daysAgo:   c.daysAgo,
    owner:     c.owner,
    notionUrl: c.sourceUrl,
  });

  const joseCommits   = all.filter(c => c.owner === "jose").slice(0, 5).map(toLite);
  const othersCommits = all.filter(c => c.owner === "others").slice(0, 5).map(toLite);

  return (
    <HallCommitmentLedgerRows
      joseCommits={joseCommits}
      othersCommits={othersCommits}
      allUrl="/admin/hall/commitments"
    />
  );
}
