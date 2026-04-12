// Admin navigation — exported separately so both server and client components can use it
// without triggering the "server-only" import restriction.

export const ADMIN_NAV = [
  { label: "House View",           href: "/admin",                icon: "◈" },
  { label: "My Rooms",             href: "/admin/my-rooms",       icon: "◫" },
  { label: "Decisions",            href: "/admin/decisions",      icon: "✓" },
  { label: "Intake / Exceptions",  href: "/admin/os",             icon: "⬡" },
  { label: "Knowledge Assets",     href: "/admin/knowledge",      icon: "◉" },
  { label: "System Health",        href: "/admin/health",         icon: "◎" },
  { label: "Living Room",          href: "/living-room",          icon: "◐", section: "House Layers" },
  { label: "Curate Living Room",   href: "/admin/living-room",    icon: "◑", section: "House Layers" },
  { label: "The Library",          href: "/library",              icon: "▤", section: "House Layers" },
  { label: "The Residents",        href: "/residents",            icon: "◍", section: "House Layers" },
];
