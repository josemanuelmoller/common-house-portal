import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";

/**
 * Where did your time go this week — meeting hours last 7 days, bucketed by
 * the "most actionable class" of the non-self attendees. Each meeting is
 * credited to ONE bucket (highest-priority class present) so hours don't
 * double-count.
 *
 * Priority order (bucket the meeting lands in if >1 attendee class present):
 *   Client > Investor > Funder > Portfolio > Partner > VIP > Team > Vendor > External > Personal > Unclassified
 *
 * Jose sets soft targets by CLASS below — red-flagged if below target.
 */

const BUCKETS = [
  { key: "Client",       label: "Client",       color: "bg-[#c8f55a]", target: 20 },
  { key: "Investor",     label: "Investor",     color: "bg-[#a78bfa]", target: 10 },
  { key: "Funder",       label: "Funder",       color: "bg-[#f472b6]", target: 5  },
  { key: "Portfolio",    label: "Portfolio",    color: "bg-[#fbbf24]", target: 20 },
  { key: "Partner",      label: "Partner",      color: "bg-[#7dd3fc]", target: 15 },
  { key: "VIP",          label: "VIP",          color: "bg-[#B2FF59]", target: 0  },
  { key: "Team",         label: "Team",         color: "bg-[#131218]", target: 10 },
  { key: "Vendor",       label: "Vendor",       color: "bg-[#9ca3af]", target: 0  },
  { key: "External",     label: "External",     color: "bg-[#cbd5e1]", target: 0  },
  { key: "Personal",     label: "Personal",     color: "bg-amber-300", target: 0  },
  { key: "Unclassified", label: "Unclassified", color: "bg-[#E0E0D8]", target: 0  },
] as const;

const PRIORITY_ORDER: readonly string[] = ["Client", "Investor", "Funder", "Portfolio", "Partner", "VIP", "Team", "Vendor", "External"];
const PERSONAL_SET = new Set(["Family", "Personal Service", "Friend"]);

async function loadAllocation(): Promise<{ bucket: typeof BUCKETS[number]; hours: number }[]> {
  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();

  const [eventsRes, attendeesRes] = await Promise.all([
    sb.from("hall_calendar_events")
      .select("event_id, event_title, event_start, event_end, attendee_emails")
      .gte("event_start", since)
      .eq("is_cancelled", false),
    sb.from("people").select("email, relationship_classes"),
  ]);

  const classesByEmail = new Map<string, string[]>();
  for (const r of (attendeesRes.data ?? []) as { email: string; relationship_classes: string[] | null }[]) {
    classesByEmail.set(r.email, r.relationship_classes ?? []);
  }

  const hoursByBucket = new Map<string, number>();
  for (const b of BUCKETS) hoursByBucket.set(b.key, 0);

  for (const ev of (eventsRes.data ?? []) as { event_id: string; event_start: string; event_end: string; attendee_emails: string[] }[]) {
    const startMs = new Date(ev.event_start).getTime();
    const endMs   = new Date(ev.event_end).getTime();
    if (!startMs || !endMs || endMs <= startMs) continue;
    const hours = Math.min(4, (endMs - startMs) / 3_600_000); // cap single event at 4h to avoid skew

    const attendees = (ev.attendee_emails ?? []).filter(e => !selfSet.has(e));
    if (attendees.length === 0) continue;

    // Determine the bucket: collect every class across attendees, pick the
    // highest-priority one. If everyone's classes are personal → Personal
    // bucket. If nobody has any class → Unclassified.
    const allClasses = new Set<string>();
    let anyKnown = false;
    for (const email of attendees) {
      const cs = classesByEmail.get(email);
      if (cs && cs.length > 0) {
        anyKnown = true;
        for (const c of cs) allClasses.add(c);
      }
    }

    let bucket: string;
    if (!anyKnown) {
      bucket = "Unclassified";
    } else {
      const hit = PRIORITY_ORDER.find(c => allClasses.has(c));
      if (hit) {
        bucket = hit;
      } else {
        // No work classes — check if all are personal.
        const onlyPersonal = [...allClasses].every(c => PERSONAL_SET.has(c));
        bucket = onlyPersonal ? "Personal" : "Unclassified";
      }
    }
    hoursByBucket.set(bucket, (hoursByBucket.get(bucket) ?? 0) + hours);
  }

  return BUCKETS.map(b => ({ bucket: b, hours: hoursByBucket.get(b.key) ?? 0 }));
}

export async function HallTimeAllocation() {
  const allocation = await loadAllocation();
  const totalHours = allocation.reduce((s, a) => s + a.hours, 0);

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EFEFEA]">
        <span className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/50">Time allocation · last 7d</span>
        <span className="text-[9px] font-semibold text-[#131218]/30">{totalHours.toFixed(1)}h total</span>
      </div>
      <div className="px-5 py-4">
        {totalHours === 0 ? (
          <p className="text-[11px] text-[#131218]/35 text-center">No meetings in the last 7 days.</p>
        ) : (
          <>
            {/* Stacked bar — h-3 is more readable than h-2 and survives PDF render */}
            <div className="flex w-full h-3 rounded-full overflow-hidden bg-[#E0E0D8] mb-4 ring-1 ring-[#E0E0D8]">
              {allocation.filter(a => a.hours > 0).map(a => (
                <div
                  key={a.bucket.key}
                  className={`h-full ${a.bucket.color}`}
                  style={{ width: `${(a.hours / totalHours) * 100}%`, minWidth: "2px" }}
                  title={`${a.bucket.label}: ${a.hours.toFixed(1)}h · ${((a.hours / totalHours) * 100).toFixed(0)}%`}
                />
              ))}
            </div>
            {/* Table — Q3: amber for "below target", red reserved for 0 with target */}
            <div className="space-y-1">
              {allocation
                .filter(a => a.hours > 0 || a.bucket.target > 0)
                .map(a => {
                  const pct = totalHours > 0 ? (a.hours / totalHours) * 100 : 0;
                  const target = a.bucket.target;
                  const far  = target > 0 && a.hours === 0;           // red only when totally neglected
                  const near = target > 0 && pct > 0 && pct < target; // amber when present but under
                  const over = target > 0 && pct > target * 1.5;      // K2 — highlight over-served
                  const color = far ? "text-red-600 font-bold"
                              : near ? "text-amber-700 font-semibold"
                              : over ? "text-emerald-700 font-semibold"
                              : "text-[#131218]/40";
                  return (
                    <div key={a.bucket.key} className="flex items-center gap-2 text-[10px]">
                      <span className={`w-2 h-2 rounded-full ${a.bucket.color}`} />
                      <span className="font-semibold text-[#131218]/75 w-20">{a.bucket.label}</span>
                      <span className="text-[#131218]/50 w-14 text-right tabular-nums">{a.hours.toFixed(1)}h</span>
                      <span className={`w-12 text-right tabular-nums ${color}`}>
                        {pct.toFixed(0)}%
                      </span>
                      {target > 0 && (
                        <span className="text-[#131218]/30 text-[9px] w-16">
                          target {target}%
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
