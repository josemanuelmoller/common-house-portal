"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { SignOutButton } from "@clerk/nextjs";
import { BrandLogo } from "@/components/BrandLogo";

/**
 * El cromo del lobby, calcado del de la sala de trabajo (`RoomClient`): app
 * enmarcada + riel lateral colapsable + header pegajoso con la sección activa.
 *
 * Por qué el lobby navega por scroll y la sala por secciones: la sala es una
 * superficie de trabajo donde vas a un lugar concreto; el lobby es una historia
 * que se lee de corrido, y partirla en ocho pantallas la rompe. El riel navega
 * dentro de la misma página y se ilumina con la sección visible.
 *
 * Señales — dos, y ninguna es un recuento:
 *   · punto lime  → cambió algo desde tu última visita (todavía sin cablear;
 *                   ver `signal: "new"`, que hoy nadie manda)
 *   · badge ámbar → te toca a ti
 * Un recuento de cuántas cosas hay es inventario: si abrís la sección igual las
 * vas a contar. Sólo se marca lo que pide atención.
 */

export type LobbyNavItem = {
  id: string;
  label: string;
  icon: string;
  /** Número que pide acción del cliente. Sin esto, el ítem va limpio. */
  alert?: number;
  /** Cambió desde su última visita. */
  isNew?: boolean;
};

type Props = {
  orgName: string;
  roomLabel: string;
  stage: string;
  nav: LobbyNavItem[];
  /** Secciones que existen al cerrar el trato — adelanto en gris, sin candados. */
  soon: Array<{ label: string; icon: string }>;
  todo: { label: string; targetId: string } | null;
  adminPreview: boolean;
  initials: string[];
  children: ReactNode;
};

const ICONS: Record<string, ReactNode> = {
  overview: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  heard: <path d="M13.5 9.2c0 .9-.7 1.6-1.6 1.6H6.4L3.2 13.2V4.4c0-.9.7-1.6 1.6-1.6h7.1c.9 0 1.6.7 1.6 1.6z" />,
  proposal: <><path d="M8 2.5 14 5.5 8 8.5 2 5.5z" /><path d="M2 8.5 8 11.5 14 8.5" /><path d="M2 11 8 14 14 11" /></>,
  plan: <><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11" /><path d="M5.5 2v3M10.5 2v3" /></>,
  together: <><circle cx="8" cy="8" r="5.5" /><path d="M8 4.8V8l2.2 1.3" /></>,
  agreements: <><path d="M4 14V2.5" /><path d="M4 3.2h7.5l-1.7 2.4 1.7 2.4H4" /></>,
  documents: <path d="M2.5 5.4c0-.8.6-1.4 1.4-1.4h2.1l1.4 1.5h4.7c.8 0 1.4.6 1.4 1.4v4.9c0 .8-.6 1.4-1.4 1.4H3.9c-.8 0-1.4-.6-1.4-1.4z" />,
  admin: <><circle cx="8" cy="8" r="5.5" /><path d="M8 7.4v3.3M8 5.2v.1" /></>,
  mine: <path d="M8 2.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6L8 10.7 4.8 12.4l.6-3.6L2.8 6.3l3.6-.5z" />,
  deliverables: <><path d="M8 2.5 14 5.5 8 8.5 2 5.5z" /><path d="M2 8.5 8 11.5 14 8.5" /><path d="M2 11 8 14 14 11" /></>,
  tasks: <><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><path d="M5.4 8.2 7.2 10 10.7 6" /></>,
  decisions: <><circle cx="8" cy="8" r="5.5" /><circle cx="8" cy="8" r="1.8" /></>,
};

function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true"
      style={{ width: 16, height: 16, stroke: "currentColor", fill: "none", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", display: "block" }}>
      {ICONS[name] ?? ICONS.overview}
    </svg>
  );
}

const AV_COLORS = ["#3B5BDB", "#0C8599", "#9C36B5"];

export function LobbyShell({ orgName, roomLabel, stage, nav, soon, todo, adminPreview, initials, children }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(nav[0]?.id ?? "");
  const [mini, setMini] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    try { setMini(window.localStorage.getItem("lobby.sidebar.mini") === "1"); } catch {}
    const mq = () => setIsMobile(window.innerWidth < 900);
    mq();
    window.addEventListener("resize", mq);
    return () => window.removeEventListener("resize", mq);
  }, []);

  // Scroll-spy: la sección activa es la última cuyo borde superior ya pasó la
  // línea de lectura. Al final del scroll gana la última, que si no nunca se
  // ilumina porque no alcanza a cruzarla.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const spy = () => {
      const line = el.getBoundingClientRect().top + 90;
      let current = nav[0]?.id ?? "";
      for (const item of nav) {
        const node = document.getElementById(item.id);
        if (node && node.getBoundingClientRect().top <= line) current = item.id;
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) current = nav[nav.length - 1]?.id ?? current;
      setActive(current);
    };
    spy();
    el.addEventListener("scroll", spy, { passive: true });
    return () => el.removeEventListener("scroll", spy);
  }, [nav]);

  function go(id: string) {
    document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    if (isMobile) setDrawer(false);
  }
  function toggleMini() {
    setMini((v) => {
      const next = !v;
      try { window.localStorage.setItem("lobby.sidebar.mini", next ? "1" : "0"); } catch {}
      return next;
    });
  }

  const showLabels = isMobile || !mini;
  const asideStyle: CSSProperties = {
    width: isMobile ? 268 : mini ? 66 : 248,
    flex: "none", background: "var(--lobby-paper)", borderRight: "1px solid var(--lobby-line)",
    display: "flex", flexDirection: "column", minHeight: 0, zIndex: 50, transition: "width .18s ease",
    ...(isMobile
      ? { position: "fixed", top: 0, left: 0, height: "100vh", transform: drawer ? "translateX(0)" : "translateX(-110%)", boxShadow: drawer ? "0 10px 40px rgba(0,0,0,.28)" : "none" }
      : {}),
  };
  const activeLabel = nav.find((n) => n.id === active)?.label ?? "";

  return (
    <div style={{ minHeight: "100vh", background: "var(--lobby-outer)", color: "var(--lobby-ink)", fontFamily: "var(--font-hall-sans), 'Inter Tight', sans-serif", padding: isMobile ? 0 : "22px 16px 40px" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "flex", height: isMobile ? "100vh" : "calc(100vh - 62px)", background: "var(--lobby-bg)", border: isMobile ? "none" : "1.5px solid var(--lobby-line)", borderRadius: isMobile ? 0 : 16, overflow: "hidden" }}>

        {isMobile && !drawer && (
          <button onClick={() => setDrawer(true)} aria-label="Abrir navegación"
            style={{ position: "fixed", top: 12, left: 12, zIndex: 40, width: 40, height: 40, borderRadius: 10, background: "var(--lobby-paper)", border: "1px solid var(--lobby-line)", cursor: "pointer", fontSize: 17 }}>≡</button>
        )}
        {isMobile && drawer && (
          <div onClick={() => setDrawer(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 45 }} />
        )}

        <aside style={asideStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: showLabels ? "16px 16px 14px" : "16px 0 14px", justifyContent: showLabels ? "flex-start" : "center", borderBottom: "1px solid var(--lobby-line)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/isotipo-vivo.svg" alt="Common House" style={{ height: 26, width: "auto", display: "block", flexShrink: 0 }} />
            {showLabels && <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-.2px" }}>Common House</span>}
          </div>

          <nav style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
            {showLabels && <div className="lobby-label" style={{ padding: "0 16px 8px" }}>Lobby</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: showLabels ? "7px 12px" : "8px 0", margin: showLabels ? "2px 8px 4px" : "2px 0 6px", borderRadius: 8, background: showLabels ? "var(--lobby-bg)" : "transparent", justifyContent: showLabels ? "flex-start" : "center" }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: "var(--lobby-lime)", flexShrink: 0 }} />
              {showLabels && (
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 11, fontWeight: 800, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roomLabel}</b>
                  <small style={{ fontSize: 9, color: "var(--lobby-muted)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stage}</small>
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: showLabels ? "2px 8px" : "2px 0" }}>
              {nav.map((item) => {
                const on = active === item.id;
                return (
                  <button key={item.id} onClick={() => go(item.id)} title={item.label}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", position: "relative",
                      justifyContent: showLabels ? "flex-start" : "center", padding: showLabels ? 8 : "10px 0", borderRadius: 8,
                      cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, fontWeight: 700, border: 0,
                      background: on ? "var(--lobby-lime-paper)" : "transparent", color: on ? "var(--lobby-ink)" : "rgba(0,0,0,.78)" }}>
                    <span style={{ width: 16, height: 16, flexShrink: 0, display: "grid", placeItems: "center" }}><Icon name={item.icon} /></span>
                    {showLabels && <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>}
                    {item.isNew && (
                      <span title="Nuevo desde tu última visita" aria-label="Nuevo"
                        style={{ width: 6, height: 6, borderRadius: 999, background: "var(--lobby-lime-ink)", flexShrink: 0, ...(showLabels ? {} : { position: "absolute", top: 8, right: 19 }) }} />
                    )}
                    {item.alert != null && (
                      <span title="Te toca responder"
                        style={{ fontSize: 8.5, fontWeight: 800, background: "var(--lobby-alert)", color: "#fff", padding: showLabels ? "1px 6px" : 0, borderRadius: showLabels ? 8 : 999, flexShrink: 0,
                          ...(showLabels ? {} : { position: "absolute", top: 7, right: 17, width: 8, height: 8, fontSize: 0, boxShadow: "0 0 0 2px var(--lobby-paper)" }) }}>{item.alert}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {soon.length > 0 && (
              <div style={{ marginTop: 16 }}>
                {showLabels && <div className="lobby-label" style={{ padding: "0 16px 8px" }}>Sala de trabajo</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: showLabels ? "2px 8px" : "2px 0" }}>
                  {soon.map((s) => (
                    <div key={s.label} title={`${s.label} — al arrancar el trabajo`}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: showLabels ? 8 : "10px 0", borderRadius: 8, fontSize: 11.5, fontWeight: 600, color: "rgba(0,0,0,.26)", justifyContent: showLabels ? "flex-start" : "center" }}>
                      <span style={{ width: 16, height: 16, flexShrink: 0, display: "grid", placeItems: "center" }}><Icon name={s.icon} /></span>
                      {showLabels && <span>{s.label}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </nav>

          <div style={{ borderTop: "1px solid var(--lobby-line)", padding: showLabels ? "10px 14px" : "10px 0", display: "flex", alignItems: "center", justifyContent: showLabels ? "space-between" : "center", gap: 10 }}>
            <SignOutButton>
              <button type="button" style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: "var(--lobby-muted)", background: "transparent", border: 0, cursor: "pointer" }}>
                {showLabels ? "Salir →" : "→"}
              </button>
            </SignOutButton>
            {!isMobile && (
              <button onClick={toggleMini} aria-label={mini ? "Expandir" : "Colapsar"} title={mini ? "Expandir" : "Colapsar"}
                style={{ width: 26, height: 26, borderRadius: 7, border: "1px solid var(--lobby-line)", background: "var(--lobby-paper)", color: "var(--lobby-muted)", cursor: "pointer", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 12 }}>
                {mini ? "›" : "‹"}
              </button>
            )}
          </div>
        </aside>

        <main style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <header style={{ display: "flex", alignItems: "center", gap: 10, padding: isMobile ? "12px 16px 12px 60px" : "12px 20px", borderBottom: "1.5px solid var(--lobby-line)", background: "var(--lobby-bg)", flexWrap: "wrap", flexShrink: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(0,0,0,.3)" }}>Common House × {orgName.toUpperCase()}</div>
              <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-.4px", margin: "1px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeLabel}</h2>
            </div>
            <span style={{ flex: 1 }} />
            {adminPreview && <span className="hall-chip-dark">Admin preview</span>}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".3px", textTransform: "uppercase", padding: "2px 8px", borderRadius: 999, background: "var(--lobby-lime)", color: "#000", whiteSpace: "nowrap" }}>{stage}</span>
            {!isMobile && initials.length > 0 && (
              <div style={{ display: "flex" }}>
                {initials.slice(0, 3).map((ini, i) => (
                  <span key={ini + i} style={{ width: 26, height: 26, borderRadius: "50%", marginLeft: i ? -6 : 0, border: "2px solid var(--lobby-bg)", display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: "#fff", background: AV_COLORS[i % AV_COLORS.length] }}>{ini}</span>
                ))}
              </div>
            )}
          </header>

          {todo && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: "1.5px solid var(--lobby-line)", background: "var(--lobby-lime-wash)", flexShrink: 0 }}>
              <span className="lobby-label" style={{ color: "var(--lobby-lime-ink)", flex: "none" }}>Te toca</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{todo.label}</span>
              <span style={{ flex: 1 }} />
              <button className="lobby-btn-go" style={{ flex: "none" }} onClick={() => go(todo.targetId)}>Ir al acuerdo →</button>
            </div>
          )}

          <div ref={scroller} style={{ padding: 20, flex: 1, overflowY: "auto", minHeight: 0 }}>{children}</div>
        </main>
      </div>
    </div>
  );
}
