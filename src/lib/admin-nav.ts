// Admin navigation — full platform structure
// Mirrors platform-admin.html nav hierarchy

export const ADMIN_NAV = [
  // ── Overview ─────────────────────────────────────────────────────────────
  { label: "House View",          href: "/admin",                icon: "◈" },
  { label: "The Plan",            href: "/admin/plan",           icon: "◆" },
  { label: "Residents",           href: "/residents",            icon: "◍" },

  // ── Portfolio ─────────────────────────────────────────────────────────────
  { label: "Workrooms",           href: "/admin/workrooms",      icon: "◻", section: "Portfolio" },
  { label: "Garage",              href: "/admin/garage-view",    icon: "◧", section: "Portfolio" },
  { label: "Investors",           href: "/admin/investors",      icon: "◎", section: "Portfolio" },

  // ── Commercial ────────────────────────────────────────────────────────────
  { label: "Opportunities",       href: "/admin/opportunities",  icon: "◉", section: "Commercial" },
  { label: "Investor Match",       href: "/admin/deal-flow",      icon: "⬡", section: "Commercial" },
  { label: "Grants",              href: "/admin/grants",         icon: "◐", section: "Commercial" },

  // ── Desks ─────────────────────────────────────────────────────────────────
  { label: "Design",              href: "/admin/design",         icon: "◑", section: "Desks" },
  { label: "Comms",               href: "/admin/comms",          icon: "◒", section: "Desks" },
  { label: "Insights",            href: "/admin/insights",       icon: "◓", section: "Desks" },
  { label: "Offers & Proposals",  href: "/admin/offers",         icon: "◫", section: "Desks" },

  // ── Knowledge layer (top-level) ─────────────────────────────────────────
  { label: "Knowledge",           href: "/admin/knowledge",      icon: "◉" },

  // ── Control Room ──────────────────────────────────────────────────────────
  // Capture + Prep promoted to the nav 2026-06-10 — both were fully wired but
  // unreachable (ghost pages). Capture also hosts the push-notification
  // toggle, which had 0 subscribers because nobody could find it.
  { label: "Capture",             href: "/admin/capture",        icon: "✚", section: "Control Room" },
  { label: "Meeting Prep",        href: "/admin/prep",           icon: "◔", section: "Control Room" },
  { label: "Agents",              href: "/admin/agents",         icon: "⬡", section: "Control Room" },
  { label: "Intake / Decisions",  href: "/admin/os",             icon: "▤", section: "Control Room" },
  { label: "Content Pipeline",    href: "/admin/content",        icon: "◫", section: "Control Room" },
  { label: "System Health",       href: "/admin/health",         icon: "◎", section: "Control Room" },
  { label: "Routine Runs",        href: "/admin/routines",       icon: "⟳", section: "Control Room" },

  // ── House Layers ──────────────────────────────────────────────────────────
  // My Rooms removed 2026-06-10 — staff-registry-dependent personal dashboard
  // with no staff configured yet; page stays reachable by URL for when the
  // team grows.
  { label: "Living Room",         href: "/living-room",          icon: "◐", section: "House Layers" },
  { label: "Curate Living Room",  href: "/admin/living-room",    icon: "◑", section: "House Layers" },
  { label: "The Library",         href: "/library",              icon: "▤", section: "House Layers" },

  // ── Settings ──────────────────────────────────────────────────────────────
  { label: "Project Roles",       href: "/admin/settings/project-roles", icon: "⚙", section: "Settings" },
];
