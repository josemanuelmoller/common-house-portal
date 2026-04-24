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
    <div>
      {loading && <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>Scanning inbox…</p>}
      {error && !loading && <p className="text-[11px]" style={{ color: "var(--hall-danger)" }}>{error}</p>}
      {!loading && !error && items && items.length === 0 && (
        <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>Everyone has responded. No outstanding pings.</p>
      )}
      {!loading && !error && items && items.length > 0 && (
        <ul className="flex flex-col">
          {items.map(i => <AskRow key={i.threadId} item={i} />)}
        </ul>
      )}
    </div>
  );
}

function AskRow({ item }: { item: Item }) {
  const ageColor = item.daysWaiting >= 21 ? "var(--hall-danger)"
    : item.daysWaiting >= 10 ? "var(--hall-warn)"
    : "var(--hall-muted-3)";
  const [nudging, setNudging] = useState(false);
  const [failed,  setFailed]  = useState(false);

  async function handleNudge(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (nudging) return;
    setNudging(true);
    setFailed(false);
    try {
      const r = await fetch("/api/hall/nudge-draft", {
        method:  "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId:    item.threadId,
          toEmail:     item.to,
          toName:      item.toName,
          subject:     item.subject,
          snippet:     item.snippet,
          classes:     item.classes,
          daysWaiting: item.daysWaiting,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false || !j?.gmailUrl) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      window.open(j.gmailUrl, "_blank", "noopener,noreferrer");
    } catch {
      setFailed(true);
      setTimeout(() => setFailed(false), 3000);
    } finally {
      setNudging(false);
    }
  }

  return (
    <li
      className="group flex items-start gap-3 py-2.5"
      style={{ borderTop: "1px solid var(--hall-line-soft)" }}
    >
      <a
        href={item.gmailUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0"
      >
        <span
          className="block text-[12px] font-semibold truncate"
          style={{ color: "var(--hall-ink-0)" }}
        >
          {item.subject}
          {item.isVip && (
            <span
              className="ml-2 text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{
                background: "var(--hall-lime-soft)",
                color: "var(--hall-lime-ink)",
                fontFamily: "var(--font-hall-mono)",
              }}
            >
              VIP
            </span>
          )}
        </span>
        <span
          className="block text-[10.5px] mt-0.5 truncate"
          style={{ color: "var(--hall-muted-2)" }}
        >
          <span className="font-semibold" style={{ color: "var(--hall-ink-3)" }}>{item.toName}</span>
          <span> · </span>
          {item.classes.length > 0
            ? item.classes.slice(0, 2).join(" · ")
            : "unclassified"}
        </span>
      </a>

      <div className="flex items-center gap-2 shrink-0">
        <span
          className="font-semibold"
          style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: ageColor }}
        >
          {item.daysWaiting}d
        </span>

        {failed && (
          <span className="text-[9px] font-semibold" style={{ color: "var(--hall-danger)" }}>Failed</span>
        )}

        <button
          type="button"
          onClick={handleNudge}
          disabled={nudging}
          title="Draft a follow-up with Haiku, opens in Gmail"
          aria-label="Nudge with Haiku draft"
          className="hall-btn-primary opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
          style={{ padding: "4px 10px", fontSize: 10.5 }}
        >
          {nudging ? "…" : "Nudge →"}
        </button>
      </div>
    </li>
  );
}
