/**
 * Skeleton de la sala — se muestra durante la navegación server-side
 * (p.ej. al cambiar de sala desde el acordeón). Espeja el shell: sidebar
 * claro a la izquierda + cabecera y tarjetas en el main.
 */
export default function RoomLoading() {
  const line = "var(--hall-line)";
  const paper = "var(--hall-paper-0)";
  const paper1 = "var(--hall-paper-1)";
  const bar = (w: number | string, h = 12, mt = 0) => (
    <div style={{ width: w, height: h, borderRadius: 6, marginTop: mt, background: "var(--hall-paper-2)", opacity: 0.7 }} />
  );
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: paper, fontFamily: "var(--font-hall-sans), sans-serif" }}>
      {/* sidebar */}
      <aside style={{ width: 248, flex: "none", background: paper1, borderRight: `1px solid ${line}`, padding: "16px 16px" }}>
        {bar(120, 20)}
        <div style={{ marginTop: 26 }}>
          {Array.from({ length: 8 }).map((_, i) => <div key={i}>{bar(i % 3 === 0 ? "70%" : "85%", 14, 12)}</div>)}
        </div>
      </aside>
      {/* main */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <div style={{ padding: "15px 26px", borderBottom: `1px solid ${line}` }}>{bar(180, 20)}</div>
        <div style={{ padding: "22px 26px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 11 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: paper, border: `1.5px solid ${line}`, borderRadius: 12, padding: "15px 16px" }}>
              {bar(60, 10)}{bar(48, 26, 12)}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
