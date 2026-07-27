"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  agreementId: string;
  version: number;
  agreementType: string;
  canRespond: boolean;
};

/**
 * Aprobar no cuesta nada; pedir cambios exige decir cuáles.
 *
 * Antes el campo era un textarea siempre visible rotulado "Optional note", en
 * inglés dentro de una sala en español y antes de elegir acción. Opcional y
 * genérico = nadie lo llena, así que `response_comment` llegaba vacío y el
 * rechazo quedaba mudo: el PM adivinando el ajuste y el feedback loop sin dato.
 * Ahora el motivo se pregunta, sólo en la rama que lo necesita.
 */
export function AgreementResponseActions({ agreementId, version, agreementType, canRespond }: Props) {
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!canRespond) return null;

  const commercial = agreementType === "commercial" || agreementType === "purchase_order";

  async function respond(action: "acknowledge" | "approve" | "request_changes") {
    setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/client-room/agreements/${agreementId}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, comment, expectedVersion: version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo registrar la respuesta");
      setComment("");
      setAsking(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3">
      {!asking && (
        <div className="flex flex-wrap gap-2">
          <button
            className="lobby-btn-go"
            type="button"
            disabled={!!busy}
            onClick={() => respond(commercial ? "approve" : "acknowledge")}
          >
            {busy ? "Guardando…" : commercial ? "Aprobar" : "Confirmar"}
          </button>
          <button className="lobby-btn-alt" type="button" disabled={!!busy} onClick={() => setAsking(true)}>
            Pedir cambios
          </button>
        </div>
      )}

      {asking && (
        <div>
          <label
            htmlFor={`reason-${agreementId}`}
            className="block text-[9px] font-bold uppercase tracking-[0.15em] mb-1.5"
            style={{ color: "var(--lobby-muted-2)" }}
          >
            ¿Qué habría que ajustar?
          </label>
          <textarea
            id={`reason-${agreementId}`}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            autoFocus
            placeholder="Ej.: el alcance de la Fase 1 y el calendario."
            className="block w-full resize-y px-2.5 py-2 text-[12px] leading-[1.5] rounded-lg"
            style={{ border: "1.5px solid var(--lobby-line)", background: "var(--lobby-paper)", color: "var(--lobby-ink)" }}
          />
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              className="lobby-btn-go"
              type="button"
              disabled={!!busy || !comment.trim()}
              onClick={() => respond("request_changes")}
            >
              {busy ? "Enviando…" : "Enviar solicitud"}
            </button>
            <button
              className="lobby-btn-alt"
              type="button"
              disabled={!!busy}
              onClick={() => { setAsking(false); setError(null); }}
            >
              Cancelar
            </button>
          </div>
          <p className="mt-1.5 text-[10px]" style={{ color: "var(--lobby-muted)" }}>
            Queda registrado en el acuerdo (v{version}) junto con tu respuesta.
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-[11px]" style={{ color: "var(--lobby-danger)" }}>{error}</p>}
    </div>
  );
}
