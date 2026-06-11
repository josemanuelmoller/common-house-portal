/**
 * GET /api/stb-debug
 *
 * Diagnostic endpoint — lists the current working-hour slots, the candidates
 * the matcher would see, the score each candidate would receive per slot,
 * the resolved project context per candidate, and the retomas the Hall
 * agenda would show. Read-only; does not create or expire anything.
 *
 * Auth: Clerk admin, or `Authorization: Bearer <CRON_SECRET>` /
 * `x-agent-key: <CRON_SECRET>` for headless verification (same pattern as
 * prep-meeting-brief). Bearer callers may pass ?email= to use a specific
 * user's hall preferences; otherwise defaults apply.
 *
 * Purpose: debug scheduling decisions (e.g. why Friday was chosen over
 * Monday, why a meeting got prep vs retoma vs nothing).
 */

import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@clerk/nextjs/server";
import { adminGuardApi } from "@/lib/require-admin";
import {
  listBusyBlocks,
  listUpcomingMeetings,
  findOpenSlots,
} from "@/lib/calendar-slots";
import {
  candidatesFromLoops,
  candidatesFromOpportunities,
  candidatesFromMeetings,
  candidatesFromCommitments,
  fetchOpenCommitmentRows,
  quickBatchCandidate,
  loopCoveredEntityIds,
} from "@/lib/time-block-candidates";
import {
  collectNonSelfEmails,
  loadAttendeeClasses,
} from "@/lib/meeting-classifier";
import { getHallPreferences } from "@/lib/hall-preferences";
import { resolveProjectContexts } from "@/lib/project-context";
import { buildRetomas } from "@/lib/meeting-retomas";

export const dynamic = "force-dynamic";

function bearerAuthed(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get("authorization") ?? "";
  const agent = req.headers.get("x-agent-key") ?? "";
  return auth === `Bearer ${expected}` || agent === expected;
}

export async function GET(req: NextRequest) {
  let email: string | undefined;
  if (bearerAuthed(req)) {
    email = new URL(req.url).searchParams.get("email") ?? "stb-debug";
  } else {
    const guard = await adminGuardApi();
    if (guard) return guard;
    const user = await currentUser();
    email = user?.primaryEmailAddress?.emailAddress;
    if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });
  }

  const prefs = await getHallPreferences(email);
  const now = new Date();

  const [busy, upcoming] = await Promise.all([
    listBusyBlocks(7, prefs.timezone),
    listUpcomingMeetings(7),
  ]);
  const slots = findOpenSlots(now, 7, busy, upcoming, prefs);

  const covered = await loopCoveredEntityIds();
  const [loopCands, oppCands, openCommitments] = await Promise.all([
    candidatesFromLoops(20),
    candidatesFromOpportunities(covered, 15),
    fetchOpenCommitmentRows(50),
  ]);
  const lookup = await loadAttendeeClasses(collectNonSelfEmails(upcoming));
  const commitmentCands = candidatesFromCommitments(openCommitments, upcoming, now, prefs.timezone);
  const batchCand = quickBatchCandidate(openCommitments);
  const prepCands = candidatesFromMeetings(upcoming, now, lookup, {
    timezone: prefs.timezone,
    openCommitments,
  });

  const allCands = [
    ...commitmentCands,
    ...prepCands,
    ...loopCands,
    ...oppCands,
    ...(batchCand ? [batchCand] : []),
  ];

  // ?inferTest=<text> — dry-run the project-context inference on arbitrary
  // text ("why didn't this block get a chip?") without touching real blocks.
  const inferTest = new URL(req.url).searchParams.get("inferTest");
  const inferTestResult = inferTest
    ? (await resolveProjectContexts([{
        title: inferTest, entity_type: "commitment", entity_id: "infer_test",
        entity_label: inferTest, duration_min: 0, task_type: "admin",
        urgency_score: 0, confidence_score: 0, why_now: "", expected_outcome: "",
        fingerprint: "infer_test", project_ref: { infer_text: inferTest },
      }])).get("infer_test") ?? null
    : null;

  // The new decision-model surfaces: project context chips + retomas.
  const projectContexts = await resolveProjectContexts(allCands);
  const retomas = await buildRetomas(upcoming.map(m => ({
    eventId:        m.id,
    title:          m.title,
    startMs:        m.start.getTime(),
    attendeeEmails: m.attendees.filter(a => !a.self).map(a => a.email),
  })));

  // Compute per-slot scores the matcher would assign to each candidate.
  // Keep it minimal; do not invoke the real matcher (we want raw visibility).
  const TARGETS: Record<string, { min: number; max: number }> = {
    deep_work:  { min: 90, max: 180 },
    decision:   { min: 40, max:  90 },
    prep:       { min: 40, max:  90 },
    follow_up:  { min: 20, max:  45 },
    admin:      { min: 20, max:  45 },
    commitment: { min: 40, max: 120 },
  };
  const FALLBACK_TARGET = { min: 30, max: 90 };

  const slotBrief = slots.map(s => ({
    start: s.start.toISOString(),
    end:   s.end.toISOString(),
    durationMin: s.durationMin,
    size:  s.size,
    hoursOutFromNow: Math.round((s.start.getTime() - now.getTime()) / 3600_000 * 10) / 10,
  }));

  const analysed = allCands.map(c => {
    const target = TARGETS[c.task_type] ?? FALLBACK_TARGET;
    const mid = (target.min + target.max) / 2;
    const perSlot = slots.map((s, idx) => {
      let score = c.urgency_score;
      const hoursOut = Math.max(0, (s.start.getTime() - now.getTime()) / 3600_000);
      const earlyPenalty = hoursOut * 0.25;
      score -= earlyPenalty;
      const urgentKick = c.urgency_score >= 70 ? Math.min(15, hoursOut * 0.15) : 0;
      score -= urgentKick;
      const fitPenalty = Math.abs(s.durationMin - mid) / 10;
      score -= fitPenalty;
      const fitMin = target.min;
      const fitMax = target.max + 60;
      const fits = s.durationMin >= fitMin && s.durationMin <= fitMax;
      return {
        slot_idx: idx,
        fits,
        score: Math.round(score * 10) / 10,
        hoursOut: Math.round(hoursOut * 10) / 10,
        earlyPenalty: Math.round(earlyPenalty * 10) / 10,
        fitPenalty: Math.round(fitPenalty * 10) / 10,
      };
    });

    const fittingSorted = perSlot.filter(x => x.fits).sort((a, b) => b.score - a.score);
    return {
      title: c.title,
      task_type: c.task_type,
      urgency_score: c.urgency_score,
      fingerprint: c.fingerprint,
      entity_label: c.entity_label,
      project_context: projectContexts.get(c.fingerprint) ?? null,
      hard_time_constraint: c.hard_time_constraint
        ? { kind: c.hard_time_constraint.kind, reference: c.hard_time_constraint.reference.toISOString() }
        : null,
      best_fitting_slots: fittingSorted.slice(0, 5).map(f => ({
        slot_idx: f.slot_idx,
        score: f.score,
        hoursOut: f.hoursOut,
        slot_start: slotBrief[f.slot_idx].start,
        slot_duration: slotBrief[f.slot_idx].durationMin,
      })),
      fitting_count: fittingSorted.length,
    };
  });

  return NextResponse.json({
    timezone: prefs.timezone,
    now_iso:  now.toISOString(),
    slot_count: slots.length,
    slots: slotBrief,
    candidate_count: allCands.length,
    candidates: analysed,
    ...(inferTest ? { infer_test: { text: inferTest, result: inferTestResult } } : {}),
    meeting_decision_model: {
      upcoming_meetings: upcoming.map(m => {
        const prep = prepCands.find(p => p.entity_id === m.id);
        const retoma = retomas.get(m.id);
        return {
          title: m.title,
          start: m.start.toISOString(),
          decision: prep ? "prep_block" : retoma ? "retoma" : "nothing",
          retoma: retoma ?? null,
        };
      }),
    },
  });
}
