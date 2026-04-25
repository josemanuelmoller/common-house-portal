import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
import { getContactsByEmails } from "@/lib/contacts";

type CalRow = {
  event_id: string;
  event_title: string;
  event_start: string;
  attendee_emails: string[] | null;
  html_link: string | null;
};

type RichMeeting = {
  eventId: string;
  title: string;
  startMs: number;
  startLocal: string;
  attendees: { email: string; name: string | null; classes: string[] }[];
  lastTouch: { kind: string; at: string; title: string } | null;
  talkingPoints: string[] | null;
  htmlLink: string | null;
};

type CompactMeeting = {
  eventId: string;
  title: string;
  startMs: number;
  timeLabel: string;
  attendeeCount: number;
  attendeeNames: string[];
  htmlLink: string | null;
};

function formatAway(startMs: number): string {
  const diff = startMs - Date.now();
  const mins = Math.round(diff / 60_000);
  if (mins < 0) return "now";
  if (mins < 60) return `in ${mins}m`;
  if (mins < 1440) return `in ${Math.round(mins / 60)}h`;
  return `in ${Math.round(mins / 1440)}d`;
}

function cleanTitle(raw: string, attendees: { name: string | null }[]): string {
  if (/^[\w.\s]+<>[\w.\s]+$/.test(raw)) {
    const [a, b] = raw.split("<>").map(s => s.trim());
    const byName = attendees.find(at => at.name && a && at.name.toLowerCase().includes(a.toLowerCase()));
    return `${byName?.name ?? a} · ${b}`;
  }
  return raw;
}

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
      : "No prior touchpoint recorded.";
    const prompt =
      `Meeting: ${title}\n\nAttendees (non-self):\n${attList}\n\n${lastLine}\n\n` +
      `Give 3 concise talking points Jose (the host) should raise, tailored to the attendee relationship classes. Each 8-14 words. Output only the 3 points, one per line, no numbering, no preamble.`;
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { type: string; text: string }).text ?? "";
    const points = text.split("\n").map(l => l.replace(/^[-*\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 3);
    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

export async function HallTodayAgenda() {
  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();

  const now = new Date();
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  // First: try today
  const { data: todayData } = await sb
    .from("hall_calendar_events")
    .select("event_id, event_title, event_start, attendee_emails, html_link")
    .gte("event_start", now.toISOString())
    .lte("event_start", todayEnd.toISOString())
    .eq("is_cancelled", false)
    .order("event_start", { ascending: true })
    .limit(20);

  const todayRows = ((todayData ?? []) as CalRow[]).filter(r =>
    (r.attendee_emails ?? []).some(e => e && !selfSet.has(e.toLowerCase()))
  );

  // If nothing today, fetch next upcoming meeting (up to 14 days ahead)
  let rows = todayRows;
  let isFallback = false;
  if (todayRows.length === 0) {
    const futureEnd = new Date(now);
    futureEnd.setDate(futureEnd.getDate() + 14);
    const { data: futureData } = await sb
      .from("hall_calendar_events")
      .select("event_id, event_title, event_start, attendee_emails, html_link")
      .gt("event_start", todayEnd.toISOString())
      .lte("event_start", futureEnd.toISOString())
      .eq("is_cancelled", false)
      .order("event_start", { ascending: true })
      .limit(20);
    rows = ((futureData ?? []) as CalRow[]).filter(r =>
      (r.attendee_emails ?? []).some(e => e && !selfSet.has(e.toLowerCase()))
    );
    isFallback = rows.length > 0;
  }

  if (rows.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
        No upcoming meetings in the next 14 days.
      </p>
    );
  }

  // ── Rich prep for the NEXT meeting only ──────────────────────────────────
  const nextRow = rows[0];
  const restRows = rows.slice(1);

  const nextAttendeeEmails = (nextRow.attendee_emails ?? []).filter(e => e && !selfSet.has(e.toLowerCase()));
  const contactMap = await getContactsByEmails(nextAttendeeEmails);
  const nextAttendees = nextAttendeeEmails.map(e => {
    const c = contactMap.get(e.toLowerCase());
    return { email: e, name: c?.display_name ?? null, classes: c?.relationship_classes ?? [] };
  });

  const [txRes, mailRes] = await Promise.all([
    sb.from("hall_transcript_observations")
      .select("title, meeting_at")
      .overlaps("participant_emails", nextAttendeeEmails)
      .order("meeting_at", { ascending: false })
      .limit(1),
    sb.from("hall_email_observations")
      .select("subject, last_message_at")
      .overlaps("attendee_emails", nextAttendeeEmails)
      .order("last_message_at", { ascending: false })
      .limit(1),
  ]);

  const candidates: { kind: string; at: string; title: string }[] = [];
  const tx = (txRes.data ?? [])[0] as { title: string; meeting_at: string } | undefined;
  const ml = (mailRes.data ?? [])[0] as { subject: string; last_message_at: string } | undefined;
  if (tx) candidates.push({ kind: "Transcript", at: tx.meeting_at, title: tx.title });
  if (ml) candidates.push({ kind: "Email", at: ml.last_message_at, title: ml.subject });
  candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const lastTouch = candidates[0] ?? null;

  const nextStartMs = new Date(nextRow.event_start).getTime();
  const minsAway = Math.round((nextStartMs - Date.now()) / 60_000);
  const talkingPoints = minsAway < 720 ? await generateTalkingPoints(
    cleanTitle(nextRow.event_title, nextAttendees), nextAttendees, lastTouch
  ) : null;

  const next: RichMeeting = {
    eventId:    nextRow.event_id,
    title:      cleanTitle(nextRow.event_title, nextAttendees),
    startMs:    nextStartMs,
    startLocal: new Date(nextRow.event_start).toLocaleString("en-GB", {
      weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
    }),
    attendees:  nextAttendees,
    lastTouch,
    talkingPoints,
    htmlLink:   nextRow.html_link ?? null,
  };

  // ── Compact data for the rest of today ───────────────────────────────────
  const rest: CompactMeeting[] = restRows.map(r => {
    const others = (r.attendee_emails ?? []).filter(e => e && !selfSet.has(e.toLowerCase()));
    const names = others.map(e => {
      const c = contactMap.get(e.toLowerCase());
      return c?.display_name ?? e.split("@")[0];
    });
    const startMs = new Date(r.event_start).getTime();
    return {
      eventId:       r.event_id,
      title:         r.event_title,
      startMs,
      timeLabel:     new Date(r.event_start).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      attendeeCount: others.length,
      attendeeNames: names.slice(0, 3),
      htmlLink:      r.html_link ?? null,
    };
  });

  const imminent = minsAway >= 0 && minsAway <= 15;

  return (
    <div>
      {/* ── Next meeting rich card ─────────────────────────────────────── */}
      {isFallback && (
        <p
          className="text-[8.5px] font-bold uppercase tracking-widest mb-2"
          style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
        >
          Next · {new Date(nextRow.event_start).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
        </p>
      )}
      <div
        className="rounded-xl p-4 mb-4"
        style={{ background: "var(--hall-paper-0)", border: "1px solid var(--hall-stroke-0)" }}
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h4
            className="font-bold leading-snug"
            style={{ fontSize: 15, color: "var(--hall-ink-0)", letterSpacing: "-0.01em" }}
          >
            {next.title}
          </h4>
          {next.htmlLink && (
            imminent ? (
              <a
                href={next.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="hall-btn-primary shrink-0"
                style={{ padding: "5px 11px", fontSize: 11 }}
              >
                Join →
              </a>
            ) : (
              <a
                href={next.htmlLink}
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
          {next.startLocal} · {formatAway(next.startMs)}
        </div>

        {minsAway >= 0 && minsAway < 90 && (
          <span
            className="inline-flex items-center gap-1.5 mb-3.5"
            style={{
              fontFamily: "var(--font-hall-mono)", fontSize: 10.5, fontWeight: 600,
              color: "var(--hall-ink-0)", background: "var(--hall-paper-0)",
              border: "1px solid var(--hall-ink-0)", padding: "3px 8px", borderRadius: 100,
            }}
          >
            <span className="hall-pulse" style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--hall-lime-ink)" }} />
            Starts in {minsAway} min
          </span>
        )}

        <div className="mb-3">
          <p className="font-bold uppercase mb-1.5" style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--hall-muted-3)" }}>
            Attendees
          </p>
          <div className="flex flex-wrap gap-1.5">
            {next.attendees.slice(0, 6).map(a => (
              <span
                key={a.email}
                className="text-[10.5px]"
                style={{ background: "var(--hall-fill-soft)", color: "var(--hall-ink-3)", padding: "2px 8px", borderRadius: 100 }}
              >
                {a.name ?? a.email.split("@")[0]}
                {a.classes[0] && <span className="ml-1 opacity-70">· {a.classes[0]}</span>}
              </span>
            ))}
            {next.attendees.length > 6 && (
              <span className="text-[10px] px-1 py-0.5" style={{ color: "var(--hall-muted-3)" }}>
                +{next.attendees.length - 6}
              </span>
            )}
          </div>
        </div>

        {next.lastTouch && (
          <div className="mb-3">
            <p className="font-bold uppercase mb-1" style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--hall-muted-3)" }}>
              Last touch
            </p>
            <p className="text-[11px] leading-snug" style={{ color: "var(--hall-muted-2)" }}>
              <span className="font-semibold" style={{ color: "var(--hall-ink-3)" }}>{next.lastTouch.kind}</span>
              <span> · {next.lastTouch.at.slice(0, 10)} · </span>
              <span className="line-clamp-1">{next.lastTouch.title}</span>
            </p>
          </div>
        )}

        {next.talkingPoints && next.talkingPoints.length > 0 && (
          <div>
            <p className="font-bold uppercase mb-1.5" style={{ fontSize: 9, letterSpacing: "0.18em", color: "var(--hall-muted-3)" }}>
              Talking points
            </p>
            <ul className="flex flex-col gap-1.5">
              {next.talkingPoints.map((p, i) => (
                <li
                  key={i}
                  className="text-[11.5px] leading-[1.5] pl-3.5 relative"
                  style={{ color: "var(--hall-ink-3)" }}
                >
                  <span className="absolute left-0" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>→</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Rest of today — compact timeline ──────────────────────────── */}
      {rest.length > 0 && (
        <div>
          <p
            className="text-[8.5px] font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
          >
            Later today · {rest.length}
          </p>
          <ul className="flex flex-col">
            {rest.map(m => (
              <li
                key={m.eventId}
                className="flex items-start gap-3 py-2"
                style={{ borderTop: "1px solid var(--hall-line-soft)" }}
              >
                <span
                  className="shrink-0 pt-0.5"
                  style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, fontWeight: 700, color: "var(--hall-muted-3)", minWidth: 36 }}
                >
                  {m.timeLabel}
                </span>
                <div className="flex-1 min-w-0">
                  {m.htmlLink ? (
                    <a
                      href={m.htmlLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11.5px] font-semibold leading-snug hover:opacity-70 transition-opacity line-clamp-1"
                      style={{ color: "var(--hall-ink-0)" }}
                    >
                      {m.title}
                    </a>
                  ) : (
                    <p className="text-[11.5px] font-semibold leading-snug line-clamp-1" style={{ color: "var(--hall-ink-0)" }}>
                      {m.title}
                    </p>
                  )}
                  {m.attendeeNames.length > 0 && (
                    <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--hall-muted-3)" }}>
                      {m.attendeeNames.join(", ")}
                      {m.attendeeCount > 3 && ` +${m.attendeeCount - 3}`}
                    </p>
                  )}
                </div>
                <span
                  className="shrink-0 text-[9px]"
                  style={{ color: "var(--hall-muted-3)", fontFamily: "var(--font-hall-mono)" }}
                >
                  {formatAway(m.startMs)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
