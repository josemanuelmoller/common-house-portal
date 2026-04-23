"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Scope = "summary" | "open_loops" | "topics" | "news" | "enrichment" | "general";

type Correction = {
  id:              string;
  scope:           Scope;
  what_is_wrong:   string;
  what_is_correct: string;
  created_at:      string;
  created_by:      string | null;
};

const SCOPE_LABEL: Record<Scope, string> = {
  summary:    "Operating brief",
  open_loops: "Open loops",
  topics:     "Recurring topics",
  news:       "News & activity",
  enrichment: "Identity / enrichment",
  general:    "General",
};

/**
 * Small "This is wrong" affordance + modal for Capa 3 (per-contact
 * corrections). Sits next to any AI output on the contact profile.
 *
 * Props:
 *   personId          — required
 *   defaultScope      — scope pre-selected when modal opens
 *   knownCorrections  — existing corrections to show in the modal (read-only list + delete)
 *   regenerateUrl     — optional: after a correction is saved, POST to this URL
 *                       with body {person_id, force: true} to regenerate that field
 *                       so the user sees the new output immediately.
 */
export function CorrectionButton({
  personId,
  defaultScope,
  knownCorrections,
  regenerateUrl,
  compact,
}: {
  personId:          string;
  defaultScope:      Scope;
  knownCorrections:  Correction[];
  regenerateUrl?:    string;
  compact?:          boolean;
}) {
  const router = useRouter();
  const [open, setOpen]                 = useState(false);
  const [scope, setScope]               = useState<Scope>(defaultScope);
  const [what_is_wrong, setWrong]       = useState("");
  const [what_is_correct, setCorrect]   = useState("");
  const [regen, setRegen]               = useState(true);
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState<string | null>(null);
  const [local, setLocal]               = useState<Correction[]>(knownCorrections);
  const [, startTransition]             = useTransition();

  useEffect(() => { setLocal(knownCorrections); }, [knownCorrections]);
  useEffect(() => { if (open) setScope(defaultScope); }, [defaultScope, open]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/contact-intelligence/corrections", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ person_id: personId, scope, what_is_wrong, what_is_correct }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "save failed");
      setLocal(j.corrections ?? []);
      setWrong("");
      setCorrect("");

      if (regen && regenerateUrl) {
        // Fire-and-forget — don't block the UI.
        fetch(regenerateUrl, {
          method:  "POST",
          headers: { "content-type": "application/json" },
          body:    JSON.stringify({ person_id: personId, force: true }),
        }).then(() => startTransition(() => router.refresh())).catch(() => { /* no-op */ });
      } else {
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeCorrection(id: string) {
    try {
      const res = await fetch("/api/contact-intelligence/corrections", {
        method:  "DELETE",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ person_id: personId, correction_id: id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "delete failed");
      setLocal(j.corrections ?? []);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  }

  const scopeFiltered = local.filter(c => c.scope === defaultScope || c.scope === "general");
  const badge = scopeFiltered.length > 0 ? scopeFiltered.length : null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`${compact
          ? "text-[9px] font-bold uppercase tracking-widest text-[#131218]/35 hover:text-red-700 underline decoration-dotted"
          : "text-[10px] font-bold uppercase tracking-widest border border-[#131218]/15 text-[#131218]/60 hover:border-red-400 hover:text-red-700 px-2 py-1 rounded-lg"
        }`}
        title="Report an error in this AI output — will be remembered for future regenerations"
      >
        {compact ? "Fix ✎" : "✎ Fix"}
        {badge != null && (
          <span className="ml-1 inline-flex items-center justify-center min-w-[14px] h-[14px] text-[8px] rounded-full bg-amber-200 text-amber-900 px-1">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-[15px] font-bold text-[#131218]">Correct this AI output</h3>
                <p className="text-[11px] text-[#131218]/55 mt-1 leading-snug">
                  The correction is remembered for this contact and injected into every future regeneration of the affected field. It does not affect other contacts.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-[#131218]/40 hover:text-[#131218] text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <label className="block mb-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">Applies to</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as Scope)}
                className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2 text-[12px] bg-white"
              >
                {(Object.keys(SCOPE_LABEL) as Scope[]).map(s => (
                  <option key={s} value={s}>{SCOPE_LABEL[s]}{s === "general" ? " (applies to every AI field)" : ""}</option>
                ))}
              </select>
            </label>

            <label className="block mb-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">What is wrong?</span>
              <textarea
                value={what_is_wrong}
                onChange={(e) => setWrong(e.target.value.slice(0, 500))}
                rows={3}
                placeholder={'e.g. "Says Francisco is at Moller Upstream"'}
                className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2 text-[12px] leading-snug"
              />
              <span className="text-[9px] text-[#131218]/35">{what_is_wrong.length} / 500</span>
            </label>

            <label className="block mb-3">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">What is correct?</span>
              <textarea
                value={what_is_correct}
                onChange={(e) => setCorrect(e.target.value.slice(0, 500))}
                rows={3}
                placeholder={'e.g. "Francisco is co-founder of Common House (33%). He is NOT at Moller Upstream — that entity is the user\'s personal consultancy."'}
                className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2 text-[12px] leading-snug"
              />
              <span className="text-[9px] text-[#131218]/35">{what_is_correct.length} / 500</span>
            </label>

            {regenerateUrl && (
              <label className="flex items-center gap-2 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={regen}
                  onChange={(e) => setRegen(e.target.checked)}
                />
                <span className="text-[11px] text-[#131218]/70">Regenerate this field immediately with the correction applied</span>
              </label>
            )}

            {err && <p className="text-[11px] text-red-600 mb-3">{err}</p>}

            <div className="flex items-center gap-3 mb-5">
              <button
                onClick={save}
                disabled={saving || !what_is_wrong.trim() || !what_is_correct.trim()}
                className="text-[10px] font-bold uppercase tracking-widest bg-[#131218] text-white px-4 py-2 rounded-lg hover:bg-[#131218]/80 disabled:opacity-40"
              >
                {saving ? "Saving…" : "Save correction"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/50 hover:text-[#131218]"
              >
                Cancel
              </button>
            </div>

            {local.length > 0 && (
              <div className="border-t border-[#EFEFEA] pt-4">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-2">
                  Existing corrections · {local.length}
                </p>
                <ul className="space-y-2">
                  {local.map(c => (
                    <li key={c.id} className="bg-[#F7F7F3] border border-[#E0E0D8] rounded-lg px-3 py-2 text-[11px]">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest bg-white px-1.5 py-0.5 rounded border border-[#E0E0D8]">
                          {SCOPE_LABEL[c.scope]}
                        </span>
                        <span className="text-[9px] text-[#131218]/40">{formatDate(c.created_at)}</span>
                        <div className="flex-1" />
                        <button
                          onClick={() => removeCorrection(c.id)}
                          className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                      <p className="text-[11px] text-[#131218]/55 line-through">{c.what_is_wrong}</p>
                      <p className="text-[11px] text-[#131218] font-medium mt-0.5">→ {c.what_is_correct}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch { return ""; }
}
