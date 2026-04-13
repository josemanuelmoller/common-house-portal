// Admin navigation — full platform structure
// Mirrors platform-admin.html nav hierarchy

export const ADMIN_NAV = [
  // ── Overview ─────────────────────────────────────────────────────────────
  { label: "House View",          href: "/admin",                icon: "◈" },
  { label: "Residents",           href: "/residents",            icon: "◍" },

  // ── Portfolio ─────────────────────────────────────────────────────────────
  { label: "Workrooms",           href: "/admin/workrooms",      icon: "◻", section: "Portfolio" },
  { label: "Garage",              href: "/admin/garage-view",    icon: "◧", section: "Portfolio" },
  { label: "Investors",           href: "/admin/investors",      icon: "◎", section: "Portfolio" },

  // ── Commercial ────────────────────────────────────────────────────────────
  { label: "Pipeline",            href: "/admin/pipeline",       icon: "◉", section: "Commercial" },
  { label: "Offers & Proposals",  href: "/admin/offers",         icon: "◫", section: "Commercial" },
  { label: "Deal Flow",           href: "/admin/deal-flow",      icon: "⬡", section: "Commercial" },
  { label: "Grants",              href: "/admin/grants",         icon: "◐", section: "Commercial" },

  // ── Desks ─────────────────────────────────────────────────────────────────
  { label: "Design",              href: "/admin/design",         icon: "◑", section: "Desks" },
  { label: "Comms",               href: "/admin/comms",          icon: "◒", section: "Desks" },
  { label: "Insights",            href: "/admin/insights",       icon: "◓", section: "Desks" },

  // ── Control Room ──────────────────────────────────────────────────────────
  { label: "Decisions",           href: "/admin/decisions",      icon: "✓", section: "Control Room" },
  { label: "Agents",              href: "/admin/agents",         icon: "⬡", section: "Control Room" },
  { label: "Intake / Exceptions", href: "/admin/os",             icon: "▤", section: "Control Room" },
  { label: "Content Pipeline",    href: "/admin/content",        icon: "◫", section: "Control Room" },
  { label: "Knowledge Assets",    href: "/admin/knowledge",      icon: "◉", section: "Control Room" },
  { label: "System Health",       href: "/admin/health",         icon: "◎", section: "Control Room" },

  // ── House Layers ──────────────────────────────────────────────────────────
  { label: "Living Room",         href: "/living-room",          icon: "◐", section: "House Layers" },
  { label: "Curate Living Room",  href: "/admin/living-room",    icon: "◑", section: "House Layers" },
  { label: "My Rooms",            href: "/admin/my-rooms",       icon: "◫", section: "House Layers" },
  { label: "The Library",         href: "/library",              icon: "▤", section: "House Layers" },
];
