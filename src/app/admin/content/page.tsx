import { Sidebar } from "@/components/Sidebar";
import { getContentPipeline } from "@/lib/notion";
import { requireAdmin } from "@/lib/require-admin";
import ContentList from "@/components/ContentCard";

export default async function ContentPipelinePage() {
  await requireAdmin();

  const items = await getContentPipeline();

  const draftCount     = items.filter(i => i.status === "Draft" || i.status === "Briefed").length;
  const reviewCount    = items.filter(i => i.status === "Review").length;
  const approvedCount  = items.filter(i => i.status === "Approved" || i.status === "Ready to Publish").length;
  const publishedCount = items.filter(i => i.status === "Published").length;
  const withDraft      = items.filter(i => i.draftText).length;

  const eyebrowDate = new Date()
    .toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--hall-paper-0)" }}>
      <Sidebar adminNav />

      <main
        className="flex-1 md:ml-[228px]"
        style={{ fontFamily: "var(--font-hall-sans)", background: "var(--hall-paper-0)" }}
      >

        {/* K-v2 collapsed header */}
        <header
          className="flex items-center justify-between gap-6 px-9 py-3.5"
          style={{ borderBottom: "1px solid var(--hall-ink-0)" }}
        >
          <div className="flex items-baseline gap-4 min-w-0">
            <span
              className="text-[10px] tracking-[0.08em] whitespace-nowrap"
              style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-2)" }}
            >
              CONTENT · <b style={{ color: "var(--hall-ink-0)" }}>{eyebrowDate}</b>
            </span>
            <h1
              className="text-[16px] font-medium tracking-[-0.01em] truncate"
              style={{ color: "var(--hall-ink-0)" }}
            >
              Content <em className="hall-flourish">Pipeline</em>
            </h1>
          </div>
          <div
            className="flex items-center gap-4"
            style={{ fontFamily: "var(--font-hall-mono)", fontSize: 10, color: "var(--hall-muted-2)", letterSpacing: "0.06em" }}
          >
            <span>{items.length} TOTAL</span>
            <span>{withDraft} WITH DRAFT</span>
            <span style={{color: reviewCount > 0 ? "var(--hall-warn)" : "var(--hall-muted-3)"}}>{reviewCount} REVIEW</span>
          </div>
        </header>

        <div className="px-9 py-6 max-w-5xl space-y-7">

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Draft / Briefed", value: draftCount,     sub: "En progreso",    color: "var(--hall-muted-2)" },
              { label: "At review",       value: reviewCount,    sub: "Needs action",   color: reviewCount > 0 ? "var(--hall-warn)" : "var(--hall-muted-3)" },
              { label: "Approved",        value: approvedCount,  sub: "Ready to send",  color: approvedCount > 0 ? "var(--hall-info)" : "var(--hall-muted-3)" },
              { label: "Published",       value: publishedCount, sub: "Delivered",      color: publishedCount > 0 ? "var(--hall-ok)" : "var(--hall-muted-3)" },
            ].map(s => (
              <div
                key={s.label}
                className="px-5 py-4"
                style={{ border: "1px solid var(--hall-line-soft)", borderRadius: 3 }}
              >
                <p
                  className="text-[9px] font-bold tracking-widest uppercase mb-2"
                  style={{ fontFamily: "var(--font-hall-mono)", color: "var(--hall-muted-3)" }}
                >
                  {s.label}
                </p>
                <p className="text-3xl font-bold tracking-tight tabular-nums" style={{color: s.color}}>{s.value}</p>
                <p className="text-[11px] font-medium mt-1.5" style={{color: "var(--hall-muted-2)"}}>{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Interactive content list with draft previews */}
          <ContentList items={items} />

        </div>
      </main>
    </div>
  );
}
