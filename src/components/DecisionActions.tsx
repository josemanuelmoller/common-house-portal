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

  if (status !== "Open") return null

  async function handle(action: "approve" | "resolve" | "dismiss") {
    setLoading(action)
    if (action === "approve") await approveDecision(id)
    if (action === "resolve") await resolveDecision(id)
    if (action === "dismiss") await dismissDecision(id)
    setLoading(null)
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
      {requiresExecute && !executeApproved && (
        <button
          onClick={() => handle("approve")}
          disabled={loading !== null}
          style={{
            background: "#B2FF59", color: "#000", border: "none",
            borderRadius: 6, padding: "0.3rem 0.75rem", fontSize: 12,
            fontWeight: 700, cursor: "pointer", opacity: loading ? 0.6 : 1
          }}
        >
          {loading === "approve" ? "Aprobando…" : "Aprobar ejecución"}
        </button>
      )}
      <button
        onClick={() => handle("resolve")}
        disabled={loading !== null}
        style={{
          background: "transparent", color: "rgba(0,0,0,0.55)",
          border: "1.5px solid var(--border, #d4d4cc)", borderRadius: 6,
          padding: "0.3rem 0.75rem", fontSize: 12, cursor: "pointer",
          opacity: loading ? 0.6 : 1
        }}
      >
        {loading === "resolve" ? "…" : "Resolver"}
      </button>
      <button
        onClick={() => handle("dismiss")}
        disabled={loading !== null}
        style={{
          background: "transparent", color: "rgba(0,0,0,0.38)",
          border: "1.5px solid transparent", borderRadius: 6,
          padding: "0.3rem 0.75rem", fontSize: 12, cursor: "pointer",
          opacity: loading ? 0.6 : 1
        }}
      >
        {loading === "dismiss" ? "…" : "Descartar"}
      </button>
    </div>
  )
}
