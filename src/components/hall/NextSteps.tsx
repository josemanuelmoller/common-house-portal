import { HallNextStep } from "@/types/hall";

export function NextSteps({ nextSteps }: { nextSteps: HallNextStep[] }) {
  if (nextSteps.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
        <div className="h-1 bg-amber-400" />
        <div className="px-6 py-5 border-b border-[#f4f4ef]">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            Next steps
          </p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#0a0a0a]/40 leading-relaxed">
            Next steps will appear here once the work is scoped. Nothing to
            act on yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-amber-400" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
          Next steps
        </p>
      </div>
      <div className="divide-y divide-[#f4f4ef]">
        {nextSteps.map((step) => (
          <div key={step.id} className="px-6 py-4 flex items-start gap-4">
            <span className="w-5 h-5 rounded-full bg-[#f4f4ef] flex items-center justify-center text-[10px] font-bold text-[#0a0a0a]/40 shrink-0 mt-0.5">
              {step.order}
            </span>
            <div className="flex-1">
              <p className="text-sm text-[#0a0a0a] leading-relaxed">
                {step.label}
              </p>
            </div>
            {step.owner && (
              <span className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest shrink-0 mt-0.5">
                {step.owner}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
