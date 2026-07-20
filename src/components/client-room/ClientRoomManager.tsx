"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  ClientRoomAdminData,
  ClientRoomAgreement,
  ClientRoomMaterial,
  ClientRoomMaterialCategory,
  ClientRoomTimelineEvent,
} from "@/lib/client-room";

const TIMELINE_KINDS = ["meeting", "milestone", "document", "exchange"] as const;

const fieldStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--hall-line)",
  background: "var(--hall-paper-1)",
  borderRadius: 3,
  padding: "9px 10px",
  fontSize: 12,
  color: "var(--hall-ink-0)",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 5,
  fontFamily: "var(--font-hall-mono)",
  fontSize: 9,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  color: "var(--hall-muted-2)",
};

const CATEGORIES: Array<{ value: ClientRoomMaterialCategory; label: string }> = [
  { value: "plan_timeline", label: "Plan / timeline" },
  { value: "deliverable", label: "Deliverable" },
  { value: "presentation", label: "Presentation" },
  { value: "manual", label: "Manual" },
  { value: "working_document", label: "Working document" },
  { value: "contract_agreement", label: "Contract / agreement" },
  { value: "proposal_budget", label: "Proposal / budget" },
  { value: "purchase_order", label: "Purchase order" },
  { value: "invoice", label: "Invoice" },
  { value: "multimedia", label: "Multimedia" },
  { value: "other", label: "Other" },
];

async function apiJson(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function Feedback({ message, error }: { message: string | null; error?: boolean }) {
  if (!message) return null;
  return <p className="mt-2 text-[11px]" style={{ color: error ? "var(--hall-danger)" : "var(--hall-muted-2)" }}>{message}</p>;
}

export function ClientRoomSettings({ room }: { room: ClientRoomAdminData }) {
  const router = useRouter();
  const [slug, setSlug] = useState(room.slug);
  const [label, setLabel] = useState(room.roomLabel);
  const [status, setStatus] = useState(room.roomStatus);
  const [enabled, setEnabled] = useState(room.roomEnabled);
  const [driveFolderId, setDriveFolderId] = useState(room.driveFolderId ?? "");
  const [driveFolderUrl, setDriveFolderUrl] = useState(room.driveFolderUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/projects/${room.id}/client-room/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, label, status, enabled, driveFolderId, driveFolderUrl }),
      });
      setFailed(false);
      setMessage("Client room settings saved.");
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <label><span style={labelStyle}>Room label</span><input style={fieldStyle} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Project room" /></label>
      <label><span style={labelStyle}>Public slug</span><input style={fieldStyle} value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="automercado-refill" /></label>
      <label><span style={labelStyle}>Room status</span><select style={fieldStyle} value={status} onChange={(event) => setStatus(event.target.value)}>{["preparing", "shared", "active", "complete", "archived"].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="flex items-center gap-3 lg:mt-5"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span className="text-[12px] font-semibold">Make the room available to granted clients</span></label>
      <label><span style={labelStyle}>Google Drive folder ID</span><input style={fieldStyle} value={driveFolderId} onChange={(event) => setDriveFolderId(event.target.value)} placeholder="Folder ID" /></label>
      <label><span style={labelStyle}>Google Drive folder URL</span><input style={fieldStyle} value={driveFolderUrl} onChange={(event) => setDriveFolderUrl(event.target.value)} placeholder="https://drive.google.com/..." /></label>
      <div className="lg:col-span-2 flex flex-wrap items-center gap-3 pt-1">
        <button className="hall-btn-primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save room"}</button>
        {room.slug && room.roomEnabled && <Link className="hall-btn-ghost" href={`/hall/${room.slug}`} target="_blank">Open client view ↗</Link>}
        <Feedback message={message} error={failed} />
      </div>
    </form>
  );
}

type Grant = {
  id: string;
  granted_email: string;
  role: string;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

export function ClientAccessManager({ slug, hasDrive }: { slug: string; hasDrive: boolean }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [invite, setInvite] = useState(true);
  const [shareDrive, setShareDrive] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const loadGrants = useCallback(async () => {
    if (!slug) return;
    try {
      const payload = await apiJson(`/api/admin/client-access?slug=${encodeURIComponent(slug)}`);
      setGrants(payload.grants ?? []);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [slug]);

  useEffect(() => { void loadGrants(); }, [loadGrants]);

  async function grant(event: FormEvent) {
    event.preventDefault();
    if (!slug) return;
    setLoading(true);
    setMessage(null);
    try {
      const payload = await apiJson("/api/admin/client-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, slug, role, invite, shareDrive }),
      });
      setFailed(false);
      setMessage(payload.invitationWarning || payload.driveWarning || (payload.invitationSent ? "Access granted and invitation sent." : "Access granted."));
      setEmail("");
      await loadGrants();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function revoke(grantRow: Grant) {
    setLoading(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/client-access?email=${encodeURIComponent(grantRow.granted_email)}&slug=${encodeURIComponent(slug)}&reason=client-room-admin`, { method: "DELETE" });
      setFailed(false);
      setMessage("Access revoked.");
      await loadGrants();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-7">
      <form onSubmit={grant} className="space-y-3">
        <label><span style={labelStyle}>Work email</span><input type="email" required style={fieldStyle} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@client.com" /></label>
        <label><span style={labelStyle}>Permission</span><select style={fieldStyle} value={role} onChange={(event) => setRole(event.target.value)}><option value="viewer">Viewer — read only</option><option value="collaborator">Collaborator — respond to operational items</option><option value="approver">Approver — approve commercial and PO items</option></select></label>
        <label className="flex items-start gap-2 text-[11px]" style={{ color: "var(--hall-ink-3)" }}><input className="mt-0.5" type="checkbox" checked={invite} onChange={(event) => setInvite(event.target.checked)} /><span>Send an invitation if this person has not created an account yet.</span></label>
        <label className="flex items-start gap-2 text-[11px]" style={{ color: "var(--hall-ink-3)" }}><input className="mt-0.5" type="checkbox" checked={shareDrive} disabled={!hasDrive} onChange={(event) => setShareDrive(event.target.checked)} /><span>Also share the project Drive folder directly with this email.</span></label>
        <button className="hall-btn-primary" type="submit" disabled={loading || !slug}>{loading ? "Working…" : "Grant access"}</button>
        {!slug && <p className="text-[11px]" style={{ color: "var(--hall-warn)" }}>Save a room slug before granting access.</p>}
        <Feedback message={message} error={failed} />
      </form>
      <div>
        <p style={labelStyle}>Access history</p>
        {grants.length === 0 ? <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>No access grants yet.</p> : grants.map((grantRow) => (
          <div key={grantRow.id} className="flex flex-wrap items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
            <div className="flex-1 min-w-[180px]"><p className="text-[12px] font-semibold">{grantRow.granted_email}</p><p className="text-[10px]" style={{ color: "var(--hall-muted-2)" }}>{grantRow.role} · {grantRow.revoked_at ? "revoked" : "active"}</p></div>
            {!grantRow.revoked_at && <button type="button" className="hall-btn-ghost" disabled={loading} onClick={() => void revoke(grantRow)}>Revoke</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function MaterialEditor({ projectId, material }: { projectId: string; material: ClientRoomMaterial }) {
  const router = useRouter();
  const [visibility, setVisibility] = useState(material.visibility);
  const [status, setStatus] = useState(material.documentStatus);
  const [category, setCategory] = useState<ClientRoomMaterialCategory>(material.category);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/projects/${projectId}/client-room/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility, status, category }),
      });
      setMessage("Saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_180px_135px_120px_auto] gap-2 lg:items-center py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
      <div className="min-w-0"><a className="text-[12px] font-semibold hover:underline" href={material.url} target="_blank" rel="noreferrer">{material.title} ↗</a><p className="text-[10px] truncate" style={{ color: category === "presentation" && status === "current" ? "var(--hall-lime-ink)" : "var(--hall-muted-2)" }}>{material.folderName || "Unfiled"}{category === "presentation" && status === "current" ? " · ★ Preview del room" : ""}{message ? ` · ${message}` : ""}</p></div>
      <select aria-label={`Category for ${material.title}`} style={fieldStyle} value={category} onChange={(event) => setCategory(event.target.value as ClientRoomMaterialCategory)}>{CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <select aria-label={`Status for ${material.title}`} style={fieldStyle} value={status} onChange={(event) => setStatus(event.target.value)}>{["draft", "in_review", "current", "approved", "superseded", "archived"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
      <select aria-label={`Visibility for ${material.title}`} style={fieldStyle} value={visibility} onChange={(event) => setVisibility(event.target.value)}>{["internal", "proposed", "client", "restricted", "archived"].map((item) => <option key={item} value={item}>{item}</option>)}</select>
      <button type="button" className="hall-btn-ghost" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
    </div>
  );
}

export function ClientMaterialsManager({ room }: { room: ClientRoomAdminData }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncDrive() {
    setSyncing(true);
    setMessage(null);
    try {
      const payload = await apiJson(`/api/admin/projects/${room.id}/client-room/materials/sync-drive`, { method: "POST" });
      setMessage(`${payload.synced ?? 0} Drive files indexed. New files remain internal until you share them.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  }

  async function createFolder() {
    setCreating(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/projects/${room.id}/client-room/drive-folder`, { method: "POST" });
      setMessage("Drive folder created (Finanzas · Documentación · Presentaciones · Multimedia). Drop files in and sync.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<ClientRoomMaterialCategory>("presentation");
  async function uploadFile(e: FormEvent) {
    e.preventDefault();
    const input = fileRef.current;
    if (!input?.files?.[0]) { setMessage("Choose a PDF or PPTX first"); return; }
    setUploading(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", input.files[0]);
      fd.append("category", uploadCategory);
      const res = await fetch(`/api/admin/projects/${room.id}/client-room/materials/upload`, { method: "POST", body: fd });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || `Upload failed (${res.status})`);
      setMessage("Uploaded — previews inline in the room. Stays internal until you set it to client.");
      if (input) input.value = "";
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <form onSubmit={(e) => void uploadFile(e)} className="flex flex-wrap items-center gap-2 mb-3 p-3" style={{ border: "1px solid var(--hall-line)", borderRadius: 6 }}>
        <span className="text-[11px] font-semibold" style={{ color: "var(--hall-muted-2)" }}>Upload PDF / PPTX</span>
        <input ref={fileRef} type="file" accept=".pdf,.pptx,application/pdf" className="text-[11px]" />
        <select aria-label="Category" style={{ ...fieldStyle, width: 170 }} value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value as ClientRoomMaterialCategory)}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
        <button type="submit" className="hall-btn-primary" disabled={uploading}>{uploading ? "Uploading…" : "Upload"}</button>
        <span className="text-[10px]" style={{ color: "var(--hall-muted-2)" }}>PDF previews inline; NDA/contracts → Contract. Max 25MB.</span>
      </form>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {room.driveFolderId
          ? <button type="button" className="hall-btn-ghost" disabled={syncing} onClick={() => void syncDrive()}>{syncing ? "Syncing…" : "Sync Google Drive"}</button>
          : <button type="button" className="hall-btn-ghost" disabled={creating} onClick={() => void createFolder()}>{creating ? "Creating…" : "Create Drive folder"}</button>}
        {room.driveFolderUrl && <a className="hall-btn-ghost" href={room.driveFolderUrl} target="_blank" rel="noreferrer">Open Drive ↗</a>}
        <Feedback message={message} />
      </div>
      {!room.driveFolderId && <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>No Drive folder yet. Create one to hold this room&apos;s documents (NDA, proposal, contracts). It stays private until you share it at invite time.</p>}
      {room.materials.length === 0 ? <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>No indexed materials yet.</p> : room.materials.map((material) => <MaterialEditor key={material.id} projectId={room.id} material={material} />)}
    </div>
  );
}

function NarrativeField({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <div className="mb-3">
      <label style={labelStyle}>{label}</label>
      {area
        ? <textarea style={{ ...fieldStyle, minHeight: 58 }} value={value} onChange={(e) => onChange(e.target.value)} />
        : <input style={fieldStyle} value={value} onChange={(e) => onChange(e.target.value)} />}
    </div>
  );
}

export function NarrativeManager({ room }: { room: ClientRoomAdminData }) {
  const router = useRouter();
  const [f, setF] = useState({
    welcomeNote: room.welcomeNote ?? "",
    currentFocus: room.currentFocus ?? "",
    nextMilestone: room.nextMilestone ?? "",
    challenge: room.whatWeHeard.challenge ?? "",
    mattersMost: room.whatWeHeard.mattersMost ?? "",
    obstacles: room.whatWeHeard.obstacles ?? "",
    success: room.whatWeHeard.success ?? "",
    proposalStatus: room.proposal.status ?? "",
    proposalSummary: room.proposal.summary ?? "",
  });
  const [plan, setPlan] = useState<Array<{ date: string; label: string; type: string }>>(
    room.timeline.map((t) => ({ date: t.date ?? "", label: t.label ?? "", type: t.type ?? "future" }))
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/projects/${room.id}/client-room/content`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, plan: plan.filter((p) => p.label.trim()) }),
      });
      setMessage("Guardado");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-[11px] mb-4" style={{ color: "var(--hall-muted-2)" }}>Edita a mano lo que muestra el room. Todo queda interno hasta que compartas / publiques.</p>
      <NarrativeField label="Nota de bienvenida" value={f.welcomeNote} onChange={set("welcomeNote")} area />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <NarrativeField label="Foco actual" value={f.currentFocus} onChange={set("currentFocus")} />
        <NarrativeField label="Próximo hito" value={f.nextMilestone} onChange={set("nextMilestone")} />
      </div>

      <p className="mt-4 mb-2 text-[11px] font-semibold" style={{ fontFamily: "var(--font-hall-mono)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--hall-muted-2)" }}>Lo que escuchamos</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        <NarrativeField label="El reto" value={f.challenge} onChange={set("challenge")} area />
        <NarrativeField label="Lo que más importa" value={f.mattersMost} onChange={set("mattersMost")} area />
        <NarrativeField label="Lo que puede estorbar" value={f.obstacles} onChange={set("obstacles")} area />
        <NarrativeField label="Cómo se ve el éxito" value={f.success} onChange={set("success")} area />
      </div>

      <p className="mt-4 mb-2 text-[11px] font-semibold" style={{ fontFamily: "var(--font-hall-mono)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--hall-muted-2)" }}>Propuesta</p>
      <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-x-3">
        <NarrativeField label="Estado" value={f.proposalStatus} onChange={set("proposalStatus")} />
        <NarrativeField label="Resumen" value={f.proposalSummary} onChange={set("proposalSummary")} area />
      </div>

      <div className="flex items-center justify-between mt-4 mb-2">
        <p className="text-[11px] font-semibold" style={{ fontFamily: "var(--font-hall-mono)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--hall-muted-2)" }}>Plan</p>
        <button type="button" className="hall-btn-ghost" onClick={() => setPlan((p) => [...p, { date: "", label: "", type: "future" }])}>+ Hito</button>
      </div>
      {plan.map((row, i) => (
        <div key={i} className="grid grid-cols-[120px_1fr_120px_auto] gap-2 mb-2 items-center">
          <input aria-label="Fecha" style={fieldStyle} placeholder="Q3 2026" value={row.date} onChange={(e) => setPlan((p) => p.map((r, j) => j === i ? { ...r, date: e.target.value } : r))} />
          <input aria-label="Hito" style={fieldStyle} placeholder="Descripción del hito" value={row.label} onChange={(e) => setPlan((p) => p.map((r, j) => j === i ? { ...r, label: e.target.value } : r))} />
          <select aria-label="Tipo" style={fieldStyle} value={row.type} onChange={(e) => setPlan((p) => p.map((r, j) => j === i ? { ...r, type: e.target.value } : r))}>{["past", "today", "future"].map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <button type="button" className="hall-btn-ghost" style={{ color: "var(--hall-danger)" }} onClick={() => setPlan((p) => p.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}

      <div className="flex items-center gap-3 mt-4">
        <button type="button" className="hall-btn-primary" disabled={busy} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar relato"}</button>
        <Feedback message={message} />
      </div>
    </div>
  );
}

function TimelineEventEditor({ projectId, event }: { projectId: string; event: ClientRoomTimelineEvent }) {
  const router = useRouter();
  const [eventDate, setEventDate] = useState(event.eventDate);
  const [kind, setKind] = useState(event.kind);
  const [title, setTitle] = useState(event.title);
  const [attendees, setAttendees] = useState(event.attendees.join(", "));
  const [summary, setSummary] = useState(event.summary ?? "");
  const [visibility, setVisibility] = useState(event.visibility);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/projects/${projectId}/client-room/timeline/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventDate, kind, title, summary, visibility,
          attendees: attendees.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      setMessage("Saved");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${title}" from the timeline?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/projects/${projectId}/client-room/timeline/${event.id}`, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  }

  const dirty =
    eventDate !== event.eventDate ||
    kind !== event.kind ||
    title !== event.title ||
    attendees !== event.attendees.join(", ") ||
    summary !== (event.summary ?? "") ||
    visibility !== event.visibility;

  return (
    <div className="py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
      <div className="grid grid-cols-1 sm:grid-cols-[130px_140px_1fr] gap-2 mb-2">
        <input type="date" aria-label="Event date" style={fieldStyle} value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        <select aria-label="Kind" style={fieldStyle} value={kind} onChange={(e) => setKind(e.target.value as ClientRoomTimelineEvent["kind"])}>{TIMELINE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        <input aria-label="Title" style={fieldStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
      </div>
      <input aria-label="Attendees" style={{ ...fieldStyle, marginBottom: 8 }} value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Attendees, comma-separated — e.g. José Moller (Common House), Javier Valdivia (MPS)" />
      <textarea aria-label="Summary" style={{ ...fieldStyle, marginBottom: 8, minHeight: 52 }} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" />
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Visibility" style={{ ...fieldStyle, width: 130 }} value={visibility} onChange={(e) => setVisibility(e.target.value)}>{["internal", "client", "archived"].map((v) => <option key={v} value={v}>{v}</option>)}</select>
        <button type="button" className="hall-btn-primary" disabled={busy || !dirty} onClick={() => void save()}>{busy ? "Saving…" : dirty ? "Save changes" : "Saved"}</button>
        <button type="button" className="hall-btn-ghost" disabled={busy} onClick={() => void remove()} style={{ color: "var(--hall-danger)" }}>Delete</button>
        {dirty && <span className="text-[10px] font-semibold" style={{ color: "var(--hall-warn)" }}>● Unsaved changes</span>}
        {visibility === "internal" && <span className="text-[10px]" style={{ color: "var(--hall-muted-2)" }}>Not visible to client</span>}
        <Feedback message={message} />
      </div>
    </div>
  );
}

export function TimelineManager({ room }: { room: ClientRoomAdminData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ eventDate: "", kind: "meeting" as ClientRoomTimelineEvent["kind"], title: "", attendees: "", location: "", summary: "" });
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function syncCalendar() {
    setSyncing(true);
    setMessage(null);
    try {
      const r = await apiJson(`/api/admin/projects/${room.id}/client-room/timeline/sync-calendar`, { method: "POST" });
      setMessage(`Calendar: ${r.created ?? 0} nuevas · ${r.updated ?? 0} actualizadas (${r.matched ?? 0} reuniones con ${(r.domains ?? []).join(", ")}). Quedan internal — borra las que no correspondan.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/projects/${room.id}/client-room/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          attendees: form.attendees.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      setForm({ eventDate: "", kind: "meeting", title: "", attendees: "", location: "", summary: "" });
      setOpen(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button type="button" className="hall-btn-primary" onClick={() => setOpen((v) => !v)}>{open ? "Close" : "Add event"}</button>
        <button type="button" className="hall-btn-ghost" disabled={syncing} onClick={() => void syncCalendar()}>{syncing ? "Syncing…" : "Sync calendar"}</button>
        <span className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>Meetings, signed documents and milestones. Every event stays internal until you set it to client.</span>
        <Feedback message={message} />
      </div>
      {open && (
        <form onSubmit={(e) => void add(e)} className="mb-5 p-3" style={{ border: "1px solid var(--hall-line)", borderRadius: 4 }}>
          <div className="grid grid-cols-1 sm:grid-cols-[130px_140px_1fr] gap-2 mb-2">
            <div><label style={labelStyle}>Date</label><input type="date" required style={fieldStyle} value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} /></div>
            <div><label style={labelStyle}>Kind</label><select style={fieldStyle} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ClientRoomTimelineEvent["kind"] })}>{TIMELINE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
            <div><label style={labelStyle}>Title</label><input required style={fieldStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Discovery session — MPS × Common House" /></div>
          </div>
          <label style={labelStyle}>Attendees (comma-separated)</label>
          <input style={{ ...fieldStyle, marginBottom: 8 }} value={form.attendees} onChange={(e) => setForm({ ...form, attendees: e.target.value })} placeholder="José Moller (Common House), Javier Valdivia (MPS)" />
          <label style={labelStyle}>Summary</label>
          <textarea style={{ ...fieldStyle, marginBottom: 8, minHeight: 52 }} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
          <button type="submit" className="hall-btn-primary" disabled={busy}>{busy ? "Adding…" : "Add to timeline"}</button>
        </form>
      )}
      {room.timelineEvents.length === 0
        ? <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>No timeline events yet.</p>
        : room.timelineEvents.map((event) => <TimelineEventEditor key={event.id} projectId={room.id} event={event} />)}
    </div>
  );
}

function AgreementRow({ agreement }: { agreement: ClientRoomAgreement }) {
  return (
    <div className="flex flex-wrap items-start gap-3 py-3" style={{ borderBottom: "1px solid var(--hall-line-soft)" }}>
      <div className="flex-1 min-w-[220px]"><p className="text-[12px] font-semibold">{agreement.title}</p><p className="mt-0.5 text-[10px]" style={{ color: "var(--hall-muted-2)" }}>{agreement.agreementType.replaceAll("_", " ")} · version {agreement.version}{agreement.respondedEmail ? ` · ${agreement.respondedEmail}` : ""}</p>{agreement.summary && <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--hall-ink-3)" }}>{agreement.summary}</p>}</div>
      <span className={agreement.visibility === "client" ? "hall-chip-dark" : "hall-chip-outline"}>{agreement.status.replaceAll("_", " ")}</span>
    </div>
  );
}

export function AgreementsManager({ room }: { room: ClientRoomAdminData }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [type, setType] = useState("operational");
  const [share, setShare] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiJson(`/api/admin/projects/${room.id}/client-room/agreements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, summary, type, share }),
      });
      setTitle("");
      setSummary("");
      setMessage(share ? "Agreement shared with the client." : "Draft saved internally.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,420px)_1fr] gap-7">
      <form onSubmit={create} className="space-y-3">
        <label><span style={labelStyle}>Agreement title</span><input required style={fieldStyle} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Pilot scope and success criteria" /></label>
        <label><span style={labelStyle}>Type</span><select style={fieldStyle} value={type} onChange={(event) => setType(event.target.value)}>{["understanding", "decision", "scope", "timeline", "deliverable", "commercial", "purchase_order", "operational"].map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
        <label><span style={labelStyle}>What is being agreed</span><textarea rows={5} style={fieldStyle} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="A concise, client-readable record of the decision or approval." /></label>
        <label className="flex items-start gap-2 text-[11px]" style={{ color: "var(--hall-ink-3)" }}><input className="mt-0.5" type="checkbox" checked={share} onChange={(event) => setShare(event.target.checked)} /><span>Share now and request a response. Uncheck to keep it as an internal draft.</span></label>
        <button type="submit" className="hall-btn-primary" disabled={saving}>{saving ? "Saving…" : share ? "Share for response" : "Save draft"}</button>
        <Feedback message={message} />
      </form>
      <div>{room.agreements.length === 0 ? <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>No agreements recorded yet.</p> : room.agreements.map((agreement) => <AgreementRow key={agreement.id} agreement={agreement} />)}</div>
    </div>
  );
}
