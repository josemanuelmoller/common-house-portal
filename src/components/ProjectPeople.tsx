import type { PersonRecord, OrgRecord } from "@/lib/notion";

function PersonInitials({ name, classification }: { name: string; classification: string }) {
  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();

  const isInternal = classification === "Internal";

  return (
    <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
      isInternal ? "bg-[#0a0a0a] text-[#c6f24a]" : "bg-[#f4f4ef] text-[#0a0a0a]"
    }`}>
      {initials}
    </div>
  );
}

function PersonCard({ p }: { p: PersonRecord }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#f4f4ef] last:border-0">
      <PersonInitials name={p.name} classification={p.classification} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#0a0a0a] tracking-tight truncate">{p.name}</p>
        {p.jobTitle && (
          <p className="text-xs text-[#0a0a0a]/40 font-medium truncate">{p.jobTitle}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        {p.roles.slice(0, 1).map(r => (
          <span key={r} className="text-[9px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest bg-[#f4f4ef] px-2 py-0.5 rounded-full">
            {r}
          </span>
        ))}
        {p.email && (
          <a href={`mailto:${p.email}`} className="block text-[10px] text-[#0a0a0a]/25 hover:text-[#0a0a0a]/60 mt-0.5 transition-colors">
            {p.email}
          </a>
        )}
      </div>
    </div>
  );
}

function OrgCard({ o, isPrimary }: { o: OrgRecord; isPrimary?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-[#f4f4ef] last:border-0">
      <div className="w-9 h-9 rounded-xl bg-[#f4f4ef] flex items-center justify-center text-xs font-bold text-[#0a0a0a]/40 shrink-0">
        {o.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#0a0a0a] tracking-tight truncate">{o.name}</p>
        <p className="text-xs text-[#0a0a0a]/40 font-medium">
          {[o.category, o.location].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="text-right shrink-0 flex flex-col items-end gap-1">
        {isPrimary && (
          <span className="text-[9px] font-bold bg-[#c6f24a] text-[#0a0a0a] px-2 py-0.5 rounded-full uppercase tracking-widest">
            Primary
          </span>
        )}
        {o.relationshipStage && (
          <span className="text-[9px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
            {o.relationshipStage}
          </span>
        )}
        {o.website && (
          <a href={o.website} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-[#0a0a0a]/25 hover:text-[#0a0a0a]/60 transition-colors">
            {o.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}
      </div>
    </div>
  );
}

type Props = {
  lead: PersonRecord[];
  team: PersonRecord[];
  primaryOrg: OrgRecord[];
  otherOrgs: OrgRecord[];
};

export function ProjectPeople({ lead, team, primaryOrg, otherOrgs }: Props) {
  const allPeople = [...lead, ...team];
  const chTeam    = allPeople.filter(p => p.classification === "Internal");
  const clients   = allPeople.filter(p => p.classification === "External" && p.roles.includes("Client Contact"));
  const external  = allPeople.filter(p => p.classification === "External" && !p.roles.includes("Client Contact"));
  const allOrgs   = [...primaryOrg, ...otherOrgs];

  const sections = [
    { title: "Common House Team", people: chTeam,  accent: "bg-[#0a0a0a] text-[#c6f24a]" },
    { title: "Client Contacts",   people: clients,  accent: "bg-[#c6f24a] text-[#0a0a0a]" },
    { title: "External Partners", people: external, accent: "bg-[#f4f4ef] text-[#0a0a0a]/60" },
  ].filter(s => s.people.length > 0);

  if (sections.length === 0 && allOrgs.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* People */}
      {sections.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
          <div className="h-1 bg-[#c6f24a]" />
          <div className="px-6 py-4 border-b border-[#f4f4ef]">
            <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">People</p>
          </div>
          <div className="px-6 divide-y divide-[#f4f4ef]">
            {sections.map(s => (
              <div key={s.title} className="py-3">
                <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full inline-block mb-2 ${s.accent}`}>
                  {s.title}
                </span>
                {s.people.map(p => <PersonCard key={p.id} p={p} />)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Organizations */}
      {allOrgs.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
          <div className="h-1 bg-[#c6f24a]" />
          <div className="px-6 py-4 border-b border-[#f4f4ef]">
            <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Organizations</p>
          </div>
          <div className="px-6">
            {primaryOrg.map(o => <OrgCard key={o.id} o={o} isPrimary />)}
            {otherOrgs.map(o => <OrgCard key={o.id} o={o} />)}
          </div>
        </div>
      )}

    </div>
  );
}
