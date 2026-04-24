type Props = {
  label: string;
  value: string | number;
  icon?: string;
  color?: "default" | "red" | "green" | "yellow" | "blue";
  sub?: string;
};

export function MetricCard({ label, value, icon, color = "default", sub }: Props) {
  const isAlert = color === "red" && Number(value) > 0;

  return (
    <div className={`rounded-2xl border p-5 flex flex-col gap-1 bg-white ${
      isAlert ? "border-red-200" : "border-[#e4e4dd]"
    }`}>
      {icon && <span className="text-lg">{icon}</span>}
      <span className={`text-3xl font-bold tracking-tight mt-1 ${
        isAlert ? "text-red-600" : "text-[#0a0a0a]"
      }`}>
        {value}
      </span>
      <span className="text-xs font-medium text-[#0a0a0a]/50 uppercase tracking-widest">{label}</span>
      {sub && <span className="text-xs text-[#0a0a0a]/30">{sub}</span>}
    </div>
  );
}
