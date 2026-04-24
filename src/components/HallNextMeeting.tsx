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
        .select("transcript_id, title, meeting_at, participant_emails")
        .overlaps("participant_emails", attendees)
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
    // F2 — normalize cryptic "Julia<>Cote" titles to "Julia Koskella & Cote"
    // when attendees are matched. Pattern: `X<>Y` → "X & Y" readable form.
    const cleanTitle = (raw: string): string => {
      if (/^[\w.\s]+<>[\w.\s]+$/.test(raw)) {
        const [a, b] = raw.split("<>").map(s => s.trim());
        // If one of the parts matches an attendee's display name, use it directly.
        const byName = attFull.find(at => at.name && a && at.name.toLowerCase().includes(a.toLowerCase()));
        const lead = byName?.name ?? a;
        return `${lead} · ${b}`;
      }
      return raw;
    };
    const talkingPoints = hoursAway < 12 ? await generateTalkingPoints(cleanTitle(r.event_title), attFull, lastTouch) : null;

    return {
      eventId:    r.event_id,
      title:      cleanTitle(r.event_title),
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

  if (!m) {
    return (
      <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
        No upcoming meeting in the calendar.
      </p>
    );
  }

  const minsAway = Math.round((m.startMs - Date.now()) / 60_000);
  const imminent = minsAway >= 0 && minsAway <= 15;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-1">
        <h4
          className="font-bold leading-snug"
          style={{ fontSize: 16, color: "var(--hall-ink-0)", letterSpacing: "-0.01em" }}
        >
          {m.title}
        </h4>
        {m.htmlLink && (
          imminent ? (
            <a
              href={m.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="hall-btn-primary"
              style={{ padding: "5px 11px", fontSize: 11 }}
            >
              Join →
            </a>
          ) : (
            <a
              href={m.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[9px] font-bold tracking-widest uppercase shrink-0"
              style={{ color: "var(--hall-muted-2)" }}
            >
              Open →
            </a>
          )
        )}
      </div>
      <div
        className="mb-3"
        style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10.5, color: "var(--hall-muted-2)" }}
      >
        {m.startLocal} · {formatAway(m.startMs)}
      </div>

      {minsAway >= 0 && minsAway < 90 && (
        <span
          className="inline-flex items-center gap-1.5 mb-3.5"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontSize: 10.5,
            fontWeight: 600,
            color: "var(--hall-ink-0)",
            background: "var(--hall-paper-0)",
            border: "1px solid var(--hall-ink-0)",
            padding: "3px 8px",
            borderRadius: 100,
          }}
        >
          <span
            className="hall-pulse"
            style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--hall-lime-ink)" }}
          />
          Starts in {minsAway} min
        </span>
      )}

      <div className="mb-3">
        <p
          className="font-bold uppercase mb-1.5"
          style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--hall-muted-3)" }}
        >
          Attendees
        </p>
        <div className="flex flex-wrap gap-1.5">
          {m.attendees.slice(0, 6).map(a => {
            const top = a.classes[0];
            return (
              <span
                key={a.email}
                className="text-[10.5px]"
                style={{
                  background: "var(--hall-fill-soft)",
                  color: "var(--hall-ink-3)",
                  padding: "2px 8px",
                  borderRadius: 100,
                }}
              >
                {a.name ?? (a.email ?? "").split("@")[0]}
                {top && <span className="ml-1 opacity-70">· {top}</span>}
              </span>
            );
          })}
          {m.attendees.length > 6 && (
            <span className="text-[10px] px-1 py-0.5" style={{ color: "var(--hall-muted-3)" }}>
              +{m.attendees.length - 6}
            </span>
          )}
        </div>
      </div>

      {m.lastTouch && (
        <div className="mb-3">
          <p
            className="font-bold uppercase mb-1"
            style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--hall-muted-3)" }}
          >
            Last touch
          </p>
          <p className="text-[11px] leading-snug" style={{ color: "var(--hall-muted-2)" }}>
            <span className="font-semibold" style={{ color: "var(--hall-ink-3)" }}>{m.lastTouch.kind}</span>
            <span> · {m.lastTouch.at.slice(0, 10)} · </span>
            <span className="line-clamp-1">{m.lastTouch.title}</span>
          </p>
        </div>
      )}

      {m.talkingPoints && m.talkingPoints.length > 0 && (
        <div>
          <p
            className="font-bold uppercase mb-1.5"
            style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--hall-muted-3)" }}
          >
            Talking points
          </p>
          <ul className="flex flex-col gap-1.5">
            {m.talkingPoints.map((p, i) => (
              <li
                key={i}
                className="text-[11.5px] leading-[1.5] pl-3.5 relative"
                style={{ color: "var(--hall-ink-3)" }}
              >
                <span
                  className="absolute left-0"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
                >
                  →
                </span>
                {p}
              </li>
            ))}
          </ul>
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

