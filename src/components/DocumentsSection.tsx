import type { DocumentItem } from "@/lib/notion";

function platformIcon(platform: string): string {
  if (platform === "Google Drive") return "📁";
  if (platform === "Fireflies")    return "🎙";
  if (platform === "Gmail")        return "✉️";
  if (platform === "Upload")       return "📎";
  return "📄";
}

function platformLabel(platform: string): string {
  return platform || "Document";
}

type Props = {
  documents: DocumentItem[];
  folderUrl?: string;         // top-level project Drive folder
  folderLabel?: string;
};

export function DocumentsSection({ documents, folderUrl, folderLabel = "Project Folder" }: Props) {
  const hasAnything = folderUrl || documents.length > 0;
  if (!hasAnything) return null;

  return (
    <div className="bg-white rounded-2xl border border-[#E0E0D8] overflow-hidden">
      <div className="h-1 bg-[#B2FF59]" />

      {/* Header */}
      <div className="px-6 py-4 border-b border-[#EFEFEA] flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">Documents</p>
          <p className="text-sm font-bold text-[#131218] tracking-tight mt-0.5">Project Files</p>
        </div>
        {folderUrl && (
          <a
            href={folderUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#131218] text-[#B2FF59] text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest hover:bg-[#131218]/80 transition-colors"
          >
            📁 {folderLabel} →
          </a>
        )}
      </div>

      {/* Individual documents */}
      {documents.length > 0 ? (
        <div className="divide-y divide-[#EFEFEA]">
          {documents.map(doc => (
            <a
              key={doc.id}
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 px-6 py-4 hover:bg-[#EFEFEA]/50 transition-colors group"
            >
              {/* Icon */}
              <div className="w-9 h-9 bg-[#EFEFEA] rounded-xl flex items-center justify-center text-lg shrink-0">
                {platformIcon(doc.platform)}
              </div>

              {/* Title + platform */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#131218] truncate group-hover:text-[#131218]">
                  {doc.title}
                </p>
                <p className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest mt-0.5">
                  {platformLabel(doc.platform)}
                  {doc.sourceDate && (
                    <span className="ml-2 font-normal normal-case tracking-normal">
                      · {new Date(doc.sourceDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  )}
                </p>
              </div>

              {/* Arrow */}
              <span className="text-[#131218]/20 group-hover:text-[#131218]/60 transition-colors text-sm shrink-0">
                →
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-[#131218]/30">No documents linked yet.</p>
          <p className="text-xs text-[#131218]/20 mt-1">
            Add documents in Notion → CH Sources, Source Type = Document
          </p>
        </div>
      )}

      {documents.length > 0 && (
        <div className="px-6 py-3 border-t border-[#EFEFEA]">
          <p className="text-[10px] text-[#131218]/25 font-bold uppercase tracking-widest">
            {documents.length} document{documents.length !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}
