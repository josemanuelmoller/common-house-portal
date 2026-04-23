import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * Unified "Needs Attention" inbox for the Contacts page.
 *
 * Aggregates five sources into one prioritised list so the user has a single
 * ritual to keep the contact base clean:
 *
 *   1. UNTAGGED           — contacts with zero relationship_classes (prep
 *                           urgency is affected — fail-open default).
 *   2. LINKEDIN REVIEW    — agent surfaced a 0.4-0.8 match; approve / reject.
 *   3. ORPHAN CANDIDATES  — medium-confidence WA sender matches from the
 *                           clipper waiting for approval.
 *   4. COLD VIPs          — VIP-tagged contacts whose last_seen_at > 60d.
 *                           Nudge to reconnect.
 *   5. NO LINKEDIN MATCH  — agent tried, found nothing. Complete manually.
 *                           Shown compact and deprioritised so it doesn't
 *                           crowd out actionable items.
 *
 * Renders as a stacked list of action rows, each linked to where the action
 * lives (tab or profile).
 */

type AttentionCounts = {
  untagged:       number;
  linkedin_review: number;
  orphans:        number;
  cold_vips:      number;
  no_linkedin:    number;
};

type AttentionRow = {
  kind:   "untagged" | "linkedin_review" | "orphans" | "cold_vip" | "no_linkedin";
  label:  string;
  sub:    string;
  href:   string;
  priority: number;     // higher = surface first
};

async function loadAttention(): Promise<{ counts: AttentionCounts; rows: AttentionRow[] }> {
  const sb = getSupabaseServerClient();

  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString();

  const [untaggedRes, reviewRes, orphansRes, coldVipRes, noLinkedInRes] = await Promise.all([
    // Untagged with email (skip WA-only — they have their own surface)
    sb.from("people")
      .select("id, email, full_name, display_name, meeting_count, last_seen_at")
      .not("email", "is", null)
      .is("dismissed_at", null)
      .or("relationship_classes.is.null,relationship_classes.eq.{}")
      .gt("meeting_count", 0)
      .order("meeting_count", { ascending: false })
      .limit(30),
    // LinkedIn review queue (0.4-0.8 matches)
    sb.from("people")
      .select("id, email, full_name, display_name, linkedin, linkedin_confidence, job_title")
      .eq("linkedin_needs_review", true)
      .order("linkedin_confidence", { ascending: false })
      .limit(20),
    // Orphan candidates pending review
    sb.from("orphan_match_candidates")
      .select("id, source_id, sender_name, candidate_person_id, confidence, msg_count")
      .eq("status", "pending")
      .order("confidence", { ascending: false })
      .order("msg_count", { ascending: false })
      .limit(20),
    // Cold VIPs — VIP-tagged, last_seen > 60d
    sb.from("people")
      .select("id, email, full_name, display_name, last_seen_at, relationship_classes")
      .not("email", "is", null)
      .is("dismissed_at", null)
      .contains("relationship_classes", ["VIP"])
      .lt("last_seen_at", sixtyDaysAgo)
      .order("last_seen_at", { ascending: false })
      .limit(15),
    // No LinkedIn match (agent tried, nothing found)
    sb.from("people")
      .select("id, email, full_name, display_name, meeting_count, linkedin_last_attempt_at")
      .not("email", "is", null)
      .is("dismissed_at", null)
      .is("linkedin", null)
      .not("linkedin_last_attempt_at", "is", null)
      .order("meeting_count", { ascending: false })
      .limit(12),
  ]);

  const rows: AttentionRow[] = [];

  type Person = { id: string; email: string | null; full_name: string | null; display_name: string | null; meeting_count: number | null; last_seen_at: string | null };
  type PersonReview = Person & { linkedin: string | null; linkedin_confidence: number | null; job_title: string | null };
  type Orphan = { id: string; source_id: string; sender_name: string; candidate_person_id: string; confidence: number; msg_count: number };
  type ColdVip = Person & { relationship_classes: string[] | null };

  for (const p of ((untaggedRes.data ?? []) as Person[])) {
    const name = p.full_name ?? p.display_name ?? (p.email ?? "").split("@")[0];
    rows.push({
      kind:    "untagged",
      label:   name,
      sub:     `${p.meeting_count ?? 0} meetings · no class yet — prep urgency defaults to unknown`,
      href:    `/admin/hall/contacts/${encodeURIComponent(p.email ?? p.id)}`,
      priority: 80 + Math.min(20, (p.meeting_count ?? 0)), // more meetings → higher urgency
    });
  }

  for (const p of ((reviewRes.data ?? []) as PersonReview[])) {
    const name = p.full_name ?? p.display_name ?? (p.email ?? "").split("@")[0];
    const conf = p.linkedin_confidence != null ? `${Math.round(p.linkedin_confidence * 100)}%` : "?";
    rows.push({
      kind:    "linkedin_review",
      label:   `${name} — LinkedIn ${conf} match needs approval`,
      sub:     `${p.job_title ?? "role unknown"} — one click to approve, override, or reject`,
      href:    `/admin/hall/contacts?mode=linkedin`,
      priority: 90,
    });
  }

  for (const c of ((orphansRes.data ?? []) as Orphan[])) {
    rows.push({
      kind:    "orphans",
      label:   `"${c.sender_name}" → ${c.msg_count} WhatsApp message${c.msg_count === 1 ? "" : "s"}`,
      sub:     `${Math.round(c.confidence * 100)}% match — click to review and approve`,
      href:    `/admin/hall/contacts?mode=orphans`,
      priority: 85,
    });
  }

  for (const p of ((coldVipRes.data ?? []) as ColdVip[])) {
    const name = p.full_name ?? p.display_name ?? (p.email ?? "").split("@")[0];
    const days = p.last_seen_at
      ? Math.floor((Date.now() - new Date(p.last_seen_at).getTime()) / 86400_000)
      : null;
    rows.push({
      kind:    "cold_vip",
      label:   `${name} — VIP gone cold`,
      sub:     `last seen ${days ?? "?"}d ago — consider reconnecting`,
      href:    `/admin/hall/contacts/${encodeURIComponent(p.email ?? p.id)}`,
      priority: 70 - Math.min(40, Math.floor((days ?? 0) / 10)),  // colder = lower priority in this bucket (let actionable items surface first)
    });
  }

  type NoLinkedInRow = { id: string; email: string | null; full_name: string | null; display_name: string | null; meeting_count: number | null; linkedin_last_attempt_at: string | null };
  for (const p of ((noLinkedInRes.data ?? []) as NoLinkedInRow[])) {
    const name = p.full_name ?? p.display_name ?? (p.email ?? "").split("@")[0];
    rows.push({
      kind:    "no_linkedin",
      label:   `${name} — no LinkedIn match`,
      sub:     `${p.meeting_count ?? 0} meetings · complete manually via Edit identity`,
      href:    `/admin/hall/contacts/${encodeURIComponent(p.email ?? p.id)}`,
      priority: 30 + Math.min(20, (p.meeting_count ?? 0)),
    });
  }

  rows.sort((a, b) => b.priority - a.priority);

  const counts: AttentionCounts = {
    untagged:         untaggedRes.data?.length ?? 0,
    linkedin_review:  reviewRes.data?.length   ?? 0,
    orphans:          orphansRes.data?.length  ?? 0,
    cold_vips:        coldVipRes.data?.length  ?? 0,
    no_linkedin:      noLinkedInRes.data?.length ?? 0,
  };

  return { counts, rows };
}

function kindStyle(kind: AttentionRow["kind"]): { dot: string; label: string } {
  switch (kind) {
    case "untagged":        return { dot: "bg-amber-400",   label: "Untagged"       };
    case "linkedin_review": return { dot: "bg-[#c8f55a]",   label: "LinkedIn review" };
    case "orphans":         return { dot: "bg-emerald-500", label: "Orphan match"    };
    case "cold_vip":        return { dot: "bg-blue-400",    label: "Cold VIP"        };
    case "no_linkedin":     return { dot: "bg-[#131218]/40", label: "No LinkedIn"    };
  }
}

export async function NeedsAttentionSection() {
  const { counts, rows } = await loadAttention();
  const totalActionable = counts.untagged + counts.linkedin_review + counts.orphans + counts.cold_vips;

  return (
    <div className="space-y-5">
      <div className="bg-[#131218] text-white rounded-2xl px-5 py-4">
        <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 mb-2">Attention inbox</p>
        <div className="flex items-center gap-6 text-[12px]">
          <Bucket count={counts.untagged}         label="Untagged"         colour="text-amber-300"   />
          <Bucket count={counts.linkedin_review}  label="LinkedIn review"  colour="text-[#c8f55a]"   />
          <Bucket count={counts.orphans}          label="Orphan matches"   colour="text-emerald-300" />
          <Bucket count={counts.cold_vips}        label="Cold VIPs"        colour="text-blue-300"    />
          <Bucket count={counts.no_linkedin}      label="No LinkedIn"      colour="text-white/50"    />
          <div className="flex-1" />
          <span className="text-[11px] text-white/50 tabular-nums">
            {totalActionable} actionable · {rows.length} total
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E0E0D8] px-5 py-10 text-center">
          <p className="text-[13px] text-[#131218]/50">🎉 Inbox zero. Nothing needs your attention right now.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden divide-y divide-[#EFEFEA]">
          {rows.map((r, i) => {
            const s = kindStyle(r.kind);
            return (
              <Link
                key={`${r.kind}:${i}`}
                href={r.href}
                prefetch={false}
                className="flex items-center gap-4 px-5 py-3 hover:bg-[#EFEFEA]/40 transition-colors"
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-[#131218] truncate">{r.label}</p>
                  <p className="text-[10.5px] text-[#131218]/50 mt-0.5 truncate">
                    <span className="uppercase tracking-wide font-bold">{s.label}</span>
                    {" · "}{r.sub}
                  </p>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#131218]/30 shrink-0">
                  Open →
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Bucket({ count, label, colour }: { count: number; label: string; colour: string }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className={`text-[18px] font-black ${colour}`}>{count}</span>
      <span className="text-[10px] text-white/40 uppercase tracking-widest">{label}</span>
    </span>
  );
}
