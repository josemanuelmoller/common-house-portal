import { DIGITAL_RESIDENTS, DigitalResidentRole } from "@/types/house";

type LiveSignals = Partial<Record<DigitalResidentRole, string>>;

export function DigitalResidents({ liveSignals }: { liveSignals?: LiveSignals }) {
  const hallRoles = DIGITAL_RESIDENTS.filter(
    r => r.surfaces.includes("hall") && r.clientVisible
  );

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#EFEFEA]" />
      <div className="px-6 py-5 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          Digital support
        </p>
        <p className="text-sm text-[#131218]/40 mt-1.5 leading-relaxed">
          The system listens, records, and synthesises — so the team can stay in the work.
        </p>
      </div>

      <div className="divide-y divide-[#EFEFEA]">
        {hallRoles.map(resident => {
          const live = liveSignals?.[resident.role];
          return (
            <div key={resident.role} className="px-6 py-4 flex items-start gap-6">
              <p className="text-sm font-semibold text-[#131218] w-44 shrink-0 pt-0.5">
                {resident.displayName}
              </p>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[#131218]/55 leading-relaxed">
                  {resident.tagline}
                </p>
                <p className="text-[10px] text-[#131218]/30 font-medium uppercase tracking-widest mt-1">
                  {live ?? resident.signals.join(" · ")}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="px-6 py-4 border-t border-[#EFEFEA]">
        <p className="text-[10px] text-[#131218]/20 leading-relaxed max-w-lg">
          These are digital roles built from real project signals. They support the team —
          they do not replace judgment, conversation, or leadership.
        </p>
      </div>
    </div>
  );
}
