/**
 * prep-brief/index.ts
 *
 * Public entrypoint. One function; no side-effects (no DB writes, no Notion
 * writes). Caller decides what to do with the Brief.
 */

import { extractFactSheet, type MeetingOverride } from "./fact-extraction";
import { synthesizeProse } from "./synthesis";
import { validateProse } from "./validate";
import type { Brief } from "./types";

export type { Brief, FactSheet, BriefProse } from "./types";
export type { MeetingOverride } from "./fact-extraction";

export async function generatePrepBrief(opts: {
  eventId: string;
  tz?:     string;
  meetingOverride?: MeetingOverride;
  /** If true, skip the LLM and return only the fact sheet (cheap smoke test). */
  factsOnly?: boolean;
}): Promise<Brief> {
  const fact = await extractFactSheet(opts.eventId, { tz: opts.tz, meetingOverride: opts.meetingOverride });

  if (opts.factsOnly) {
    return {
      fact_sheet: fact,
      prose: { prep_actions: "", key_context: "", opener: "" },
      validation: { passed: true, issues: [] },
    };
  }

  const prose = await synthesizeProse(fact);
  const { passed, issues } = validateProse(prose, fact);

  return {
    fact_sheet: fact,
    prose,
    validation: {
      passed,
      issues: issues.map(i => `[${i.severity}:${i.kind}] (${i.field}) "${i.match}" — ${i.note}`),
    },
  };
}
