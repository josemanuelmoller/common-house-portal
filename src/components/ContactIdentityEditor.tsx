"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Inline editor for the contact profile's Identity block. Lets the user
 * complete missing fields (full name, display name, LinkedIn, job title,
 * phone, notes) and save via POST /api/hall-contacts/profile.
 *
 * Saves mark the fields as `manual` — future agent runs will not overwrite
 * them. Use this to add a last name ("Carlos" → "Carlos Silva") or fix a
 * bad LinkedIn match the agent made.
 */

type Initial = {
  full_name:    string | null;
  display_name: string | null;
  linkedin:     string | null;
  job_title:    string | null;
  phone:        string | null;
  notes:        string | null;
  city:         string | null;
  country:      string | null;
};

export function ContactIdentityEditor({
  personId,
  initial,
}: {
  personId: string;
  initial:  Initial;
}) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [, startTransition]   = useTransition();

  const [values, setValues] = useState<Initial>(initial);

  // Only include fields that actually changed from initial. An empty string
  // means "clear the field"; `null` in initial → "" in the input is a no-op.
  function diffPayload(): Record<string, string | null> {
    const out: Record<string, string | null> = { person_id: personId };
    (Object.keys(values) as Array<keyof Initial>).forEach(k => {
      const newVal = (values[k] ?? "").trim();
      const oldVal = (initial[k] ?? "").trim();
      if (newVal !== oldVal) {
        out[k] = newVal === "" ? null : newVal;
      }
    });
    return out;
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const payload = diffPayload();
      if (Object.keys(payload).length <= 1) {
        setErr("No changes to save");
        setSaving(false);
        return;
      }
      const res = await fetch("/api/hall-contacts/profile", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const j = await res.json();
      if (res.status === 409) {
        setErr(`Email already used by ${j.conflict_with?.full_name ?? j.conflict_with?.email ?? "another contact"}.`);
        return;
      }
      if (!res.ok) throw new Error(j.error ?? "save failed");
      setOpen(false);
      startTransition(() => router.refresh());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof Initial>(key: K, v: string) {
    setValues(prev => ({ ...prev, [key]: v }));
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-[10px] font-bold uppercase tracking-widest border border-[#0a0a0a]/20 text-[#0a0a0a]/70 hover:text-[#0a0a0a] hover:border-[#0a0a0a]/50 px-3 py-1.5 rounded-lg"
      >
        ✎ Edit identity
      </button>
    );
  }

  return (
    <div className="w-full mt-3 bg-[#F7F7F3] border border-[#e4e4dd] rounded-2xl px-4 py-4 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Input label="Full name"    value={values.full_name    ?? ""} onChange={v => setField("full_name",    v)} placeholder="Carlos Silva" />
        <Input label="Display name" value={values.display_name ?? ""} onChange={v => setField("display_name", v)} placeholder="(how it appears)" />
        <Input label="LinkedIn"     value={values.linkedin     ?? ""} onChange={v => setField("linkedin",     v)} placeholder="https://linkedin.com/in/…" />
        <Input label="Job title"    value={values.job_title    ?? ""} onChange={v => setField("job_title",    v)} placeholder="Head of …" />
        <Input label="Phone"        value={values.phone        ?? ""} onChange={v => setField("phone",        v)} placeholder="+56 9 …" />
        <Input label="City"         value={values.city         ?? ""} onChange={v => setField("city",         v)} placeholder="" />
        <Input label="Country"      value={values.country      ?? ""} onChange={v => setField("country",      v)} placeholder="" />
      </div>
      <div>
        <label className="text-[9px] font-bold uppercase tracking-widest text-[#0a0a0a]/45 mb-1 block">Notes</label>
        <textarea
          value={values.notes ?? ""}
          onChange={e => setField("notes", e.target.value)}
          rows={3}
          className="w-full text-[12px] px-3 py-2 rounded-lg border border-[#e4e4dd] bg-white outline-none focus:border-[#0a0a0a]/30 resize-y"
        />
      </div>
      {err && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="text-[10px] font-bold uppercase tracking-widest bg-[#0a0a0a] text-white px-4 py-2 rounded-lg hover:bg-[#0a0a0a]/80 disabled:opacity-40"
        >
          {saving ? "Saving…" : "✓ Save"}
        </button>
        <button
          onClick={() => { setOpen(false); setValues(initial); setErr(null); }}
          disabled={saving}
          className="text-[10px] font-bold uppercase tracking-widest text-[#0a0a0a]/50 hover:text-[#0a0a0a] px-2"
        >
          Cancel
        </button>
        <span className="text-[10px] text-[#0a0a0a]/40 ml-auto">
          Saved values are marked as manual — the agent will not overwrite them on future runs.
        </span>
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[9px] font-bold uppercase tracking-widest text-[#0a0a0a]/45 mb-1 block">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[12px] px-3 py-1.5 rounded-lg border border-[#e4e4dd] bg-white outline-none focus:border-[#0a0a0a]/30"
      />
    </div>
  );
}
