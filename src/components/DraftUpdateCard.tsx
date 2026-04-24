// Parses the OS draft update text into structured sections with visual hierarchy

type Section = {
  label: string;
  content: string;
  type: "positive" | "warning" | "neutral" | "clear";
};

const SECTION_PATTERNS: { regex: RegExp; label: string; type: Section["type"] }[] = [
  { regex: /OUTCOMES?:/i,                      label: "Outcomes",         type: "positive" },
  { regex: /OPEN REQUIREMENTS?:/i,             label: "Open Requirements",type: "warning"  },
  { regex: /REQUIREMENTS?:/i,                  label: "Requirements",     type: "neutral"  },
  { regex: /PROCESS STEPS?:/i,                 label: "Process Steps",    type: "neutral"  },
  { regex: /DECISIONS?:/i,                     label: "Decisions",        type: "positive" },
  { regex: /DEPENDENCIES?:/i,                  label: "Dependencies",     type: "warning"  },
  { regex: /BLOCKERS?:/i,                      label: "Blockers",         type: "warning"  },
  { regex: /NO BLOCKERS?[^.]*(?:DEPENDENCIES?[^.]*)?(?:\.|$)/i, label: "Blockers & Dependencies", type: "clear" },
];

const typeStyles = {
  positive: { bar: "bg-[#c6f24a]",  label: "text-[#0a0a0a]/50", bg: "bg-white" },
  warning:  { bar: "bg-amber-400",  label: "text-amber-600",    bg: "bg-amber-50/30" },
  neutral:  { bar: "bg-[#0a0a0a]/20", label: "text-[#0a0a0a]/40", bg: "bg-white" },
  clear:    { bar: "bg-[#c6f24a]",  label: "text-[#0a0a0a]/40", bg: "bg-[#f4f4ef]/50" },
};

function parseDraftUpdate(raw: string): { period: string; intro: string; sections: Section[] } {
  // Extract period line — everything before the first ALL-CAPS section marker
  const firstSectionMatch = raw.search(/\b(OUTCOMES?|OPEN REQUIREMENTS?|REQUIREMENTS?|PROCESS STEPS?|DECISIONS?|DEPENDENCIES?|BLOCKERS?|NO BLOCKERS?)\s*:/i);

  let intro = firstSectionMatch > 0 ? raw.slice(0, firstSectionMatch).trim() : "";
  let body  = firstSectionMatch > 0 ? raw.slice(firstSectionMatch) : raw;

  // Extract period from intro ("Week of X to Y —")
  let period = "";
  const periodMatch = intro.match(/^(Week of [^—]+(?:—[^.]+)?\.?)\s*/i);
  if (periodMatch) {
    period = periodMatch[1].replace(/\.$/, "").trim();
    intro  = intro.slice(periodMatch[0].length).trim();
  }

  // Split body into sections by ALL-CAPS label
  const sections: Section[] = [];
  // Find all section start positions
  const markers: { index: number; label: string; type: Section["type"] }[] = [];

  for (const { regex, label, type } of SECTION_PATTERNS) {
    const globalRegex = new RegExp(regex.source, "gi");
    let match;
    while ((match = globalRegex.exec(body)) !== null) {
      markers.push({ index: match.index, label, type });
    }
  }

  markers.sort((a, b) => a.index - b.index);

  for (let i = 0; i < markers.length; i++) {
    const start  = markers[i].index;
    const end    = markers[i + 1]?.index ?? body.length;
    const chunk  = body.slice(start, end).trim();
    // Remove the label prefix from content
    const content = chunk.replace(/^[A-Z &]+:\s*/i, "").trim();
    if (content) {
      sections.push({ label: markers[i].label, content, type: markers[i].type });
    }
  }

  // If no sections found, treat whole body as intro
  if (sections.length === 0) {
    intro = raw;
  }

  return { period, intro, sections };
}

export function DraftUpdateCard({ text }: { text: string }) {
  const { period, intro, sections } = parseDraftUpdate(text);

  return (
    <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden">
      <div className="h-1 bg-amber-400" />

      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1">
          Draft Update — Pending Review
        </p>
        {period && (
          <p className="text-base font-bold text-[#0a0a0a] tracking-tight">{period}</p>
        )}
        {intro && (
          <p className="text-sm text-[#0a0a0a]/50 mt-1 leading-relaxed">{intro}</p>
        )}
      </div>

      {/* Sections */}
      {sections.length > 0 && (
        <div className="divide-y divide-[#f4f4ef]">
          {sections.map((s, i) => {
            const style = typeStyles[s.type];
            return (
              <div key={i} className={`px-6 py-4 flex gap-4 ${style.bg}`}>
                <div className={`w-0.5 shrink-0 rounded-full mt-0.5 ${style.bar}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${style.label}`}>
                    {s.label}
                  </p>
                  <p className="text-sm text-[#0a0a0a]/65 leading-relaxed">{s.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
