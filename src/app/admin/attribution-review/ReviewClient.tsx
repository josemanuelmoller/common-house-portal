"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

type Proposal = {
  id: string;
  evidence_id: string;
  evidence_snippet: string | null;
  current_project_notion_id: string | null;
  proposed_project_notion_id: string | null;
  proposed_project_name: string | null;
  proposed_org_notion_id: string | null;
  proposed_org_name: string | null;
  reason: string | null;
};
type Cat = { notion_id: string; name: string };

const ink = "var(--hall-ink-0)";
const muted = "var(--hall-muted-2)";
const line = "var(--hall-line, #E6E6DA)";
const panel = "var(--hall-paper-1, #fff)";
const accent = "var(--hall-accent, #B9E200)";

export default function ReviewClient() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [projects, setProjects] = useState<Cat[]>([]);
  const [orgs, setOrgs] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/attribution-proposals")
      .then(r => r.json())
      .then(d => { setProposals(d.proposals ?? []); setProjects(d.projects ?? []); setOrgs(d.orgs ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const act = useCallback(async (ids: string[], action: string, project_notion_id?: string | null) => {
    setBusy(prev => { const n = new Set(prev); ids.forEach(i => n.add(i)); return n; });
    await Promise.all(ids.map(id =>
      fetch("/api/admin/attribution-proposals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, project_notion_id }),
      }).catch(() => {})
    ));
    setProposals(prev => prev.filter(p => !ids.includes(p.id)));
    setBusy(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n; });
  }, []);

  const groups = useMemo(() => {
    const m = new Map<string, Proposal[]>();
    for (const p of proposals) {
      const k = p.proposed_project_name ?? (p.proposed_org_name ? `(org only) ${p.proposed_org_name}` : "(unclassified)");
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [proposals]);

  if (loading) return <p className="px-9 py-6 text-sm" style={{ color: muted }}>Loading proposals…</p>;
  if (proposals.length === 0)
    return <p className="px-9 py-6 text-sm" style={{ color: muted }}>Nothing to review — the queue is clear. ✓</p>;

  return (
    <div className="px-9 pb-16" style={{ maxWidth: 900 }}>
      <div className="mb-5 text-[11px] font-medium" style={{ color: muted, fontFamily: "var(--font-hall-mono)" }}>
        {proposals.length} PENDING · {groups.length} PROJECTS
      </div>

      {groups.map(([name, items]) => (
        <section key={name} className="mb-7" style={{ border: `1px solid ${line}`, borderRadius: 14, overflow: "hidden" }}>
          <div className="flex items-center justify-between gap-4 px-4 py-3" style={{ background: "var(--hall-paper-2, #F4F4EC)", borderBottom: `1px solid ${line}` }}>
            <div className="text-[14px] font-semibold" style={{ color: ink }}>
              {name} <span style={{ color: muted, fontWeight: 400 }}>· {items.length}</span>
            </div>
            <button
              onClick={() => act(items.map(i => i.id), "approve")}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: accent, color: "#16170F", border: "none", cursor: "pointer" }}
            >
              Approve all {items.length}
            </button>
          </div>

          <ul>
            {items.map(p => (
              <li key={p.id} className="px-4 py-3 flex flex-col gap-2" style={{ borderBottom: `1px solid ${line}`, opacity: busy.has(p.id) ? 0.5 : 1 }}>
                <div className="text-[13px] leading-snug" style={{ color: ink }}>{p.evidence_snippet ?? "(no text)"}</div>
                <div className="flex items-center gap-2 flex-wrap text-[11px]" style={{ color: muted }}>
                  {p.reason ? <span style={{ fontFamily: "var(--font-hall-mono)" }}>{p.reason}</span> : null}
                  {p.proposed_org_name ? <span>· org: {p.proposed_org_name}</span> : null}
                  {p.current_project_notion_id ? <span>· currently attributed elsewhere</span> : null}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => act([p.id], "approve")} disabled={busy.has(p.id)}
                    className="text-[12px] font-medium px-3 py-1 rounded-full" style={{ border: `1px solid ${ink}`, color: ink, background: "transparent", cursor: "pointer" }}>
                    Approve
                  </button>
                  <select defaultValue="" disabled={busy.has(p.id)}
                    onChange={e => { if (e.target.value) act([p.id], "adjust", e.target.value); }}
                    className="text-[12px] px-2 py-1 rounded-full" style={{ border: `1px solid ${line}`, color: ink, background: panel, cursor: "pointer", maxWidth: 220 }}>
                    <option value="">Adjust → project…</option>
                    {projects.map(pr => <option key={pr.notion_id} value={pr.notion_id}>{pr.name}</option>)}
                  </select>
                  <button onClick={() => act([p.id], "reject")} disabled={busy.has(p.id)}
                    className="text-[12px] font-medium px-3 py-1 rounded-full" style={{ border: `1px solid ${line}`, color: muted, background: "transparent", cursor: "pointer" }}>
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <div className="mt-2 text-[11px]" style={{ color: muted }}>Orgs available for reference: {orgs.length}. High-confidence attributions were applied automatically by the classifier.</div>
    </div>
  );
}
