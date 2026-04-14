"use client"

import { useState, useCallback, useRef } from "react"
import {
  approveDecision, resolveDecision, resolveWithNote,
  resolveAndUpdate, resolveAndUpdateMulti,
  resolveWithRelationId, searchNotionEntities, previewRelationTarget,
  dismissDecision,
} from "@/app/admin/decisions/actions"

interface Props {
  id: string
  requiresExecute: boolean
  executeApproved: boolean
  status: string
  decisionType: string
  sourceAgent?: string
  notionUrl?: string
  // Structured metadata from [ENTITY_ID:][RESOLUTION_FIELD:][RESOLUTION_TYPE:][RESOLUTION_DB:][RESOLUTION_FIELDS:]
  relatedEntityId?: string
  relatedField?: string
  relatedResolutionType?: string
  relatedSearchDb?: string
  relatedFields?: { field: string; label: string }[]
}

// Types that render an inline input area
const INLINE_INPUT_TYPES = new Set(["Missing Input", "Ambiguity Resolution"])

// Agent run commands shown after resolving (Fix 3)
const AGENT_COMMANDS: Record<string, string> = {
  "deal-flow-agent":             "deal-flow-agent:\n  mode: dry_run",
  "validation-operator":         "validation-operator:\n  evidence_ids: [<pega el ID del evidence>]",
  "grant-fit-scanner":           "grant-fit-scanner:\n  mode: dry_run",
  "source-intake":               "source-intake:\n  scope: all",
  "hygiene-agent":               "hygiene-agent:\n  mode: dry_run",
  "create-or-update-opportunity":"create-or-update-opportunity:\n  mode: dry_run",
}

// Per-type labels & messages
const TYPE_CFG: Record<string, {
  resolveLabel: string; dismissLabel: string
  placeholder: string; searchPlaceholder: string
  resolvedMsg: string; dismissedMsg: string
}> = {
  "Missing Input": {
    resolveLabel: "Guardar y resolver", dismissLabel: "No es necesario",
    placeholder: "Escribe los datos que faltan…",
    searchPlaceholder: "Nombre del proyecto…",
    resolvedMsg: "Guardado en Notion ✓ — el agente usará estos datos en su próxima ejecución",
    dismissedMsg: "Omitido — el agente continuará sin este dato",
  },
  "Ambiguity Resolution": {
    resolveLabel: "Guardar y resolver", dismissLabel: "Dejar pendiente",
    placeholder: "Escribe cómo se resuelve esta ambigüedad…",
    searchPlaceholder: "Buscar…",
    resolvedMsg: "Resolución guardada en Notion ✓",
    dismissedMsg: "Dejado pendiente",
  },
  "Approval": {
    resolveLabel: "Aprobar", dismissLabel: "Rechazar",
    placeholder: "", searchPlaceholder: "",
    resolvedMsg: "Aprobado ✓", dismissedMsg: "Rechazado — acción cancelada",
  },
  "Draft Review": {
    resolveLabel: "Aprobar borrador", dismissLabel: "Descartar borrador",
    placeholder: "", searchPlaceholder: "",
    resolvedMsg: "Borrador aprobado ✓", dismissedMsg: "Borrador descartado",
  },
  "Policy/Automation Decision": {
    resolveLabel: "Aceptar política", dismissLabel: "Descartar",
    placeholder: "", searchPlaceholder: "",
    resolvedMsg: "Política aceptada ✓", dismissedMsg: "Descartado",
  },
}

const DEFAULT_CFG = {
  resolveLabel: "Aceptar", dismissLabel: "Descartar",
  placeholder: "", searchPlaceholder: "",
  resolvedMsg: "Aceptado ✓", dismissedMsg: "Descartado ✓",
}

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Fix 1 — inline entity search for legacy items without relatedEntityId */
function EntitySearch({ onSelect }: { onSelect: (id: string, name: string) => void }) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ id: string; name: string; dbType: string }[]>([])
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (q.trim().length < 2) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try { setResults(await searchNotionEntities(q)) }
      catch { setResults([]) }
      finally { setSearching(false) }
    }, 350)
  }, [])

  return (
    <div className="flex flex-col gap-1.5 p-3 bg-amber-50 border border-amber-200 rounded-lg">
      <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">
        Este item no tiene registro vinculado
      </p>
      <p className="text-[10px] text-[#131218]/45 leading-snug">
        Busca el registro de Notion al que pertenece este item. Tu respuesta se guardará allí directamente.
      </p>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value) }}
          placeholder="Buscar organización, persona o proyecto…"
          className="w-full text-[12px] text-[#131218] bg-white border border-[#d4d4cc] rounded-lg px-3 py-1.5 placeholder:text-[#131218]/30 focus:outline-none focus:border-amber-400"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#131218]/30">
            Buscando…
          </span>
        )}
      </div>
      {results.length > 0 && (
        <div className="flex flex-col gap-0.5 bg-white border border-[#E0E0D8] rounded-lg overflow-hidden">
          {results.map(r => (
            <button
              key={r.id}
              onClick={() => onSelect(r.id, r.name)}
              className="flex items-center gap-2 px-3 py-2 text-left hover:bg-[#EFEFEA] transition-colors"
            >
              <span className="text-[9px] font-bold text-[#131218]/30 bg-[#EFEFEA] px-1.5 py-0.5 rounded-full uppercase tracking-widest shrink-0">
                {r.dbType}
              </span>
              <span className="text-[12px] text-[#131218] font-medium">{r.name}</span>
            </button>
          ))}
        </div>
      )}
      {query.trim().length >= 2 && !searching && results.length === 0 && (
        <p className="text-[10px] text-[#131218]/35 italic">
          Sin resultados para &ldquo;{query}&rdquo;
        </p>
      )}
    </div>
  )
}

/** Fix 2 — two-step relation search: preview then confirm */
function RelationSearch({
  searchDb, fieldName, placeholder, disabled,
  onConfirm,
}: {
  searchDb: string; fieldName: string; placeholder: string; disabled: boolean
  onConfirm: (foundId: string) => void
}) {
  const [query, setQuery] = useState("")
  const [preview, setPreview] = useState<{ id: string; name: string; url: string } | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  async function handleSearch() {
    if (!query.trim()) return
    setPreviewError(null)
    setPreviewing(true)
    try {
      const result = await previewRelationTarget(query, searchDb)
      if (!result) setPreviewError(`No se encontró ningún registro que contenga "${query}". Prueba con otro nombre.`)
      else setPreview(result)
    } catch {
      setPreviewError("Error al buscar. Intenta de nuevo.")
    } finally { setPreviewing(false) }
  }

  if (preview) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-[10px] text-green-600">✓</span>
          <span className="text-[12px] font-semibold text-[#131218]">{preview.name}</span>
          <a href={preview.url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-[#131218]/30 hover:text-[#131218]/60 ml-auto">
            ver →
          </a>
        </div>
        <p className="text-[10px] text-[#131218]/35 leading-snug">
          Se vinculará <span className="font-mono">{fieldName}</span> a este registro.
        </p>
        <button onClick={() => { setPreview(null); setQuery("") }}
          className="self-start text-[10px] text-[#131218]/35 hover:text-[#131218]/60 transition-colors">
          ← Buscar otro
        </button>
        {/* Trigger actual write via parent — call onConfirm with the found ID */}
        <input type="hidden" onChange={() => onConfirm(preview.id)} />
        {/* We surface the found ID up via effect on mount */}
        <ConfirmRelay id={preview.id} onConfirm={onConfirm} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setPreviewError(null) }}
          onKeyDown={e => { if (e.key === "Enter") handleSearch() }}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 text-[12px] text-[#131218] bg-[#FAFAF8] border border-[#d4d4cc] rounded-lg px-3 py-1.5 placeholder:text-[#131218]/30 focus:outline-none focus:border-[#131218]/40 disabled:opacity-50"
        />
        <button
          onClick={handleSearch}
          disabled={disabled || !query.trim() || previewing}
          className="text-[11px] font-medium text-[#131218]/55 border border-[#d4d4cc] rounded-lg px-3 py-1.5 hover:bg-[#EFEFEA] transition-colors disabled:opacity-40"
        >
          {previewing ? "Buscando…" : "Buscar"}
        </button>
      </div>
      {previewError && <p className="text-[10px] text-red-500">{previewError}</p>}
      <p className="text-[10px] text-[#131218]/35 leading-snug">
        Escribe parte del nombre. El sistema buscará en Notion y te mostrará el registro antes de vincularlo.
      </p>
    </div>
  )
}

/** Helper: calls onConfirm once on mount (lets RelationSearch surface found ID to parent) */
function ConfirmRelay({ id, onConfirm }: { id: string; onConfirm: (id: string) => void }) {
  const called = useRef(false)
  if (!called.current) { called.current = true; onConfirm(id) }
  return null
}

/** Fix 3 — shown after resolving: agent re-run command with copy button */
function RerunHint({ sourceAgent }: { sourceAgent?: string }) {
  const [copied, setCopied] = useState(false)
  const command = sourceAgent ? AGENT_COMMANDS[sourceAgent] : null
  if (!command) return null

  function copy() {
    navigator.clipboard.writeText(command!).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="mt-2 p-2.5 bg-[#EFEFEA] rounded-lg flex flex-col gap-1">
      <p className="text-[10px] font-bold text-[#131218]/40 uppercase tracking-widest">
        Re-ejecutar agente
      </p>
      <pre className="text-[11px] text-[#131218]/70 font-mono leading-relaxed whitespace-pre-wrap">
        {command}
      </pre>
      <button
        onClick={copy}
        className="self-start text-[10px] font-medium text-[#131218]/40 hover:text-[#131218]/70 transition-colors"
      >
        {copied ? "Copiado ✓" : "Copiar comando"}
      </button>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function DecisionActions({
  id, requiresExecute, executeApproved, status, decisionType, sourceAgent,
  notionUrl, relatedEntityId, relatedField, relatedResolutionType, relatedSearchDb, relatedFields,
}: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  // Fix 1 — entity selected from inline search (overrides absent relatedEntityId)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [selectedEntityName, setSelectedEntityName] = useState<string | null>(null)

  // Fix 2 — relation: found record ID after preview confirmation
  const [confirmedRelationId, setConfirmedRelationId] = useState<string | null>(null)

  // Input values: single string or per-field map (Fix 4)
  const [note, setNote] = useState("")
  const [notes, setNotes] = useState<Record<string, string>>({})

  if (status !== "Open") return null

  const cfg = TYPE_CFG[decisionType] ?? DEFAULT_CFG
  const needsInput = INLINE_INPUT_TYPES.has(decisionType)
  const isRelation = relatedResolutionType === "relation"
  const isMultiField = (relatedFields?.length ?? 0) > 1
  const effectiveEntityId = selectedEntityId ?? relatedEntityId ?? null
  const hasInput = isMultiField
    ? Object.values(notes).some(v => v.trim())
    : note.trim().length > 0
  const canResolve = !needsInput || (isRelation ? !!confirmedRelationId : hasInput)

  if (done) {
    return (
      <div className="mt-1">
        <p className="text-[10px] text-[#131218]/35 italic">{done}</p>
        <RerunHint sourceAgent={sourceAgent} />
      </div>
    )
  }

  async function handle(action: "approve" | "resolve" | "dismiss") {
    setError(null)
    setLoading(action)
    try {
      if (action === "approve") {
        await approveDecision(id)

      } else if (action === "resolve") {
        if (needsInput) {
          if (isRelation) {
            // Fix 2: write the confirmed relation using the previewed page ID directly
            if (!confirmedRelationId || !relatedEntityId || !relatedField) {
              setError("Busca y confirma el registro antes de vincular.")
              setLoading(null); return
            }
            await resolveWithRelationId(id, relatedEntityId, relatedField, confirmedRelationId)
          } else if (isMultiField && effectiveEntityId) {
            // Fix 4: write multiple fields
            const fields = (relatedFields ?? []).map(f => ({ field: f.field, value: notes[f.field] ?? "" }))
            await resolveAndUpdateMulti(id, effectiveEntityId, fields)
          } else if (effectiveEntityId) {
            // Single text field write to entity — returns error as value (not thrown)
            const result = await resolveAndUpdate(id, effectiveEntityId, note, relatedField ?? "Notes")
            if (result?.error) { setError(`[entity] ${result.error}`); setLoading(null); return }
          } else {
            // No entity — comment + resolve DI only
            const result = await resolveWithNote(id, note)
            if (result?.error) { setError(`[note] ${result.error}`); setLoading(null); return }
          }
        } else {
          await resolveDecision(id)
        }

      } else {
        await dismissDecision(id)
      }

      setDone(
        action === "approve" ? "Ejecución aprobada ✓" :
        action === "resolve" ? cfg.resolvedMsg :
        cfg.dismissedMsg
      )
    } catch (err) {
      // Server action errors may not always be Error instances — extract message defensively
      const msg =
        err instanceof Error ? err.message :
        (err as { message?: string })?.message ??
        (typeof err === "string" ? err : "Error al guardar. Intenta de nuevo.")
      setError(msg)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-2">

      {/* Relation search (required — replaces textarea for relation fields) */}
      {needsInput && isRelation && relatedSearchDb && relatedField && (
        <RelationSearch
          searchDb={relatedSearchDb}
          fieldName={relatedField}
          placeholder={cfg.searchPlaceholder}
          disabled={loading !== null}
          onConfirm={rid => setConfirmedRelationId(rid)}
        />
      )}

      {/* Multi-field inputs */}
      {needsInput && !isRelation && isMultiField && relatedFields && (
        <div className="flex flex-col gap-2">
          {relatedFields.map(({ field, label }) => (
            <div key={field} className="flex flex-col gap-0.5">
              <label className="text-[10px] font-bold text-[#131218]/50 uppercase tracking-widest">
                {label}
              </label>
              <textarea
                value={notes[field] ?? ""}
                onChange={e => setNotes(prev => ({ ...prev, [field]: e.target.value }))}
                placeholder={`${label}…`}
                rows={2}
                disabled={loading !== null}
                className="w-full text-[12px] text-[#131218] bg-[#FAFAF8] border border-[#d4d4cc] rounded-lg px-3 py-2 resize-y placeholder:text-[#131218]/30 focus:outline-none focus:border-[#131218]/40 disabled:opacity-50 leading-relaxed"
              />
            </div>
          ))}
          <p className="text-[10px] text-[#131218]/35 leading-snug">
            {effectiveEntityId
              ? "Se escribirá en el registro de Notion. El agente lo usará en su próxima ejecución."
              : "Se guardará como respuesta en este item."}
          </p>
        </div>
      )}

      {/* Single textarea — always shown for text input types (legacy + structured) */}
      {needsInput && !isRelation && !isMultiField && (
        <div className="flex flex-col gap-1">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={cfg.placeholder}
            rows={3}
            disabled={loading !== null}
            className="w-full text-[12px] text-[#131218] bg-[#FAFAF8] border border-[#d4d4cc] rounded-lg px-3 py-2 resize-y placeholder:text-[#131218]/30 focus:outline-none focus:border-[#131218]/40 disabled:opacity-50 leading-relaxed"
          />
          <p className="text-[10px] text-[#131218]/35 leading-snug">
            {effectiveEntityId
              ? <>Se escribirá en <span className="font-mono">{relatedField ?? "Notes"}</span> del registro. El agente lo usará en su próxima ejecución.</>
              : "Se guardará como respuesta en este item. El agente lo leerá en su próxima ejecución."}
          </p>
        </div>
      )}

      {/* Optional entity linker — only for legacy items (no relatedEntityId) */}
      {needsInput && !isRelation && !relatedEntityId && (
        <details className="group">
          <summary className="cursor-pointer text-[10px] text-[#131218]/30 hover:text-[#131218]/60 transition-colors list-none flex items-center gap-1 select-none">
            <span className="group-open:rotate-90 inline-block transition-transform">›</span>
            {selectedEntityId
              ? <span className="text-[#131218]/50">Guardar también en registro de Notion</span>
              : "Vincular a un registro de Notion (opcional)"}
          </summary>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {!selectedEntityId ? (
              <EntitySearch
                onSelect={(eid, ename) => { setSelectedEntityId(eid); setSelectedEntityName(ename) }}
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-[10px] text-green-600">✓</span>
                  <span className="text-[11px] font-medium text-[#131218]">{selectedEntityName}</span>
                </div>
                <button
                  onClick={() => { setSelectedEntityId(null); setSelectedEntityName(null) }}
                  className="text-[10px] text-[#131218]/30 hover:text-[#131218]/60 transition-colors"
                >
                  Cambiar
                </button>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        {requiresExecute && !executeApproved && (
          <button onClick={() => handle("approve")} disabled={loading !== null}
            className="text-[11px] font-bold bg-[#B2FF59] text-[#131218] border-none rounded-md px-3 py-1 cursor-pointer disabled:opacity-50 hover:bg-[#9ee84a] transition-colors">
            {loading === "approve" ? "Aprobando…" : "Aprobar ejecución"}
          </button>
        )}
        <button
          onClick={() => handle("resolve")}
          disabled={loading !== null || !canResolve}
          className="text-[11px] text-[#131218]/55 border border-[#d4d4cc] rounded-md px-3 py-1 cursor-pointer disabled:opacity-40 hover:bg-[#EFEFEA] transition-colors"
        >
          {loading === "resolve"
            ? (isRelation ? "Vinculando…" : "Guardando…")
            : cfg.resolveLabel}
        </button>
        <button onClick={() => handle("dismiss")} disabled={loading !== null}
          className="text-[11px] text-[#131218]/38 border border-transparent rounded-md px-3 py-1 cursor-pointer disabled:opacity-50 hover:text-[#131218]/60 transition-colors">
          {loading === "dismiss" ? "…" : cfg.dismissLabel}
        </button>
        {notionUrl && (
          <a href={notionUrl} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-[#131218]/25 hover:text-[#131218]/50 transition-colors ml-auto">
            Notion →
          </a>
        )}
      </div>

      {error && <p className="text-[10px] text-red-500 font-medium">{error}</p>}
    </div>
  )
}
