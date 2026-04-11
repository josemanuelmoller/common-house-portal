import { HallProject } from "@/types/hall";

type SubSection = {
  label: string;
  text: string;
};

function SubSectionBlock({ label, text }: SubSection) {
  return (
    <div>
      <p className="text-[10px] font-bold text-[#131218]/25 uppercase tracking-widest mb-2">
        {label}
      </p>
      <p className="text-sm text-[#131218]/70 leading-relaxed">{text}</p>
    </div>
  );
}

export function WhatWeHeard({ project }: { project: HallProject }) {
  const sections = [
    { label: "The challenge",                   text: project.theChallenge },
    { label: "What matters most",               text: project.whatMattersMost },
    { label: "What may be getting in the way",  text: project.whatMayBeInTheWay },
    { label: "What success could look like",    text: project.whatSuccessCouldLookLike },
  ].filter((s) => !!s.text);

  if (sections.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#131218]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          What we heard
        </p>
      </div>
      <div className="px-6 py-5 space-y-5">
        {sections.map((s, i) => (
          <div key={s.label}>
            {i > 0 && <div className="h-px bg-[#EFEFEA] mb-5" />}
            <SubSectionBlock label={s.label} text={s.text} />
          </div>
        ))}
      </div>
    </div>
  );
}
