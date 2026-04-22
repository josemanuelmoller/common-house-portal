"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AgentDraft } from "@/lib/notion";

const DRAFT_TYPE_ICON: Record<string, string> = {
  "LinkedIn Post":    "in",
  "Follow-up Email":  "✉",
  "Check-in Email":   "✉",
  "Market Signals":   "◉",
  "Quick Win Scan":   "⚡",
  "Delegation Brief": "→",
};

type DraftState = "pending" | "approving" | "approved" | "revision" | "sending" | "sent" | "send_error";
type PersonOption = { id: string; name: string; email: string };

// Gmail draft URL — opens the draft directly in Gmail's web UI.
const gmailDraftUrl = (gmailId: string) => `https://mail.google.com/mail/u/0/#drafts/${gmailId}`;

export function AgentQueueSection({ drafts }: { drafts: AgentDraft[] }) {
  // ─── Core draft state ──────────────────────────────────────────────────────
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [states, setStates]           = useState<Record<string, DraftState>>({});
  const [dismissed, setDismissed]     = useState<Set<string>>(new Set());
  const router = useRouter();

  // ─── Inline edit state ─────────────────────────────────────────────────────
  // A draft enters edit mode when the user clicks "Edit". The textarea holds
  // the working copy. Save PATCHes Notion; Cancel discards the edit.
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editText, setEditText]       = useState<string>("");
  const [savingEdit, setSavingEdit]   = useState(false);
  const [localText, setLocalText]     = useState<Record<string, string>>({});

  // ─── Sent-state context ────────────────────────────────────────────────────
  // After handleSend succeeds, we keep the returned Gmail draft ID so the
  // post-approval action bar can show "Open in Gmail ↗".
  const [gmailIds, setGmailIds]       = useState<Record<string, string>>({});

  // ─── Contact assignment state ──────────────────────────────────────────────
  // pickerDraftId  — which card currently has the picker open (only one at a time)
  // people         — fetched once and cached for the session
  // search         — filter string for the picker
  // assigningId    — draft ID currently being assigned (spinner)
  // localRecipient — optimistic override: after assignment, show name before refresh
  const [pickerDraftId, setPickerDraftId]   = useState<string | null>(null);
  const [people, setPeople]                 = useState<PersonOption[]>([]);
  const [loadingPeople, setLoadingPeople]   = useState(false);
  const [search, setSearch]                 = useState("");
  const [assigningId, setAssigningId]       = useState<string | null>(null);
  const [localRecipient, setLocalRecipient] = useState<Record<string, PersonOption>>({});

  const visible    = drafts.filter((d) => !dismissed.has(d.id));
  const EMAIL_TYPES = new Set(["Follow-up Email", "Check-in Email"]);

  // ─── Approve / revision ───────────────────────────────────────────────────
  async function handleAction(draftId: string, action: "approve" | "revision", draftType: string) {
    setStates((s) => ({ ...s, [draftId]: "approving" }));
    try {
      const res = await fetch("/api/approve-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, action }),
      });
      if (res.ok) {
        if (action === "revision") {
          setStates((s) => ({ ...s, [draftId]: "revision" }));
          setTimeout(() => setDismissed((prev) => new Set(prev).add(draftId)), 1200);
        } else {
          setStates((s) => ({ ...s, [draftId]: "approved" }));
          if (!EMAIL_TYPES.has(draftType)) {
            setTimeout(() => setDismissed((prev) => new Set(prev).add(draftId)), 1200);
          }
        }
        router.refresh();
      }
    } catch {
      setStates((s) => ({ ...s, [draftId]: "pending" }));
    }
  }

  // ─── Send ─────────────────────────────────────────────────────────────────
  async function handleSend(draftId: string) {
    setStates((s) => ({ ...s, [draftId]: "sending" }));
    setPickerDraftId(null);
    try {
      const res = await fetch("/api/send-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.gmailId) {
          setGmailIds((ids) => ({ ...ids, [draftId]: data.gmailId as string }));
        }
        setStates((s) => ({ ...s, [draftId]: "sent" }));
        // Keep the card visible longer so user can click "Open in Gmail".
        setTimeout(() => setDismissed((prev) => new Set(prev).add(draftId)), 6000);
        router.refresh();
      } else {
        setStates((s) => ({ ...s, [draftId]: "send_error" }));
      }
    } catch {
      setStates((s) => ({ ...s, [draftId]: "send_error" }));
    }
  }

  // ─── Inline edit ──────────────────────────────────────────────────────────
  function startEdit(draftId: string, currentText: string) {
    setEditingId(draftId);
    setEditText(currentText);
    setExpandedId(draftId); // expand so the textarea has room
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function saveEdit(draftId: string) {
    if (editText.length === 0) return;
    setSavingEdit(true);
    try {
      const res = await fetch("/api/update-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, content: editText }),
      });
      if (res.ok) {
        // Optimistic: show the edited text immediately, then refresh server data.
        setLocalText((t) => ({ ...t, [draftId]: editText }));
        setEditingId(null);
        setEditText("");
        router.refresh();
      }
    } finally {
      setSavingEdit(false);
    }
  }

  // ─── Open contact picker ──────────────────────────────────────────────────
  async function openPicker(draftId: string) {
    setPickerDraftId(draftId);
    setSearch("");
    if (people.length === 0) {
      setLoadingPeople(true);
      try {
        const res = await fetch("/api/people-list");
        const data = await res.json();
        setPeople(data.people ?? []);
      } finally {
        setLoadingPeople(false);
      }
    }
  }

  // ─── Assign contact to draft ──────────────────────────────────────────────
  async function assignContact(draftId: string, person: PersonOption) {
    setAssigningId(draftId);
    try {
      const res = await fetch("/api/assign-draft-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, personId: person.id }),
      });
      if (res.ok) {
        setLocalRecipient((r) => ({ ...r, [draftId]: person }));
        setPickerDraftId(null);
        router.refresh();
      }
    } finally {
      setAssigningId(null);
    }
  }

  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-3">
      {visible.slice(0, 6).map((draft) => {
        const icon        = DRAFT_TYPE_ICON[draft.draftType] ?? "·";
        const isLinkedIn  = draft.draftType === "LinkedIn Post";
        const isEmail     = EMAIL_TYPES.has(draft.draftType);
        const isFollowUp  = draft.draftType === "Follow-up Email";
        const isExpanded  = expandedId === draft.id;
        const state       = states[draft.id] ?? "pending";

        // Recipient resolution: prefer server value, fall back to local optimistic state
        const hasRecipient = !!(draft.relatedEntityId ?? localRecipient[draft.id]);
        const localPerson  = localRecipient[draft.id];

        // Follow-up with no recipient → needs assignment before real send
        const needsContact = isFollowUp && !hasRecipient;

        const isPickerOpen = pickerDraftId === draft.id;
        const filteredPeople = people.filter(
          (p) =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.email.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 6);

        return (
          <div
            key={draft.id}
            className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden flex flex-col"
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="px-4 py-3.5 border-b border-[#EFEFEA] flex-1">
              <div className="flex items-start gap-2.5">
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-black ${
                    isLinkedIn ? "bg-[#0077B5] text-white" : "bg-[#EFEFEA] text-[#131218]/50"
                  }`}
                >
                  {icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/30 mb-0.5">
                    {draft.draftType}
                  </p>
                  <p className="text-[12px] font-semibold text-[#131218] leading-snug">
                    {draft.title}
                  </p>

                  {/* Recipient status chip — only for email drafts */}
                  {isEmail && (
                    <div className="mt-1">
                      {needsContact ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                          ⚠ No contact set
                        </span>
                      ) : localPerson ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                          → {localPerson.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-medium text-[#131218]/30 bg-[#EFEFEA] px-1.5 py-0.5 rounded">
                          ✓ Contact set
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Preview / Expanded / Editing */}
              {(draft.draftText || editingId === draft.id) && (() => {
                // Effective text: local optimistic override (after inline save) > server value.
                const effectiveText = localText[draft.id] ?? draft.draftText;
                const isEditing = editingId === draft.id;

                return (
                  <div className="mt-2.5">
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full text-[10.5px] text-[#131218] leading-[1.6] font-sans border border-[#131218]/20 rounded-lg px-2 py-1.5 outline-none focus:border-[#131218] min-h-[180px] bg-white resize-y"
                      />
                    ) : isExpanded ? (
                      <pre className="text-[10.5px] text-[#131218]/60 leading-[1.6] whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
                        {effectiveText}
                      </pre>
                    ) : (
                      <p className="text-[11px] text-[#131218]/45 leading-[1.55] line-clamp-3">
                        {effectiveText.slice(0, 180)}
                        {effectiveText.length > 180 ? "…" : ""}
                      </p>
                    )}

                    <div className="mt-1.5 flex items-center gap-3">
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(draft.id)}
                            disabled={savingEdit}
                            className="text-[9px] font-bold text-[#131218] hover:text-emerald-700 transition-colors disabled:opacity-50"
                          >
                            {savingEdit ? "Saving…" : "Save edit"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={savingEdit}
                            className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : draft.id)}
                            className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors"
                          >
                            {isExpanded ? "Collapse ↑" : "Expand ↓"}
                          </button>
                          {state === "pending" && (
                            <button
                              onClick={() => startEdit(draft.id, effectiveText)}
                              className="text-[9px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors"
                            >
                              Edit
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Actions ────────────────────────────────────────────────── */}
            <div className="px-4 py-2.5 flex flex-col gap-1.5">

              {/* Terminal states */}
              {state === "sent" ? (
                gmailIds[draft.id] ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-emerald-600 shrink-0">
                      ✓ Draft in Gmail
                    </span>
                    <a
                      href={gmailDraftUrl(gmailIds[draft.id])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 text-center text-[10px] font-bold bg-[#131218] text-white rounded-lg py-1.5 hover:bg-[#2a2938] transition-colors"
                    >
                      Open in Gmail ↗
                    </a>
                  </div>
                ) : (
                  <span className="text-center text-[10px] font-bold text-emerald-600">
                    ✓ Enviado a Gmail
                  </span>
                )
              ) : state === "send_error" ? (
                <span className="text-center text-[10px] font-bold text-red-500">
                  ✗ Error al enviar
                </span>
              ) : state === "revision" ? (
                <span className="text-center text-[10px] font-bold text-amber-500">
                  ↩ Revision requested
                </span>

              /* ── Approved email WITH recipient → normal send ─────────── */
              ) : state === "approved" && isEmail && !needsContact ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-emerald-600 shrink-0">✓ Aprobado</span>
                  <button
                    onClick={() => handleSend(draft.id)}
                    disabled={state === ("sending" as DraftState)}
                    className="flex-1 text-center text-[10px] font-bold bg-[#131218] text-white rounded-lg py-1.5 hover:bg-[#2a2938] transition-colors disabled:opacity-50"
                  >
                    Enviar →
                  </button>
                  <a
                    href={draft.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors shrink-0"
                  >
                    ↗
                  </a>
                </div>

              /* ── Approved Follow-up WITHOUT recipient → assign flow ───── */
              ) : state === "approved" && needsContact ? (
                <>
                  {isPickerOpen ? (
                    /* Contact picker */
                    <div className="flex flex-col gap-1">
                      <input
                        autoFocus
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search people…"
                        className="text-[10px] border border-[#E0E0D8] rounded-lg px-2 py-1.5 outline-none focus:border-[#131218] bg-white"
                      />
                      {loadingPeople ? (
                        <p className="text-[9px] text-[#131218]/40 text-center py-1">Loading…</p>
                      ) : filteredPeople.length === 0 ? (
                        <p className="text-[9px] text-[#131218]/40 text-center py-1">
                          {search ? "No match" : "No contacts with email"}
                        </p>
                      ) : (
                        <div className="flex flex-col divide-y divide-[#EFEFEA] max-h-36 overflow-y-auto rounded-lg border border-[#E0E0D8]">
                          {filteredPeople.map((p) => (
                            <button
                              key={p.id}
                              disabled={assigningId === draft.id}
                              onClick={() => assignContact(draft.id, p)}
                              className="flex flex-col items-start px-2 py-1.5 text-left hover:bg-[#EFEFEA] transition-colors disabled:opacity-50"
                            >
                              <span className="text-[10px] font-semibold text-[#131218] leading-tight">
                                {assigningId === draft.id ? "Assigning…" : p.name}
                              </span>
                              <span className="text-[9px] text-[#131218]/40">{p.email}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => setPickerDraftId(null)}
                        className="text-[9px] text-[#131218]/30 hover:text-[#131218] text-center transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    /* No-recipient action bar */
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-emerald-600 shrink-0">✓ Aprobado</span>
                        <button
                          onClick={() => openPicker(draft.id)}
                          className="flex-1 text-center text-[10px] font-bold bg-[#c8f55a] text-[#131218] rounded-lg py-1.5 hover:bg-[#b8e54a] transition-colors"
                        >
                          Assign contact →
                        </button>
                        <a
                          href={draft.notionUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors shrink-0"
                        >
                          ↗
                        </a>
                      </div>
                      <button
                        onClick={() => handleSend(draft.id)}
                        className="text-[10px] text-[#131218]/40 hover:text-[#131218] text-center transition-colors"
                      >
                        Save to my inbox instead
                      </button>
                    </div>
                  )}
                </>

              /* ── Approved non-email ───────────────────────────────────── */
              ) : state === "approved" ? (
                <span className="text-center text-[10px] font-bold text-emerald-600">
                  ✓ Approved
                </span>

              /* ── Pending (default): Approve / Revise ─────────────────── */
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(draft.id, "approve", draft.draftType)}
                    disabled={state === "approving"}
                    className="flex-1 text-center text-[10px] font-bold bg-[#c8f55a] text-[#131218] rounded-lg py-1.5 hover:bg-[#b8e54a] transition-colors disabled:opacity-50"
                  >
                    {state === "approving" ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleAction(draft.id, "revision", draft.draftType)}
                    disabled={state === "approving"}
                    className="text-[10px] font-bold text-[#131218]/30 hover:text-[#131218] transition-colors border border-[#E0E0D8] rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                  >
                    Revise
                  </button>
                  <a
                    href={draft.notionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-bold text-[#131218]/25 hover:text-[#131218] transition-colors shrink-0"
                  >
                    ↗
                  </a>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
