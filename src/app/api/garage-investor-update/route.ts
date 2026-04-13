import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminGuardApi } from "@/lib/require-admin";
import {
  getProjectById,
  getEvidenceForProject,
  getFinancialsForProject,
  getPortfolioOpportunities,
  getStartupOrgData,
} from "@/lib/notion";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const guard = await adminGuardApi();
  if (guard) return guard;

  let body: { projectId: string; period: string; tone: string; include: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, period, tone, include } = body;
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  // Fetch data in parallel
  const [project, evidence, financials, orgData] = await Promise.all([
    getProjectById(projectId),
    getEvidenceForProject(projectId),
    getFinancialsForProject(projectId),
    getStartupOrgData(projectId),
  ]);

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const opportunities = await getPortfolioOpportunities(orgData?.name || project.name);

  // Build context for Claude
  const latestFinancials = financials[0];
  const milestones = evidence.filter(e => ["Milestone", "Outcome", "Traction"].includes(e.type) && e.validationStatus === "Validated").slice(0, 5);
  const decisions  = evidence.filter(e => e.type === "Decision" && e.validationStatus === "Validated").slice(0, 3);
  const blockers   = evidence.filter(e => e.type === "Blocker" && e.validationStatus === "Validated").slice(0, 2);
  const investorOpps = opportunities.filter(o => o.type === "Investor Match").slice(0, 5);
  const grantOpps    = opportunities.filter(o => o.type === "Grant").slice(0, 4);

  const sections: string[] = [];
  if (include.includes("kpis") && latestFinancials) {
    sections.push(`Financial data: Revenue ${latestFinancials.revenue ?? "N/A"}, Burn ${latestFinancials.burn ?? "N/A"}/mo, Runway ${latestFinancials.runway ?? "N/A"}mo, Cash ${latestFinancials.cash ?? "N/A"}`);
  }
  if (include.includes("milestones") && milestones.length) {
    sections.push(`Key milestones: ${milestones.map(m => m.title).join("; ")}`);
  }
  if (include.includes("fundraising") && investorOpps.length) {
    sections.push(`Investor pipeline: ${investorOpps.map(o => `${o.name} (${o.stage})`).join(", ")}`);
  }
  if (include.includes("grants") && grantOpps.length) {
    sections.push(`Grant pipeline: ${grantOpps.map(o => `${o.name} (${o.stage})`).join(", ")}`);
  }
  if (include.includes("nextsteps")) {
    sections.push(`Current focus: ${project.hallCurrentFocus || "N/A"}. Next milestone: ${project.hallNextMilestone || "N/A"}`);
  }
  if (blockers.length) {
    sections.push(`Active blockers: ${blockers.map(b => b.title).join("; ")}`);
  }
  if (decisions.length) {
    sections.push(`Recent decisions: ${decisions.map(d => d.title).join("; ")}`);
  }

  const systemPrompt = `You are a startup advisor writing a concise investor update for ${project.name}.
Write in ${tone.toLowerCase()} tone. Cover only the sections requested. Be specific, brief, and professional.
Use plain text only — no markdown, no bullet symbols, just short paragraphs with clear section headers in ALL CAPS.
The update should feel like it comes from the founder, not from an AI.`;

  const userPrompt = `Write an investor update for ${project.name} covering the period: ${period}.

Data available:
${sections.length > 0 ? sections.join("\n") : "No structured data available — use the project context to write a brief progress note."}

Stage: ${project.stage || "N/A"}
Status: ${project.statusSummary || "N/A"}
Geography: ${project.geography?.join(", ") || "N/A"}

Sections to include: ${include.join(", ")}

Keep it under 400 words. Start directly with the first section header.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      messages: [{ role: "user", content: userPrompt }],
      system: systemPrompt,
    });

    const draft = (message.content[0] as { type: string; text: string }).text ?? "";
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("[garage-investor-update]", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
