"use client";

import { useState, useTransition } from "react";
import { EvidenceQueueRow } from "./EvidenceQueueRow";
import { batchMarkReviewed } from "@/app/admin/os/actions";
import { StatusBadge } from "./StatusBadge";

type EvidenceItem = {
  id: string;
  title: string;
  excerpt: string;
  projectId: string | null;
  type: string;
  validationStatus: string;
  dateCaptured: string | null;
};

interface Props {
  items: EvidenceItem[];
  projectNames: Record<string, string>;
}

export function EvidenceQueueTable({ items, projectNames }: Props) {
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [dismissed, setDismissed]   = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const visible = items.filter(i => !dismissed.has(i.id));
  const selectableIds = visible.map(i => i.id);
  const allSelected   = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleDismiss(id: string) {
    setDismissed(prev => new Set(prev).add(id));
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  function handleBatchApprove() {
    const ids = [...selected];
    if (!ids.length) return;
    startTransition(async () => {
      await batchMarkReviewed(ids);
      setDismissed(prev => new Set([...prev, ...ids]));
      setSelected(new Set());
    });
  }

  if (visible.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-sm text-[#0a0a0a]/30 italic">
        Nothing flagged — engine handled everything.
      </div>
    );
  }

  return (
    <>
      {/* Batch action bar — only visible when items are selected */}
      {selected.size > 0 && (
        <div className="px-6 py-2.5 bg-[#0a0a0a] flex items-center justify-between">
          <span className="text-[11px] font-semibold text-white/70">
            {selected.size} item{selected.size !== 1 ? "s" : ""} selected
          </span>
          <button
            onClick={handleBatchApprove}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-[#c6f24a] text-[#0a0a0a] px-3 py-1.5 rounded-full uppercase tracking-widest hover:bg-[#9ee84a] transition-colors disabled:opacity-50"
          >
            {isPending ? "Aprobando…" : `✓ Aprobar selección (${selected.size})`}
          </button>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#f4f4ef]">
            <th className="px-4 py-3 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-[#e4e4dd] accent-[#0a0a0a] cursor-pointer"
                title="Seleccionar todos"
              />
            </th>
            <th className="text-left px-2 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Evidence</th>
            <th className="text-left px-4 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Project</th>
            <th className="text-left px-4 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Type</th>
            <th className="text-left px-4 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Status</th>
            <th className="text-left px-4 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Captured</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#f4f4ef]">
          {visible.map(e => (
            <EvidenceQueueRow
              key={e.id}
              id={e.id}
              title={e.title}
              excerpt={e.excerpt}
              projectName={e.projectId ? (projectNames[e.projectId] ?? "—") : "—"}
              type={e.type}
              validationStatus={e.validationStatus}
              dateCaptured={e.dateCaptured}
              isSelected={selected.has(e.id)}
              onToggleSelect={toggleOne}
              onDismiss={handleDismiss}
            />
          ))}
        </tbody>
      </table>

      {/* Select-all shortcut at the bottom when queue is long */}
      {visible.length > 5 && selected.size < visible.length && (
        <div className="px-6 py-3 border-t border-[#f4f4ef] flex items-center justify-between">
          <button
            onClick={toggleAll}
            className="text-[10px] font-bold text-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-colors uppercase tracking-widest"
          >
            Seleccionar todos ({visible.length})
          </button>
          {selected.size > 0 && (
            <button
              onClick={handleBatchApprove}
              disabled={isPending}
              className="text-[10px] font-bold bg-[#c6f24a] text-[#0a0a0a] px-3 py-1.5 rounded-full uppercase tracking-widest hover:bg-[#9ee84a] transition-colors disabled:opacity-50"
            >
              {isPending ? "Aprobando…" : `✓ Aprobar (${selected.size})`}
            </button>
          )}
        </div>
      )}
    </>
  );
}

// Read-only row for "Awaiting engine" section
export function EvidenceQueueReadOnlyTable({
  items,
  projectNames,
}: {
  items: EvidenceItem[];
  projectNames: Record<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#f4f4ef]">
          <th className="text-left px-6 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Evidence</th>
          <th className="text-left px-4 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Project</th>
          <th className="text-left px-4 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Type</th>
          <th className="text-left px-4 py-3 text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Captured</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[#f4f4ef]">
        {items.slice(0, 10).map(e => (
          <tr key={e.id} className="opacity-50">
            <td className="px-6 py-3">
              <p className="font-medium text-[#0a0a0a] text-sm">{e.title}</p>
              {e.excerpt && <p className="text-xs text-[#0a0a0a]/35 mt-0.5 line-clamp-1 max-w-sm">{e.excerpt}</p>}
            </td>
            <td className="px-4 py-3 text-xs font-medium text-[#0a0a0a]/50">
              {e.projectId ? (projectNames[e.projectId] ?? "—") : "—"}
            </td>
            <td className="px-4 py-3"><StatusBadge value={e.type} /></td>
            <td className="px-4 py-3 text-xs text-[#0a0a0a]/35 font-medium">
              {e.dateCaptured
                ? new Date(e.dateCaptured).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
