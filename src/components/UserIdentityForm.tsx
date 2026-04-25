"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type UserIdentityValues = {
  user_name:         string;
  user_aliases:      string[];
  user_own_orgs:     string[];
  user_role_context: string;
};

/**
 * Form that edits the single user_identity row. Saved values are injected
 * into every AI prompt for contacts so Claude knows whose perspective it
 * writes from — prevents hallucinations like "Francisco is partner at
 * Moller Upstream" when Moller Upstream is actually only the user's company.
 */
export function UserIdentityForm({ initial }: { initial: UserIdentityValues }) {
  const router = useRouter();
  const [values, setValues] = useState<UserIdentityValues>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);
  const [err, setErr]       = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Inputs for comma-separated arrays — edit as text, split on save.
  const [aliasesText, setAliasesText] = useState(initial.user_aliases.join(", "));
  const [orgsText, setOrgsText]       = useState(initial.user_own_orgs.join("\n"));

  async function save() {
    setSaving(true);
    setErr(null);
    setSaved(false);
    try {
      const payload = {
        user_name: values.user_name,
        user_aliases: aliasesText.split(",").map(s => s.trim()).filter(Boolean),
        user_own_orgs: orgsText.split("\n").map(s => s.trim()).filter(Boolean),
        user_role_context: values.user_role_context,
      };
      const res = await fetch("/api/user-identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "save failed");
      setSaved(true);
      setValues({
        user_name:         j.identity.user_name ?? "",
        user_aliases:      j.identity.user_aliases ?? [],
        user_own_orgs:     j.identity.user_own_orgs ?? [],
        user_role_context: j.identity.user_role_context ?? "",
      });
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] px-6 py-5 space-y-5">
      <div>
        <label className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">Full name</label>
        <input
          type="text"
          value={values.user_name}
          onChange={e => setValues(v => ({ ...v, user_name: e.target.value }))}
          placeholder="José Manuel Moller"
          className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30"
        />
      </div>

      <div>
        <label className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">
          Aliases <span className="text-[#131218]/35 font-medium normal-case">· comma-separated · how people might address you informally</span>
        </label>
        <input
          type="text"
          value={aliasesText}
          onChange={e => setAliasesText(e.target.value)}
          placeholder="Jose, JM, Cote"
          className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30"
        />
      </div>

      <div>
        <label className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">
          Your own organisations <span className="text-[#131218]/35 font-medium normal-case">· one per line · orgs you own or co-own</span>
        </label>
        <textarea
          value={orgsText}
          onChange={e => setOrgsText(e.target.value)}
          rows={4}
          placeholder={"Common House\nMoller Upstream Consultancy"}
          className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30 resize-y"
        />
        <p className="text-[10px] text-[#131218]/50 mt-1.5 leading-snug">
          Prevents the AI from attributing these orgs to OTHER contacts. If a contact is also a co-founder/partner in one of these, that still gets surfaced — only wrong assumptions are blocked.
        </p>
      </div>

      <div>
        <label className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/45 mb-1 block">
          Role context <span className="text-[#131218]/35 font-medium normal-case">· one paragraph · free-form</span>
        </label>
        <textarea
          value={values.user_role_context}
          onChange={e => setValues(v => ({ ...v, user_role_context: e.target.value }))}
          rows={4}
          placeholder="Founder & CEO of Common House. Sole owner of Moller Upstream Consultancy. Based in London. Focus: circular economy, climate finance, retail partnerships in LATAM + UK."
          className="w-full text-[13px] px-3 py-2 rounded-lg border border-[#E0E0D8] bg-white outline-none focus:border-[#131218]/30 resize-y"
        />
      </div>

      {err && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      {saved && !err && <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">✓ Saved. Future AI outputs for your contacts will use this context.</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="text-[11px] font-bold uppercase tracking-widest bg-[#131218] text-white px-4 py-2 rounded-lg hover:bg-[#131218]/80 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <span className="text-[10px] text-[#131218]/40">
          Applies to every AI summary, open loops, news scan and topics synthesis.
        </span>
      </div>
    </div>
  );
}
