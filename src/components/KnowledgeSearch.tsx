"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type SearchItem = {
  path: string;
  title: string;
  summary: string;
  body_preview: string;
  kind: "node" | "case";
  case_code?: string;
};

export function KnowledgeSearch({ items }: { items: SearchItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Global "/" shortcut — skip when focused on inputs/textareas
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as SearchItem[];
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored = items.map(item => {
      const hay = `${item.path} ${item.title} ${item.summary} ${item.body_preview} ${item.case_code ?? ""}`.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score++;
        if (item.title.toLowerCase().includes(t)) score += 2;
        if (item.path.toLowerCase().includes(t)) score += 1;
      }
      return { item, score };
    });
    return scored
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15)
      .map(x => x.item);
  }, [query, items]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest bg-white border border-[#E0E0D8] hover:border-[#131218]/30 text-[#131218]/70 hover:text-[#131218] px-3 py-1.5 rounded-full transition-colors"
      >
        <span className="text-[13px] text-[#131218]/40">⌕</span>
        Search
        <kbd className="text-[9px] font-mono font-bold bg-[#EFEFEA] text-[#131218]/60 px-1.5 py-0.5 rounded border border-[#E0E0D8]">/</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-[#131218]/40 backdrop-blur-sm flex items-start justify-center pt-24"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-[14px] border border-[#E0E0D8] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#EFEFEA]">
              <span className="text-[#131218]/40 text-lg">⌕</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar leaves, cases, contenido..."
                className="flex-1 outline-none text-sm text-[#131218] placeholder:text-[#131218]/25"
              />
              <kbd className="text-[9px] font-mono font-bold bg-[#EFEFEA] text-[#131218]/50 px-1.5 py-0.5 rounded border border-[#E0E0D8]">ESC</kbd>
            </div>

            {results.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm text-[#131218]/30">
                  {query.trim() ? "Sin resultados" : "Escribe para buscar en el árbol + cases"}
                </p>
                <p className="text-[10px] text-[#131218]/20 mt-1">
                  {items.length} elementos indexados
                </p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-[#EFEFEA]">
                {results.map(r => (
                  <Link
                    key={r.kind === "case" ? `case-${r.case_code}` : r.path}
                    href={r.kind === "case"
                      ? `/admin/knowledge/cases/${encodeURIComponent(r.case_code!)}`
                      : `/admin/knowledge/${r.path}`}
                    className="block px-5 py-3 hover:bg-[#EFEFEA]/40 transition-colors"
                    onClick={() => setOpen(false)}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest ${
                        r.kind === "case" ? "bg-[#131218] text-[#B2FF59]" : "bg-[#EFEFEA] text-[#131218]/40"
                      }`}>
                        {r.kind === "case" ? "CASE" : "NODE"}
                      </span>
                      <p className="text-[10px] font-bold font-mono text-[#131218]/30">{r.path}</p>
                    </div>
                    <p className="text-sm font-semibold text-[#131218] mt-1">{r.title}</p>
                    {r.summary && <p className="text-[11px] text-[#131218]/50 line-clamp-1 mt-0.5">{r.summary}</p>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
