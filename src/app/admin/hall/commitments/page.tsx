import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { requireAdmin } from "@/lib/require-admin";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getSelfEmails } from "@/lib/hall-self";

export const dynamic = "force-dynamic";

const ACTION_VERBS = [
  "must", "needs to", "need to", "will", "should", "is tasked",
  "is responsible", "pending", "required", "owes", "to send", "to finalize",
  "to complete", "to follow up", "to coordinate",
];

type Commitment = {
  id:         string;
  title:      string;
  statement:  string;
  daysAgo:    number;
  owner:      "jose" | "others";
  projectId:  string | null;
  evidenceType: string;
  dateCaptured: string;
};

async function load(): Promise<Commitment[]> {
  const sb = getSupabaseServerClient();
  const selfSet = await getSelfEmails();
  const since = new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);

  const [evRes, dismRes] = await Promise.all([
    sb.from("evidence")
      .select("notion_id, title, evidence_statement, evidence_type, project_notion_id, date_captured")
      .in("evidence_type", ["Dependency", "Process Step", "Requirement"])
      .eq("validation_status", "Validated")
      .gte("date_captured", since)
      .order("date_captured", { ascending: false })
      .limit(300),
    sb.from("hall_commitment_dismissals").select("notion_id"),
  ]);

  const dismissed = new Set(((dismRes.data ?? []) as { notion_id: string }[]).map(r => r.notion_id));

  const rows = (evRes.data ?? []) as {
    notion_id: string; title: string; evidence_statement: string | null;
    evidence_type: string; project_notion_id: string | null; date_captured: string | null;
  }[];

  const out: Commitment[] = [];
  const now = Date.now();
  for (const r of rows) {
    if (dismissed.has(r.notion_id)) continue;  // G3 — hide server-dismissed
    const stmt = (r.evidence_statement ?? r.title).trim();
    if (!stmt) continue;
    const lower = stmt.toLowerCase();
    if (!ACTION_VERBS.some(v => lower.includes(v))) continue;

    let owner: "jose" | "others" = "others";
    if (lower.includes("jose manuel") || /\bjose\b/i.test(stmt)) owner = "jose";
    for (const se of selfSet) if (lower.includes(se)) owner = "jose";

    const daysAgo = r.date_captured ? Math.floor((now - new Date(r.date_captured).getTime()) / 86400_000) : 0;
    out.push({
      id:           r.notion_id,
      title:        r.title,
      statement:    stmt,
      daysAgo,
      owner,
      projectId:    r.project_notion_id,
      evidenceType: r.evidence_type,
      dateCaptured: r.date_captured ?? "",
    });
  }
  return out;
}

export default async function CommitmentsPage() {
  await requireAdmin();
  const all = await load();
  const jose   = all.filter(c => c.owner === "jose");
  const others = all.filter(c => c.owner === "others");
  const stale  = all.filter(c => c.daysAgo >= 14);

  return (
    <div className="flex min-h-screen">
      <Sidebar adminNav />
      <main
        className="flex-1 ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >
        {/* ── K-v2 one-line header ─────────────────────────────────────── */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap uppercase"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              HALL · <b style={{ color: "var(--hall-ink-0)" }}>ACCOUNTABILITY</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em]"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Commitment{" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                ledger
              </em>
            </h1>
          </div>
          <div className="flex items-center gap-5">
            <Stat label="You owe" value={jose.length} tone="danger" />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label="Owed to you" value={others.length} />
            <div className="w-px h-8" style={{ background: "var(--hall-line)" }} />
            <Stat label=">14d stale" value={stale.length} tone={stale.length > 0 ? "warn" : "muted"} />
          </div>
        </header>

        <div className="px-9 py-7 max-w-5xl space-y-7">
          <p className="text-[11px] leading-snug" style={{ color: "var(--hall-muted-2)" }}>
            <strong style={{ color: "var(--hall-ink-0)" }}>Ledger rules.</strong>{" "}
            A commitment is Dependency / Process Step / Requirement evidence with an action verb in the statement. Owner = Jose if the statement mentions his name or email; otherwise it lives under &quot;Owed to you&quot;. Action items parsed from validated evidence in CH Evidence [OS v2], last 90 days. Heuristic-based — click into any record to refine, dismiss, or close.
          </p>

          <Section title="You committed" flourish="to act" items={jose} kind="jose" empty="Nothing on your side — clean slate." />
          <Section title="Owed" flourish="to you" items={others} kind="others" empty="No outstanding pings on others." />
        </div>
      </main>
    </div>
  );
}

function Section({ title, flourish, items, kind, empty }: { title: string; flourish?: string; items: Commitment[]; kind: "jose" | "others"; empty: string }) {
  return (
    <section className="mb-7" style={{ fontFamily: "var(--font-hall-sans)" }}>
      <div
        className="flex items-baseline justify-between gap-3 pb-2 mb-3.5"
        style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
      >
        <h2
          className="text-[19px] font-bold leading-none"
          style={{ letterSpacing: "-0.02em", color: "var(--hall-ink-0)" }}
        >
          {title}
          {flourish && (
            <>
              {" "}
              <em
                style={{
                  fontFamily: "var(--font-hall-display)",
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: "var(--hall-ink-0)",
                }}
              >
                {flourish}
              </em>
            </>
          )}
        </h2>
        <span
          className="text-[10px] tracking-[0.06em] whitespace-nowrap"
          style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
        >
          {items.length} TOTAL
        </span>
      </div>
      {items.length === 0 ? (
        <div className="px-1 py-5 text-center">
          <p className="text-[11px]" style={{ color: "var(--hall-muted-3)" }}>{empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map(c => <Row key={c.id} c={c} kind={kind} />)}
        </ul>
      )}
    </section>
  );
}

function Row({ c, kind }: { c: Commitment; kind: "jose" | "others" }) {
  const staleColor =
    c.daysAgo >= 21 ? "var(--hall-danger)" :
    c.daysAgo >= 10 ? "var(--hall-warn)" :
    "var(--hall-muted-2)";
  const accent = kind === "jose" ? "var(--hall-danger)" : "var(--hall-muted-3)";
  return (
    <li style={{ borderTop: "1px solid var(--hall-line-soft)" }}>
      <Link
        href={`https://www.notion.so/${c.id.replace(/-/g, "")}`}
        target="_blank"
        className="flex items-start gap-3 py-3 transition-colors hover:bg-[var(--hall-fill-soft)]"
        style={{ borderLeft: `3px solid ${accent}`, paddingLeft: 12, paddingRight: 4 }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p
              className="text-[12.5px] font-semibold line-clamp-1"
              style={{ color: "var(--hall-ink-0)" }}
            >
              {c.title}
            </p>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
              style={{
                fontFamily: "var(--font-hall-mono)",
                fontWeight: 700,
                background: "var(--hall-fill-soft)",
                color: "var(--hall-muted-2)",
                letterSpacing: "0.08em",
              }}
            >
              {c.evidenceType}
            </span>
          </div>
          <p
            className="text-[11px] leading-relaxed line-clamp-3"
            style={{ color: "var(--hall-ink-3)" }}
          >
            {c.statement}
          </p>
        </div>
        <span
          className="text-[11px] shrink-0"
          style={{
            fontFamily: "var(--font-hall-mono)",
            fontWeight: 700,
            color: staleColor,
          }}
        >
          {c.daysAgo}d
        </span>
      </Link>
    </li>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "danger" | "warn" | "muted" }) {
  const color =
    tone === "danger" ? "var(--hall-danger)" :
    tone === "warn"   ? "var(--hall-warn)" :
    tone === "muted"  ? "var(--hall-muted-3)" :
    "var(--hall-ink-0)";
  return (
    <div className="text-right">
      <p
        className="text-[20px] font-bold leading-none"
        style={{ letterSpacing: "-0.02em", color }}
      >
        {value}
      </p>
      <p
        className="text-[9px] tracking-[0.08em] uppercase mt-1"
        style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
      >
        {label}
      </p>
    </div>
  );
}
