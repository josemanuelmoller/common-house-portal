"use client";

import { useEffect, useState } from "react";

type Item = {
  threadId: string;
  subject:  string;
  to:       string;
  toName:   string;
  snippet:  string;
  daysWaiting: number;
  classes:  string[];
  isVip:    boolean;
  gmailUrl: string;
};

export function HallAskQueue() {
  const [items,   setItems]   = useState<Item[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [total,   setTotal]   = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/hall/ask-queue", { credentials: "include" });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || j?.ok === false) {
          setError(j?.error ?? `HTTP ${r.status}`);
          setLoading(false);
          return;
        }
        setItems(j.items ?? []);
        setTotal(j.waiting_total ?? j.items?.length ?? 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EFEFEA]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/50">Waiting on others</span>
          {items && items.length > 0 && (
            <span className="text-[9px] font-bold bg-[#131218]/6 text-[#131218]/60 px-1.5 py-0.5 rounded-full">
              {total}
            </span>
          )}
        </div>
        <span className="text-[9px] font-semibold text-[#131218]/30">top {items?.length ?? 0}</span>
      </div>
      {loading && <div className="px-5 py-4"><p className="text-[11px] text-[#131218]/30">Scanning inbox…</p></div>}
      {error && !loading && <div className="px-5 py-4"><p className="text-[11px] text-red-600">{error}</p></div>}
      {!loading && !error && items && items.length === 0 && (
        <div className="px-5 py-6 text-center">
          <p className="text-[11px] text-[#131218]/35">Everyone has responded. No outstanding pings.</p>
        </div>
      )}
      {!loading && !error && items && items.length > 0 && (
        <div className="divide-y divide-[#EFEFEA]">
          {items.map(i => <AskRow key={i.threadId} item={i} />)}
        </div>
      )}
    </div>
  );
}

function AskRow({ item }: { item: Item }) {
  const stale = item.daysWaiting >= 21 ? "text-red-600" : item.daysWaiting >= 10 ? "text-amber-700" : "text-[#131218]/55";
  return (
    <a
      href={item.gmailUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-5 py-2.5 hover:bg-[#EFEFEA]/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-[#131218] truncate">
          {item.subject}
          {item.isVip && <span className="ml-2 text-[8px] font-bold px-1.5 py-0.5 rounded bg-[#B2FF59]/40 text-green-900">VIP</span>}
        </p>
        <p className="text-[9px] text-[#131218]/45 mt-0.5 truncate">
          <span className="font-semibold">{item.toName}</span>
          <span className="text-[#131218]/25"> · </span>
          {item.classes.length > 0
            ? item.classes.slice(0, 2).join(" · ")
            : "unclassified"}
        </p>
      </div>
      <span className={`text-[10px] font-bold shrink-0 ${stale}`}>
        {item.daysWaiting}d
      </span>
    </a>
  );
}
