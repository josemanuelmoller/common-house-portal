"use client";

import { useEffect, useState } from "react";

type Status = "loading" | "unsupported" | "blocked" | "off" | "on";

type SubInfo = {
  ok: boolean;
  subscribed: boolean;
  deviceCount: number;
  vapidPublicKey: string | null;
};

export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [deviceCount, setDeviceCount] = useState(0);
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("blocked");
      return;
    }
    refreshState();
  }, []);

  async function refreshState() {
    try {
      const res = await fetch("/api/push/subscribe", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = (await res.json()) as SubInfo;
      setVapidKey(info.vapidPublicKey);
      setDeviceCount(info.deviceCount);
      setStatus(info.subscribed ? "on" : "off");
    } catch {
      setStatus("off");
    }
  }

  async function enable() {
    if (!vapidKey) {
      setMsg("VAPID público no configurado. Pedile al admin que lo seteé.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "blocked" : "off");
        setMsg("Permiso de notificaciones no concedido.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      // Reuse existing subscription if any
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) throw new Error(`subscribe HTTP ${res.status}`);
      setStatus("on");
      await refreshState();
      setMsg("✓ Push activado");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: "DELETE", credentials: "include" }
        );
      }
      setStatus("off");
      await refreshState();
      setMsg("Push desactivado en este dispositivo");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`test HTTP ${res.status}`);
      const body = (await res.json()) as { sent?: number };
      setMsg(`Push de prueba enviado a ${body.sent ?? 0} dispositivo(s).`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <span
        className="text-[11px]"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        push…
      </span>
    );
  }

  if (status === "unsupported") {
    return (
      <span
        className="text-[11px]"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        push no soportado en este navegador
      </span>
    );
  }

  if (status === "blocked") {
    return (
      <span
        className="text-[11px]"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-danger)" }}
      >
        push bloqueado · cambiá en ajustes del navegador
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {status === "off" ? (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="text-[11px] px-2.5 py-1 rounded-sm tracking-[0.06em] uppercase disabled:opacity-50"
            style={{
              background: "var(--hall-ink-0)",
              color: "var(--hall-paper-0)",
              fontFamily: "var(--font-hall-mono)",
            }}
          >
            Activar push
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={sendTest}
              disabled={busy}
              className="text-[11px] px-2.5 py-1 rounded-sm tracking-[0.06em] uppercase disabled:opacity-50"
              style={{
                color: "var(--hall-ink-0)",
                border: "1px solid var(--hall-ink-0)",
                background: "var(--hall-paper-0)",
                fontFamily: "var(--font-hall-mono)",
              }}
            >
              Probar
            </button>
            <button
              type="button"
              onClick={disable}
              disabled={busy}
              className="text-[11px] px-2.5 py-1 rounded-sm tracking-[0.06em] uppercase disabled:opacity-50"
              style={{
                color: "var(--hall-muted-2)",
                border: "1px solid var(--hall-line)",
                fontFamily: "var(--font-hall-mono)",
              }}
            >
              Desactivar
            </button>
          </>
        )}
      </div>
      {msg && (
        <p
          className="text-[10px] max-w-[260px] text-right"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {msg}
        </p>
      )}
      {status === "on" && deviceCount > 1 && !msg && (
        <p
          className="text-[10px]"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {deviceCount} dispositivos activos
        </p>
      )}
    </div>
  );
}

// VAPID public keys are base64url; PushManager wants a Uint8Array
// backed by an ArrayBuffer (not SharedArrayBuffer).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
