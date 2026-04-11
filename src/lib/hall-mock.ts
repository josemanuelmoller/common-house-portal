import { HallData } from "@/types/hall";

// Explore mode — pre-sale / early exploration
export const exploreMockData: HallData = {
  mode: "explore",
  project: {
    id: "mock-explore-001",
    name: "Innovapack",
    stage: "Exploration",
    lastUpdated: "April 11, 2026",
    welcomeNote:
      "We've spent time with what you shared and put together a first view of the space. This is where we'll keep the thread of the work — before, during, and after.",
    preparedNote: "Prepared by Common House",
    currentFocus:
      "Mapping the procurement landscape and identifying where the highest-friction points live",
    nextMilestone: "Initial findings session — week of April 21",
    statusLine: "In early exploration",
    theChallenge:
      "Procurement decisions are being made across four regional teams without a shared view of what's being bought, from whom, or at what cost. The result is duplication, missed leverage, and a finance team that can't see clearly.",
    whatMattersMost:
      "Clarity and control — not necessarily centralization. The teams need autonomy to operate, but leadership needs enough visibility to make sound decisions.",
    whatMayBeInTheWay:
      "There's been at least one failed attempt at a shared system in the past. There may be cultural resistance to anything that feels like surveillance or overhead. The data is also messier than people realize.",
    whatSuccessCouldLookLike:
      "In 18 months: a clear category view, a small set of preferred suppliers per region, and a reporting layer that takes less than an hour per month to maintain.",
  },
  opportunities: [
    {
      id: "opp-1",
      title: "Category consolidation",
      summary:
        "Three of the four regions buy from different suppliers for the same seven categories. Consolidating even two of them would reduce administrative load and likely improve terms.",
    },
    {
      id: "opp-2",
      title: "Spend visibility",
      summary:
        "No single view currently surfaces total spend by category or supplier. A lightweight monthly export would change the quality of decisions being made.",
    },
    {
      id: "opp-3",
      title: "Supplier relationship depth",
      summary:
        "The top five suppliers account for 60% of spend but are managed transactionally. There's room to negotiate better terms without adding headcount.",
    },
    {
      id: "opp-4",
      title: "Approval friction",
      summary:
        "Purchase approvals over a low threshold go through a four-step process that averages eight days. Streamlining this for routine categories could free up meaningful time.",
    },
  ],
  nextSteps: [
    {
      id: "ns-1",
      order: 1,
      label: "Review this space and share initial reactions",
      owner: "Your team",
    },
    {
      id: "ns-2",
      order: 2,
      label: "Confirm the right people for the initial findings session",
      owner: "Your team",
    },
    {
      id: "ns-3",
      order: 3,
      label: "Prepare a short walk-through of the current approval flow",
      owner: "Common House",
    },
    {
      id: "ns-4",
      order: 4,
      label: "Align on scope and timeline before moving to proposal",
      owner: "Both",
    },
  ],
  asks: [],
  materials: [
    {
      id: "mat-1",
      title: "Briefing document — Innovapack procurement context",
      url: "#",
      platform: "Google Drive",
      addedDate: "April 8, 2026",
      description: "The initial brief shared before our first conversation",
    },
    {
      id: "mat-2",
      title: "Category mapping template",
      url: "#",
      platform: "Google Drive",
      addedDate: "April 10, 2026",
      description:
        "A starting point for cataloging current categories and suppliers",
    },
  ],
  conversations: [
    {
      id: "conv-1",
      title: "Initial conversation — procurement overview",
      date: "April 3, 2026",
      summary:
        "Walked through the current state of procurement across all four regions. Key finding: regional teams have strong preferences for local supplier relationships and will likely resist anything perceived as top-down standardization.",
      takeaway:
        "Frame any future changes as 'visibility first, alignment second' — not as a centralization initiative.",
    },
    {
      id: "conv-2",
      title: "Follow-up — finance team perspective",
      date: "April 9, 2026",
      summary:
        "Finance confirmed they're spending roughly 12 hours per month reconciling invoices from overlapping suppliers. They have no objection to consolidation if operational continuity is protected.",
      takeaway: "Finance is an ally. Bring them into the design process early.",
    },
  ],
  decisions: [],
  timeline: [],
  team: [
    {
      id: "tm-1",
      name: "Sofía Reyes",
      role: "Lead",
      bio: "Works at the intersection of operations and strategy. Focused on making complex systems readable.",
      initials: "SR",
    },
    {
      id: "tm-2",
      name: "Andrés Molina",
      role: "Research",
      bio: "Maps organizations from the inside out. Comfortable in messy data and ambiguous briefs.",
      initials: "AM",
    },
    {
      id: "tm-3",
      name: "Camila Torres",
      role: "Design",
      bio: "Turns findings into things people actually read. Shapes how insights land with different audiences.",
      initials: "CT",
    },
  ],
};

// Live mode — project underway
export const liveMockData: HallData = {
  mode: "live",
  project: {
    id: "mock-live-001",
    name: "Innovapack",
    stage: "Execution",
    lastUpdated: "April 11, 2026",
    welcomeNote:
      "The work is underway. This is your home base — where you'll find what's happened, what's next, and anything that needs your attention.",
    preparedNote: "Maintained by Common House",
    currentFocus:
      "Category consolidation pilot — running with logistics and packaging first",
    nextMilestone: "Pilot review and go/no-go on broader rollout — May 2",
    statusLine: "On track",
    theChallenge:
      "Procurement decisions were being made across four regional teams without a shared view of what's being bought, from whom, or at what cost.",
    whatMattersMost:
      "Clarity and control — not centralization. Regional teams keep autonomy; leadership gets the visibility needed for sound decisions.",
    whatMayBeInTheWay:
      "Change fatigue is real. Two of the four regional leads have expressed skepticism. We're monitoring adoption closely and keeping the pilot lightweight.",
    whatSuccessCouldLookLike:
      "A clear category view, a small set of preferred suppliers per region, and a reporting layer that takes less than an hour per month to maintain — live by Q3 2026.",
  },
  opportunities: [
    {
      id: "opp-1",
      title: "Category consolidation",
      summary:
        "Pilot underway with logistics and packaging. Early data shows ~18% supplier overlap across regions — higher than expected.",
    },
    {
      id: "opp-2",
      title: "Spend visibility layer",
      summary:
        "First monthly export scheduled for April 30. Finance will validate the format before it reaches regional leads.",
    },
    {
      id: "opp-3",
      title: "Supplier relationship depth",
      summary:
        "Three preferred suppliers identified. Outreach to negotiate terms is planned for after the pilot review.",
    },
    {
      id: "opp-4",
      title: "Approval flow redesign",
      summary:
        "A simplified three-step approval process has been drafted. Awaiting sign-off from the COO before piloting in the south region.",
    },
  ],
  nextSteps: [
    {
      id: "ns-1",
      order: 1,
      label: "Review pilot data and share regional feedback by April 25",
      owner: "Your team",
    },
    {
      id: "ns-2",
      order: 2,
      label: "Confirm COO availability for approval flow sign-off",
      owner: "Your team",
    },
    {
      id: "ns-3",
      order: 3,
      label: "Prepare pilot review presentation",
      owner: "Common House",
    },
    {
      id: "ns-4",
      order: 4,
      label: "Run go/no-go session on May 2",
      owner: "Both",
    },
  ],
  asks: [
    {
      id: "ask-1",
      question:
        "Has the south region lead seen the new approval flow draft?",
      context:
        "We're holding the pilot sign-off until we hear back. This is the last open gate before we can move.",
      dueDate: "April 18, 2026",
    },
    {
      id: "ask-2",
      question: "Who should be in the room for the pilot review on May 2?",
      context:
        "We'd like at least one representative from each region, plus finance. Let us know if there are constraints.",
      dueDate: "April 22, 2026",
    },
  ],
  materials: [
    {
      id: "mat-1",
      title: "Category pilot — working document",
      url: "#",
      platform: "Google Drive",
      addedDate: "April 1, 2026",
      description:
        "Live document tracking the logistics and packaging pilot",
    },
    {
      id: "mat-2",
      title: "Supplier overlap analysis",
      url: "#",
      platform: "Google Drive",
      addedDate: "April 8, 2026",
      description:
        "Cross-regional supplier comparison for the two pilot categories",
    },
    {
      id: "mat-3",
      title: "Approval flow redesign — draft",
      url: "#",
      platform: "Google Drive",
      addedDate: "April 10, 2026",
      description: "Three-step approval process proposal for routine purchases",
    },
    {
      id: "mat-4",
      title: "Project brief — original scope",
      url: "#",
      platform: "Google Drive",
      addedDate: "March 12, 2026",
      description: "The agreed scope document from project kick-off",
    },
  ],
  conversations: [
    {
      id: "conv-1",
      title: "Pilot kick-off — logistics and packaging",
      date: "April 1, 2026",
      summary:
        "Confirmed the pilot scope, assigned regional contacts, and set the April 25 data review date. The south region lead was not present and needs to be briefed separately.",
      takeaway:
        "Brief south region lead directly — don't assume the message will flow down from leadership.",
    },
    {
      id: "conv-2",
      title: "Weekly check-in — week of April 7",
      date: "April 8, 2026",
      summary:
        "Early supplier overlap numbers came in higher than expected. Finance flagged two duplicate contracts unknown to both regional leads. Momentum is positive.",
      takeaway:
        "The duplicate contract finding creates a concrete, non-political reason to consolidate. Use it in the pilot review.",
    },
    {
      id: "conv-3",
      title: "Approval flow working session",
      date: "April 10, 2026",
      summary:
        "Designed the three-step process. Removed two redundant checkpoints that added time without adding oversight. Waiting for COO sign-off.",
      takeaway:
        "Keep the COO briefing short and concrete — show the time savings, not the design rationale.",
    },
  ],
  decisions: [
    {
      id: "dec-1",
      title:
        "Pilot with logistics and packaging categories first — not all seven",
      date: "March 28, 2026",
      context:
        "Scope reduced to two categories to limit change fatigue and produce a clean data set.",
      status: "confirmed",
    },
    {
      id: "dec-2",
      title: "Regional leads retain final supplier selection authority",
      date: "April 1, 2026",
      context:
        "Leadership agreed that mandating specific suppliers would create resistance. The model is 'preferred list, not required list'.",
      status: "confirmed",
    },
    {
      id: "dec-3",
      title: "Approval threshold for simplified flow — set at $5,000",
      date: "April 10, 2026",
      context:
        "Draft decision — pending COO sign-off. Purchases under $5k go through the three-step process; above that threshold stays as is.",
      status: "pending",
    },
  ],
  timeline: [
    {
      id: "tl-1",
      label: "Project kick-off",
      date: "March 12, 2026",
      status: "done",
      note: "Scope confirmed, team assigned",
    },
    {
      id: "tl-2",
      label: "Initial findings session",
      date: "March 26, 2026",
      status: "done",
      note: "Presented procurement landscape analysis",
    },
    {
      id: "tl-3",
      label: "Pilot launch — logistics & packaging",
      date: "April 1, 2026",
      status: "done",
    },
    {
      id: "tl-4",
      label: "Pilot data review",
      date: "April 25, 2026",
      status: "current",
      note: "Regional teams submitting feedback this week",
    },
    {
      id: "tl-5",
      label: "Go / no-go: broader rollout",
      date: "May 2, 2026",
      status: "upcoming",
    },
    {
      id: "tl-6",
      label: "Approval flow pilot — south region",
      date: "May 15, 2026",
      status: "upcoming",
      note: "Pending COO sign-off",
    },
    {
      id: "tl-7",
      label: "Full category view live",
      date: "June 30, 2026",
      status: "upcoming",
    },
  ],
  team: [
    {
      id: "tm-1",
      name: "Sofía Reyes",
      role: "Lead",
      bio: "Works at the intersection of operations and strategy. Focused on making complex systems readable.",
      initials: "SR",
    },
    {
      id: "tm-2",
      name: "Andrés Molina",
      role: "Research",
      bio: "Maps organizations from the inside out. Comfortable in messy data and ambiguous briefs.",
      initials: "AM",
    },
    {
      id: "tm-3",
      name: "Camila Torres",
      role: "Design",
      bio: "Turns findings into things people actually read. Shapes how insights land with different audiences.",
      initials: "CT",
    },
  ],
};
