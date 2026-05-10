"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceRecorder } from "./VoiceRecorder";
import {
  enqueueCapture,
  newCaptureId,
  requestQueueFlush,
} from "@/lib/inbox-client";

type Status = "idle" | "submitting" | "success" | "queued" | "error";

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Auto · que el agente clasifique" },
  { value: "reminder", label: "Recordatorio (con fecha)" },
  { value: "read-later", label: "Leer más tarde" },
  { value: "client-message", label: "Mensaje de cliente" },
  { value: "reference", label: "Referencia / inspiración" },
  { value: "idea", label: "Idea" },
  { value: "other", label: "Otro" },
];

export function QuickCaptureForm() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [rawText, setRawText] = useState("");
  const [notesToAgent, setNotesToAgent] = useState("");
  const [typeOverride, setTypeOverride] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [voiceTranscript, setVoiceTranscript] = useState("");

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-focus the textarea on mount (mobile-first capture)
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const isReminder = typeOverride === "reminder";
  const canSubmit =
    !!rawText.trim() || !!voiceTranscript.trim() || !!photo || !!audio;

  // Merge voice transcript into final raw_text on submit:
  //   - both present → join with newline
  //   - only one → use it
  //   - neither → null (server constraint catches if no media either)
  function mergedRawText(): string | undefined {
    const a = rawText.trim();
    const b = voiceTranscript.trim();
    if (a && b) return `${a}\n\n${b}`;
    return a || b || undefined;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || status === "submitting") return;

    setStatus("submitting");
    setErrorMsg(null);

    const captureId = newCaptureId();
    const fields: Record<string, string | undefined> = {
      source: "quick_capture",
      raw_text: mergedRawText(),
      user_notes_to_agent: notesToAgent.trim() || undefined,
      user_type_override: typeOverride || undefined,
      user_due_date: isReminder && dueDate ? dueDate : undefined,
      client_capture_id: captureId,
    };

    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v) fd.append(k, v);
    }
    if (photo) fd.append("photo", photo, photo.name || "photo.jpg");
    if (audio) fd.append("audio", audio, "voice.webm");

    try {
      const res = await fetch("/api/inbox/quick-capture", {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      if (res.ok) {
        setStatus("success");
        // Brief success flash then route to bandeja so user sees their capture in context
        setTimeout(() => router.push("/admin/capture"), 500);
        setTimeout(() => router.refresh(), 600);
        return;
      }

      // Auth failure — let user see; don't queue (they need to re-auth)
      if (res.status === 401 || res.status === 403) {
        setStatus("error");
        setErrorMsg("Sesión expirada — recargá la app y volvé a entrar.");
        return;
      }

      // Server error — try to extract message
      let body: { error?: string } = {};
      try {
        body = await res.json();
      } catch {
        /* ignore */
      }
      throw new Error(body.error || `HTTP ${res.status}`);
    } catch (err) {
      // Network failure or transient server error → queue for SW background sync
      try {
        await enqueueCapture({
          id: captureId,
          createdAt: Date.now(),
          fields,
          photoBlob: photo || undefined,
          photoName: photo?.name,
          audioBlob: audio || undefined,
          audioName: audio ? "voice.webm" : undefined,
        });
        await requestQueueFlush();
        setStatus("queued");
      } catch (qErr) {
        setStatus("error");
        setErrorMsg(
          err instanceof Error ? err.message : String(qErr || "Error desconocido")
        );
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Main textarea */}
      <div>
        <label
          htmlFor="raw_text"
          className="block text-[11px] mb-1.5 tracking-[0.06em] uppercase"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-muted-2)",
          }}
        >
          Nota
        </label>
        <textarea
          id="raw_text"
          ref={textareaRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="Lo que tengas en la cabeza…"
          rows={5}
          className="w-full p-3 text-[15px] rounded-md focus:outline-none focus:ring-1"
          style={{
            background: "var(--hall-paper-1)",
            border: "1px solid var(--hall-line)",
            color: "var(--hall-ink-0)",
            fontFamily: "var(--font-hall-sans)",
          }}
        />
      </div>

      {/* Photo */}
      <div>
        <label
          className="block text-[11px] mb-1.5 tracking-[0.06em] uppercase"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-muted-2)",
          }}
        >
          Foto (opcional)
        </label>
        <PhotoPicker file={photo} onChange={setPhoto} />
      </div>

      {/* Voice */}
      <div>
        <label
          className="block text-[11px] mb-1.5 tracking-[0.06em] uppercase"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-muted-2)",
          }}
        >
          Voz (opcional)
        </label>
        <VoiceRecorder
          onChange={setAudio}
          onTranscript={setVoiceTranscript}
          disabled={status === "submitting"}
        />
        {voiceTranscript && (
          <div
            className="mt-2 p-2 text-[12.5px] rounded-sm leading-snug"
            style={{
              background: "var(--hall-paper-1)",
              border: "1px solid var(--hall-line)",
              color: "var(--hall-ink-3)",
              fontFamily: "var(--font-hall-sans)",
            }}
          >
            <div
              className="text-[10px] mb-1 uppercase tracking-[0.06em]"
              style={{
                fontFamily: "var(--font-hall-mono)",
                color: "var(--hall-muted-2)",
              }}
            >
              Transcripción
            </div>
            {voiceTranscript}
          </div>
        )}
      </div>

      {/* Type override */}
      <div>
        <label
          htmlFor="user_type_override"
          className="block text-[11px] mb-1.5 tracking-[0.06em] uppercase"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-muted-2)",
          }}
        >
          Tipo
        </label>
        <select
          id="user_type_override"
          value={typeOverride}
          onChange={(e) => setTypeOverride(e.target.value)}
          className="w-full p-3 text-[14px] rounded-md focus:outline-none"
          style={{
            background: "var(--hall-paper-1)",
            border: "1px solid var(--hall-line)",
            color: "var(--hall-ink-0)",
          }}
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Due date — only when type=reminder */}
      {isReminder && (
        <div>
          <label
            htmlFor="user_due_date"
            className="block text-[11px] mb-1.5 tracking-[0.06em] uppercase"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
            }}
          >
            Vence (sin fecha = 3 días por defecto)
          </label>
          <input
            id="user_due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full p-3 text-[14px] rounded-md focus:outline-none"
            style={{
              background: "var(--hall-paper-1)",
              border: "1px solid var(--hall-line)",
              color: "var(--hall-ink-0)",
            }}
          />
        </div>
      )}

      {/* Notes to agent */}
      <div>
        <label
          htmlFor="user_notes_to_agent"
          className="block text-[11px] mb-1.5 tracking-[0.06em] uppercase"
          style={{
            fontFamily: "var(--font-hall-mono)",
            color: "var(--hall-muted-2)",
          }}
        >
          Comentario al agente (opcional)
        </label>
        <textarea
          id="user_notes_to_agent"
          value={notesToAgent}
          onChange={(e) => setNotesToAgent(e.target.value)}
          placeholder="Ej: esto es para el proyecto Algramo / no clasificar, solo guardar"
          rows={2}
          className="w-full p-3 text-[13px] rounded-md focus:outline-none"
          style={{
            background: "var(--hall-paper-1)",
            border: "1px solid var(--hall-line)",
            color: "var(--hall-ink-0)",
          }}
        />
      </div>

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={!canSubmit || status === "submitting"}
          className="w-full py-3.5 rounded-sm text-[14px] font-medium disabled:opacity-40"
          style={{
            background: "var(--hall-ink-0)",
            color: "var(--hall-paper-0)",
          }}
        >
          {status === "submitting"
            ? "Enviando…"
            : status === "success"
              ? "✓ Capturado"
              : status === "queued"
                ? "📥 Guardado offline (sync cuando vuelvas)"
                : "Capturar"}
        </button>
        {status === "error" && errorMsg && (
          <p
            className="mt-2 text-[12px]"
            style={{ color: "var(--hall-danger)" }}
          >
            {errorMsg}
          </p>
        )}
      </div>
    </form>
  );
}

function PhotoPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    onChange(f);
    e.target.value = ""; // allow re-picking same file
  }

  if (file && previewUrl) {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="preview"
          className="w-full max-h-72 object-contain rounded-md"
          style={{
            background: "var(--hall-paper-1)",
            border: "1px solid var(--hall-line)",
          }}
        />
        <div className="flex justify-between text-[11px]" style={{ fontFamily: "var(--font-hall-mono)" }}>
          <span style={{ color: "var(--hall-muted-2)" }}>
            {file.name || "imagen"} · {Math.round(file.size / 1024)} KB
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="underline"
            style={{ color: "var(--hall-muted-2)" }}
          >
            Quitar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="py-2.5 rounded-sm text-[13px]"
        style={{
          background: "var(--hall-paper-0)",
          color: "var(--hall-ink-0)",
          border: "1px solid var(--hall-ink-0)",
        }}
      >
        📷 Cámara
      </button>
      <button
        type="button"
        onClick={() => galleryRef.current?.click()}
        className="py-2.5 rounded-sm text-[13px]"
        style={{
          background: "var(--hall-paper-0)",
          color: "var(--hall-ink-0)",
          border: "1px solid var(--hall-ink-0)",
        }}
      >
        🖼 Galería
      </button>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={pick}
        className="hidden"
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        onChange={pick}
        className="hidden"
      />
    </div>
  );
}
