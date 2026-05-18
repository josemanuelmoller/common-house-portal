"use client";

/**
 * Admin error boundary.
 *
 * Replaces the default Next.js "This page couldn't load" placeholder with
 * a UI that ALSO reports the full error stack to Supabase debug_log on
 * mount. The Vercel runtime log truncates exception messages to ~240
 * chars; this boundary captures the full stack so we can debug from SQL.
 *
 * Renders a minimal UI with the digest + a one-line message + a Reload
 * button. Sub-pages are unaffected — only /admin (root) currently uses
 * this boundary.
 */

import { useEffect, useState } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [reportStatus, setReportStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReportStatus("sending");

    const body = {
      source: "admin/error.tsx",
      url: typeof window !== "undefined" ? window.location.href : null,
      message: error?.message ?? null,
      stack: error?.stack ?? null,
      digest: error?.digest ?? null,
      metadata: {
        name: error?.name ?? null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
    };

    fetch("/api/debug-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => res.ok ? res.json() : Promise.reject(res.statusText))
      .then((data) => {
        if (cancelled) return;
        setReportId(data?.id ?? null);
        setReportStatus("sent");
      })
      .catch(() => {
        if (cancelled) return;
        setReportStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [error]);

  return (
    <div style={{ padding: 32, fontFamily: "system-ui, -apple-system, sans-serif", maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        Admin dashboard failed to render
      </h1>
      <p style={{ color: "#666", fontSize: 14, marginBottom: 16 }}>
        The full dashboard hit a server error. Use the sub-page links to keep working.
      </p>

      <div style={{ background: "#f4f4ef", border: "1px solid #e4e4dd", borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 12, fontFamily: "monospace" }}>
        <div><strong>message</strong>: {error?.message || "(none)"}</div>
        {error?.digest && <div style={{ marginTop: 4 }}><strong>digest</strong>: {error.digest}</div>}
        <div style={{ marginTop: 4 }}>
          <strong>report</strong>:{" "}
          {reportStatus === "sending" && "sending to Supabase debug_log…"}
          {reportStatus === "sent" && <span style={{ color: "#0a0" }}>captured (id: {reportId})</span>}
          {reportStatus === "failed" && <span style={{ color: "#a00" }}>failed</span>}
          {reportStatus === "idle" && "queued"}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          onClick={reset}
          style={{ padding: "8px 16px", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
        >
          Try again
        </button>
        <a
          href="/admin"
          style={{ padding: "8px 16px", background: "#fff", color: "#0a0a0a", border: "1px solid #e4e4dd", borderRadius: 6, textDecoration: "none", fontSize: 14 }}
        >
          Safe mode
        </a>
      </div>

      <ul style={{ listStyle: "none", padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
        {[
          ["/admin/decisions", "Decisions"],
          ["/admin/inbox", "Inbox"],
          ["/admin/hall/contacts", "Contacts"],
          ["/admin/hall/organizations", "Organizations"],
          ["/admin/hall/commitments", "Commitments"],
          ["/admin/agents", "Agents"],
          ["/admin/plan", "Plan"],
        ].map(([href, label]) => (
          <li key={href}>
            <a href={href} style={{ display: "block", padding: "10px 14px", border: "1px solid #e4e4dd", borderRadius: 8, color: "#0a0a0a", textDecoration: "none", fontSize: 14 }}>
              {label} →
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
