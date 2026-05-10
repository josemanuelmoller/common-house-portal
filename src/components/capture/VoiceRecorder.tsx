"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  onChange: (blob: Blob | null) => void;
  disabled?: boolean;
};

/**
 * VoiceRecorder — MediaRecorder-based voice capture for Quick Capture.
 * Records audio/webm. Caller receives the Blob via onChange.
 */
export function VoiceRecorder({ onChange, disabled }: Props) {
  const [state, setState] = useState<"idle" | "recording" | "recorded">("idle");
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount: stop recorder + release mic
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = rec;

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setState("recorded");
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        onChange(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };

      rec.start();
      setState("recording");
      setSeconds(0);
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo acceder al micrófono"
      );
      setState("idle");
    }
  }

  function stop() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function reset() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    chunksRef.current = [];
    setState("idle");
    setSeconds(0);
    onChange(null);
  }

  return (
    <div
      className="rounded-md p-3"
      style={{
        background: "var(--hall-paper-1)",
        border: "1px solid var(--hall-line)",
      }}
    >
      {state === "idle" && (
        <button
          type="button"
          onClick={start}
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm text-[13px] font-medium disabled:opacity-50"
          style={{
            background: "var(--hall-paper-0)",
            color: "var(--hall-ink-0)",
            border: "1px solid var(--hall-ink-0)",
          }}
        >
          <span aria-hidden>🎙</span>
          <span>Grabar voz</span>
        </button>
      )}

      {state === "recording" && (
        <button
          type="button"
          onClick={stop}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-sm text-[13px] font-medium"
          style={{
            background: "var(--hall-danger)",
            color: "#fff",
            border: "1px solid var(--hall-danger)",
          }}
        >
          <span
            className="inline-block w-2 h-2 rounded-full animate-pulse"
            style={{ background: "#fff" }}
          />
          <span>Detener · {formatSeconds(seconds)}</span>
        </button>
      )}

      {state === "recorded" && previewUrl && (
        <div className="space-y-2">
          <audio src={previewUrl} controls className="w-full" preload="metadata" />
          <button
            type="button"
            onClick={reset}
            className="text-[11px] underline"
            style={{
              fontFamily: "var(--font-hall-mono)",
              color: "var(--hall-muted-2)",
            }}
          >
            Borrar y grabar de nuevo
          </button>
        </div>
      )}

      {error && (
        <p
          className="mt-2 text-[11px]"
          style={{ color: "var(--hall-danger)" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return undefined;
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
