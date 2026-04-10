"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

type NavItem = { label: string; href: string; icon: string };

type Props = {
  projectName?: string;
  isAdmin?: boolean;
  items: NavItem[];
};

export function Sidebar({ projectName, isAdmin, items }: Props) {
  const pathname = usePathname();

  return (
    <aside className="w-60 min-h-screen bg-[#131218] flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="px-6 py-6 border-b border-white/8">
        <p className="text-white font-bold text-sm tracking-tight leading-snug">
          common<br />house
        </p>
        {isAdmin && (
          <span className="mt-2.5 inline-block bg-[#B2FF59] text-[#131218] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">
            Admin
          </span>
        )}
        {projectName && (
          <p className="text-white/30 text-xs mt-2 truncate font-medium">{projectName}</p>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map(item => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/80 hover:bg-white/5"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-5 py-4 border-t border-white/8 flex items-center gap-3">
        <UserButton />
        <p className="text-white/30 text-xs font-medium">Account</p>
      </div>
    </aside>
  );
}
