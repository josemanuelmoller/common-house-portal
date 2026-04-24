// Brand-aligned status pills for Common House
// Active / Validated / High → lime green (brand accent)
// Blockers / errors → dark pill with white text
// Neutral / stages → outlined dark pill

const styles: Record<string, string> = {
  // Validation status
  Validated:   "bg-[#c6f24a] text-[#0a0a0a]",
  New:         "bg-[#0a0a0a]/8 text-[#0a0a0a]/60 border border-[#0a0a0a]/10",
  Reviewed:    "bg-[#0a0a0a] text-white",
  Rejected:    "bg-red-600 text-white",

  // Project status
  Active:      "bg-[#c6f24a] text-[#0a0a0a]",
  Paused:      "bg-[#0a0a0a]/10 text-[#0a0a0a]/60",
  Completed:   "bg-[#0a0a0a] text-white",
  Archived:    "bg-[#0a0a0a]/8 text-[#0a0a0a]/40",

  // Evidence types — black pill style (like "POWERED BY" tags in brand)
  Blocker:     "bg-red-600 text-white",
  Dependency:  "bg-[#0a0a0a] text-white",
  Decision:    "bg-[#0a0a0a] text-white",
  Requirement: "bg-[#0a0a0a] text-white",
  Outcome:     "bg-[#c6f24a] text-[#0a0a0a]",
  Risk:        "bg-amber-500 text-white",
  "Process Step": "bg-[#0a0a0a]/10 text-[#0a0a0a]/70",

  // Confidence
  High:        "bg-[#c6f24a] text-[#0a0a0a]",
  Medium:      "bg-[#0a0a0a]/10 text-[#0a0a0a]/70",
  Low:         "bg-red-100 text-red-700",

  // Stages
  "Stakeholder Alignment": "border border-[#0a0a0a]/20 text-[#0a0a0a]/70 bg-transparent",
  "Pilot Planning":        "border border-[#0a0a0a]/20 text-[#0a0a0a]/70 bg-transparent",
  "Research":              "border border-[#0a0a0a]/20 text-[#0a0a0a]/70 bg-transparent",
  "Execution":             "border border-[#c6f24a] text-[#0a0a0a] bg-[#c6f24a]/20",
  "Launch":                "border border-[#c6f24a] text-[#0a0a0a] bg-[#c6f24a]/20",
};

export function StatusBadge({ value }: { value: string }) {
  const style = styles[value] ?? "border border-[#0a0a0a]/15 text-[#0a0a0a]/60 bg-transparent";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${style}`}>
      {value || "—"}
    </span>
  );
}
