"use client";

import { useState } from "react";

type Props = {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
};

export function CollapsibleSection({ title, children, defaultOpen = false, count }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <span className="text-[10px] font-bold text-[#0a0a0a]/30 uppercase tracking-widest">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-[10px] font-bold bg-[#0a0a0a]/8 text-[#0a0a0a]/40 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
        <span className={`ml-auto text-[#0a0a0a]/25 group-hover:text-[#0a0a0a]/50 transition-all text-xs ${open ? "rotate-180" : "rotate-0"}`}>
          ▾
        </span>
      </button>
      <div className={open ? "block" : "hidden"}>
        {children}
      </div>
    </div>
  );
}
