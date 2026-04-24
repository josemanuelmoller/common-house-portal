"use client";

import { useState, useEffect } from "react";

type Section = { type: "heading" | "paragraph" | "bullet"; text: string };

type MeetingDetail = {
  id: string;
  title: string;
  date: string | null;
  url: string | null;
  platform: string;
  attendees: string[];
  sections: Section[];
};

type Props = {
  meetingId: string;
  children: React.ReactNode; // the trigger element
};

function platformColor(platform: string) {
  if (platform === "Fireflies") return "bg-purple-100 text-purple-700";
  if (platform === "Gmail")     return "bg-red-100 text-red-700";
  return "bg-[#f4f4ef] text-[#0a0a0a]/50";
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function MeetingDetailModal({ meetingId, children }: Props) {
  const [open, setOpen]       = useState(false);
  const [detail, setDetail]   = useState<MeetingDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || detail) return;
    setLoading(true);
    fetch(`/api/meeting-detail/${meetingId}`)
      .then(r => r.json())
      .then(d => { setDetail(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [open, meetingId, detail]);

  return (
    <>
      {/* Trigger */}
      <div onClick={() => setOpen(true)} className="cursor-pointer">
        {children}
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-[#0a0a0a]/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-over panel */}
      <div
        className={`fixed top-0 right-0 h-full z-50 bg-white shadow-2xl transition-transform duration-300 flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ width: "min(520px, 95vw)" }}
      >
        {/* Panel header */}
        <div className="h-1 bg-[#0a0a0a] shrink-0" />
        <div className="px-6 py-5 border-b border-[#f4f4ef] flex items-start justify-between shrink-0">
          <div>
            <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest mb-1">Meeting Detail</p>
            <p className="text-lg font-bold text-[#0a0a0a] leading-tight">
              {loading ? "Cargando..." : detail?.title ?? "—"}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-[#0a0a0a]/30 hover:text-[#0a0a0a] transition-colors text-xl leading-none mt-0.5 shrink-0 ml-4"
          >
            ✕
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-[#0a0a0a]/20 border-t-[#0a0a0a] rounded-full animate-spin" />
            </div>
          )}

          {!loading && detail && (
            <>
              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-widest ${platformColor(detail.platform)}`}>
                  {detail.platform || "Meeting"}
                </span>
                <span className="text-sm text-[#0a0a0a]/50 font-medium">
                  {formatDate(detail.date)}
                </span>
              </div>

              {/* Attendees */}
              {detail.attendees.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest mb-2">Asistentes</p>
                  <div className="flex flex-wrap gap-2">
                    {detail.attendees.map((a, i) => {
                      const words = a.trim().split(/\s+/);
                      const initials = words.length >= 2
                        ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
                        : a.slice(0, 2).toUpperCase();
                      return (
                        <div key={i} className="flex items-center gap-2 bg-[#f4f4ef] rounded-xl px-3 py-1.5">
                          <div className="w-6 h-6 rounded-lg bg-[#0a0a0a] flex items-center justify-center text-[9px] font-bold text-[#c6f24a] shrink-0">
                            {initials}
                          </div>
                          <span className="text-xs font-semibold text-[#0a0a0a]">{a}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Content sections */}
              {detail.sections.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest mb-3">Resumen</p>
                  <div className="space-y-2">
                    {detail.sections.map((s, i) => {
                      if (s.type === "heading") return (
                        <p key={i} className="text-sm font-bold text-[#0a0a0a] mt-4 first:mt-0">{s.text}</p>
                      );
                      if (s.type === "bullet") return (
                        <div key={i} className="flex gap-2">
                          <span className="text-[#c6f24a] bg-[#0a0a0a] rounded-full w-1.5 h-1.5 mt-1.5 shrink-0" />
                          <p className="text-sm text-[#0a0a0a]/70 leading-relaxed">{s.text}</p>
                        </div>
                      );
                      return (
                        <p key={i} className="text-sm text-[#0a0a0a]/70 leading-relaxed">{s.text}</p>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="bg-[#f4f4ef]/50 rounded-xl px-4 py-6 text-center">
                  <p className="text-sm text-[#0a0a0a]/30">Sin contenido procesado en Notion</p>
                </div>
              )}

              {/* Link to source */}
              {detail.url && (
                <a
                  href={detail.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full bg-[#0a0a0a] text-[#c6f24a] text-[10px] font-bold px-4 py-3 rounded-xl uppercase tracking-widest hover:bg-[#0a0a0a]/80 transition-colors"
                >
                  Ver fuente completa →
                </a>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
