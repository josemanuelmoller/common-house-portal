"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser, SignOutButton } from "@clerk/nextjs";

type NavItem = { label: string; href: string; icon: string; section?: string };

type Props = {
  projectName?: string;
  isAdmin?: boolean;
  items: NavItem[];
};

export function Sidebar({ projectName, isAdmin, items }: Props) {
  const pathname = usePathname();
  const { user } = useUser();

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ` ${user.lastName}` : ""}`
    : user?.emailAddresses?.[0]?.emailAddress?.split("@")[0] ?? "";
  const email = user?.emailAddresses?.[0]?.emailAddress ?? "";

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
      <nav className="flex-1 px-3 py-4">
        {isAdmin && (
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest px-3 mb-2">
            Control Room
          </p>
        )}
        <div className="space-y-0.5">
          {items.map((item, i) => {
            const active = pathname === item.href;
            const showSection = item.section && (i === 0 || items[i - 1].section !== item.section);
            return (
              <div key={item.href}>
                {showSection && (
                  <div className="pt-4 pb-1.5 px-3">
                    <div className="h-px bg-white/8 mb-3" />
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                      {item.section}
                    </p>
                  </div>
                )}
                <Link
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
              </div>
            );
          })}
        </div>
      </nav>

      {/* Account */}
      <div className="px-5 py-5 border-t border-white/8">
        <div className="flex items-center gap-3 min-w-0">
          <UserButton />
          <div className="flex-1 min-w-0">
            {displayName && (
              <p className="text-white/70 text-xs font-semibold truncate leading-snug">{displayName}</p>
            )}
            {email && (
              <p className="text-white/25 text-[10px] font-medium truncate">{email}</p>
            )}
          </div>
        </div>
        <SignOutButton redirectUrl="/sign-in">
          <button className="mt-3 w-full text-left text-white/20 text-[10px] font-bold uppercase tracking-widest hover:text-white/50 transition-colors">
            Sign out →
          </button>
        </SignOutButton>
      </div>
    </aside>
  );
}
