// Brand-aligned status pills for Common House
// Active / Validated / High → lime green (brand accent)
// Blockers / errors → dark pill with white text
// Neutral / stages → outlined dark pill

const styles: Record<string, string> = {
  // Validation status
  Validated:   "bg-[#B2FF59] text-[#131218]",
  New:         "bg-[#131218]/8 text-[#131218]/60 border border-[#131218]/10",
  Reviewed:    "bg-[#131218] text-white",
  Rejected:    "bg-red-600 text-white",

  // Project status
  Active:      "bg-[#B2FF59] text-[#131218]",
  Paused:      "bg-[#131218]/10 text-[#131218]/60",
  Completed:   "bg-[#131218] text-white",
  Archived:    "bg-[#131218]/8 text-[#131218]/40",

  // Evidence types — black pill style (like "POWERED BY" tags in brand)
  Blocker:     "bg-red-600 text-white",
  Dependency:  "bg-[#131218] text-white",
  Decision:    "bg-[#131218] text-white",
  Requirement: "bg-[#131218] text-white",
  Outcome:     "bg-[#B2FF59] text-[#131218]",
  Risk:        "bg-amber-500 text-white",
  "Process Step": "bg-[#131218]/10 text-[#131218]/70",

  // Confidence
  High:        "bg-[#B2FF59] text-[#131218]",
  Medium:      "bg-[#131218]/10 text-[#131218]/70",
  Low:         "bg-red-100 text-red-700",

  // Stages
  "Stakeholder Alignment": "border border-[#131218]/20 text-[#131218]/70 bg-transparent",
  "Pilot Planning":        "border border-[#131218]/20 text-[#131218]/70 bg-transparent",
  "Research":              "border border-[#131218]/20 text-[#131218]/70 bg-transparent",
  "Execution":             "border border-[#B2FF59] text-[#131218] bg-[#B2FF59]/20",
  "Launch":                "border border-[#B2FF59] text-[#131218] bg-[#B2FF59]/20",
};

export function StatusBadge({ value }: { value: string }) {
  const style = styles[value] ?? "border border-[#131218]/15 text-[#131218]/60 bg-transparent";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide ${style}`}>
      {value || "—"}
    </span>
  );
}
