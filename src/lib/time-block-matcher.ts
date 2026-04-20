/**
 * time-block-matcher.ts
 * Layer C of Suggested Time Blocks — greedy slot/candidate matcher.
 *
 * Assigns each top candidate to the best-fit slot respecting:
 *   - Task-type → slot-size constraints
 *   - Hard time constraints (prep must be before meeting; follow-up after)
 *   - Slot proximity (prep close to meeting; follow-up same-day where possible)
 *   - Founder-owned bonus for deep_work slots
 * Uses no magic; greedy, explainable, and deterministic given the same input.
 */

import type { Candidate, TaskType } from "./time-block-candidates";
import type { Slot } from "./calendar-slots";

export type Match = {
  candidate: Candidate;
  slot: Slot;
  score: number;                      // combined score used for ranking
};

export type MatchOptions = {
  timezone:                     string;
  prefer_morning_for_deep_work: boolean;
};

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  timezone:                     process.env.HALL_TIMEZONE || "America/Costa_Rica",
  prefer_morning_for_deep_work: true,
};

const TASK_TYPE_SLOT_MIN_MIN: Record<TaskType, number> = {
  deep_work: 90,
  decision:  40,
  prep:      40,
  follow_up: 20,
  admin:     20,
};

const TASK_TYPE_SLOT_MAX_MIN: Record<TaskType, number> = {
  deep_work: 180,
  decision:   90,
  prep:       90,
  follow_up:  45,
  admin:      45,
};

function slotFits(c: Candidate, s: Slot): boolean {
  const min = TASK_TYPE_SLOT_MIN_MIN[c.task_type];
  const max = TASK_TYPE_SLOT_MAX_MIN[c.task_type];
  if (s.durationMin < min) return false;
  if (s.durationMin > max + 60) return false;               // oversize is fine but we cap runaway
  if (c.hard_time_constraint) {
    const { kind, reference, withinMs } = c.hard_time_constraint;
    if (kind === "before") {
      if (s.end.getTime() > reference.getTime()) return false;
      if (reference.getTime() - s.end.getTime() > withinMs) return false;
    } else {
      if (s.start.getTime() < reference.getTime()) return false;
      if (s.start.getTime() - reference.getTime() > withinMs) return false;
    }
  }
  return true;
}

function slotScore(c: Candidate, s: Slot, now: Date, opts: MatchOptions): number {
  let score = c.urgency_score;

  // Universal earliness preference. Applied to ALL candidates so the earliest
  // valid slot in the week wins by default. A full day later costs ~6 points;
  // across a 5-day week the penalty is ~30 points, dominating the task-specific
  // bonuses below (morning +6, prep +8, follow-up +10). Only hard_time_constraint
  // (a prep binding to its meeting) pulls selection to a later slot.
  const hoursOut = Math.max(0, (s.start.getTime() - now.getTime()) / 3600_000);
  score -= hoursOut * 0.25;
  // Extra kick for urgent work so it lands first among early slots
  if (c.urgency_score >= 70) score -= Math.min(15, hoursOut * 0.15);

  // Task-slot fit
  const targetMid = (TASK_TYPE_SLOT_MIN_MIN[c.task_type] + TASK_TYPE_SLOT_MAX_MIN[c.task_type]) / 2;
  const fitPenalty = Math.abs(s.durationMin - targetMid) / 10;
  score -= fitPenalty;

  // Prep bonus when slot is adjacent to the reference meeting (within 6h)
  if (c.task_type === "prep" && s.nextMeeting && c.hard_time_constraint?.kind === "before") {
    const gap = c.hard_time_constraint.reference.getTime() - s.end.getTime();
    if (gap <= 6 * 3600_000) score += 8;
  }

  // Follow-up bonus when immediately after the meeting
  if (c.task_type === "follow_up" && s.prevMeeting && c.hard_time_constraint?.kind === "after") {
    const gap = s.start.getTime() - c.hard_time_constraint.reference.getTime();
    if (gap <= 2 * 3600_000) score += 10;
  }

  // Deep work bonus for morning slots (opt-in via preferences)
  if (c.task_type === "deep_work" && opts.prefer_morning_for_deep_work) {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: opts.timezone,
        hour: "2-digit", hour12: false,
      }).format(s.start)
    );
    if (hour < 12) score += 6;
  }

  return score;
}

export function matchCandidatesToSlots(
  candidates: Candidate[],
  slots: Slot[],
  now: Date,
  limit = 5,
  opts: MatchOptions = DEFAULT_MATCH_OPTIONS,
): Match[] {
  // Sort candidates by urgency DESC, then confidence DESC. Highest-urgency work
  // gets first pick of the earliest slots.
  const pool = [...candidates].sort((a, b) => {
    if (b.urgency_score !== a.urgency_score) return b.urgency_score - a.urgency_score;
    return b.confidence_score - a.confidence_score;
  });

  // Sort slots EARLIEST FIRST. Iterating in ascending time order means any
  // later slot needs a strictly higher score to beat an earlier one — the
  // earliness bias in slotScore guarantees earlier wins on ties.
  const ordered = [...slots]
    .map((s, originalIdx) => ({ s, originalIdx }))
    .sort((a, b) => a.s.start.getTime() - b.s.start.getTime());

  const used = new Set<number>();
  const matches: Match[] = [];
  const seenFingerprint = new Set<string>();

  for (const c of pool) {
    if (matches.length >= limit) break;
    if (seenFingerprint.has(c.fingerprint)) continue;

    let best: { orderedIdx: number; score: number; slot: Slot } | null = null;
    for (let i = 0; i < ordered.length; i++) {
      if (used.has(i)) continue;
      const s = ordered[i].s;
      if (!slotFits(c, s)) continue;
      const sc = slotScore(c, s, now, opts);
      // Strict >: since slots are ordered earliest-first, a later slot only
      // wins if its score is higher, never on a tie.
      if (!best || sc > best.score) best = { orderedIdx: i, score: sc, slot: s };
    }
    if (!best) continue;
    used.add(best.orderedIdx);
    seenFingerprint.add(c.fingerprint);
    matches.push({ candidate: c, slot: best.slot, score: best.score });
  }

  // Final display order: chronological ascending so Jose sees the earliest-scheduled
  // block first in the UI. Matches the selection preference end-to-end.
  matches.sort((a, b) => a.slot.start.getTime() - b.slot.start.getTime());
  return matches;
}
