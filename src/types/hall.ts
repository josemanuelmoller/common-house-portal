export type HallMode = "explore" | "live";

export type HallProject = {
  id: string;
  name: string;
  stage: string;
  lastUpdated: string;
  welcomeNote: string;
  preparedNote: string;
  // What's happening now
  currentFocus: string;
  nextMilestone: string;
  statusLine?: string;
  // What we heard
  theChallenge: string;
  whatMattersMost: string;
  whatMayBeInTheWay: string;
  whatSuccessCouldLookLike: string;
};

export type HallOpportunity = {
  id: string;
  title: string;
  summary: string;
};

export type HallNextStep = {
  id: string;
  order: number;
  label: string;
  owner?: string;
};

export type HallAsk = {
  id: string;
  question: string;
  context?: string;
  dueDate?: string;
};

export type HallMaterial = {
  id: string;
  title: string;
  url: string;
  platform: string;
  addedDate?: string;
  description?: string;
};

export type HallConversation = {
  id: string;
  title: string;
  date: string;
  summary: string;
  takeaway?: string;
};

export type HallDecision = {
  id: string;
  title: string;
  date: string;
  context?: string;
  status: "confirmed" | "pending" | "revisited";
};

export type HallTimelineItem = {
  id: string;
  label: string;
  date: string;
  status: "done" | "current" | "upcoming";
  note?: string;
};

export type HallTeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  photoUrl?: string;
  initials: string;
};

export type HallData = {
  mode: HallMode;
  project: HallProject;
  opportunities: HallOpportunity[];
  nextSteps: HallNextStep[];
  asks: HallAsk[];
  materials: HallMaterial[];
  conversations: HallConversation[];
  decisions: HallDecision[];
  timeline: HallTimelineItem[];
  team: HallTeamMember[];
};
