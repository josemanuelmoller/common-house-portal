"use client";

import { useState, useRef, useTransition } from "react";
import { DEFAULT_FOLDERS, FolderName } from "@/lib/drive-constants";

type UploadedFile = {
  name: string;
  url: string;
  folder: string;
};

type Props = {
  onUploaded?: (file: UploadedFile) => void;
};

const folderIcons: Record<string, string> = {
  "💰 Finanzas":       "$",
  "📋 Documentación":  "▤",
  "📊 Presentaciones": "◳",
  "🎨 Multimedia":     "◈",
};

export function UploadZone({ onUploaded }: Props) {
  const [selectedFolder, setSelectedFolder] = useState<FolderName>(DEFAULT_FOLDERS[0].name);
  const [dragOver, setDragOver]             = useState(false);
  const [isPending, startTransition]        = useTransition();
  const [error, setError]                   = useState<string | null>(null);
  const [uploaded, setUploaded]             = useState<UploadedFile | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setError(null);
    setUploaded(null);

    startTransition(async () => {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", selectedFolder);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        return;
      }

      setUploaded(data.file);
      onUploaded?.(data.file);
    });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = "";
  }

  return (
    <div className="bg-white rounded-2xl border border-[#e4e4dd] overflow-hidden">
      <div className="h-1 bg-[#0a0a0a]" />
      <div className="px-6 py-4 border-b border-[#f4f4ef]">
        <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">Upload Document</p>
        <p className="text-sm font-bold text-[#0a0a0a] tracking-tight mt-0.5">Share a file with Common House</p>
      </div>

      <div className="px-6 py-5 space-y-4">

        {/* Folder selector */}
        <div>
          <p className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest mb-2">Save to folder</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DEFAULT_FOLDERS.map(f => (
              <button
                key={f.name}
                onClick={() => setSelectedFolder(f.name)}
                className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-center transition-all ${
                  selectedFolder === f.name
                    ? "border-[#0a0a0a] bg-[#0a0a0a] text-white"
                    : "border-[#e4e4dd] hover:border-[#0a0a0a]/30 text-[#0a0a0a]/50"
                }`}
              >
                <span className="text-xl">{folderIcons[f.name]}</span>
                <span className="text-[10px] font-bold uppercase tracking-wide leading-tight">
                  {f.name.replace(/^\S+\s/, "")}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-all ${
            dragOver
              ? "border-[#c6f24a] bg-[#c6f24a]/10"
              : isPending
              ? "border-[#0a0a0a]/20 bg-[#f4f4ef]/50 cursor-wait"
              : "border-[#e4e4dd] hover:border-[#0a0a0a]/30 hover:bg-[#f4f4ef]/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={onFileChange}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.mp4,.mov,.zip"
          />

          {isPending ? (
            <>
              <div className="w-8 h-8 border-2 border-[#0a0a0a]/20 border-t-[#0a0a0a] rounded-full animate-spin" />
              <p className="text-sm font-semibold text-[#0a0a0a]/50">Uploading to {selectedFolder}...</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 bg-[#f4f4ef] rounded-xl flex items-center justify-center text-xl">
                {folderIcons[selectedFolder]}
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-[#0a0a0a]">
                  Drop file here or <span className="underline">browse</span>
                </p>
                <p className="text-xs text-[#0a0a0a]/30 mt-1">
                  PDF, Word, Excel, PowerPoint, images, video · Max 20MB
                </p>
              </div>
            </>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
            <span>↯</span> {error}
          </div>
        )}

        {/* Success */}
        {uploaded && (
          <div className="flex items-center gap-3 bg-[#c6f24a]/20 border border-[#c6f24a] rounded-xl px-4 py-3">
            <span className="text-lg">{folderIcons[uploaded.folder] ?? "▤"}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-[#0a0a0a] truncate">✓ {uploaded.name}</p>
              <p className="text-xs text-[#0a0a0a]/40">Subido a {uploaded.folder}</p>
            </div>
            <a
              href={uploaded.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-bold text-[#0a0a0a]/50 hover:text-[#0a0a0a] uppercase tracking-widest transition-colors"
            >
              Ver →
            </a>
          </div>
        )}

      </div>
    </div>
  );
}
