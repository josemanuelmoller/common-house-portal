import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getOpsSnapshot } from "@/lib/fireflies-backup";
import { FirefliesBackupActions } from "@/components/FirefliesBackupActions";

export const dynamic = "force-dynamic";

function ago(iso: string | null): string {
  if (!iso) return "nunca";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "warn" | "danger" | "ok" | "muted" }) {
  const color = tone === "danger" ? "#b91c1c" : tone === "warn" ? "#b45309" : tone === "ok" ? "#15803d" : "var(--hall-ink-0)";
  return (
    <div className="text-center">
      <div className="text-[19px] font-semibold leading-none" style={{ color }}>{value}</div>
      <div className="text-[9px] uppercase tracking-[0.08em] mt-1" style={{ color: "var(--hall-muted-2)" }}>{label}</div>
    </div>
  );
}

export default async function FirefliesBackupPage() {
  await requireAdmin();
  const snap = await getOpsSnapshot();
  const cap = snap.capture;
  // Every eligible id, not the 25-row table sample — the sample is for display.
  const eligibleIds = snap.prune.eligible_ids;

  return (
    <div className="flex min-h-screen">
      <Sidebar adminNav />
      <main className="flex-1 md:ml-[228px]" style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}>
        <header className="flex items-center justify-between gap-6 px-9 py-3.5" style={{ borderBottom: "1px solid var(--hall-ink-0)" }}>
          <div className="flex items-baseline gap-4 min-w-0">
            <span className="text-[10px] tracking-[0.08em] uppercase" style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}>
              FIREFLIES · <b style={{ color: "var(--hall-ink-0)" }}>BACKUP AGENT</b>
            </span>
            <h1 className="text-[16px] font-medium" style={{ color: "var(--hall-ink-0)" }}>Respaldo &amp; poda</h1>
          </div>
          <div className="flex items-center gap-5">
            <Stat label="Respaldadas" value={snap.backup.backed_up_total} tone="ok" />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Sin grabar" value={cap?.capture_gaps.length ?? "—"} tone={(cap?.capture_gaps.length ?? 0) > 0 ? "warn" : "muted"} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Para borrar" value={snap.prune.eligible_to_delete} tone={snap.prune.eligible_to_delete > 0 ? "danger" : "muted"} />
          </div>
        </header>

        <div className="px-9 py-7 max-w-5xl space-y-7">
          {/* Actions */}
          <section className="space-y-3">
            <FirefliesBackupActions eligibleIds={eligibleIds} />
            <p className="text-[10px]" style={{ color: "var(--hall-muted-2)" }}>
              Snapshot de captura: {ago(snap.snapshot_age)}. Respaldo diario 07:15 UTC · captura 07:30 UTC.
            </p>
          </section>

          {/* 3-layer health */}
          <section>
            <h2 className="text-[11px] uppercase tracking-[0.08em] mb-3" style={{ color: "var(--hall-muted-2)" }}>Salud de las 3 capas (últimos {cap?.window_days ?? 45}d)</h2>
            <div className="grid grid-cols-3 gap-3">
              <Card title="Calendario → Fireflies" a={cap?.matched ?? 0} b={cap?.calendar_count ?? 0} label="reus agendadas capturadas" />
              <Card title="Fireflies" a={cap?.fireflies_count ?? 0} b={cap?.fireflies_count ?? 0} label="transcripciones en ventana" />
              <Card title="Fireflies → Drive" a={snap.backup.backed_up_total} b={snap.backup.backed_up_total} label="respaldadas en total" />
            </div>
          </section>

          {/* Capture gaps */}
          <Section title="Ocurrieron pero NO se grabaron" count={cap?.capture_gaps.length ?? 0} tone="warn"
            empty="Sin huecos de captura. Todo lo agendado tiene transcripción.">
            {(cap?.capture_gaps ?? []).slice(0, 30).map((g) => (
              <Row key={g.event_id} title={g.title ?? "(sin título)"} sub={`${new Date(g.event_start).toLocaleString()} · ${g.attendees.slice(0, 3).join(", ")}`} />
            ))}
          </Section>

          {/* Spontaneous */}
          <Section title="Espontáneas (se grabaron sin estar en el calendario)" count={cap?.spontaneous.length ?? 0} tone="ok"
            empty="Ninguna espontánea en la ventana.">
            {(cap?.spontaneous ?? []).slice(0, 30).map((s) => (
              <Row key={s.id} title={s.title ?? s.id} sub={`${s.date ?? ""} · ${s.minutes}m`} />
            ))}
          </Section>

          {/* Prune eligibility */}
          <Section title={`Elegibles para borrar (>${snap.prune.retention_days}d, ya en Drive)`} count={snap.prune.eligible_to_delete} tone="danger"
            empty="Nada elegible aún. Se libera storage cuando las reus pasen la retención.">
            <p className="text-[11px] mb-2" style={{ color: "var(--hall-muted-2)" }}>
              Liberarían ~{snap.prune.eligible_minutes} min · corte {snap.prune.cutoff_date} · ya borradas: {snap.prune.already_deleted}
              {snap.prune.eligible_to_delete > snap.prune.eligible_sample.length &&
                ` · abajo se listan las ${snap.prune.eligible_sample.length} más antiguas`}
            </p>
            {snap.prune.eligible_sample.map((e) => (
              <Row key={e.id} title={e.title ?? e.id} sub={`${e.date ?? ""} · ${e.minutes}m`} />
            ))}
          </Section>

          {/* Agent questions / flags */}
          {snap.flags.length > 0 && (
            <Section title="Dudas del agente" count={snap.flags.length} tone="warn" empty="">
              {snap.flags.map((f) => (
                <Row key={f.id} title={f.question ?? f.title ?? f.kind} sub={`${f.kind} · ${ago(f.created_at)}`} />
              ))}
            </Section>
          )}
        </div>
      </main>
    </div>
  );
}

function Card({ title, a, b, label }: { title: string; a: number; b: number; label: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--hall-paper-1, #fff)", border: "1px solid var(--hall-line)" }}>
      <div className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--hall-muted-2)" }}>{title}</div>
      <div className="text-[22px] font-semibold mt-1" style={{ color: "var(--hall-ink-0)" }}>{a}<span className="text-[13px] font-normal" style={{ color: "var(--hall-muted-2)" }}> / {b}</span></div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--hall-muted-2)" }}>{label}</div>
    </div>
  );
}

function Section({ title, count, tone, empty, children }: { title: string; count: number; tone: "warn" | "danger" | "ok"; empty: string; children?: React.ReactNode }) {
  const dot = tone === "danger" ? "#b91c1c" : tone === "warn" ? "#b45309" : "#15803d";
  return (
    <section>
      <h2 className="text-[11px] uppercase tracking-[0.08em] mb-3 flex items-center gap-2" style={{ color: "var(--hall-muted-2)" }}>
        <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
        {title} <span style={{ color: "var(--hall-ink-0)" }}>· {count}</span>
      </h2>
      {count === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--hall-muted-2)" }}>{empty}</p>
      ) : (
        <div className="rounded-2xl divide-y" style={{ border: "1px solid var(--hall-line)", borderColor: "var(--hall-line)" }}>{children}</div>
      )}
    </section>
  );
}

function Row({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="px-4 py-2.5">
      <div className="text-[12px] font-medium" style={{ color: "var(--hall-ink-0)" }}>{title}</div>
      <div className="text-[10px] mt-0.5" style={{ color: "var(--hall-muted-2)" }}>{sub}</div>
    </div>
  );
}
