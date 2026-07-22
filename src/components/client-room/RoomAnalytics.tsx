"use client";

import { useEffect } from "react";

type QEvent = { type: string; target?: string; durationMs?: number; metadata?: Record<string, unknown>; ts: string };

// A section only counts as "viewed" after it stays ≥40% on screen this long —
// scrolling past it no longer inflates coverage.
const DWELL_MIN_MS = 3_000;
// Periodic "still here" beat so a session's real length survives even when the
// tab is closed abruptly (common on mobile) and no session_end lands.
const HEARTBEAT_MS = 15_000;
const FLUSH_MS = 10_000;

/**
 * Identified room analytics. Mounted once inside the client room. Captures:
 *  - visit (on mount)
 *  - section_view (only after DWELL_MIN_MS continuously in view) + per-section
 *    dwell time (visible + on-screen time, never counted while backgrounded)
 *  - material_open (clicks on any element carrying [data-track])
 *  - heartbeat (every HEARTBEAT_MS while visible) carrying cumulative active
 *    time + a snapshot of per-section dwell — a lower bound that stands in if
 *    session_end is lost
 *  - session_end (total active time on pagehide)
 *
 * Every event carries its own `ts` (client clock) so the server keeps the real
 * timeline instead of collapsing a whole flush batch onto the ingest time.
 * The sessionId is persisted per tab so a reload continues the same visit.
 * Attribution (email/role/is_admin) is added server-side.
 */
export function RoomAnalytics({ projectId, sectionIds }: { projectId: string; sectionIds: string[] }) {
  useEffect(() => {
    const url = `/api/projects/${projectId}/analytics`;

    // Persist the session id for this tab so a reload continues the same session
    // instead of fragmenting into a fresh "visit".
    const storeKey = `cr_sess_${projectId}`;
    let sessionId = "";
    try { sessionId = sessionStorage.getItem(storeKey) ?? ""; } catch { /* private mode */ }
    if (!sessionId) {
      sessionId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
      try { sessionStorage.setItem(storeKey, sessionId); } catch { /* private mode */ }
    }

    let queue: QEvent[] = [];
    const seen = new Set<string>();               // sections that cleared the dwell gate
    const inView = new Set<string>();             // sections currently ≥40% on screen
    const accrueStart = new Map<string, number>(); // section -> when it began accruing visible on-screen time
    const dwell = new Map<string, number>();       // section -> cumulative on-screen ms
    const gate = new Map<string, number>();        // section -> pending dwell-gate timeout id
    let visible = document.visibilityState === "visible";
    let activeStart = visible ? Date.now() : 0;
    let totalActive = 0;
    let ended = false;

    const nowIso = () => new Date().toISOString();
    const push = (e: Omit<QEvent, "ts">) => queue.push({ ...e, ts: nowIso() });

    const flush = (useBeacon: boolean) => {
      if (queue.length === 0) return;
      const body = JSON.stringify({
        sessionId,
        path: location.pathname,
        referrer: document.referrer || null,
        events: queue,
      });
      queue = [];
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      }
    };

    // Dwell only accrues while a section is BOTH on screen AND the tab is visible.
    const startAccrual = (id: string) => {
      if (visible && inView.has(id) && !accrueStart.has(id)) accrueStart.set(id, Date.now());
    };
    const stopAccrual = (id: string) => {
      const s = accrueStart.get(id);
      if (s !== undefined) { dwell.set(id, (dwell.get(id) ?? 0) + (Date.now() - s)); accrueStart.delete(id); }
    };
    const armGate = (id: string) => {
      if (seen.has(id) || gate.has(id) || !visible) return;
      const timer = window.setTimeout(() => {
        gate.delete(id);
        if (inView.has(id) && visible && !seen.has(id)) {
          seen.add(id);
          push({ type: "section_view", target: id });
        }
      }, DWELL_MIN_MS);
      gate.set(id, timer);
    };
    const clearGate = (id: string) => {
      const t = gate.get(id);
      if (t !== undefined) { window.clearTimeout(t); gate.delete(id); }
    };

    const sectionSnapshot = () => {
      const out: Record<string, number> = {};
      for (const [id, ms] of dwell) out[id] = ms;
      const t = Date.now();
      for (const [id, s] of accrueStart) out[id] = (out[id] ?? 0) + (t - s);
      return out;
    };
    const activeMs = () => totalActive + (activeStart ? Date.now() - activeStart : 0);

    push({ type: "visit" });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (!id) continue;
          if (entry.isIntersecting) {
            inView.add(id);
            startAccrual(id);
            armGate(id);
          } else {
            inView.delete(id);
            stopAccrual(id);
            clearGate(id);
          }
        }
      },
      { threshold: 0.4 }
    );
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }

    // material / element clicks via [data-track]
    const onClick = (ev: MouseEvent) => {
      const el = (ev.target as HTMLElement)?.closest?.("[data-track]") as HTMLElement | null;
      if (el) push({ type: "material_open", target: el.getAttribute("data-track") || "unknown" });
    };
    document.addEventListener("click", onClick, true);

    const heartbeat = () => {
      if (ended || !visible) return;
      push({ type: "heartbeat", durationMs: activeMs(), metadata: { sections: sectionSnapshot() } });
      flush(false);
    };

    const endSession = (useBeacon: boolean) => {
      if (ended) return;
      ended = true;
      for (const id of [...accrueStart.keys()]) stopAccrual(id);
      if (activeStart) { totalActive += Date.now() - activeStart; activeStart = 0; }
      const sections: Record<string, number> = {};
      for (const [id, ms] of dwell) sections[id] = ms;
      push({ type: "session_end", durationMs: totalActive, metadata: { sections } });
      flush(useBeacon);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Freeze all clocks and land a heartbeat before a possible close.
        for (const id of [...accrueStart.keys()]) stopAccrual(id);
        for (const id of [...gate.keys()]) clearGate(id);
        if (activeStart) { totalActive += Date.now() - activeStart; activeStart = 0; }
        visible = false;
        push({ type: "heartbeat", durationMs: activeMs(), metadata: { sections: sectionSnapshot() } });
        flush(true);
      } else {
        visible = true;
        activeStart = Date.now();
        // Resume clocks for whatever is still on screen.
        for (const id of inView) { startAccrual(id); armGate(id); }
      }
    };
    const onPageHide = () => endSession(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const flushInterval = window.setInterval(() => flush(false), FLUSH_MS);
    const beatInterval = window.setInterval(heartbeat, HEARTBEAT_MS);
    // record the initial visit quickly, don't wait for the first flush tick
    const kickoff = window.setTimeout(() => flush(false), 1500);

    return () => {
      window.clearInterval(flushInterval);
      window.clearInterval(beatInterval);
      window.clearTimeout(kickoff);
      for (const t of gate.values()) window.clearTimeout(t);
      io.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      endSession(true);
    };
  }, [projectId, sectionIds]);

  return null;
}
