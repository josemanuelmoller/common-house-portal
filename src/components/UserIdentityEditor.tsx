"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type OwnOrg = {
  name:  string;
  role:  string | null;
  stake: string | null;
  notes: string | null;
};

type Identity = {
  user_email?:        string;     // read-only, inferred from Clerk on POST
  user_name:          string;
  user_aliases:       string[];
  user_own_orgs:      OwnOrg[];
  user_role_classes:  string[];
  additional_context: string | null;
};

const EMPTY: Identity = {
  user_name:          "",
  user_aliases:       [],
  user_own_orgs:      [],
  user_role_classes:  [],
  additional_context: null,
};

export function UserIdentityEditor({ initial }: { initial: Identity | null }) {
  const router = useRouter();
  const [id, setId]         = useState<Identity>(initial ?? EMPTY);
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [ok, setOk]         = useState(false);
  const [, startTransition] = useTransition();

  function patch<K extends keyof Identity>(k: K, v: Identity[K]) {
    setId(prev => ({ ...prev, [k]: v }));
    setOk(false);
  }

  function addOrg() {
    patch("user_own_orgs", [...id.user_own_orgs, { name: "", role: null, stake: null, notes: null }]);
  }
  function removeOrg(idx: number) {
    patch("user_own_orgs", id.user_own_orgs.filter((_, i) => i !== idx));
  }
  function updateOrg(idx: number, field: keyof OwnOrg, value: string) {
    const next = id.user_own_orgs.slice();
    next[idx] = { ...next[idx], [field]: value || null };
    patch("user_own_orgs", next);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    setOk(false);
    try {
      const res = await fetch("/api/user-identity", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(id),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "save failed");
      if (j.identity) setId(j.identity);
      setOk(true);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Name + aliases */}
      <section className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4 space-y-3">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45">Who you are</p>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/60 mb-1 block">Full name</span>
          <input
            type="text"
            value={id.user_name}
            onChange={(e) => patch("user_name", e.target.value)}
            className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2 text-[12px]"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/60 mb-1 block">Aliases / nicknames</span>
          <input
            type="text"
            value={id.user_aliases.join(", ")}
            onChange={(e) =>
              patch(
                "user_aliases",
                e.target.value.split(",").map(s => s.trim()).filter(Boolean),
              )
            }
            placeholder="Jose, JM, Cote"
            className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2 text-[12px]"
          />
          <span className="text-[9px] text-[#131218]/40 block mt-1">Comma-separated. Used so the AI recognises it&apos;s you in transcripts/messages.</span>
        </label>
      </section>

      {/* Own orgs */}
      <section className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4">
        <div className="flex items-center gap-3 mb-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45">Your organisations</p>
          <div className="flex-1 h-px bg-[#EFEFEA]" />
          <button
            onClick={addOrg}
            className="text-[9px] font-bold uppercase tracking-widest border border-[#131218]/20 text-[#131218] hover:border-[#131218]/50 px-2 py-1 rounded-lg"
          >
            + Add org
          </button>
        </div>
        {id.user_own_orgs.length === 0 && (
          <p className="text-[11px] text-[#131218]/45 italic">No organisations listed. The AI will not have a way to distinguish your own orgs from a contact&apos;s.</p>
        )}
        <div className="space-y-3">
          {id.user_own_orgs.map((o, i) => (
            <div key={i} className="bg-[#F7F7F3] border border-[#E0E0D8] rounded-lg px-3 py-3 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 block mb-0.5">Org name</span>
                    <input
                      type="text"
                      value={o.name}
                      onChange={(e) => updateOrg(i, "name", e.target.value)}
                      className="w-full border border-[#E0E0D8] rounded px-2 py-1.5 text-[12px] bg-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 block mb-0.5">Your role</span>
                    <input
                      type="text"
                      value={o.role ?? ""}
                      onChange={(e) => updateOrg(i, "role", e.target.value)}
                      placeholder="Co-founder, Founder, Director…"
                      className="w-full border border-[#E0E0D8] rounded px-2 py-1.5 text-[12px] bg-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 block mb-0.5">Your stake</span>
                    <input
                      type="text"
                      value={o.stake ?? ""}
                      onChange={(e) => updateOrg(i, "stake", e.target.value)}
                      placeholder="33.3%, 100%, minority…"
                      className="w-full border border-[#E0E0D8] rounded px-2 py-1.5 text-[12px] bg-white"
                    />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/50 block mb-0.5">Notes (optional)</span>
                    <input
                      type="text"
                      value={o.notes ?? ""}
                      onChange={(e) => updateOrg(i, "notes", e.target.value)}
                      placeholder="e.g. Personal consultancy, not linked to anyone else"
                      className="w-full border border-[#E0E0D8] rounded px-2 py-1.5 text-[12px] bg-white"
                    />
                  </label>
                </div>
                <button
                  onClick={() => removeOrg(i)}
                  className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 hover:text-red-700 mt-5"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Additional context */}
      <section className="bg-white border border-[#E0E0D8] rounded-2xl px-5 py-4 space-y-2">
        <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45">Additional context</p>
        <textarea
          value={id.additional_context ?? ""}
          onChange={(e) => patch("additional_context", e.target.value)}
          rows={4}
          placeholder="Anything the AI should always keep in mind about you (e.g. your timezone, primary language, standing collaborations, sensitive topics to avoid, etc.)"
          className="w-full border border-[#E0E0D8] rounded-lg px-3 py-2 text-[12px] leading-snug"
          maxLength={2000}
        />
        <span className="text-[9px] text-[#131218]/35 block">{(id.additional_context ?? "").length} / 2000</span>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !id.user_name.trim()}
          className="text-[10px] font-bold uppercase tracking-widest bg-[#131218] text-white px-4 py-2 rounded-lg hover:bg-[#131218]/80 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save grounding"}
        </button>
        {ok && <span className="text-[11px] text-emerald-700">Saved · takes effect on next regeneration</span>}
        {err && <span className="text-[11px] text-red-600">{err}</span>}
      </div>
    </div>
  );
}
