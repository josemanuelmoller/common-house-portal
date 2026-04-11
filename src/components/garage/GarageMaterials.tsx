import type { GarageMaterial } from "@/types/garage";

/**
 * GarageMaterials — curated materials for the engagement.
 *
 * Source: getDocumentsForProject() from CH Sources [OS v2].
 * In the Garage context, these are typically: pitch deck, financial model,
 * market memo, cap table, investor updates — the core build artefacts.
 *
 * Placement: mid-Garage, paired alongside GarageCommitments.
 * Returns null if no materials exist.
 */
export function GarageMaterials({ materials }: { materials: GarageMaterial[] }) {
  if (materials.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#EFEFEA]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          Materials
        </p>
        <p className="text-sm text-[#131218]/40 mt-1.5 leading-relaxed">
          Decks, models, and documents for this engagement.
        </p>
      </div>
      <div className="divide-y divide-[#EFEFEA]">
        {materials.map((m) => (
          <div key={m.id} className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#131218] leading-snug truncate">
                {m.title}
              </p>
              <p className="text-[10px] text-[#131218]/25 font-medium uppercase tracking-widest mt-0.5">
                {m.platform}
                {m.addedDate && ` · ${m.addedDate}`}
              </p>
            </div>
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-[#131218]/40 hover:text-[#131218] uppercase tracking-widest transition-colors shrink-0"
            >
              Open ↗
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
