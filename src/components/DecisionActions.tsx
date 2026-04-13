"use client"

import { useState } from "react"
import { approveDecision, resolveDecision, dismissDecision } from "@/app/admin/decisions/actions"

interface Props {
  id: string
  requiresExecute: boolean
  executeApproved: boolean
  status: string
}

export function DecisionActions({ id, requiresExecute, executeApproved, status }: Props) {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  if (status !== "Open") return null
  if (done) {
    return (
      <p className="text-[10px] text-[#131218]/35 italic mt-1">{done}</p>
    )
  }

  async function handle(action: "approve" | "resolve" | "dismiss") {
    setError(null)
    setLoading(action)
    try {
      if (action === "approve") await approveDecision(id)
      if (action === "resolve") await resolveDecision(id)
      if (action === "dismiss") await dismissDecision(id)
      setDone(
        action === "approve" ? "Ejecución aprobada ✓" :
        action === "resolve" ? "Aceptado ✓" :
        "Descartado ✓"
      )
    } catch {
      setError("Error al guardar. Intenta de nuevo.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="flex flex-col gap-1 mt-2">
      <div className="flex gap-2">
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
          disabled={loading !== null}
          className="text-[11px] text-[#131218]/55 border border-[#d4d4cc] rounded-md px-3 py-1 cursor-pointer disabled:opacity-50 hover:bg-[#EFEFEA] transition-colors"
        >
          {loading === "resolve" ? "…" : "Aceptar"}
        </button>
        <button
          onClick={() => handle("dismiss")}
          disabled={loading !== null}
          className="text-[11px] text-[#131218]/38 border border-transparent rounded-md px-3 py-1 cursor-pointer disabled:opacity-50 hover:text-[#131218]/60 transition-colors"
        >
          {loading === "dismiss" ? "…" : "Descartar"}
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-red-500 font-medium">{error}</p>
      )}
    </div>
  )
}
