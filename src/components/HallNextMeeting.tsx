import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
import { getContactsByEmails } from "@/lib/contacts";

/**
 * Next-meeting playbook — surfaces the next upcoming meeting with context:
 *   - Attendees + their relationship classes
 *   - Last touchpoint with any of them (transcript / email / calendar)
 *   - 3 Haiku-generated talking points
 *
 * Pulls from hall_calendar_events, hall_transcript_observations,
 * hall_email_observations. Caps Haiku cost by running a single prompt only
 * for the single NEXT meeting in the next 12h.
 */

type NextMeeting = {
  eventId:      string;
  title:        string;
  startMs:      number;
  startLocal:   string;
  attendees:    { email: string; name: string | null; classes: string[] }[];
  lastTouch:    { kind: string; at: string; title: string } | null;
  talkingPoints: string[] | null;
  htmlLink:     string | null;
};

async function generateTalkingPoints(
  title: string,
  attendees: { email: string; name: string | null; classes: string[] }[],
  lastTouch: { kind: string; at: string; title: string } | null,
): Promise<string[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const attList = attendees.map(a => {
      const cls = a.classes.length > 0 ? ` [${a.classes.join(", ")}]` : "";
      return `- ${a.name ?? a.email}${cls}`;
    }).join("\n");
    const lastLine = lastTouch
      ? `Most recent prior touchpoint: ${lastTouch.kind} on ${lastTouch.at.slice(0, 10)} — "${lastTouch.title}"`
      : `No prior touchpoint recorded.`;

    const prompt =
      `Meeting: ${title}\n\n` +
      `Attendees (non-self):\n${attList}\n\n` +
      `${lastLine}\n\n` +
      `Give 3 concise talking points Jose (the host) should raise in this meeting, tailored to the attendee relationship classes above. Each point 8-14 words. Output only the 3 points, one per line, no numbering, no preamble.`;

    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { type: string; text: string }).text ?? "";
    const points = text
      .split("\n")
      .map(l => l.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 3);
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

async function loadNext(): Promise<NextMeeting | null> {
  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();
  const nowIso = new Date().toISOString();

  const { data } = await sb
    .from("hall_calendar_events")
    .select("event_id, event_title, event_start, attendee_emails, html_link")
    .gte("event_start", nowIso)
    .eq("is_cancelled", false)
    .order("event_start", { ascending: true })
    .limit(10);

  const rows = (data ?? []) as {
    event_id: string; event_title: string; event_start: string;
    attendee_emails: string[] | null; html_link: string | null;
  }[];

  for (const r of rows) {
    const attendees = (r.attendee_emails ?? []).filter(e => e && !selfSet.has(e.toLowerCase()));
    if (attendees.length === 0) continue;

    const contactMap = await getContactsByEmails(attendees);
    const attFull = attendees.map(e => {
      const c = contactMap.get(e.toLowerCase());
      return {
        email:   e,
        name:    c?.display_name ?? null,
        classes: c?.relationship_classes ?? [],
      };
    });

    const [txRes, mailRes] = await Promise.all([
      sb.from("hall_transcript_observations")
        .select("transcript_id, title, meeting_at, attendee_emails")
        .overlaps("attendee_emails", attendees)
        .order("meeting_at", { ascending: false })
        .limit(1),
      sb.from("hall_email_observations")
        .select("thread_id, subject, last_message_at, attendee_emails")
        .overlaps("attendee_emails", attendees)
        .order("last_message_at", { ascending: false })
        .limit(1),
    ]);

    const candidates: { kind: string; at: string; title: string }[] = [];
    const tx = (txRes.data ?? [])[0] as { title: string; meeting_at: string } | undefined;
    const ml = (mailRes.data ?? [])[0] as { subject: string; last_message_at: string } | undefined;
    if (tx) candidates.push({ kind: "Transcript", at: tx.meeting_at, title: tx.title });
    if (ml) candidates.push({ kind: "Email",      at: ml.last_message_at, title: ml.subject });
    candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const lastTouch = candidates[0] ?? null;

    const startMs = new Date(r.event_start).getTime();
    const hoursAway = (startMs - Date.now()) / 3_600_000;
    const talkingPoints = hoursAway < 12 ? await generateTalkingPoints(r.event_title, attFull, lastTouch) : null;

    return {
      eventId:    r.event_id,
      title:      r.event_title,
      startMs,
      startLocal: new Date(r.event_start).toLocaleString("en-GB", {
        weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
      }),
      attendees:  attFull,
      lastTouch,
      talkingPoints,
      htmlLink:   r.html_link ?? null,
    };
  }
  return null;
}

export async function HallNextMeeting() {
  const m = await loadNext();

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#EFEFEA]">
        <span className="text-[10px] font-bold tracking-widest uppercase text-[#131218]/50">Next meeting · playbook</span>
        {m && (
          <span className="text-[9px] font-semibold text-[#131218]/40 tabular-nums">
            {formatAway(m.startMs)}
          </span>
        )}
      </div>
      {!m ? (
        <div className="px-5 py-6 text-center">
          <p className="text-[11px] text-[#131218]/35">No upcoming meeting in the calendar.</p>
        </div>
      ) : (
        <div className="px-5 py-4 space-y-3">
          <div>
            <div className="flex items-start justify-between gap-3">
              <p className="text-[13px] font-bold text-[#131218] leading-snug">{m.title}</p>
              {m.htmlLink && (
                <a href={m.htmlLink} target="_blank" rel="noopener noreferrer"
                   className="text-[9px] font-bold tracking-widest uppercase text-[#131218]/40 hover:text-[#131218]/80 shrink-0">
                  Open →
                </a>
              )}
            </div>
            <p className="text-[10px] text-[#131218]/50 mt-0.5">{m.startLocal}</p>
          </div>

          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 mb-1">Attendees</p>
            <div className="flex flex-wrap gap-1.5">
              {m.attendees.slice(0, 6).map(a => {
                const top = a.classes[0];
                const cls = top ? pillColor(top) : "bg-[#EFEFEA] text-[#131218]/50";
                return (
                  <span key={a.email} className={`text-[9px] font-semibold px-2 py-0.5 rounded ${cls}`}>
                    {a.name ?? a.email.split("@")[0]}
                    {top && <span className="ml-1 opacity-70">· {top}</span>}
                  </span>
                );
              })}
              {m.attendees.length > 6 && (
                <span className="text-[9px] text-[#131218]/40 px-1 py-0.5">+{m.attendees.length - 6}</span>
              )}
            </div>
          </div>

          {m.lastTouch && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#131218]/40 mb-0.5">Last touch</p>
              <p className="text-[10px] text-[#131218]/70 leading-snug">
                <span className="font-semibold">{m.lastTouch.kind}</span>
                <span className="text-[#131218]/40"> · {m.lastTouch.at.slice(0, 10)} · </span>
                <span className="line-clamp-1">{m.lastTouch.title}</span>
              </p>
            </div>
          )}

          {m.talkingPoints && m.talkingPoints.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-[#c8f55a] mb-1 bg-[#131218] inline-block px-2 py-0.5 rounded">
                Talking points
              </p>
              <ul className="mt-1.5 space-y-1">
                {m.talkingPoints.map((p, i) => (
                  <li key={i} className="text-[11px] text-[#131218]/80 leading-snug flex gap-2">
                    <span className="text-[#c8f55a] font-bold shrink-0">·</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatAway(startMs: number): string {
  const diffMs = startMs - Date.now();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60)  return `in ${mins}m`;
  if (mins < 1440) return `in ${Math.round(mins / 60)}h`;
  return `in ${Math.round(mins / 1440)}d`;
}

function pillColor(cls: string): string {
  switch (cls) {
    case "Client":    return "bg-[#c8f55a]/40 text-green-900";
    case "Investor":  return "bg-[#a78bfa]/30 text-purple-900";
    case "Funder":    return "bg-[#f472b6]/30 text-pink-900";
    case "Portfolio": return "bg-[#fbbf24]/30 text-amber-900";
    case "Partner":   return "bg-[#7dd3fc]/30 text-sky-900";
    case "VIP":       return "bg-[#B2FF59]/40 text-green-900";
    case "Team":      return "bg-[#131218] text-white";
    case "Family":    return "bg-amber-100 text-amber-900";
    case "Friend":    return "bg-amber-100 text-amber-900";
    default:          return "bg-[#EFEFEA] text-[#131218]/60";
  }
}
