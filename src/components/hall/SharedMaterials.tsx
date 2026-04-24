import { HallMaterial } from "@/types/hall";

const PLATFORM_ICONS: Record<string, string> = {
  "Google Drive": "◱",
  Notion: "◫",
  Figma: "◈",
  Default: "◻",
};

function platformIcon(platform: string): string {
  return PLATFORM_ICONS[platform] ?? PLATFORM_ICONS.Default;
}

export function SharedMaterials({ materials }: { materials: HallMaterial[] }) {
  if (materials.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
        <div className="h-1 bg-[#c6f24a]" />
        <div className="px-6 py-5 border-b border-[#f4f4ef]">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            Shared materials
          </p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#0a0a0a]/40 leading-relaxed">
            Shared documents and references will appear here as the work
            progresses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#c6f24a]" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
          Shared materials
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#f4f4ef]">
        {materials.map((mat) => (
          <a
            key={mat.id}
            href={mat.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-4 px-6 py-4 hover:bg-[#f4f4ef]/60 transition-colors border-b border-[#f4f4ef] last:border-b-0 sm:last:border-b sm:odd:border-b sm:[&:nth-last-child(-n+2)]:border-b-0"
          >
            <span className="text-base text-[#0a0a0a]/20 shrink-0 mt-0.5">
              {platformIcon(mat.platform)}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#0a0a0a] truncate">
                {mat.title}
              </p>
              {mat.description && (
                <p className="text-xs text-[#0a0a0a]/40 mt-0.5 leading-snug line-clamp-2">
                  {mat.description}
                </p>
              )}
              {mat.addedDate && (
                <p className="text-[10px] text-[#0a0a0a]/25 font-bold uppercase tracking-widest mt-1.5">
                  Added {mat.addedDate}
                </p>
              )}
            </div>
            <span className="text-[#0a0a0a]/20 text-xs shrink-0 mt-0.5">↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}
