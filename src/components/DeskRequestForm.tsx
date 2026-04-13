"use client";

import { useState } from "react";

type DeskRequestFormProps = {
  deskType: "design" | "comms";
  contentTypes: string[];
  channelOrProjectOptions: string[];
  channelOrProjectLabel: string;
};

export default function DeskRequestForm({
  deskType,
  contentTypes,
  channelOrProjectOptions,
  channelOrProjectLabel,
}: DeskRequestFormProps) {
  const [selectedType, setSelectedType] = useState(contentTypes[0]);
  const [selectedOption, setSelectedOption] = useState(channelOrProjectOptions[0]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit() {
    if (!description.trim()) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/desk-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deskType,
          contentType: selectedType,
          description,
          ...(deskType === "comms" ? { channel: selectedOption } : { project: selectedOption }),
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setStatus("success");
      setDescription("");
      setTimeout(() => setStatus("idle"), 3000);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <div className="px-5 py-4 flex flex-col gap-4">
      <div>
        <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">Tipo</p>
        <div className="flex flex-wrap gap-1.5">
          {contentTypes.map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                selectedType === t
                  ? "bg-[#131218] text-white border-[#131218]"
                  : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/40 hover:text-[#131218]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">
          {deskType === "comms" ? "Ángulo / contexto" : "Descripción"}
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full h-24 border border-[#E0E0D8] rounded-lg px-3 py-2.5 text-xs text-[#131218] bg-[#EFEFEA] resize-none outline-none focus:border-[#131218]/40 placeholder-[#131218]/20"
          placeholder={
            deskType === "comms"
              ? "Qué queremos decir, a quién y en qué tono..."
              : "Qué necesitas, para quién y cuándo..."
          }
        />
      </div>

      <div>
        <p className="text-[9px] font-bold tracking-[1.5px] uppercase text-[#131218]/30 mb-2">
          {channelOrProjectLabel}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {channelOrProjectOptions.map((opt) => (
            <button
              key={opt}
              onClick={() => setSelectedOption(opt)}
              className={`text-[10px] font-semibold px-3 py-1.5 rounded-full border transition-all ${
                selectedOption === opt
                  ? "bg-[#131218] text-white border-[#131218]"
                  : "border-[#E0E0D8] text-[#131218]/50 hover:border-[#131218]/40 hover:text-[#131218]"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={status === "loading" || !description.trim()}
        className={`w-full text-xs font-bold py-2.5 rounded-xl transition-all ${
          status === "success"
            ? "bg-[#B2FF59] text-[#131218]"
            : status === "error"
            ? "bg-red-100 text-red-700"
            : status === "loading"
            ? "bg-[#131218]/40 text-white cursor-not-allowed"
            : deskType === "comms"
            ? "bg-[#131218] text-white hover:bg-[#131218]/80"
            : "bg-[#B2FF59] text-[#131218] hover:opacity-85"
        }`}
      >
        {status === "success"
          ? "✓ Draft en camino — revisa Notion en ~30s"
          : status === "error"
          ? "Error — intenta de nuevo"
          : status === "loading"
          ? "Enviando..."
          : "Enviar solicitud →"}
      </button>
    </div>
  );
}
