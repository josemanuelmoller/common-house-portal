"use client";

import { useEffect } from "react";

/**
 * Registers the Common House service worker on mount.
 * Mounted once in the root layout. Safe to render on every route.
 *
 * Phase 1: registration only. Later phases extend the SW itself, not this file.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Register on idle to avoid contending with first paint.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          // SW failures should not break the app. Surface in dev only.
          if (process.env.NODE_ENV !== "production") {
            console.warn("[CH] sw register failed:", err);
          }
        });
    };

    const ric = (window as { requestIdleCallback?: (cb: () => void) => void })
      .requestIdleCallback;
    if (typeof ric === "function") {
      ric(register);
    } else {
      setTimeout(register, 1500);
    }
  }, []);

  return null;
}
