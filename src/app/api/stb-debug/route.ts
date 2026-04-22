/**
 * GET /api/stb-debug
 *
 * Diagnostic endpoint — lists the current working-hour slots, the candidates
 * the matcher would see, and the score each candidate would receive per slot.
 * Read-only; does not create or expire anything. Admin-guarded.
 *
 * Purpose: debug scheduling decisions (e.g. why Friday was chosen over Monday).
 */

import { NextResponse } from "next/server";
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
  loopCoveredEntityIds,
} from "@/lib/time-block-candidates";
import {
  collectNonSelfEmails,
  loadAttendeeClasses,
} from "@/lib/meeting-classifier";
import { getHallPreferences } from "@/lib/hall-preferences";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await adminGuardApi();
  if (guard) return guard;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });

  const prefs = await getHallPreferences(email);
  const now = new Date();

  const [busy, upcoming] = await Promise.all([
    listBusyBlocks(7, prefs.timezone),
    listUpcomingMeetings(7),
  ]);
  const slots = findOpenSlots(now, 7, busy, upcoming, prefs);

  const covered = await loopCoveredEntityIds();
  const [loopCands, oppCands] = await Promise.all([
    candidatesFromLoops(20),
    candidatesFromOpportunities(covered, 15),
  ]);
  const lookup = await loadAttendeeClasses(collectNonSelfEmails(upcoming));
  const prepCands = await candidatesFromMeetings(upcoming, now, lookup);

  const allCands = [...loopCands, ...oppCands, ...prepCands];

  // Compute per-slot scores the matcher would assign to each candidate.
  // Keep it minimal; do not invoke the real matcher (we want raw visibility).
  const TARGETS: Record<string, { min: number; max: number }> = {
    deep_work: { min: 90, max: 180 },
    decision:  { min: 40, max:  90 },
    prep:      { min: 40, max:  90 },
    follow_up: { min: 20, max:  45 },
    admin:     { min: 20, max:  45 },
  };

  const slotBrief = slots.map(s => ({
    start: s.start.toISOString(),
    end:   s.end.toISOString(),
    durationMin: s.durationMin,
    size:  s.size,
    hoursOutFromNow: Math.round((s.start.getTime() - now.getTime()) / 3600_000 * 10) / 10,
  }));

  const analysed = allCands.map(c => {
    const target = TARGETS[c.task_type];
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
  });
}
