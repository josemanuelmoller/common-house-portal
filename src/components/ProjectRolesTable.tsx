"use client";

import { useState } from "react";

type Level = "operational" | "mentorship" | "observer";

type Row = {
  notionId: string;
  name:     string;
  status:   string;
  level:    Level;
};

const LEVEL_ORDER: Level[] = ["operational", "mentorship", "observer"];

const LEVEL_COLOR: Record<Level, string> = {
  operational: "var(--hall-ok)",
  mentorship:  "var(--hall-info, #3B7AA9)",
  observer:    "var(--hall-muted-3)",
};

export function ProjectRolesTable({ initialRows }: { initialRows: Row[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateLevel(notionId: string, level: Level) {
    setSaving(notionId);
    setError(null);
    const prev = rows.find(r => r.notionId === notionId)?.level ?? "operational";
    setRows(rs => rs.map(r => (r.notionId === notionId ? { ...r, level } : r)));
    try {
      const res = await fetch(`/api/admin/projects/${encodeURIComponent(notionId)}/management-level`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ level }),
      });
      if (!res.ok) {
        setRows(rs => rs.map(r => (r.notionId === notionId ? { ...r, level: prev } : r)));
        const body = await res.json().catch(() => null);
        setError(body?.error || `Save failed (${res.status})`);
      }
    } catch (e) {
      setRows(rs => rs.map(r => (r.notionId === notionId ? { ...r, level: prev } : r)));
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  const totals = LEVEL_ORDER.reduce<Record<Level, number>>((acc, l) => {
    acc[l] = rows.filter(r => r.level === l).length;
    return acc;
  }, { operational: 0, mentorship: 0, observer: 0 });

  return (
    <div>
      {/* Totals bar */}
      <div className="flex items-center gap-6 pb-3 mb-4" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
        {LEVEL_ORDER.map(level => (
          <div key={level} className="flex items-baseline gap-2">
            <span className="font-semibold tabular-nums" style={{ fontFamily: "var(--font-hall-mono)", fontSize: 14, color: LEVEL_COLOR[level] }}>
              {totals[level]}
            </span>
            <span className="text-[9px] uppercase tracking-widest" style={{ color: "var(--hall-muted-3)" }}>
              {level}
            </span>
          </div>
        ))}
        <span className="text-[10px] ml-auto" style={{ color: "var(--hall-muted-3)" }}>
          {rows.length} projects total
        </span>
      </div>

      {error && (
        <p className="text-[11px] mb-3" style={{ color: "var(--hall-danger)" }}>
          {error}
        </p>
      )}

      <ul className="flex flex-col">
        {rows.map(r => (
          <li
            key={r.notionId}
            className="flex items-center gap-4 py-2.5"
            style={{ borderTop: "1px solid var(--hall-line-soft)" }}
          >
            <div className="flex-1 min-w-0">
              <p
                className="text-[12.5px] font-semibold line-clamp-1"
                style={{ color: "var(--hall-ink-0)" }}
              >
                {r.name || "(untitled)"}
              </p>
              <p className="text-[10px] uppercase tracking-widest mt-0.5" style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}>
                {r.status}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: LEVEL_COLOR[r.level] }}
              />
              <select
                value={r.level}
                onChange={e => updateLevel(r.notionId, e.target.value as Level)}
                disabled={saving === r.notionId}
                className="text-[11px] font-semibold bg-transparent border px-2 py-1 rounded"
                style={{
                  borderColor: "var(--hall-line)",
                  color: "var(--hall-ink-0)",
                  minWidth: 130,
                  fontFamily: "var(--font-hall-sans)",
                }}
              >
                <option value="operational">operational</option>
                <option value="mentorship">mentorship</option>
                <option value="observer">observer</option>
              </select>
              {saving === r.notionId && (
                <span className="text-[9px]" style={{ color: "var(--hall-muted-3)" }}>saving…</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
