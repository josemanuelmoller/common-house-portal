"use client";

import { useEffect, useMemo, useState } from "react";

type Node = {
  email:   string;
  name:    string;
  classes: string[];
  top:     string;
  touches: number;
  ring:    number;
};
type Edge = { a: string; b: string; weight: number };

type Placed = Node & { x: number; y: number };

const W = 960;
const H = 720;
const CX = W / 2;
const CY = H / 2;
// Ring radii (outer-to-inner)
const RING_R: Record<number, number> = { 1: 90, 2: 200, 3: 300, 4: 380 };

const TOP_COLOR: Record<string, string> = {
  Family:             "#fde68a",
  Friend:             "#fde68a",
  "Personal Service": "#fde68a",
  VIP:                "#B2FF59",
  Client:             "#c8f55a",
  Investor:           "#a78bfa",
  Funder:             "#f472b6",
  Portfolio:          "#fbbf24",
  Partner:            "#7dd3fc",
  Team:               "#111111",
  Vendor:             "#9ca3af",
  External:           "#cbd5e1",
};

function layout(nodes: Node[]): Placed[] {
  // Group nodes by ring, then distribute angularly.
  const byRing = new Map<number, Node[]>();
  for (const n of nodes) {
    const r = n.ring || 4;
    const arr = byRing.get(r) ?? [];
    arr.push(n);
    byRing.set(r, arr);
  }
  const out: Placed[] = [];
  for (const [ring, arr] of byRing.entries()) {
    const r = RING_R[ring] ?? 380;
    // Sort within ring by top class so same-class nodes cluster
    arr.sort((a, b) => (a.top || "").localeCompare(b.top || ""));
    const n = arr.length;
    const ringOffset = ring * 0.37; // rotate each ring slightly so nodes don't overlap radially
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI + ringOffset;
      out.push({
        ...arr[i],
        x: CX + r * Math.cos(angle),
        y: CY + r * Math.sin(angle),
      });
    }
  }
  return out;
}

export function NetworkGraph() {
  const [data,   setData]   = useState<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const [error,  setError]  = useState<string | null>(null);
  const [hover,  setHover]  = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/hall/network", { credentials: "include" });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || j?.ok === false) { setError(j?.error ?? `HTTP ${r.status}`); return; }
        setData({ nodes: j.nodes ?? [], edges: j.edges ?? [] });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const placed = useMemo(() => data ? layout(data.nodes) : [], [data]);
  const byEmail = useMemo(() => {
    const m = new Map<string, Placed>();
    for (const p of placed) m.set(p.email, p);
    return m;
  }, [placed]);

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!data) return m;
    for (const e of data.edges) {
      if (!m.has(e.a)) m.set(e.a, new Set());
      if (!m.has(e.b)) m.set(e.b, new Set());
      m.get(e.a)!.add(e.b);
      m.get(e.b)!.add(e.a);
    }
    return m;
  }, [data]);

  if (error) {
    return <div className="bg-white border border-[#e4e4dd] rounded-2xl px-6 py-8">
      <p className="text-[12px] text-red-600">Error loading network: {error}</p>
    </div>;
  }
  if (!data) {
    return <div className="bg-white border border-[#e4e4dd] rounded-2xl px-6 py-8">
      <p className="text-[12px] text-black/40">Computing network from calendar history…</p>
    </div>;
  }
  if (data.nodes.length === 0) {
    return <div className="bg-white border border-[#e4e4dd] rounded-2xl px-6 py-8">
      <p className="text-[12px] text-black/40">Not enough classified contacts with co-attendance yet. Tag more contacts in Control Room → Contacts.</p>
    </div>;
  }

  const isDimmed = (email: string): boolean => {
    if (!hover) return false;
    if (hover === email) return false;
    const adj = adjacency.get(hover);
    return !(adj && adj.has(email));
  };

  const edgeVisible = (e: Edge): number => {
    if (!hover) return 0.25;
    if (e.a === hover || e.b === hover) return 0.9;
    return 0.05;
  };

  // Build unique class legend
  const legendClasses = [...new Set(data.nodes.map(n => n.top))].sort();

  return (
    <div className="font-['Inter']">
      <div className="relative mx-auto bg-white" style={{ width: W, maxWidth: "100%" }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="max-w-full h-auto"
             style={{ overflow: "visible" }}>
          {/* Self node at center */}
          <circle cx={CX} cy={CY} r={26} fill="#111" />
          <text x={CX} y={CY + 4} textAnchor="middle" fontSize="12" fontWeight="800"
                fill="#fff" letterSpacing="-0.3" fontFamily="Inter">Jose</text>

          {/* Edges */}
          {data.edges.map(e => {
            const pa = byEmail.get(e.a);
            const pb = byEmail.get(e.b);
            if (!pa || !pb) return null;
            return (
              <line key={`${e.a}-${e.b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                    stroke="#cccccc" strokeWidth={Math.min(3, Math.max(0.6, e.weight * 0.35))}
                    opacity={edgeVisible(e)}
                    style={{ transition: "opacity 0.2s" }} />
            );
          })}

          {/* Center-to-first-ring faint spokes for visual anchoring */}
          {placed.filter(p => p.ring <= 2).map(p => (
            <line key={`spoke-${p.email}`} x1={CX} y1={CY} x2={p.x} y2={p.y}
                  stroke="#eeeeee" strokeWidth={0.6}
                  opacity={hover && hover !== p.email ? 0 : 0.6} />
          ))}
        </svg>

        {/* Bubbles as HTML overlay so text & interactions feel identical to the reference diagram */}
        <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
          {placed.map(p => {
            const dimmed = isDimmed(p.email);
            const color  = TOP_COLOR[p.top] ?? "#f0f0f0";
            const textDark = p.top !== "Team";
            return (
              <div key={p.email}
                   style={{
                     position: "absolute",
                     left: p.x - 32,
                     top:  p.y - 32,
                     width: 64, height: 64,
                     pointerEvents: "auto",
                     transition: "opacity 0.2s, transform 0.2s",
                     opacity: dimmed ? 0.1 : 1,
                     transform: hover === p.email ? "scale(1.1)" : "scale(1)",
                     zIndex: hover === p.email ? 10 : 1,
                   }}
                   onMouseEnter={() => setHover(p.email)}
                   onMouseLeave={() => setHover(h => h === p.email ? null : h)}
                   title={`${p.name} · ${p.classes.join(", ")} · ${p.touches} touches`}>
                <div style={{
                  width: 64, height: 64, borderRadius: "50%",
                  background: color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 800, letterSpacing: -0.2,
                  color: textDark ? "#333" : "#fff",
                  textAlign: "center", lineHeight: 1.1,
                  padding: 4, cursor: "pointer",
                  userSelect: "none",
                }}>
                  {shortName(p.name)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap gap-3 justify-center max-w-3xl mx-auto">
        {legendClasses.map(cls => (
          <div key={cls} className="flex items-center gap-2">
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: TOP_COLOR[cls] ?? "#f0f0f0" }} />
            <span className="text-[10px] font-bold uppercase tracking-[1.5px] text-black/70">{cls}</span>
          </div>
        ))}
      </div>

      {/* Hover detail strip */}
      <div className="mt-4 text-center min-h-[28px]">
        {hover && byEmail.get(hover) && (() => {
          const n = byEmail.get(hover)!;
          const neighbors = adjacency.get(hover)?.size ?? 0;
          return (
            <p className="text-[11px] text-black/70">
              <strong className="font-bold text-black">{n.name}</strong>
              <span className="text-black/40"> · </span>
              {n.classes.join(" · ")}
              <span className="text-black/40"> · </span>
              {n.touches} touches · {neighbors} direct ties
            </p>
          );
        })()}
      </div>
    </div>
  );
}

function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 10);
  const first = parts[0];
  const last  = parts[parts.length - 1];
  if (first.length + last.length + 1 <= 12) return `${first} ${last[0]}.`;
  return first.slice(0, 10);
}
