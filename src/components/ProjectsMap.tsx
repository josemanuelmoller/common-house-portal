"use client";

import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Map geography tags → coordinates
const GEO_COORDS: Record<string, [number, number]> = {
  "Global":        [0, 20],
  "LATAM":         [-65, -15],
  "Latin America": [-65, -15],
  "Chile":         [-70.6, -33.4],
  "Costa Rica":    [-84.1, 9.9],
  "México":        [-99.1, 19.4],
  "Mexico":        [-99.1, 19.4],
  "Colombia":      [-74.1, 4.7],
  "Brazil":        [-47.9, -15.8],
  "Brasil":        [-47.9, -15.8],
  "Argentina":     [-64.2, -31.4],
  "Peru":          [-77.0, -12.0],
  "Perú":          [-77.0, -12.0],
  "Europe":        [10, 51],
  "Europa":        [10, 51],
  "Spain":         [-3.7, 40.4],
  "España":        [-3.7, 40.4],
  "UK":            [-0.1, 51.5],
  "France":        [2.3, 48.9],
  "Germany":       [13.4, 52.5],
  "USA":           [-95, 37],
  "Australia":     [134, -25],
  "Asia":          [100, 30],
  "Africa":        [20, 5],
};

type ProjectPin = {
  id: string;
  name: string;
  geography: string[];
};

type Props = {
  projects: ProjectPin[];
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function ProjectsMap({ projects }: Props) {
  // Build markers — one per geography tag per project
  const markers: Array<{ id: string; name: string; coords: [number, number]; initials: string }> = [];

  projects.forEach(p => {
    p.geography.forEach(geo => {
      const coords = GEO_COORDS[geo];
      if (coords) {
        // Avoid duplicate coords — offset slightly if same location
        const existing = markers.filter(m => m.coords[0] === coords[0] && m.coords[1] === coords[1]);
        const offset: [number, number] = existing.length > 0
          ? [coords[0] + existing.length * 3, coords[1] + existing.length * 2]
          : coords;
        markers.push({ id: `${p.id}-${geo}`, name: p.name, coords: offset, initials: getInitials(p.name) });
      }
    });
  });

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#131218]" />
      <div className="px-6 py-4 border-b border-[#EFEFEA]">
        <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Portfolio Map</p>
        <p className="text-sm font-bold text-[#131218] tracking-tight mt-0.5">Active Projects by Location</p>
      </div>
      <div className="bg-[#EFEFEA]/50 px-2 py-2" style={{ height: 320 }}>
        <ComposableMap
          projection="geoMercator"
          projectionConfig={{ scale: 120, center: [0, 20] }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup zoom={1}>
            <Geographies geography={GEO_URL}>
              {({ geographies }) =>
                geographies.map(geo => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="#E0E0D8"
                    stroke="#FFFFFF"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: "none" },
                      hover:   { outline: "none", fill: "#D0D0C8" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {markers.map(m => (
              <Marker key={m.id} coordinates={m.coords}>
                <circle r={14} fill="#131218" stroke="#B2FF59" strokeWidth={2} />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#B2FF59"
                  fontSize={7}
                  fontWeight={700}
                  fontFamily="system-ui"
                >
                  {m.initials}
                </text>
                <title>{m.name}</title>
              </Marker>
            ))}
          </ZoomableGroup>
        </ComposableMap>
      </div>
      {markers.length === 0 && (
        <div className="px-6 py-4 text-center">
          <p className="text-xs text-[#131218]/30">No geography tags on projects</p>
        </div>
      )}
    </div>
  );
}
