import { PromoteButton } from "./PromoteButton";

export type LandscapeRow = {
  id: string;
  solution_name: string;
  organization_name: string;
  website: string | null;
  description: string | null;
  solution_category: string | null;
  sub_category: string | null;
  waste_types: string[] | null;
  stage: string | null;
  hq_country: string | null;
  active_regions: string[] | null;
  status: string | null;
  year_founded: number | null;
  organization_id: string | null;
  channels: string[] | null;
  employees_band: string | null;
};

const headCls = "text-[10px] uppercase tracking-[0.06em] py-2 px-3 text-left";
const headStyle: React.CSSProperties = {
  fontFamily: "var(--font-hall-mono)",
  color: "var(--hall-muted-2)",
  borderBottom: "1px solid var(--hall-line-strong)",
};

const cellCls = "py-3 px-3 align-top text-[12px]";
const cellStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--hall-line-soft)",
  color: "var(--hall-ink-0)",
};

export function LandscapeTable({ rows }: { rows: LandscapeRow[] }) {
  if (rows.length === 0) {
    return (
      <p
        className="text-[12px] py-6 italic"
        style={{ color: "var(--hall-muted-2)" }}
      >
        No rows match the current filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th className={headCls} style={headStyle}>Solution / Org</th>
            <th className={headCls} style={headStyle}>Category</th>
            <th className={headCls} style={headStyle}>Stage</th>
            <th className={headCls} style={headStyle}>HQ</th>
            <th className={headCls} style={headStyle}>Founded</th>
            <th className={headCls} style={headStyle}>Status</th>
            <th className={headCls} style={headStyle}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className={cellCls} style={cellStyle}>
                <div className="flex flex-col gap-0.5 max-w-xs">
                  <span style={{ fontWeight: 600 }}>{r.solution_name}</span>
                  <span
                    className="text-[10.5px]"
                    style={{ color: "var(--hall-muted-2)" }}
                  >
                    {r.organization_name}
                    {r.website && (
                      <>
                        {" · "}
                        <a
                          href={r.website}
                          target="_blank"
                          rel="noreferrer"
                          className="underline"
                          style={{ color: "var(--hall-muted-2)" }}
                        >
                          ↗
                        </a>
                      </>
                    )}
                  </span>
                  {r.description && (
                    <span
                      className="text-[10.5px] mt-1 leading-snug"
                      style={{ color: "var(--hall-muted-3)" }}
                      title={r.description}
                    >
                      {r.description.length > 140
                        ? r.description.slice(0, 140) + "…"
                        : r.description}
                    </span>
                  )}
                </div>
              </td>
              <td className={cellCls} style={cellStyle}>
                <div className="flex flex-col gap-0.5">
                  <span>{r.solution_category ?? "—"}</span>
                  {r.sub_category && (
                    <span
                      className="text-[10.5px]"
                      style={{ color: "var(--hall-muted-3)" }}
                    >
                      {r.sub_category}
                    </span>
                  )}
                </div>
              </td>
              <td className={cellCls} style={cellStyle}>
                <span
                  className="text-[10.5px]"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  {(r.stage ?? "—").replace(/^\d-/, "")}
                </span>
              </td>
              <td className={cellCls} style={cellStyle}>
                <div className="flex flex-col gap-0.5">
                  <span>{r.hq_country ?? "—"}</span>
                  {r.active_regions && r.active_regions.length > 0 && (
                    <span
                      className="text-[10.5px]"
                      style={{ color: "var(--hall-muted-3)" }}
                    >
                      {r.active_regions.join(", ")}
                    </span>
                  )}
                </div>
              </td>
              <td className={cellCls} style={cellStyle}>
                <span
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    color: "var(--hall-muted-2)",
                  }}
                >
                  {r.year_founded ?? "—"}
                </span>
              </td>
              <td className={cellCls} style={cellStyle}>
                <span
                  className="text-[10.5px] px-1.5 py-0.5"
                  style={{
                    fontFamily: "var(--font-hall-mono)",
                    border: "1px solid var(--hall-line-strong)",
                    borderRadius: 2,
                    color:
                      r.status === "Active"
                        ? "var(--hall-ink-0)"
                        : "var(--hall-muted-3)",
                  }}
                >
                  {(r.status ?? "—").toUpperCase()}
                </span>
              </td>
              <td className={cellCls} style={cellStyle}>
                <PromoteButton
                  landscapeId={r.id}
                  alreadyPromoted={!!r.organization_id}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
