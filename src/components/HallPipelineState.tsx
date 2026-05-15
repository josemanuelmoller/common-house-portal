/**
 * HallPipelineState — server component that renders the unified
 * "Pipeline State" block: one row per commercial relationship needing
 * attention today (active clients + open prospects), plus a 24h
 * "resolved today" footer.
 *
 * Data: src/lib/pipeline-state.ts → getPipelineState()
 * Mutations: HallPipelineStateRow (client) → /api/pipeline-state/*
 */

import { getPipelineState, type PipelineRow, type Trend } from "@/lib/pipeline-state";
import { HallPipelineStateRow } from "./HallPipelineStateRow";
import { HallPipelineStateResolved } from "./HallPipelineStateResolved";

export async function HallPipelineState() {
  const { rows, resolvedToday, snoozedCount } = await getPipelineState();

  if (rows.length === 0 && resolvedToday.length === 0 && snoozedCount === 0) {
    return (
      <p
        className="text-[12px] py-3"
        style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-sans)" }}
      >
        Todo al día. Nada pide tu ojo en clientes ni prospectos.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {rows.length === 0 ? (
        <p
          className="text-[12px] py-3"
          style={{ color: "var(--hall-muted-2)", fontFamily: "var(--font-hall-sans)" }}
        >
          Sin filas que pidan atención hoy.
        </p>
      ) : (
        <ul className="flex flex-col">
          {rows.map(r => (
            <HallPipelineStateRow key={`${r.entityType}:${r.entityId}:${r.reason}`} row={serializeRow(r)} />
          ))}
        </ul>
      )}

      {(resolvedToday.length > 0 || snoozedCount > 0) && (
        <HallPipelineStateResolved
          resolved={resolvedToday.map(r => ({
            logId: r.logId,
            name: r.name,
            reason: r.reason,
            resolution: r.resolution,
            resolvedAt: r.resolvedAt,
          }))}
          snoozedCount={snoozedCount}
        />
      )}
    </div>
  );
}

export type SerializedPipelineRow = {
  entityType: "organization" | "opportunity";
  entityId: string;
  name: string;
  kind: "client" | "prospect";
  reason: "ball_with_jose" | "ball_with_them" | "drift" | "pre_meeting";
  reasonDetail: string;
  topics: string[];
  ballSummary: string | null;
  trend: Trend;
  nextMeetingAt: string | null;
  newSignalChip: boolean;
  oppMeta: { priority: string | null; status: string; valueLabel: string } | null;
  ctaPrimary: { label: string; action: string; payload?: Record<string, unknown> };
  ctaResolveLabel: string;
  url: string | null;
};

function serializeRow(r: PipelineRow): SerializedPipelineRow {
  return {
    entityType: r.entityType,
    entityId: r.entityId,
    name: r.name,
    kind: r.kind,
    reason: r.reason,
    reasonDetail: r.reasonDetail,
    topics: r.topics,
    ballSummary: r.ballSummary,
    trend: r.trend,
    nextMeetingAt: r.nextMeetingAt,
    newSignalChip: r.newSignalChip,
    oppMeta: r.oppMeta
      ? { priority: r.oppMeta.priority, status: r.oppMeta.status, valueLabel: r.oppMeta.valueLabel }
      : null,
    ctaPrimary: {
      label: r.ctaPrimary.label,
      action: r.ctaPrimary.action,
      payload: r.ctaPrimary.payload,
    },
    ctaResolveLabel: r.ctaResolveLabel,
    url: r.url,
  };
}
