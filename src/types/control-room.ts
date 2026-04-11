/**
 * Control Room — Internal Staff Layer
 *
 * The Control Room is the operating layer for the Common House team.
 * It is not a Room (those are client-facing). It is internal staff tooling.
 *
 * Two scopes define how a staff member views the House:
 *   My Rooms   — personal lens: my projects, my deadlines, my alerts
 *   House View — operating lens: all rooms at risk, stale rooms, blockers
 *
 * Four workbenches map to /admin routes, each serving the Control Room model.
 * See src/types/house.ts for the full 3-layer architecture documentation.
 */

// ─── Control Room View Types ──────────────────────────────────────────────────

// The two Control Room scopes
export type ControlRoomViewType = "my-rooms" | "house-view";

// My Rooms scope — personal lens
// Signals relevant to this scope:
export type MyRoomsSignal =
  | "my_projects"        // projects I am assigned to
  | "my_deadlines"       // upcoming deadlines in my rooms
  | "my_alerts"          // alerts requiring my attention
  | "my_commitments"     // agreements I own
  | "my_activity";       // recent activity in my rooms

// House View scope — operating lens
// Signals relevant to this scope:
export type HouseViewSignal =
  | "rooms_at_risk"      // projects with blockers or stale status
  | "stale_rooms"        // rooms with no activity in >30 days
  | "overdue_items"      // deadlines passed without resolution
  | "active_blockers"    // validated blockers across all rooms
  | "pressure_points"    // projects flagged for update
  | "systemic_signals";  // patterns across projects (from reusable evidence)

// ─── Workbench Model ──────────────────────────────────────────────────────────

// Workbench metadata — maps admin routes to Control Room model
export type ControlRoomWorkbench = {
  label: string;
  href: string;
  icon: string;
  scope: "house-view" | "both";  // "both" = relevant to both My Rooms and House View
  system: "os" | "knowledge" | "health";
  role: "room-facing" | "system-facing" | "transversal";
  description: string;
};

// The four current Control Room workbenches
export const CONTROL_ROOM_WORKBENCHES: ControlRoomWorkbench[] = [
  {
    label: "PMO / Delivery",
    href: "/admin",
    icon: "◈",
    scope: "house-view",
    system: "os",
    role: "room-facing",
    description: "Portfolio health, room status, source activity across all projects.",
  },
  {
    label: "Intake / Exceptions",
    href: "/admin/os",
    icon: "⬡",
    scope: "house-view",
    system: "os",
    role: "system-facing",
    description: "Unprocessed sources, evidence queue, OS pipeline exceptions.",
  },
  {
    label: "Knowledge Assets",
    href: "/admin/knowledge",
    icon: "◉",
    scope: "house-view",
    system: "knowledge",
    role: "transversal",
    description: "Knowledge asset review, reusable evidence, cross-project patterns.",
  },
  {
    label: "System Health",
    href: "/admin/health",
    icon: "◎",
    scope: "house-view",
    system: "health",
    role: "system-facing",
    description: "OS hygiene signals, validation stats, backlog monitoring.",
  },
];
