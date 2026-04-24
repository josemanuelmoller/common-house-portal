import { getSupabaseServerClient } from "@/lib/supabase-server";

type Mention = {
  id:           string;
  url:          string;
  title:        string | null;
  snippet:      string | null;
  source:       string | null;
  kind:         string;
  published_at: string | null;
  relevance:    number | null;
  why_relevant: string | null;
  detected_at:  string;
};

function timeAgoShort(iso: string | null): string {
  if (!iso) return "recent";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1d ago";
  if (d < 30) return `${d}d ago`;
  const m = Math.floor(d / 30);
  if (m < 12) return `${m}mo ago`;
  return `${Math.floor(m / 12)}y ago`;
}

function kindGlyph(kind: string): string {
  switch (kind) {
    case "linkedin_post":    return "in";
    case "podcast":          return "🎧";
    case "blog":             return "✍️";
    case "org_announcement": return "📣";
    default:                 return "📰";
  }
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "linkedin_post":    return "LinkedIn post";
    case "podcast":          return "Podcast";
    case "blog":             return "Blog";
    case "org_announcement": return "Org announcement";
    default:                 return "News";
  }
}

function relevanceClass(r: number | null): string {
  const v = r ?? 0;
  if (v >= 0.8) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (v >= 0.5) return "text-amber-700  bg-amber-50  border-amber-200";
  return "text-[#0a0a0a]/50 bg-[#f4f4ef] border-[#e4e4dd]";
}

/**
 * Server component — loads news mentions for a single contact (last 90 days,
 * not dismissed, ranked by recency + relevance). Shown on the contact
 * profile below the Conversation block.
 *
 * Populated by the biweekly news-monitor cron or the on-demand scan button.
 */
export async function ContactNewsMentions({
  personId,
  lastScanAt,
}: {
  personId:    string;
  lastScanAt?: string | null;
}) {
  const sb = getSupabaseServerClient();
  const { data } = await sb
    .from("people_news_mentions")
    .select("id, url, title, snippet, source, kind, published_at, relevance, why_relevant, detected_at")
    .eq("person_id", personId)
    .is("dismissed_at", null)
    .order("detected_at", { ascending: false })
    .limit(30);

  const mentions = ((data ?? []) as Mention[])
    .sort((a, b) => {
      // Blend recency + relevance — half-life ~30 days
      const scoreOf = (m: Mention) => {
        const d = (Date.now() - new Date(m.detected_at).getTime()) / 86400_000;
        const recencyFactor = Math.max(0, 1 - d / 60);
        return (m.relevance ?? 0) * 0.7 + recencyFactor * 0.3;
      };
      return scoreOf(b) - scoreOf(a);
    });

  if (mentions.length === 0) {
    return (
      <div className="bg-white border border-[#e4e4dd] rounded-2xl px-5 py-4">
        <p className="text-[9px] font-bold tracking-widest uppercase text-[#0a0a0a]/45 mb-2">
          Recent mentions
          {lastScanAt && <span className="text-[#0a0a0a]/30"> · last scanned {timeAgoShort(lastScanAt)}</span>}
        </p>
        <p className="text-[11.5px] text-[#0a0a0a]/45 leading-snug">
          {lastScanAt
            ? "No recent news, LinkedIn posts, or podcast appearances detected. Next scan runs biweekly."
            : "Not scanned yet. The biweekly news monitor runs on VIPs Monday mornings."}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e4e4dd] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <p className="text-[9px] font-bold tracking-widest uppercase text-[#0a0a0a]/45">
          Recent mentions
          {lastScanAt && <span className="text-[#0a0a0a]/30"> · scanned {timeAgoShort(lastScanAt)}</span>}
        </p>
        <div className="flex-1 h-px bg-[#f4f4ef]" />
        <span className="text-[10px] text-[#0a0a0a]/40 tabular-nums">{mentions.length}</span>
      </div>
      <ul className="divide-y divide-[#f4f4ef]">
        {mentions.slice(0, 8).map(m => (
          <li key={m.id} className="px-5 py-3">
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[11px]">{kindGlyph(m.kind)}</span>
                <span className="text-[9px] font-bold uppercase tracking-widest text-[#0a0a0a]/45">
                  {kindLabel(m.kind)}
                </span>
                {m.source && <span className="text-[9px] text-[#0a0a0a]/40">· {m.source}</span>}
                <span className="text-[9px] text-[#0a0a0a]/40">
                  · {m.published_at ? timeAgoShort(m.published_at) : `detected ${timeAgoShort(m.detected_at)}`}
                </span>
                {m.relevance != null && (
                  <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full border ml-auto ${relevanceClass(m.relevance)}`}>
                    {Math.round(m.relevance * 100)}%
                  </span>
                )}
              </div>
              <p className="text-[12.5px] font-semibold text-[#0a0a0a] mt-1 group-hover:underline underline-offset-2 decoration-[#0a0a0a]/30">
                {m.title ?? m.url}
              </p>
              {m.snippet && (
                <p className="text-[11px] text-[#0a0a0a]/60 mt-1 leading-snug line-clamp-2">
                  {m.snippet}
                </p>
              )}
              {m.why_relevant && (
                <p className="text-[10px] text-[#0a0a0a]/45 italic mt-1">→ {m.why_relevant}</p>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
