"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Props = {
  opportunityId: string;
  initialFollowed: boolean;
  size?: "sm" | "md";
};

/**
 * Follow / Unfollow toggle for a grant record.
 *
 * Calls POST /api/opportunity-follow. On success, refreshes the page so the
 * server-rendered "Following" section and grant list re-render with fresh
 * is_followed state. Never triggers sync — the sync-loops gate reads is_followed
 * directly from Supabase on its next run, and unfollow has already resolved
 * any open loops via the API route's side effects.
 */
export function GrantFollowButton({ opportunityId, initialFollowed, size = "sm" }: Props) {
  const router = useRouter();
  const [followed, setFollowed] = useState(initialFollowed);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    const next = !followed;
    const action = next ? "follow" : "unfollow";
    let reason: string | undefined;
    if (!next) {
      const r = window.prompt(
        "Unfollow this grant? Optional reason (stored so it does not resurface automatically):",
        "",
      );
      if (r === null) return; // cancelled
      reason = r.trim() || undefined;
    }

    setFollowed(next); // optimistic
    try {
      const res = await fetch("/api/opportunity-follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId, action, reason }),
      });
      if (!res.ok) {
        setFollowed(!next);
        const j = await res.json().catch(() => ({}));
        setError(j?.error ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (e) {
      setFollowed(!next);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const label = followed ? "Following" : "Follow";
  const nextLabel = followed ? "Unfollow" : "Follow";
  const base = size === "md" ? "text-[11px] px-3 py-1.5" : "text-[10px] px-2 py-1";
  const cls = followed
    ? `${base} font-bold rounded-full bg-[#c6f24a]/25 text-green-900 hover:bg-[#c6f24a]/40 border border-[#c6f24a]/60 transition-colors`
    : `${base} font-bold rounded-full bg-[#0a0a0a] text-white hover:bg-[#0a0a0a]/80 transition-colors`;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        title={followed ? "Jose has explicitly activated this grant" : "System-discovered — passive until followed"}
        aria-label={`${nextLabel} grant`}
        className={`${cls} ${pending ? "opacity-60 cursor-wait" : ""}`}
      >
        {pending ? "…" : label}
      </button>
      {error && <span className="text-[9px] text-red-600" role="alert">{error}</span>}
    </div>
  );
}
