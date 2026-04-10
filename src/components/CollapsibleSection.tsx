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
        <span className="text-[10px] font-bold text-[#131218]/30 uppercase tracking-widest">
          {title}
        </span>
        {count !== undefined && (
          <span className="text-[10px] font-bold bg-[#131218]/8 text-[#131218]/40 px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
        <span className={`ml-auto text-[#131218]/25 group-hover:text-[#131218]/50 transition-all text-xs ${open ? "rotate-180" : "rotate-0"}`}>
          ▾
        </span>
      </button>
      <div className={open ? "block" : "hidden"}>
        {children}
      </div>
    </div>
  );
}
