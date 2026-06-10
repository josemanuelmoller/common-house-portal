import Anthropic from "@anthropic-ai/sdk";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";
import { getContactsByEmails } from "@/lib/contacts";
import { getHallPreferences } from "@/lib/hall-preferences";
import { logServerError } from "@/lib/debug-log";

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

// Calendar-date key in the user's timezone (en-CA → "2026-06-10"). Server runs
// in UTC, so date comparisons and labels must never use the process timezone.
function dayKey(d: Date, tz: string): string {
  return d.toLocaleDateString("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
}

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

type OpenCommitmentLine = { direction: "mine" | "theirs"; text: string; daysOpen: number };

/** Open action_items involving these attendees — real material for the
 *  talking points instead of relationship-class guesswork. */
async function fetchAttendeeCommitments(attendeeEmails: string[]): Promise<OpenCommitmentLine[]> {
  if (attendeeEmails.length === 0) return [];
  try {
    const sb = getSupabaseServerClient();
    const { data: people } = await sb
      .from("people")
      .select("id")
      .in("email", attendeeEmails.map(e => e.toLowerCase()));
    const ids = (people ?? []).map(p => (p as { id: string }).id);
    if (ids.length === 0) return [];
    const { data } = await sb
      .from("action_items")
      .select("intent, next_action, subject, last_motion_at")
      .eq("status", "open")
      .in("counterparty_contact_id", ids)
      .order("last_motion_at", { ascending: false })
      .limit(5);
    const now = Date.now();
    return ((data ?? []) as Array<{ intent: string; next_action: string | null; subject: string; last_motion_at: string }>)
      .map(r => ({
        direction: (r.intent === "chase" ? "theirs" : "mine") as "mine" | "theirs",
        text: (r.next_action ?? r.subject).slice(0, 100),
        daysOpen: Math.max(0, Math.floor((now - new Date(r.last_motion_at).getTime()) / 86_400_000)),
      }));
  } catch {
    return [];
  }
}

async function generateTalkingPoints(
  eventId: string,
  meetingStartIso: string,
  title: string,
  attendees: { email: string; name: string | null; classes: string[] }[],
  lastTouch: { kind: string; at: string; title: string } | null,
): Promise<string[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const sb = getSupabaseServerClient();

  // Cache first — talking points are generated ONCE per meeting, not on
  // every page load (the previous version paid a Haiku call per render and
  // returned silent null on failure).
  try {
    const { data: cached } = await sb
      .from("hall_talking_points")
      .select("points")
      .eq("event_id", eventId)
      .maybeSingle();
    if (cached?.points && Array.isArray(cached.points) && cached.points.length > 0) {
      return cached.points as string[];
    }
  } catch { /* cache miss path below */ }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const attList = attendees.map(a => {
      const cls = a.classes.length > 0 ? ` [${a.classes.join(", ")}]` : "";
      return `- ${a.name ?? a.email}${cls}`;
    }).join("\n");
    const lastLine = lastTouch
      ? `Most recent prior touchpoint: ${lastTouch.kind} on ${lastTouch.at.slice(0, 10)} — "${lastTouch.title}"`
      : "No prior touchpoint recorded.";

    // Real material: open commitments either party owes. A talking point that
    // cites "you owe them the proposal from 12d ago" beats a generic opener.
    const commitments = await fetchAttendeeCommitments(attendees.map(a => a.email));
    const commitmentBlock = commitments.length > 0
      ? "\n\nOpen commitments with these attendees (cite the relevant ones):\n" +
        commitments.map(c => `- [${c.direction === "mine" ? "Jose owes them" : "they owe Jose"}, ${c.daysOpen}d open] ${c.text}`).join("\n")
      : "";

    const prompt =
      `Meeting: ${title}\n\nAttendees (non-self):\n${attList}\n\n${lastLine}${commitmentBlock}\n\n` +
      `Give 3 concise talking points Jose (the host) should raise. Prioritise open commitments above (close or address them); otherwise tailor to the attendee relationship classes. Each 8-14 words. Output only the 3 points, one per line, no numbering, no preamble.`;
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { type: string; text: string }).text ?? "";
    const points = text.split("\n").map(l => l.replace(/^[-*\d.)\s]+/, "").trim()).filter(Boolean).slice(0, 3);
    if (points.length === 0) return null;

    // Persist — best-effort; a cache write failure must not hide the points.
    try {
      await sb.from("hall_talking_points").upsert({
        event_id: eventId,
        points,
        meeting_start: meetingStartIso,
        generated_at: new Date().toISOString(),
      }, { onConflict: "event_id" });
    } catch { /* non-fatal */ }

    return points;
  } catch (e) {
    // Visible failure beats a card that silently loses its talking points.
    await logServerError("HallTodayAgenda:generateTalkingPoints", e);
    return null;
  }
}

export async function HallTodayAgenda({ userEmail }: { userEmail?: string } = {}) {
  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();
  const prefs = await getHallPreferences(userEmail ?? "");
  const tz = prefs.timezone;

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 7);

  const { data } = await sb
    .from("hall_calendar_events")
    .select("event_id, event_title, event_start, attendee_emails, html_link")
    .gte("event_start", now.toISOString())
    .lte("event_start", windowEnd.toISOString())
    .eq("is_cancelled", false)
    .order("event_start", { ascending: true })
    .limit(20);

  const allRows = ((data ?? []) as CalRow[])
    .filter(r => (r.attendee_emails ?? []).some(e => e && !selfSet.has(e.toLowerCase())))
    .slice(0, 7); // max 7 meetings

  const rows = allRows;

  // Show date label when the first meeting is not today (in the user's timezone)
  const todayStr = dayKey(now, tz);
  const isFallback = rows.length > 0 && dayKey(new Date(rows[0].event_start), tz) !== todayStr;

  if (rows.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>
        No meetings in the next 7 days.
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
  const tx = (txRes.data ?? [])[0] as { title: string | null; meeting_at: string | null } | undefined;
  const ml = (mailRes.data ?? [])[0] as { subject: string | null; last_message_at: string | null } | undefined;
  // Guard `at`: it feeds `.slice(0,10)` and `new Date()` in the render path
  // below, both of which throw / NaN on null. Only push rows with a real date.
  if (tx?.meeting_at) candidates.push({ kind: "Transcript", at: tx.meeting_at, title: tx.title ?? "Meeting" });
  if (ml?.last_message_at) candidates.push({ kind: "Email", at: ml.last_message_at, title: ml.subject ?? "Email" });
  candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const lastTouch = candidates[0] ?? null;

  const nextStartMs = new Date(nextRow.event_start).getTime();
  const minsAway = Math.round((nextStartMs - Date.now()) / 60_000);
  const talkingPoints = minsAway < 720 ? await generateTalkingPoints(
    nextRow.event_id, nextRow.event_start,
    cleanTitle(nextRow.event_title, nextAttendees), nextAttendees, lastTouch
  ) : null;

  const next: RichMeeting = {
    eventId:    nextRow.event_id,
    title:      cleanTitle(nextRow.event_title, nextAttendees),
    startMs:    nextStartMs,
    startLocal: new Date(nextRow.event_start).toLocaleString("en-GB", {
      timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short",
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
      timeLabel:     new Date(r.event_start).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" }),
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
          Next · {new Date(nextRow.event_start).toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" })}
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
              <span> · {dayKey(new Date(next.lastTouch.at), tz)} · </span>
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

      {/* ── Rest — compact timeline grouped by day ────────────────────── */}
      {rest.length > 0 && (() => {
        // Group by calendar date string
        const groups: { dateLabel: string; meetings: CompactMeeting[] }[] = [];
        for (const m of rest) {
          const d = new Date(m.startMs);
          const label = d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });
          const last = groups[groups.length - 1];
          if (last && last.dateLabel === label) last.meetings.push(m);
          else groups.push({ dateLabel: label, meetings: [m] });
        }
        return (
          <div className="mt-1">
            {groups.map(g => (
              <div key={g.dateLabel} className="mb-3">
                <p
                  className="text-[8px] font-bold uppercase tracking-widest py-1.5 mb-0"
                  style={{
                    color: "var(--hall-muted-3)",
                    fontFamily: "var(--font-hall-mono)",
                    borderBottom: "1px solid var(--hall-line-soft)",
                  }}
                >
                  {g.dateLabel}
                </p>
                <ul className="flex flex-col">
                  {g.meetings.map(m => (
                    <li
                      key={m.eventId}
                      className="flex items-start gap-3 py-2"
                      style={{ borderBottom: "1px solid var(--hall-line-soft)" }}
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
            ))}
          </div>
        );
      })()}
    </div>
  );
}
