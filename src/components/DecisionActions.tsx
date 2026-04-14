"use client"

import { useState } from "react"
import { approveDecision, resolveDecision, resolveWithNote, dismissDecision } from "@/app/admin/decisions/actions"

interface Props {
  id: string
  requiresExecute: boolean
  executeApproved: boolean
  status: string
  decisionType: string
  notionUrl?: string
}

// Types where the user provides a free-text response inline
const INLINE_INPUT_TYPES = new Set(["Missing Input", "Ambiguity Resolution"])

// Per-type action semantics: what each button means and what the user should know
const TYPE_ACTIONS: Record<string, {
  resolveLabel: string
  dismissLabel: string
  inputPlaceholder?: string
  resolvedMsg: string
  dismissedMsg: string
}> = {
  "Missing Input": {
    resolveLabel: "Guardar y resolver",
    dismissLabel: "No es necesario",
    inputPlaceholder: "Escribe aquí los datos que faltan…",
    resolvedMsg: "Guardado — dato registrado en Notion ✓",
    dismissedMsg: "Omitido — el agente continuará sin este dato",
  },
  "Approval": {
    resolveLabel: "Aprobar",
    dismissLabel: "Rechazar",
    resolvedMsg: "Aprobado ✓",
    dismissedMsg: "Rechazado — acción cancelada",
  },
  "Draft Review": {
    resolveLabel: "Aprobar borrador",
    dismissLabel: "Descartar borrador",
    resolvedMsg: "Borrador aprobado ✓",
    dismissedMsg: "Borrador descartado",
  },
  "Policy/Automation Decision": {
    resolveLabel: "Aceptar política",
    dismissLabel: "Descartar",
    resolvedMsg: "Política aceptada ✓",
    dismissedMsg: "Descartado",
  },
  "Ambiguity Resolution": {
    resolveLabel: "Guardar y resolver",
    dismissLabel: "Dejar pendiente",
    inputPlaceholder: "Escribe cómo se resuelve esta ambigüedad…",
    resolvedMsg: "Resolución guardada en Notion ✓",
    dismissedMsg: "Dejado pendiente",
  },
}

const DEFAULT_ACTIONS = {
  resolveLabel: "Aceptar",
  dismissLabel: "Descartar",
  resolvedMsg: "Aceptado ✓",
  dismissedMsg: "Descartado ✓",
}

export function DecisionActions({ id, requiresExecute, executeApproved, status, decisionType, notionUrl }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [note, setNote] = useState("")

  if (status !== "Open") return null
  if (done) {
    return (
      <p className="text-[10px] text-[#131218]/35 italic mt-1">{done}</p>
    )
  }

  const cfg = TYPE_ACTIONS[decisionType] ?? DEFAULT_ACTIONS
  const needsInlineInput = INLINE_INPUT_TYPES.has(decisionType)

  async function handle(action: "approve" | "resolve" | "dismiss") {
    setError(null)
    setLoading(action)
    try {
      if (action === "approve") {
        await approveDecision(id)
      } else if (action === "resolve") {
        if (needsInlineInput) {
          if (!note.trim()) { setError("Escribe algo antes de guardar."); setLoading(null); return }
          await resolveWithNote(id, note)
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
    } catch {
      setError("Error al guardar. Intenta de nuevo.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-2 mt-2">
      {needsInlineInput && (
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={cfg.inputPlaceholder}
          rows={3}
          disabled={loading !== null}
          className="w-full text-[12px] text-[#131218] bg-[#FAFAF8] border border-[#d4d4cc] rounded-lg px-3 py-2 resize-y placeholder:text-[#131218]/30 focus:outline-none focus:border-[#131218]/40 disabled:opacity-50 leading-relaxed"
        />
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {requiresExecute && !executeApproved && (
          <button
            onClick={() => handle("approve")}
            disabled={loading !== null}
            className="text-[11px] font-bold bg-[#B2FF59] text-[#131218] border-none rounded-md px-3 py-1 cursor-pointer disabled:opacity-50 hover:bg-[#9ee84a] transition-colors"
          >
            {loading === "approve" ? "Aprobando…" : "Aprobar ejecución"}
          </button>
        )}
        <button
          onClick={() => handle("resolve")}
          disabled={loading !== null || (needsInlineInput && !note.trim())}
          className="text-[11px] text-[#131218]/55 border border-[#d4d4cc] rounded-md px-3 py-1 cursor-pointer disabled:opacity-40 hover:bg-[#EFEFEA] transition-colors"
        >
          {loading === "resolve" ? "Guardando…" : cfg.resolveLabel}
        </button>
        <button
          onClick={() => handle("dismiss")}
          disabled={loading !== null}
          className="text-[11px] text-[#131218]/38 border border-transparent rounded-md px-3 py-1 cursor-pointer disabled:opacity-50 hover:text-[#131218]/60 transition-colors"
        >
          {loading === "dismiss" ? "…" : cfg.dismissLabel}
        </button>
        {notionUrl && (
          <a
            href={notionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#131218]/25 hover:text-[#131218]/50 transition-colors ml-auto"
          >
            Notion →
          </a>
        )}
      </div>
      {error && (
        <p className="text-[10px] text-red-500 font-medium">{error}</p>
      )}
    </div>
  )
}
