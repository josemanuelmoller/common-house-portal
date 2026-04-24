/* Shared sidebar used by all 3 Hall variants */
const { useState } = React;

const sbItems = [
  { group: "Operaciones", items: [
    { name: "The Hall", active: true, count: 3 },
    { name: "The Plan" },
    { name: "Portfolio" },
    { name: "Commercial" },
    { name: "Desks" },
  ]},
  { group: "Red", items: [
    { name: "Residents" },
    { name: "Contacts" },
    { name: "Network" },
  ]},
  { group: "Sistema", items: [
    { name: "Knowledge" },
    { name: "Library" },
    { name: "Control Room" },
    { name: "Living Room" },
    { name: "Curate" },
  ]},
];

function Sidebar() {
  return (
    <aside className="sb">
      <div className="sb-brand">
        <div className="sb-brand-mark">c</div>
        <div className="sb-brand-name">common<b>house</b></div>
      </div>
      {sbItems.map((g, gi) => (
        <React.Fragment key={gi}>
          <div className="sb-group-label">{g.group}</div>
          {g.items.map((it, i) => (
            <div key={i} className={"sb-item" + (it.active ? " active" : "")}>
              <span className="dot-ic" />
              <span>{it.name}</span>
              {it.count && <span className="count">{it.count}</span>}
            </div>
          ))}
        </React.Fragment>
      ))}
      <div className="sb-foot">
        <div className="sb-avatar">JM</div>
        <div className="sb-foot-txt">
          <b>Jose Manuel Moller</b>
          <span>josemanuelmoller@…</span>
        </div>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;
