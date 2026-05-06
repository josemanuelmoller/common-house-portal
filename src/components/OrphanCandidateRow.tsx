"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  approveOrphanCandidate,
  rejectOrphanCandidate,
  reassignOrphanCandidate,
} from "@/app/admin/hall/orphans/actions";

type PersonOption = { id: string; full_name: string | null; email: string | null };

type Props = {
  candidateId:   string;
  senderName:    string;
  personName:    string | null;
  personEmail:   string | null;
  reasonLabel:   string;
  msgCount:      number;
  confPct:       number;
  confColor:     string;
  sourceTitle:   string | null;
  msgBackfillHint: string; // used as the approve button tooltip
};

export function OrphanCandidateRow({
  candidateId,
  senderName,
  personName,
  personEmail,
  reasonLabel,
  msgCount,
  confPct,
  confColor,
  sourceTitle,
  msgBackfillHint,
}: Props) {
  const router = useRouter();
  const [busy, setBusy]               = useState<"approve" | "reject" | "reassign" | null>(null);
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [search, setSearch]           = useState("");
  const [people, setPeople]           = useState<PersonOption[]>([]);
  const [loading, setLoading]         = useState(false);
  const [err, setErr]                 = useState<string | null>(null);
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/hall-people-search?q=${encodeURIComponent(search)}`);
        if (res.ok) {
          const j = await res.json();
          setPeople(j.people ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, pickerOpen]);

  async function handleApprove() {
    setBusy("approve"); setErr(null);
    try {
      await approveOrphanCandidate(candidateId);
      router.refresh();
    } catch (e) {
      setErr(String(e));
      setBusy(null);
    }
  }

  async function handleReject() {
    setBusy("reject"); setErr(null);
    try {
      await rejectOrphanCandidate(candidateId);
      router.refresh();
    } catch (e) {
      setErr(String(e));
      setBusy(null);
    }
  }

  async function handleReassign(personId: string) {
    setBusy("reassign"); setErr(null);
    try {
      await reassignOrphanCandidate(candidateId, personId);
      setPickerOpen(false);
      router.refresh();
    } catch (e) {
      setErr(String(e));
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <div className="px-5 py-4 hover:bg-[#f4f4ef]/40 transition-colors">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[13px] font-bold text-[#0a0a0a]">
              &ldquo;{senderName}&rdquo;
            </span>
            <span className="text-[11px] text-[#0a0a0a]/40">→</span>
            <span className="text-[13px] font-bold text-[#0a0a0a]">
              {personName ?? "(person not found)"}
            </span>
            {personEmail && (
              <span className="text-[10px] text-[#0a0a0a]/45">· {personEmail}</span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[10px] text-[#0a0a0a]/55">
            <span className="uppercase tracking-wide font-bold">{reasonLabel}</span>
            <span>·</span>
            <span>{msgCount} message{msgCount === 1 ? "" : "s"}</span>
            <span>·</span>
            <span className="min-w-[90px] flex items-center gap-2">
              <span className="flex-1 h-1 rounded-full bg-[#f4f4ef] overflow-hidden inline-block max-w-[60px]">
                <span className={`block h-full ${confColor}`} style={{ width: `${confPct}%` }} />
              </span>
              <span className="font-bold tracking-wider">{confPct}%</span>
            </span>
            {sourceTitle && (
              <>
                <span>·</span>
                <span className="truncate max-w-[240px]">{sourceTitle}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={handleApprove}
            disabled={disabled}
            className="bg-[#c6f24a] text-[#0a0a0a] text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded hover:bg-[#d4ff6a] transition-colors disabled:opacity-50"
            title={msgBackfillHint}
          >
            {busy === "approve" ? "…" : "Approve"}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(v => !v)}
            disabled={disabled}
            className="bg-white text-[#0a0a0a] text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded border border-[#0a0a0a] hover:bg-[#f4f4ef]/60 transition-colors disabled:opacity-50"
          >
            {pickerOpen ? "Close" : "Reassign"}
          </button>
          <button
            type="button"
            onClick={handleReject}
            disabled={disabled}
            className="bg-white text-[#0a0a0a]/60 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded border border-[#e4e4dd] hover:bg-[#f4f4ef]/60 transition-colors disabled:opacity-50"
          >
            {busy === "reject" ? "…" : "Reject"}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <div className="mt-3 ml-0 bg-[#fafaf7] rounded-lg border border-[#e4e4dd] p-3 space-y-2">
          <input
            type="text"
            autoFocus
            placeholder="Search person by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-[12px] px-3 py-2 bg-white rounded border border-[#e4e4dd] focus:outline-none focus:border-[#0a0a0a]"
          />
          <div className="max-h-[220px] overflow-y-auto divide-y divide-[#f4f4ef]">
            {loading ? (
              <div className="py-3 text-center text-[10px] text-[#0a0a0a]/45 uppercase tracking-widest">Loading…</div>
            ) : people.length === 0 ? (
              <div className="py-3 text-center text-[10px] text-[#0a0a0a]/45 uppercase tracking-widest">No matches</div>
            ) : (
              people.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleReassign(p.id)}
                  disabled={disabled}
                  className="w-full flex items-center justify-between gap-3 px-2 py-2 text-left hover:bg-white rounded transition-colors disabled:opacity-50"
                >
                  <span className="text-[12px] font-bold text-[#0a0a0a] truncate">
                    {p.full_name ?? "(no name)"}
                  </span>
                  {p.email && (
                    <span className="text-[10px] text-[#0a0a0a]/50 truncate">{p.email}</span>
                  )}
                </button>
              ))
            )}
          </div>
          {busy === "reassign" && (
            <div className="text-[10px] text-[#0a0a0a]/55 uppercase tracking-widest">Reassigning…</div>
          )}
        </div>
      )}

      {err && (
        <div className="mt-2 text-[10px] text-[#b91c1c]">Error: {err}</div>
      )}
    </div>
  );
}
