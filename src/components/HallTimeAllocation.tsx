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
  { key: "Client",       label: "Client",       color: "bg-[#c6f24a]", target: 20 },
  { key: "Investor",     label: "Investor",     color: "bg-[#a78bfa]", target: 10 },
  { key: "Funder",       label: "Funder",       color: "bg-[#f472b6]", target: 5  },
  { key: "Portfolio",    label: "Portfolio",    color: "bg-[#fbbf24]", target: 20 },
  { key: "Partner",      label: "Partner",      color: "bg-[#7dd3fc]", target: 15 },
  { key: "VIP",          label: "VIP",          color: "bg-[#c6f24a]", target: 0  },
  { key: "Team",         label: "Team",         color: "bg-[#0a0a0a]", target: 10 },
  { key: "Vendor",       label: "Vendor",       color: "bg-[#9ca3af]", target: 0  },
  { key: "External",     label: "External",     color: "bg-[#cbd5e1]", target: 0  },
  { key: "Personal",     label: "Personal",     color: "bg-amber-300", target: 0  },
  { key: "Unclassified", label: "Unclassified", color: "bg-[#e4e4dd]", target: 0  },
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

  if (totalHours === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
        No meetings in the last 7 days.
      </p>
    );
  }

  return (
    <div>
      <div
        className="flex items-center justify-between mb-2 text-[10px]"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        <span>WEEK · 7D</span>
        <span style={{ color: "var(--hall-ink-0)", fontWeight: 600 }}>{totalHours.toFixed(1)}H TOTAL</span>
      </div>
      <div
        className="flex w-full h-2 rounded-full overflow-hidden mb-4"
        style={{ background: "var(--hall-paper-3)" }}
      >
        {allocation.filter(a => a.hours > 0).map(a => (
          <div
            key={a.bucket.key}
            className={`h-full ${a.bucket.color}`}
            style={{ width: `${(a.hours / totalHours) * 100}%`, minWidth: "2px" }}
            title={`${a.bucket.label}: ${a.hours.toFixed(1)}h · ${((a.hours / totalHours) * 100).toFixed(0)}%`}
          />
        ))}
      </div>
      <div>
        {allocation
          .filter(a => a.hours > 0 || a.bucket.target > 0)
          .map(a => {
            const pct = totalHours > 0 ? (a.hours / totalHours) * 100 : 0;
            const target = a.bucket.target;
            const far  = target > 0 && a.hours === 0;
            const near = target > 0 && pct > 0 && pct < target;
            const over = target > 0 && pct > target * 1.5;
            const status = far ? "OVER" : near ? "UNDER" : over ? "OVER" : target > 0 ? "OK" : "";
            const statusColor = far ? "var(--hall-danger)"
              : near ? "var(--hall-warn)"
              : over ? "var(--hall-danger)"
              : "var(--hall-muted-2)";
            return (
              <div
                key={a.bucket.key}
                className="grid items-center py-2"
                style={{
                  gridTemplateColumns: "80px 1fr 58px 42px",
                  gap: 10,
                  borderTop: "1px solid var(--hall-line-soft)",
                }}
              >
                <span className="text-[12px] font-semibold" style={{ color: "var(--hall-ink-0)" }}>
                  {a.bucket.label}
                </span>
                <div className="relative" style={{ height: 6, background: "var(--hall-line-soft)", borderRadius: 2 }}>
                  <span
                    className="absolute left-0 top-0 bottom-0 rounded-[2px]"
                    style={{ width: `${Math.min(pct, 100)}%`, background: "var(--hall-ink-0)" }}
                  />
                  {target > 0 && (
                    <span
                      className="absolute"
                      style={{ left: `${target}%`, top: -3, bottom: -3, width: 1.5, background: "var(--hall-warn)" }}
                    />
                  )}
                </div>
                <span
                  className="text-right tabular-nums text-[11px] font-bold"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-ink-0)" }}
                >
                  {pct.toFixed(0)}%{target > 0 ? `/${target}%` : ""}
                </span>
                <span
                  className="text-[9px] tracking-[0.08em]"
                  style={{ fontFamily: "var(--font-hall-mono)", color: statusColor }}
                >
                  {status}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
