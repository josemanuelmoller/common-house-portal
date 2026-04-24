import { HallTeamMember } from "@/types/hall";

export function HallTeam({ team }: { team: HallTeamMember[] }) {
  if (team.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden h-full">
        <div className="h-1 bg-[#0a0a0a]" />
        <div className="px-6 py-5 border-b border-[#f4f4ef]">
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            Team
          </p>
          <p className="text-xs text-[#0a0a0a]/30 mt-0.5">Who&apos;s in the room</p>
        </div>
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[#0a0a0a]/40 leading-relaxed">
            Team details will appear here once the project is underway.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden h-full">
      <div className="h-1 bg-[#0a0a0a]" />
      <div className="px-6 py-5 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
          Team
        </p>
        <p className="text-xs text-[#0a0a0a]/30 mt-0.5">Who&apos;s in the room</p>
      </div>
      <div className="divide-y divide-[#f4f4ef]">
        {team.map((member) => (
          <div key={member.id} className="px-6 py-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0a0a0a] flex items-center justify-center text-xs font-bold text-[#c6f24a] shrink-0">
              {member.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#0a0a0a]">
                {member.name}
              </p>
              <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest mt-0.5">
                {member.role}
              </p>
              {member.bio && (
                <p className="text-xs text-[#0a0a0a]/40 mt-1.5 leading-snug">
                  {member.bio}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
