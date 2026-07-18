"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ProjectLearningItem, ProjectStateItem, ProjectStateView } from "@/lib/project-state";

const field: CSSProperties = { width: "100%", border: "1px solid var(--hall-line)", background: "var(--hall-paper-1)", borderRadius: 3, padding: "9px 10px", fontSize: 12, color: "var(--hall-ink-0)" };
const label: CSSProperties = { display: "block", marginBottom: 5, fontFamily: "var(--font-hall-mono)", fontSize: 9, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--hall-muted-2)" };

async function api(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function dateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

function Notice({ text, error }: { text: string | null; error?: boolean }) {
  return text ? <p className="mt-2 text-[11px]" style={{ color: error ? "var(--hall-danger)" : "var(--hall-muted-2)" }}>{text}</p> : null;
}

export function CurrentStateEditor({ view }: { view: ProjectStateView }) {
  const router = useRouter();
  const initial = view.state;
  const [summary, setSummary] = useState(initial?.currentSummary ?? "");
  const [phase, setPhase] = useState(initial?.currentPhase ?? "");
  const [focus, setFocus] = useState(initial?.currentFocus ?? "");
  const [health, setHealth] = useState<string>(initial?.health ?? "unknown");
  const [confidence, setConfidence] = useState(String(initial?.confidence ?? 50));
  const [status, setStatus] = useState<string>(initial?.stateStatus ?? "draft");
  const [nextCheckInAt, setNextCheckInAt] = useState(dateInput(initial?.nextCheckInAt));
  const [staleAfter, setStaleAfter] = useState(dateInput(initial?.staleAfter));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage(null);
    try {
      await api(`/api/admin/projects/${view.projectId}/state`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentSummary: summary, currentPhase: phase, currentFocus: focus, health, confidence: Number(confidence), stateStatus: status, nextCheckInAt, staleAfter }) });
      setFailed(false); setMessage("Current state saved as a revision."); router.refresh();
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  }

  return <form onSubmit={save} className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <label className="md:col-span-2"><span style={label}>Current summary</span><textarea rows={5} style={field} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="What is true now? Keep it concise and factual." /></label>
    <label><span style={label}>Current phase</span><input style={field} value={phase} onChange={(event) => setPhase(event.target.value)} placeholder="e.g. implementation design" /></label>
    <label><span style={label}>Current focus</span><input style={field} value={focus} onChange={(event) => setFocus(event.target.value)} placeholder="The one thing that needs to move" /></label>
    <label><span style={label}>Health</span><select style={field} value={health} onChange={(event) => setHealth(event.target.value)}>{["on_track", "watch", "blocked", "paused", "unknown"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
    <label><span style={label}>Confidence (0–100)</span><input type="number" min="0" max="100" style={field} value={confidence} onChange={(event) => setConfidence(event.target.value)} /></label>
    <label><span style={label}>Next check-in</span><input type="date" style={field} value={nextCheckInAt} onChange={(event) => setNextCheckInAt(event.target.value)} /></label>
    <label><span style={label}>Review / stale after</span><input type="date" style={field} value={staleAfter} onChange={(event) => setStaleAfter(event.target.value)} /></label>
    <label><span style={label}>State status</span><select style={field} value={status} onChange={(event) => setStatus(event.target.value)}>{["draft", "current", "stale", "archived"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <div className="md:col-span-2"><button className="hall-btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save current state"}</button><Notice text={message} error={failed} /></div>
  </form>;
}

function StateItemRow({ projectId, item }: { projectId: string; item: ProjectStateItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function change(status: string) {
    setBusy(true); setMessage(null);
    try {
      await api(`/api/admin/projects/${projectId}/state/items/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(status === "active" ? { status, lastConfirmedAt: new Date().toISOString() } : { status }) });
      setMessage(status === "active" ? "Confirmed" : `${status.replaceAll("_", " ")} saved`); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  return <article className="py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><div className="flex flex-wrap items-start gap-3"><div className="flex-1 min-w-[230px]"><p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{item.itemType.replaceAll("_", " ")} · {item.status} · {item.confidence}% confidence</p><p className="mt-1 text-[13px] font-semibold">{item.statement}</p><p className="mt-1 text-[10px]" style={{ color: "var(--hall-muted-2)" }}>{[item.ownerLabel, item.stakeholderLabel, item.sourceRefs.length ? `${item.sourceRefs.length} source refs` : null, item.staleAfter ? `review ${dateInput(item.staleAfter)}` : null].filter(Boolean).join(" · ")}</p>{item.linkedEntities.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{item.linkedEntities.map((e) => <Link key={`${e.entityType}:${e.entityId}:${e.relation}`} href={`/admin/entities/${e.entityType}/${e.entityId}`} className="hall-chip-outline" style={{ textDecoration: "none" }}>{e.relation}: {e.entityName}</Link>)}</div>}</div>{item.status === "active" && <div className="flex gap-2"><button className="hall-btn-ghost" type="button" disabled={busy} onClick={() => void change("active")}>Confirm</button><button className="hall-btn-ghost" type="button" disabled={busy} onClick={() => void change("resolved")}>Resolve</button></div>}</div>{message && <p className="mt-1 text-[10px]" style={{ color: "var(--hall-muted-2)" }}>{message}</p>}</article>;
}

export function StateItemsManager({ view }: { view: ProjectStateView }) {
  const router = useRouter();
  const [statement, setStatement] = useState("");
  const [itemType, setItemType] = useState("risk");
  const [stakeholderLabel, setStakeholderLabel] = useState("");
  const [sourceRefs, setSourceRefs] = useState("");
  const [confidence, setConfidence] = useState("50");
  const [staleAfter, setStaleAfter] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(null);
    try {
      await api(`/api/admin/projects/${view.projectId}/state/items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statement, itemType, stakeholderLabel, sourceRefs, confidence: Number(confidence), staleAfter }) });
      setStatement(""); setStakeholderLabel(""); setSourceRefs(""); setMessage("State item added."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }
  return <div className="grid grid-cols-1 lg:grid-cols-[minmax(290px,390px)_1fr] gap-7"><form onSubmit={create} className="space-y-3"><label><span style={label}>Claim or signal</span><textarea required rows={4} style={field} value={statement} onChange={(event) => setStatement(event.target.value)} placeholder="A decision, risk, question or observable signal to keep current." /></label><label><span style={label}>Type</span><select style={field} value={itemType} onChange={(event) => setItemType(event.target.value)}>{["decision", "commitment", "risk", "dependency", "question", "milestone", "stakeholder_signal", "assumption", "outcome"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label><span style={label}>Stakeholder / owner</span><input style={field} value={stakeholderLabel} onChange={(event) => setStakeholderLabel(event.target.value)} placeholder="e.g. Quality — Automercado" /></label><label><span style={label}>Source or evidence IDs</span><input style={field} value={sourceRefs} onChange={(event) => setSourceRefs(event.target.value)} placeholder="Comma-separated IDs" /></label><div className="grid grid-cols-2 gap-3"><label><span style={label}>Confidence</span><input type="number" min="0" max="100" style={field} value={confidence} onChange={(event) => setConfidence(event.target.value)} /></label><label><span style={label}>Review by</span><input type="date" style={field} value={staleAfter} onChange={(event) => setStaleAfter(event.target.value)} /></label></div><button className="hall-btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Add to current state"}</button><Notice text={message} /></form><div>{view.items.length === 0 ? <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>No state claims yet. Add only what someone should act on, confirm, or let expire.</p> : view.items.map((item) => <StateItemRow key={item.id} projectId={view.projectId} item={item} />)}</div></div>;
}

function LearningRow({ projectId, learning }: { projectId: string; learning: ProjectLearningItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  async function update(payload: Record<string, string>) {
    setBusy(true); setMessage(null);
    try { await api(`/api/admin/projects/${projectId}/learning/${learning.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); router.refresh(); }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  async function promote() {
    setBusy(true); setMessage(null);
    try { const body = await api(`/api/admin/projects/${projectId}/learning/${learning.id}/promote`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); setFailed(false); setMessage(`Promoted to knowledge: ${body.assetTitle || "asset"}`); router.refresh(); }
    catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  }
  const promoted = learning.status === "promoted";
  const canPromote = learning.transferability === "candidate" || learning.transferability === "confirmed";
  return <article className="py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}><div className="flex flex-wrap items-start gap-3"><div className="flex-1 min-w-[230px]"><p className="text-[10px] uppercase tracking-[0.07em]" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>{learning.area || "Implementation"} · {learning.learningType.replaceAll("_", " ")} · {learning.transferability} · {learning.status}</p><p className="mt-1 text-[13px] font-semibold">{learning.title}</p><p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{learning.observation}</p>{learning.implication && <p className="mt-1 text-[11px]" style={{ color: "var(--hall-muted-2)" }}>So what: {learning.implication}</p>}{message && <p className="mt-1 text-[10px]" style={{ color: failed ? "var(--hall-danger)" : "var(--hall-muted-2)" }}>{message}</p>}</div>{promoted ? <span className="hall-chip-outline">Promoted ✓</span> : <div className="flex gap-2"><button className="hall-btn-ghost" type="button" disabled={busy} onClick={() => void update({ status: "review" })}>Review</button><button className="hall-btn-ghost" type="button" disabled={busy} onClick={() => void update({ transferability: "candidate" })}>Candidate</button>{canPromote && <button className="hall-btn-primary" type="button" disabled={busy} onClick={() => void promote()}>Promote →</button>}</div>}</div></article>;
}

export function LearningManager({ view }: { view: ProjectStateView }) {
  const router = useRouter();
  const [title, setTitle] = useState(""); const [observation, setObservation] = useState(""); const [area, setArea] = useState(""); const [implication, setImplication] = useState(""); const [learningType, setLearningType] = useState("implementation_question"); const [sourceRefs, setSourceRefs] = useState(""); const [saving, setSaving] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function create(event: FormEvent) { event.preventDefault(); setSaving(true); setMessage(null); try { await api(`/api/admin/projects/${view.projectId}/learning`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, observation, area, implication, learningType, sourceRefs }) }); setTitle(""); setObservation(""); setArea(""); setImplication(""); setSourceRefs(""); setMessage("Implementation learning captured as an observation, not yet institutional knowledge."); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); } }
  return <div className="grid grid-cols-1 lg:grid-cols-[minmax(290px,390px)_1fr] gap-7"><form onSubmit={create} className="space-y-3"><label><span style={label}>What did we learn?</span><input required style={field} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Quality needs an exception path before pilot launch" /></label><label><span style={label}>Area / team</span><input style={field} value={area} onChange={(event) => setArea(event.target.value)} placeholder="Quality, Marketing, Store operations…" /></label><label><span style={label}>Type</span><select style={field} value={learningType} onChange={(event) => setLearningType(event.target.value)}>{["implementation_question", "stakeholder_need", "friction", "decision_pattern", "operating_pattern", "outcome"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label><span style={label}>Observation</span><textarea required rows={4} style={field} value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="What was said or observed? Keep the evidence separate from the interpretation." /></label><label><span style={label}>Implication for the next implementation</span><textarea rows={3} style={field} value={implication} onChange={(event) => setImplication(event.target.value)} placeholder="What should we anticipate, ask or build differently next time?" /></label><label><span style={label}>Source or evidence IDs</span><input style={field} value={sourceRefs} onChange={(event) => setSourceRefs(event.target.value)} placeholder="Comma-separated IDs" /></label><button className="hall-btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Capture learning"}</button><Notice text={message} /></form><div>{view.learnings.length === 0 ? <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>No implementation learning captured yet.</p> : view.learnings.map((learning) => <LearningRow key={learning.id} projectId={view.projectId} learning={learning} />)}</div></div>;
}
