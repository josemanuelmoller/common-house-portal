"use client";

import { useEffect } from "react";

type QEvent = { type: string; target?: string; durationMs?: number; metadata?: Record<string, unknown> };

/**
 * Identified room analytics. Mounted once inside the client room. Captures:
 *  - visit (on mount)
 *  - section_view (first time each section scrolls into view) + per-section dwell
 *  - material_open (clicks on any element carrying [data-track])
 *  - session_end (total active time on pagehide)
 *
 * Events queue and flush every 10s and on pagehide (via sendBeacon so a tab
 * close still lands). Attribution (email/role/is_admin) is added server-side.
 */
export function RoomAnalytics({ projectId, sectionIds }: { projectId: string; sectionIds: string[] }) {
  useEffect(() => {
    const url = `/api/projects/${projectId}/analytics`;
    const sessionId =
      (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `s_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    let queue: QEvent[] = [];
    const seen = new Set<string>();
    const enterAt = new Map<string, number>();
    const dwell = new Map<string, number>();
    let activeStart = document.visibilityState === "visible" ? Date.now() : 0;
    let totalActive = 0;
    let ended = false;

    const push = (e: QEvent) => queue.push(e);

    const flush = (useBeacon: boolean) => {
      if (queue.length === 0) return;
      const payload = {
        sessionId,
        path: location.pathname,
        referrer: document.referrer || null,
        events: queue,
      };
      queue = [];
      const bodyStr = JSON.stringify(payload);
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([bodyStr], { type: "application/json" }));
      } else {
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: bodyStr, keepalive: true }).catch(() => {});
      }
    };

    // visit
    push({ type: "visit" });

    // section observation
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (!id) continue;
          if (entry.isIntersecting) {
            if (!seen.has(id)) {
              seen.add(id);
              push({ type: "section_view", target: id });
            }
            if (!enterAt.has(id)) enterAt.set(id, Date.now());
          } else if (enterAt.has(id)) {
            dwell.set(id, (dwell.get(id) ?? 0) + (Date.now() - (enterAt.get(id) as number)));
            enterAt.delete(id);
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

    const finalizeDwell = () => {
      const t = Date.now();
      for (const [id, start] of enterAt) dwell.set(id, (dwell.get(id) ?? 0) + (t - start));
      enterAt.clear();
    };

    const endSession = (useBeacon: boolean) => {
      if (ended) return;
      ended = true;
      finalizeDwell();
      if (activeStart) { totalActive += Date.now() - activeStart; activeStart = 0; }
      const sections: Record<string, number> = {};
      for (const [id, ms] of dwell) sections[id] = ms;
      push({ type: "session_end", durationMs: totalActive, metadata: { sections } });
      flush(useBeacon);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        if (activeStart) { totalActive += Date.now() - activeStart; activeStart = 0; }
        flush(true); // land queued events before a possible close
      } else {
        activeStart = Date.now();
      }
    };
    const onPageHide = () => endSession(true);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const interval = window.setInterval(() => flush(false), 10_000);
    // record the initial visit quickly, don't wait 10s
    const kickoff = window.setTimeout(() => flush(false), 1500);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(kickoff);
      io.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      endSession(true);
    };
  }, [projectId, sectionIds]);

  return null;
}
