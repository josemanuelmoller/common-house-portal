// Public marketing page — no auth required
// Ported from hall-vitrina.html

export const metadata = {
  title: "Common House — The Hall",
  description:
    "Strategy, intelligence and production capacity — built around the people and organisations making zero waste real.",
};

// ─── Inline SVG helpers ────────────────────────────────────────────────────────

function CoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 108 50" fill="none" className={className}>
      <path
        d="M42 4 A21 21 0 1 0 42 46"
        stroke="white"
        strokeWidth="10"
        strokeLinecap="butt"
      />
      <circle cx="84" cy="25" r="21" stroke="white" strokeWidth="10" />
    </svg>
  );
}

function ArrowRight({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="3" y1="8" x2="13" y2="8" />
      <polyline points="9 4 13 8 9 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="2" y="5" width="8" height="6" rx="1" />
      <path d="M4 5V3.5a2 2 0 0 1 4 0V5" />
    </svg>
  );
}

// ─── Section bar ───────────────────────────────────────────────────────────────

function SectionBar({
  label,
  num,
  dark,
}: {
  label: string;
  num: string;
  dark?: boolean;
}) {
  if (dark) {
    return (
      <div className="bg-[rgba(200,245,90,0.07)] border-b border-[rgba(200,245,90,0.12)] px-12 py-3 flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-white/40">
          {label}
        </span>
        <span className="text-[11px] font-extrabold text-white/20 tabular-nums tracking-[1px]">
          {num}
        </span>
      </div>
    );
  }
  return (
    <div className="bg-[#c8f55a] px-12 py-3 flex items-center justify-between">
      <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-black">
        {label}
      </span>
      <span className="text-[11px] font-extrabold text-black tabular-nums tracking-[1px]">
        {num}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VitrinaPage() {
  return (
    <div className="font-sans bg-[#eeeee8] text-[#0e0e0e]">

      {/* ── TOP NAV ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black h-[60px] flex items-center px-12 gap-0">
        <a href="#top" className="flex items-center gap-3 shrink-0 no-underline">
          <CoMark className="w-[38px] h-[18px]" />
          <div className="flex flex-col leading-[1.1]">
            <span className="text-[12px] font-normal text-white tracking-[0.3px]">common</span>
            <span className="text-[12px] font-normal text-white tracking-[0.3px]">house</span>
          </div>
        </a>
        <div className="flex items-center gap-8 ml-auto">
          <a href="#capabilities" className="text-[12px] font-medium text-white/45 no-underline hover:text-white/85 transition-colors">
            The House
          </a>
          <a href="#residents" className="text-[12px] font-medium text-white/45 no-underline hover:text-white/85 transition-colors">
            Residents
          </a>
          <a href="#desks" className="text-[12px] font-medium text-white/45 no-underline hover:text-white/85 transition-colors">
            How we work
          </a>
        </div>
        <a
          href="#cta"
          className="ml-7 inline-flex items-center gap-1.5 bg-[#c8f55a] text-black text-[11px] font-bold tracking-[0.3px] px-4 py-2 rounded-md no-underline hover:opacity-90 transition-opacity shrink-0"
        >
          Request a conversation
        </a>
      </nav>

      {/* ── 01. HERO ────────────────────────────────────────────────────────── */}
      <section
        id="top"
        className="bg-black min-h-screen flex flex-col pt-[60px]"
      >
        <div className="flex-1 flex flex-col justify-end max-w-[1100px] mx-auto w-full px-12 pb-20 pt-16">
          <h1 className="text-[clamp(3.5rem,9vw,8.5rem)] font-light text-white tracking-[-4px] leading-[0.9] mb-9">
            The house
            <br />
            is{" "}
            <em className="font-black italic text-[#c8f55a]">ready</em>
            <br />
            to work.
          </h1>
          <div className="flex items-end justify-between gap-10 flex-wrap">
            <p className="text-[16px] text-white/45 leading-[1.65] max-w-[420px] font-normal">
              Strategy, intelligence and production capacity — built around the
              people and organisations making zero waste real.
            </p>
            <div className="flex items-center gap-3 shrink-0">
              <a
                href="#residents"
                className="inline-flex items-center gap-[7px] bg-[#c8f55a] text-black text-[12px] font-bold tracking-[0.2px] px-[22px] py-[13px] rounded-lg no-underline hover:opacity-90 transition-opacity"
              >
                Explore Residents
                <ArrowRight size={12} />
              </a>
              <a
                href="#desks"
                className="inline-flex items-center gap-[7px] bg-transparent text-white/50 text-[12px] font-semibold px-[22px] py-[13px] rounded-lg border border-white/12 no-underline hover:text-white/85 hover:border-white/30 transition-all"
              >
                See how the House works
              </a>
            </div>
          </div>
          <p className="text-[9px] font-semibold tracking-[2px] uppercase text-white/15 mt-16 flex items-center gap-2.5">
            <span className="block w-8 h-px bg-white/12" />
            Scroll to explore
          </p>
        </div>
      </section>

      {/* ── 02. CAPABILITIES ────────────────────────────────────────────────── */}
      <section id="capabilities" className="w-full">
        <SectionBar label="What the House does" num="01" />
        <div className="max-w-[1100px] mx-auto px-12 py-24">
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-light text-[#0e0e0e] tracking-[-1.5px] leading-[1.05]">
            Five capabilities.
            <br />
            <em className="font-black italic">One operating system.</em>
          </h2>
          <p className="text-[15px] text-[#6b6b6b] leading-[1.7] max-w-[520px] mt-4 font-normal">
            Every engagement activates the full House — not just a consultant or
            a tool, but a system that works together.
          </p>

          <div className="mt-14 grid grid-cols-5 border border-[#d8d8d0] rounded-2xl overflow-hidden bg-white">
            {/* Strategy */}
            <div className="p-7 border-r border-[#d8d8d0] hover:bg-[#f9f9f6] transition-colors">
              <div className="w-9 h-9 rounded-xl bg-[#c8f55a] flex items-center justify-center mb-4 shrink-0">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 2L2 7l8 5 8-5-8-5z" />
                  <path d="M2 12l8 5 8-5" />
                  <path d="M2 17l8 5 8-5" />
                </svg>
              </div>
              <p className="text-[13px] font-extrabold text-[#0e0e0e] tracking-[-0.3px] mb-2">Strategy & Operations</p>
              <p className="text-[11.5px] text-[#6b6b6b] leading-[1.6]">
                Project management, roadmaps, decision tracking, and governance — keeping the work moving.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {["Workrooms", "Decisions", "Roadmaps"].map((t) => (
                  <span key={t} className="text-[9.5px] font-semibold text-[#6b6b6b] border border-[#d8d8d0] rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
            {/* Design */}
            <div className="p-7 border-r border-[#d8d8d0] hover:bg-[#f9f9f6] transition-colors">
              <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center mb-4 shrink-0">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="16" height="13" rx="1" />
                  <path d="M6 7h8M6 10h5" />
                </svg>
              </div>
              <p className="text-[13px] font-extrabold text-[#0e0e0e] tracking-[-0.3px] mb-2">Design & Production</p>
              <p className="text-[11.5px] text-[#6b6b6b] leading-[1.6]">
                Decks, one-pagers, proposals, reports and investor briefs — built to move conversations forward.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {["Design Desk", "Comms Desk", "Brand Brain"].map((t) => (
                  <span key={t} className="text-[9.5px] font-semibold text-[#6b6b6b] border border-[#d8d8d0] rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
            {/* Intelligence */}
            <div className="p-7 border-r border-[#d8d8d0] hover:bg-[#f9f9f6] transition-colors">
              <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center mb-4 shrink-0">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="10" cy="10" r="8" />
                  <path d="M10 6v4l3 2" />
                </svg>
              </div>
              <p className="text-[13px] font-extrabold text-[#0e0e0e] tracking-[-0.3px] mb-2">Intelligence</p>
              <p className="text-[11.5px] text-[#6b6b6b] leading-[1.6]">
                Continuous synthesis of signals, sources, and conversations into actionable insight briefs.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {["Insights Desk", "Knowledge", "Evidence"].map((t) => (
                  <span key={t} className="text-[9.5px] font-semibold text-[#6b6b6b] border border-[#d8d8d0] rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
            {/* Grants */}
            <div className="p-7 border-r border-[#d8d8d0] hover:bg-[#f9f9f6] transition-colors">
              <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center mb-4 shrink-0">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7z" />
                  <polyline points="12 2 12 7 17 7" />
                </svg>
              </div>
              <p className="text-[13px] font-extrabold text-[#0e0e0e] tracking-[-0.3px] mb-2">Grants & Funding</p>
              <p className="text-[11.5px] text-[#6b6b6b] leading-[1.6]">
                Funder mapping, grant fit reviews, backlog management, and active monitoring across the portfolio.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {["Grants Desk", "Pipeline", "Monitoring"].map((t) => (
                  <span key={t} className="text-[9.5px] font-semibold text-[#6b6b6b] border border-[#d8d8d0] rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
            {/* Relationships */}
            <div className="p-7 hover:bg-[#f9f9f6] transition-colors">
              <div className="w-9 h-9 rounded-xl bg-black flex items-center justify-center mb-4 shrink-0">
                <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <p className="text-[13px] font-extrabold text-[#0e0e0e] tracking-[-0.3px] mb-2">Relationships</p>
              <p className="text-[11.5px] text-[#6b6b6b] leading-[1.6]">
                Relationship warmth tracking, investor matching, and portfolio health — the relational layer of the system.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3.5">
                {["Residents", "Garage", "Portfolio"].map((t) => (
                  <span key={t} className="text-[9.5px] font-semibold text-[#6b6b6b] border border-[#d8d8d0] rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 03. RESIDENTS PREVIEW ───────────────────────────────────────────── */}
      <section id="residents" className="w-full bg-black">
        <div className="bg-[rgba(200,245,90,0.12)] border-b border-[rgba(200,245,90,0.2)] px-12 py-3 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-white/50">Residents</span>
          <span className="text-[11px] font-extrabold text-white/30 tabular-nums tracking-[1px]">02</span>
        </div>
        <div className="max-w-[1100px] mx-auto px-12 py-24">
          <div className="flex items-end justify-between gap-6 mb-12 flex-wrap">
            <div>
              <p className="text-[9.5px] font-bold tracking-[2.5px] uppercase text-[#c8f55a] mb-4">
                Directorio vivo de capacidades
              </p>
              <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-light text-white tracking-[-1.5px] leading-[1.05]">
                Not a team page.
                <br />
                <em className="font-black italic text-[#c8f55a]">A living directory.</em>
              </h2>
            </div>
            <a
              href="/residents"
              className="inline-flex items-center gap-[7px] bg-transparent text-white/60 text-[11px] font-bold px-[18px] py-[10px] rounded-lg border border-white/15 no-underline hover:text-white hover:border-white/40 transition-all shrink-0"
            >
              View all Residents
              <ArrowRight size={11} />
            </a>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {[
              { initials: "JM", name: "José Manuel", role: "Co-founder · Project Lead", tags: ["Strategy", "Zero waste", "Operations"], lime: true },
              { initials: "SC", name: "Sofía Castro", role: "Co-founder · Strategy", tags: ["Intelligence", "Policy", "Advocacy"], lime: true },
              { initials: "AP", name: "Andrés Pérez", role: "Design & Comms Lead", tags: ["Design", "Brand", "Production"], lime: false },
              { initials: "LV", name: "Laura Vargas", role: "Grants & Funding Advisor", tags: ["Grants", "Impact", "EU Policy"], lime: false },
            ].map((r) => (
              <div
                key={r.initials}
                className="bg-white/4 border border-white/8 rounded-2xl p-[22px] hover:bg-white/7 hover:border-[rgba(200,245,90,0.25)] transition-all"
              >
                <div className="w-11 h-11 rounded-full bg-[#c8f55a] text-black text-[13px] font-extrabold flex items-center justify-center mb-3.5 tracking-[-0.5px]">
                  {r.initials}
                </div>
                <p className="text-[13px] font-bold text-white mb-0.5 tracking-[-0.2px]">{r.name}</p>
                <p className="text-[10.5px] text-white/35 font-medium mb-3">{r.role}</p>
                <div className="flex flex-wrap gap-1">
                  {r.tags.map((tag, i) => (
                    <span
                      key={tag}
                      className={
                        i === 0
                          ? "text-[9px] font-semibold text-[#c8f55a] bg-[rgba(200,245,90,0.07)] border border-[rgba(200,245,90,0.2)] rounded-full px-[7px] py-0.5 tracking-[0.3px]"
                          : "text-[9px] font-semibold text-white/30 bg-white/5 border border-white/8 rounded-full px-[7px] py-0.5 tracking-[0.3px]"
                      }
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Digital agents row */}
          <div className="mt-6 px-6 py-5 bg-[rgba(200,245,90,0.05)] border border-[rgba(200,245,90,0.15)] rounded-xl flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-8 h-8 rounded-full bg-[rgba(200,245,90,0.12)] border border-[rgba(200,245,90,0.25)] flex items-center justify-center shrink-0">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="rgba(200,245,90,0.6)" strokeWidth="1.8" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3l2 1.5" />
                </svg>
              </div>
              <p className="text-[13px] font-semibold text-white/60">
                And{" "}
                <strong className="text-[#c8f55a] font-bold">6 digital residents</strong>{" "}
                that run continuously — capturing, analysing, and maintaining the system.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {[
                "Information Coordinator",
                "Intelligence Analyst",
                "Project Manager",
                "Internal Auditor",
                "Portfolio Director",
                "Chief of Staff",
              ].map((agent) => (
                <span
                  key={agent}
                  className="text-[9.5px] font-semibold text-[rgba(200,245,90,0.6)] bg-[rgba(200,245,90,0.06)] border border-[rgba(200,245,90,0.15)] rounded-full px-2.5 py-0.5 tracking-[0.3px]"
                >
                  {agent}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 04. THE DESKS ───────────────────────────────────────────────────── */}
      <section id="desks" className="w-full bg-[#eeeee8]">
        <SectionBar label="The Desks — Section Entry" num="03" />
        <div className="max-w-[1100px] mx-auto px-12 py-24">
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-light text-[#0e0e0e] tracking-[-1.5px] leading-[1.05]">
            Go to the desk
            <br />
            that fits <em className="font-black italic">the work.</em>
          </h2>
          <p className="text-[15px] text-[#6b6b6b] leading-[1.7] max-w-[520px] mt-4 font-normal">
            Each desk is a contextual entry point. You go to the right team with
            the right ask — not a generic form or a chatbot.
          </p>

          <div className="grid grid-cols-4 gap-4 mt-[52px]">

            {/* Design Desk — featured */}
            <div className="bg-white border-2 border-black rounded-2xl overflow-hidden flex flex-col">
              <div className="px-[22px] pt-[22px] pb-[18px] border-b border-[#d8d8d0] flex items-start justify-between gap-2.5">
                <div>
                  <p className="text-[15px] font-black text-[#0e0e0e] tracking-[-0.5px] mt-0.5">Design</p>
                  <p className="text-[11px] text-[#6b6b6b] font-medium mt-0.5">Visual production & documents</p>
                </div>
                <div className="w-[38px] h-[38px] rounded-xl bg-[#c8f55a] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="16" height="13" rx="1" />
                    <path d="M6 7h8M6 10h5" />
                  </svg>
                </div>
              </div>
              <div className="px-[22px] pt-[18px] pb-[22px] flex-1 flex flex-col">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-black/20 mb-2.5">What you can get</p>
                <div className="flex flex-col gap-1.5 flex-1">
                  {["Deck / Presentation", "One-pager", "Proposal", "Investor brief", "Report skeleton"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-[12px] font-semibold text-[#0e0e0e]">
                      <span className="w-1 h-1 rounded-full bg-[#c8f55a] shrink-0 block" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              {/* Form */}
              <div className="border-t border-[#d8d8d0] px-[22px] py-[18px] bg-[#f9f9f6]">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-black/25 mb-2">What type?</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {["Deck", "One-pager", "Proposal", "Brief", "Report"].map((pill, i) => (
                    <span
                      key={pill}
                      className={
                        i === 0
                          ? "text-[10.5px] font-semibold text-black bg-[#c8f55a] border-2 border-[#c8f55a] rounded-full px-3 py-1 cursor-pointer"
                          : "text-[10.5px] font-semibold text-[#0e0e0e] bg-white border-[1.5px] border-[#d8d8d0] rounded-full px-3 py-1 cursor-pointer"
                      }
                    >
                      {pill}
                    </span>
                  ))}
                </div>
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-black/25 mb-2 mt-2.5">Tell us more</p>
                <div className="bg-white border-[1.5px] border-[#d8d8d0] rounded-lg px-3 py-2.5 text-[12px] text-[#aaa] leading-relaxed">
                  What&apos;s it for, who&apos;s the audience, any references...
                </div>
                <div className="mt-2.5">
                  <a href="#" className="flex items-center justify-center w-full bg-[#c8f55a] text-black text-[11px] font-bold px-3.5 py-2.5 rounded-lg no-underline hover:opacity-90 transition-opacity">
                    Send to Design desk →
                  </a>
                </div>
              </div>
              <div className="px-[22px] py-3 border-t border-[#d8d8d0] flex items-center justify-between">
                <span className="text-[9px] text-black/20 font-semibold tracking-[0.5px]">Feeds: Brand Brain · Design System</span>
              </div>
            </div>

            {/* Comms Desk */}
            <div className="bg-white border-[1.5px] border-[#d8d8d0] rounded-2xl overflow-hidden flex flex-col hover:border-[#0e0e0e] transition-colors">
              <div className="px-[22px] pt-[22px] pb-[18px] border-b border-[#d8d8d0] flex items-start justify-between gap-2.5">
                <div>
                  <p className="text-[15px] font-black text-[#0e0e0e] tracking-[-0.5px] mt-0.5">Comms</p>
                  <p className="text-[11px] text-[#6b6b6b] font-medium mt-0.5">Voice, narrative & content</p>
                </div>
                <div className="w-[38px] h-[38px] rounded-xl bg-black flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 14a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10z" />
                  </svg>
                </div>
              </div>
              <div className="px-[22px] pt-[18px] pb-[22px] flex-1 flex flex-col">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-black/20 mb-2.5">What you can get</p>
                <div className="flex flex-col gap-1.5 flex-1">
                  {["Post / social copy", "Newsletter block", "Article angle", "Founder voice piece", "CH institutional piece"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-[12px] font-semibold text-[#0e0e0e]">
                      <span className="w-1 h-1 rounded-full bg-[#c8f55a] shrink-0 block" />
                      {item}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#d8d8d0]">
                  <a href="#" className="inline-flex items-center gap-1.5 bg-black text-white text-[10.5px] font-bold px-3.5 py-2 rounded-lg no-underline hover:bg-[#222] transition-colors">
                    Request from Comms →
                  </a>
                  <span className="text-[9px] text-black/20 font-semibold tracking-[0.5px]">Comms System · Voice</span>
                </div>
              </div>
            </div>

            {/* Insights Desk */}
            <div className="bg-white border-[1.5px] border-[#d8d8d0] rounded-2xl overflow-hidden flex flex-col hover:border-[#0e0e0e] transition-colors">
              <div className="px-[22px] pt-[22px] pb-[18px] border-b border-[#d8d8d0] flex items-start justify-between gap-2.5">
                <div>
                  <p className="text-[15px] font-black text-[#0e0e0e] tracking-[-0.5px] mt-0.5">Insights</p>
                  <p className="text-[11px] text-[#6b6b6b] font-medium mt-0.5">Analysis & intelligence</p>
                </div>
                <div className="w-[38px] h-[38px] rounded-xl bg-black flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="10" r="8" />
                    <path d="M10 6v4l3 2" />
                  </svg>
                </div>
              </div>
              <div className="px-[22px] pt-[18px] pb-[22px] flex-1 flex flex-col">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-black/20 mb-2.5">What you can get</p>
                <div className="flex flex-col gap-1.5 flex-1">
                  {["PDF / PPT digest", "Grant scan", "Project intel brief", "Open exploration"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-[12px] font-semibold text-[#0e0e0e]">
                      <span className="w-1 h-1 rounded-full bg-[#c8f55a] shrink-0 block" />
                      {item}
                    </div>
                  ))}
                </div>
                <div className="mt-3.5">
                  <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-black/25 mb-2">Upload a source</p>
                  <div className="bg-[#f5f5f2] border-[1.5px] border-dashed border-[#d0d0c8] rounded-lg p-3 text-center text-[10.5px] text-[#aaa]">
                    PDF · PPT · DOC · URL
                  </div>
                </div>
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#d8d8d0]">
                  <a href="#" className="inline-flex items-center gap-1.5 bg-black text-white text-[10.5px] font-bold px-3.5 py-2 rounded-lg no-underline hover:bg-[#222] transition-colors">
                    Go to Insights →
                  </a>
                  <span className="text-[9px] text-black/20 font-semibold tracking-[0.5px]">Insight Engine</span>
                </div>
              </div>
            </div>

            {/* Grants Desk */}
            <div className="bg-white border-[1.5px] border-[#d8d8d0] rounded-2xl overflow-hidden flex flex-col hover:border-[#0e0e0e] transition-colors">
              <div className="px-[22px] pt-[22px] pb-[18px] border-b border-[#d8d8d0] flex items-start justify-between gap-2.5">
                <div>
                  <p className="text-[15px] font-black text-[#0e0e0e] tracking-[-0.5px] mt-0.5">Grants</p>
                  <p className="text-[11px] text-[#6b6b6b] font-medium mt-0.5">Funding fit & monitoring</p>
                </div>
                <div className="w-[38px] h-[38px] rounded-xl bg-[#1a3a08] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#c8f55a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7z" />
                    <polyline points="12 2 12 7 17 7" />
                  </svg>
                </div>
              </div>
              <div className="px-[22px] pt-[18px] pb-[22px] flex-1 flex flex-col">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-black/20 mb-2.5">What you can get</p>
                <div className="flex flex-col gap-1.5 flex-1">
                  {["Grant fit review", "Funding scan", "Funder mapping", "Grant backlog & next steps"].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-[12px] font-semibold text-[#0e0e0e]">
                      <span className="w-1 h-1 rounded-full bg-[#c8f55a] shrink-0 block" />
                      {item}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#d8d8d0]">
                  <a href="#" className="inline-flex items-center gap-1.5 bg-black text-white text-[10.5px] font-bold px-3.5 py-2 rounded-lg no-underline hover:bg-[#222] transition-colors">
                    Go to Grants →
                  </a>
                  <span className="text-[9px] text-black/20 font-semibold tracking-[0.5px]">Grants System · OS v2</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── 05. WHAT CLIENTS UNLOCK ─────────────────────────────────────────── */}
      <section id="unlock" className="w-full bg-black">
        <div className="bg-[rgba(200,245,90,0.07)] border-b border-[rgba(200,245,90,0.12)] px-12 py-3 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-white/40">What clients unlock</span>
          <span className="text-[11px] font-extrabold text-white/20 tabular-nums tracking-[1px]">04</span>
        </div>
        <div className="max-w-[1100px] mx-auto px-12 py-24">
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-light text-white tracking-[-1.5px] leading-[1.05]">
            Inside the House,
            <br />
            <em className="font-black italic text-[#c8f55a]">everything connects.</em>
          </h2>
          <p className="text-[15px] text-white/50 leading-[1.7] max-w-[520px] mt-4 font-normal">
            Once you&apos;re in, you have a home base — visibility into your project,
            intelligence on demand, and a team that&apos;s always current on your work.
          </p>

          <div className="mt-[52px] grid grid-cols-[1fr_1px_1fr_1px_1fr] border border-white/7 rounded-2xl overflow-hidden">
            {[
              {
                num: "01 —",
                title: "Your Hall",
                desc: "A private portal showing your project's current state, decisions, materials, and team.",
                bullets: ["Live project status", "Decision log", "Shared materials", "Conversations history"],
              },
              null,
              {
                num: "02 —",
                title: "The Workroom or Garage",
                desc: "An active workspace where all deliverables, sessions, and milestones are tracked and visible.",
                bullets: ["Executive snapshot", "What's in motion", "Blockers surfaced", "Investor & grant fit"],
              },
              null,
              {
                num: "03 —",
                title: "The full system",
                desc: "Intelligence, design, comms, and grants capacity — available through contextual desk requests, not queues.",
                bullets: ["Design desk on demand", "Comms production", "Insight digests", "Funding support"],
              },
            ].map((item, i) =>
              item === null ? (
                <div key={i} className="bg-white/7" />
              ) : (
                <div key={i} className="px-7 py-8">
                  <p className="text-[10px] font-extrabold tracking-[2px] text-[#c8f55a] mb-3.5 tabular-nums">{item.num}</p>
                  <p className="text-[16px] font-extrabold text-white tracking-[-0.4px] mb-2.5 leading-[1.3]">{item.title}</p>
                  <p className="text-[12px] text-white/40 leading-[1.65]">{item.desc}</p>
                  <div className="mt-3.5 flex flex-col gap-1.5">
                    {item.bullets.map((b) => (
                      <div key={b} className="text-[11px] text-white/35 flex items-center gap-1.5">
                        <span className="w-[3px] h-[3px] rounded-full bg-[#c8f55a] shrink-0 block" />
                        {b}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── 06. WORKROOM PREVIEW ────────────────────────────────────────────── */}
      <section id="workroom" className="w-full bg-[#eeeee8]">
        <SectionBar label="Workroom — inside view" num="05" />
        <div className="max-w-[1100px] mx-auto px-12 py-24">
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-light text-[#0e0e0e] tracking-[-1.5px] leading-[1.05]">
            Where active work
            <br />
            becomes <em className="font-black italic">visible.</em>
          </h2>

          <div className="mt-12 border-[1.5px] border-[#d8d8d0] rounded-2xl overflow-hidden bg-white relative">
            {/* Browser bar */}
            <div className="bg-black px-6 py-3.5 flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-white/15" />
              <div className="w-2 h-2 rounded-full bg-white/15" />
              <div className="w-2 h-2 rounded-full bg-white/15" />
              <span className="text-[10px] font-medium text-white/30 tracking-[0.5px]">
                common house ›{" "}
                <span className="text-white/55">Auto Mercado Fase 2</span> ›{" "}
                <span className="text-white/55">The Workroom</span>
              </span>
            </div>

            {/* Body */}
            <div className="grid grid-cols-[180px_1fr] min-h-[340px]">
              <div className="bg-[#f5f5f2] border-r border-[#d8d8d0] p-5">
                {[
                  { label: "Overview", active: true },
                  { label: "In motion", active: false },
                  { label: "Decisions", active: false },
                  { label: "Materials", active: false },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[11px] font-semibold mb-0.5 cursor-default ${
                      item.active ? "bg-black text-[#c8f55a]" : "text-[#888]"
                    }`}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
              <div className="p-6 px-7">
                <p className="text-[18px] font-black tracking-[-0.5px] text-[#0e0e0e] mb-1">
                  Auto Mercado{" "}
                  <em className="italic text-[#888]">Fase 2</em>
                </p>
                <p className="text-[10.5px] text-[#6b6b6b] mb-5">
                  Pilot Planning · Last updated 11 Apr 2026
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Current focus", val: "Validating pilot model at 2 locations", dim: false },
                    { label: "Next milestone", val: "Pilot kickoff with TI team — Q2 2026", dim: false },
                    { label: "Decisions made", val: "2 confirmed this cycle", dim: true },
                    { label: "Materials", val: "3 shared documents", dim: true },
                  ].map((card) => (
                    <div
                      key={card.label}
                      className={`border-[1.5px] border-[#d8d8d0] rounded-xl p-3.5 bg-[#eeeee8] ${card.dim ? "opacity-50" : ""}`}
                    >
                      <p className="text-[8px] font-bold tracking-[2px] uppercase text-black/20 mb-1.5">{card.label}</p>
                      <p className="text-[13px] font-bold text-[#0e0e0e] leading-[1.4]">{card.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Blur overlay */}
            <div className="absolute bottom-0 left-0 right-0 h-[120px] bg-gradient-to-b from-transparent to-[rgba(238,238,232,0.96)] flex items-end justify-center pb-6">
              <a
                href="#cta"
                className="inline-flex items-center gap-1.5 bg-black text-white text-[11px] font-bold px-5 py-2.5 rounded-lg no-underline tracking-[0.3px]"
              >
                <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="6" width="10" height="7" rx="1" />
                  <path d="M4.5 6V4a2.5 2.5 0 0 1 5 0v2" />
                </svg>
                Unlocks with your engagement
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── 07. SAMPLE OUTPUTS ──────────────────────────────────────────────── */}
      <section id="outputs" className="w-full bg-white">
        <SectionBar label="Sample outputs" num="06" />
        <div className="max-w-[1100px] mx-auto px-12 py-24">
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-light text-[#0e0e0e] tracking-[-1.5px] leading-[1.05]">
            What the House <em className="font-black italic">produces.</em>
          </h2>

          <div className="grid grid-cols-4 gap-4 mt-[52px]">
            {/* Output 1 */}
            <div className="border-[1.5px] border-[#d8d8d0] rounded-2xl overflow-hidden bg-[#eeeee8] hover:border-[#aaa] transition-colors">
              <div className="h-[120px] bg-black flex items-center justify-center p-5 relative">
                <p className="text-[22px] font-black italic text-white/15 tracking-[-1px] leading-none text-center">
                  Propuesta
                  <br />
                  de trabajo
                </p>
                <span className="absolute bottom-3 right-4 text-[10px] font-extrabold text-white/12 tracking-[1px] tabular-nums">01</span>
              </div>
              <div className="p-4 px-[18px]">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-[#6b6b6b] mb-1.5">Design Desk</p>
                <p className="text-[13px] font-bold text-[#0e0e0e] tracking-[-0.3px] leading-[1.3] mb-1.5">Pilot Scope & Proposal</p>
                <p className="text-[11px] text-[#6b6b6b] leading-[1.5]">Full engagement proposal with scope, timeline, team, and commercial model.</p>
                <div className="flex items-center gap-1.5 mt-3">
                  <span className="text-[9px] font-bold text-[#6b6b6b] bg-black/5 rounded-full px-2 py-0.5 tracking-[0.3px]">Design</span>
                  <span className="text-[9px] font-bold text-[#6b6b6b] bg-black/5 rounded-full px-2 py-0.5 tracking-[0.3px]">PDF · 18p</span>
                </div>
              </div>
            </div>

            {/* Output 2 */}
            <div className="border-[1.5px] border-[#d8d8d0] rounded-2xl overflow-hidden bg-[#eeeee8] hover:border-[#aaa] transition-colors">
              <div className="h-[120px] bg-[#c8f55a] flex items-center justify-center p-5 relative">
                <p className="text-[22px] font-black italic text-black/12 tracking-[-1px] leading-none text-center">
                  Insight
                  <br />
                  Brief
                </p>
                <span className="absolute bottom-3 right-4 text-[10px] font-extrabold text-black/10 tracking-[1px] tabular-nums">02</span>
              </div>
              <div className="p-4 px-[18px]">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-[#6b6b6b] mb-1.5">Insights Desk</p>
                <p className="text-[13px] font-bold text-[#0e0e0e] tracking-[-0.3px] leading-[1.3] mb-1.5">Circular Economy — LATAM 2026</p>
                <p className="text-[11px] text-[#6b6b6b] leading-[1.5]">Synthesis of 12 sources into a 4-point strategic brief with opportunities and risks.</p>
                <div className="flex items-center gap-1.5 mt-3">
                  <span className="text-[9px] font-bold text-[#6b6b6b] bg-black/5 rounded-full px-2 py-0.5 tracking-[0.3px]">Insights</span>
                  <span className="text-[9px] font-bold text-[#6b6b6b] bg-black/5 rounded-full px-2 py-0.5 tracking-[0.3px]">Brief · 4p</span>
                </div>
              </div>
            </div>

            {/* Output 3 */}
            <div className="border-[1.5px] border-[#d8d8d0] rounded-2xl overflow-hidden bg-[#eeeee8] hover:border-[#aaa] transition-colors">
              <div className="h-[120px] bg-[#eeeee8] border-b border-[#d8d8d0] flex items-start p-5">
                <div>
                  <p className="text-[8px] font-bold tracking-[2px] uppercase text-[#ccc] mb-2">Advocacy Strategy</p>
                  <p className="text-[16px] font-black italic text-[#ddd] tracking-[-0.5px] leading-[1.1]">Chief x Common House</p>
                  <div className="mt-2.5 flex flex-col gap-1.5">
                    <div className="bg-[#eee] rounded h-1.5 w-4/5" />
                    <div className="bg-[#eee] rounded h-1.5 w-3/5" />
                  </div>
                </div>
              </div>
              <div className="p-4 px-[18px]">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-[#6b6b6b] mb-1.5">Design + Comms</p>
                <p className="text-[13px] font-bold text-[#0e0e0e] tracking-[-0.3px] leading-[1.3] mb-1.5">Advocacy Roadmap Deck</p>
                <p className="text-[11px] text-[#6b6b6b] leading-[1.5]">Strategic deck translating operational impact into structural influence for board use.</p>
                <div className="flex items-center gap-1.5 mt-3">
                  <span className="text-[9px] font-bold text-[#6b6b6b] bg-black/5 rounded-full px-2 py-0.5 tracking-[0.3px]">Design</span>
                  <span className="text-[9px] font-bold text-[#6b6b6b] bg-black/5 rounded-full px-2 py-0.5 tracking-[0.3px]">Comms</span>
                </div>
              </div>
            </div>

            {/* Output 4 */}
            <div className="border-[1.5px] border-[#d8d8d0] rounded-2xl overflow-hidden bg-[#eeeee8] hover:border-[#aaa] transition-colors">
              <div className="h-[120px] bg-[#111] flex items-center justify-center p-5">
                <div className="text-center">
                  <p className="text-[11px] font-bold tracking-[2px] uppercase text-[rgba(200,245,90,0.3)] mb-1.5">Grant Landscape</p>
                  <div className="flex flex-col gap-1">
                    {[
                      { w: "w-[100px]", score: "82%", bright: true },
                      { w: "w-[80px]", score: "64%", bright: false },
                      { w: "w-[60px]", score: "51%", bright: false },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${row.bright ? "bg-[rgba(200,245,90,0.2)]" : "bg-white/8"}`} />
                        <div className={`${row.w} h-1.5 rounded bg-${row.bright ? "[rgba(255,255,255,0.06)]" : "[rgba(255,255,255,0.04)]"}`} />
                        <span className={`text-[9px] font-bold ${row.bright ? "text-[rgba(200,245,90,0.3)]" : "text-white/20"}`}>{row.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-4 px-[18px]">
                <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-[#6b6b6b] mb-1.5">Grants Desk</p>
                <p className="text-[13px] font-bold text-[#0e0e0e] tracking-[-0.3px] leading-[1.3] mb-1.5">Funder Fit Mapping</p>
                <p className="text-[11px] text-[#6b6b6b] leading-[1.5]">Ranked funder landscape with fit scores, next steps, and application backlog.</p>
                <div className="flex items-center gap-1.5 mt-3">
                  <span className="text-[9px] font-bold text-[#6b6b6b] bg-black/5 rounded-full px-2 py-0.5 tracking-[0.3px]">Grants</span>
                  <span className="text-[9px] font-bold text-[#6b6b6b] bg-black/5 rounded-full px-2 py-0.5 tracking-[0.3px]">Mapping</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 08. INTELLIGENCE PREVIEW ────────────────────────────────────────── */}
      <section id="intelligence" className="w-full bg-black">
        <div className="bg-[rgba(200,245,90,0.07)] border-b border-[rgba(200,245,90,0.12)] px-12 py-3 flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[1.5px] uppercase text-white/40">Intelligence layer — preview</span>
          <span className="text-[11px] font-extrabold text-white/20 tabular-nums tracking-[1px]">07</span>
        </div>
        <div className="max-w-[1100px] mx-auto px-12 py-24">
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-light text-white tracking-[-1.5px] leading-[1.05]">
            Signals that feed <em className="font-black italic text-[#c8f55a]">the work.</em>
          </h2>
          <p className="text-[15px] text-white/50 leading-[1.7] max-w-[520px] mt-4 font-normal">
            The system continuously monitors conversations, documents, and sources — surfacing what matters, when it matters.
          </p>

          <div className="grid grid-cols-3 gap-4 mt-[52px]">
            {/* Card 1 */}
            <div className="bg-white/3 border border-white/7 rounded-2xl px-[22px] pt-[22px] pb-5">
              <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-white/20 mb-2.5">Insight Brief · CH Portfolio</p>
              <p className="text-[14px] font-bold text-white/70 tracking-[-0.3px] leading-[1.4] mb-2.5">
                New regulation opens packaging reuse mandate across 4 EU markets
              </p>
              <p className="text-[11.5px] text-white/25 leading-[1.6] blur-sm select-none pointer-events-none">
                Applies to retailers with &gt;50 locations starting Q3 2026. Auto Mercado&apos;s pilot positions them ahead of the compliance curve in LATAM analogues.
              </p>
              <div className="flex items-center justify-between mt-3.5">
                <span className="text-[9.5px] text-white/18 font-mono">9 Apr 2026</span>
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[rgba(200,245,90,0.5)] tracking-[0.5px] uppercase">
                  <LockIcon /> Client-only
                </span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white/3 border border-white/7 rounded-2xl px-[22px] pt-[22px] pb-5">
              <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-white/20 mb-2.5">Decision Validated · Auto Mercado</p>
              <p className="text-[14px] font-bold text-white/70 tracking-[-0.3px] leading-[1.4] mb-2.5">
                TI integration confirmed: no infrastructure changes required
              </p>
              <p className="text-[11.5px] text-white/25 leading-[1.6] blur-sm select-none pointer-events-none">
                Signed off by Carlos Rojas (TI Director) on 9 Apr. Integration through existing POS API. Reduces pilot cost by an estimated 12–18%.
              </p>
              <div className="flex items-center justify-between mt-3.5">
                <span className="text-[9.5px] text-white/18 font-mono">9 Apr 2026</span>
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[rgba(200,245,90,0.5)] tracking-[0.5px] uppercase">
                  <LockIcon /> Client-only
                </span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white/3 border border-white/7 rounded-2xl px-[22px] pt-[22px] pb-5">
              <p className="text-[8.5px] font-bold tracking-[2px] uppercase text-white/20 mb-2.5">Grant Signal · Grants System</p>
              <p className="text-[14px] font-bold text-white/70 tracking-[-0.3px] leading-[1.4] mb-2.5">
                SUFI / Fair4All: deadline approaching — strong fit signal for 2 portfolio startups
              </p>
              <p className="text-[11.5px] text-white/25 leading-[1.6] blur-sm select-none pointer-events-none">
                Application window closes 30 Apr. Scoring 78–82% match on sector and geography criteria. P1 action required by portfolio lead this week.
              </p>
              <div className="flex items-center justify-between mt-3.5">
                <span className="text-[9.5px] text-white/18 font-mono">11 Apr 2026</span>
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-[rgba(255,180,0,0.7)] tracking-[0.5px] uppercase">
                  <LockIcon /> Internal · P1
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 09. GRANTS PREVIEW ──────────────────────────────────────────────── */}
      <section id="grants" className="w-full bg-[#eeeee8]">
        <SectionBar label="Grants — funding fit" num="08" />
        <div className="max-w-[1100px] mx-auto px-12 py-24">
          <h2 className="text-[clamp(2rem,4vw,3.2rem)] font-light text-[#0e0e0e] tracking-[-1.5px] leading-[1.05]">
            Funding fit,
            <br />
            mapped and <em className="font-black italic">monitored.</em>
          </h2>
          <p className="text-[15px] text-[#6b6b6b] leading-[1.7] max-w-[520px] mt-4 font-normal">
            The House maintains a live view of grant opportunities across the portfolio — matching funders to projects continuously.
          </p>

          <div className="grid grid-cols-3 gap-4 mt-[52px]">
            {/* Grant 1 */}
            <div className="bg-white border-[1.5px] border-[#d8d8d0] rounded-2xl p-[22px]">
              <div className="flex items-center gap-2 mb-3.5">
                <div>
                  <p className="text-[9.5px] font-bold text-[#6b6b6b] tracking-[0.5px] uppercase">Match</p>
                  <p className="text-[20px] font-black text-[#0e0e0e] tracking-[-1px]">82%</p>
                </div>
                <div className="flex-1 h-1 bg-[#d8d8d0] rounded-sm overflow-hidden">
                  <div className="h-full bg-[#c8f55a] rounded-sm" style={{ width: "82%" }} />
                </div>
              </div>
              <p className="text-[14px] font-extrabold text-[#0e0e0e] tracking-[-0.3px] leading-[1.3] mb-1.5">Circular Economy Innovation Fund</p>
              <p className="text-[10.5px] text-[#6b6b6b] font-medium mb-3">European Investment Bank</p>
              <div className="flex flex-wrap gap-1.5">
                {["Circular economy", "SME", "LATAM-eligible"].map((t) => (
                  <span key={t} className="text-[9px] font-semibold text-[#6b6b6b] border border-[#d8d8d0] rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
              <p className="text-[11px] font-bold text-black/20 font-mono mt-3.5 tracking-[0.5px] blur-sm select-none">€ ██,███ — €███,███</p>
            </div>

            {/* Grant 2 */}
            <div className="bg-white border-[1.5px] border-[#d8d8d0] rounded-2xl p-[22px]">
              <div className="flex items-center gap-2 mb-3.5">
                <div>
                  <p className="text-[9.5px] font-bold text-[#6b6b6b] tracking-[0.5px] uppercase">Match</p>
                  <p className="text-[20px] font-black text-[#0e0e0e] tracking-[-1px]">74%</p>
                </div>
                <div className="flex-1 h-1 bg-[#d8d8d0] rounded-sm overflow-hidden">
                  <div className="h-full bg-[#c8f55a] rounded-sm" style={{ width: "74%" }} />
                </div>
              </div>
              <p className="text-[14px] font-extrabold text-[#0e0e0e] tracking-[-0.3px] leading-[1.3] mb-1.5">Fair4All Finance — Impact Lending</p>
              <p className="text-[10.5px] text-[#6b6b6b] font-medium mb-3">SUFI · Fair4All Finance</p>
              <div className="flex flex-wrap gap-1.5">
                {["Impact", "Retail", "P1 — deadline Apr 30"].map((t) => (
                  <span key={t} className="text-[9px] font-semibold text-[#6b6b6b] border border-[#d8d8d0] rounded-full px-2 py-0.5">{t}</span>
                ))}
              </div>
              <p className="text-[11px] font-bold text-black/20 font-mono mt-3.5 tracking-[0.5px] blur-sm select-none">$ ██,███ — $███,███</p>
            </div>

            {/* Grant 3 — Grants desk active */}
            <div className="bg-[#f9f9f6] border-[1.5px] border-[#d8d8d0] rounded-2xl p-[22px]">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 rounded-full bg-[#c8f55a] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round">
                    <circle cx="8" cy="8" r="6" />
                    <path d="M8 5v3l2 1.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-[11px] font-extrabold text-[#0e0e0e]">Grants desk active</p>
                  <p className="text-[10px] text-[#6b6b6b]">11 funders mapped · 3 in pipeline</p>
                </div>
              </div>
              <p className="text-[12px] text-[#6b6b6b] leading-[1.6]">
                The Grants desk continuously monitors the funder landscape and surfaces fit matches as new opportunities emerge.
              </p>
              <div className="mt-[18px]">
                <a
                  href="#desks"
                  className="inline-flex items-center gap-1.5 bg-[#c8f55a] text-black text-[11px] font-bold px-3.5 py-2 rounded-lg no-underline hover:opacity-90 transition-opacity"
                >
                  Explore Grants desk →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 10. FINAL CTA ───────────────────────────────────────────────────── */}
      <section id="cta" className="bg-black relative overflow-hidden">
        {/* Background co mark */}
        <div className="absolute right-[-60px] top-1/2 -translate-y-1/2 opacity-[0.04] pointer-events-none">
          <svg viewBox="0 0 600 280" fill="none" width="600" height="280">
            <path d="M220 20 A120 120 0 1 0 220 260" stroke="white" strokeWidth="55" strokeLinecap="butt" />
            <circle cx="460" cy="140" r="120" stroke="white" strokeWidth="55" />
          </svg>
        </div>

        <div className="max-w-[1100px] mx-auto px-12 py-[120px] relative z-10">
          <h2 className="text-[clamp(3rem,6vw,5.5rem)] font-light text-white tracking-[-3px] leading-none mb-8">
            Enough context.
            <br />
            <em className="font-black italic text-[#c8f55a]">Time to talk.</em>
          </h2>
          <p className="text-[15px] text-white/35 max-w-[420px] leading-[1.65] mb-11">
            If the work sounds familiar — or if you want to understand what activating the House could mean for your organisation — let&apos;s have a real conversation.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href="#"
              className="inline-flex items-center gap-2 bg-[#c8f55a] text-black text-[13px] font-extrabold px-7 py-[15px] rounded-xl no-underline tracking-[-0.2px] hover:opacity-90 transition-opacity"
            >
              Request a conversation
              <ArrowRight size={13} />
            </a>
            <a
              href="#residents"
              className="inline-flex items-center gap-2 bg-transparent text-white/40 text-[12px] font-semibold px-[22px] py-[15px] rounded-xl border border-white/10 no-underline hover:text-white/75 hover:border-white/25 transition-all"
            >
              Explore Residents
            </a>
            <a
              href="#desks"
              className="inline-flex items-center gap-2 bg-transparent text-white/40 text-[12px] font-semibold px-[22px] py-[15px] rounded-xl border border-white/10 no-underline hover:text-white/75 hover:border-white/25 transition-all"
            >
              See how the House works
            </a>
          </div>

          <div className="mt-20 pt-8 border-t border-white/6 flex items-center justify-between">
            <a
              href="http://wearecommonhouse.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-white/15 font-medium no-underline tracking-[0.3px] hover:text-white/35 hover:underline transition-colors underline-offset-[3px]"
            >
              wearecommonhouse.com
            </a>
            <svg viewBox="0 0 108 50" fill="none" width="54" height="25">
              <path d="M42 4 A21 21 0 1 0 42 46" stroke="rgba(255,255,255,0.1)" strokeWidth="10" strokeLinecap="butt" />
              <circle cx="84" cy="25" r="21" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
            </svg>
          </div>
        </div>
      </section>

    </div>
  );
}
