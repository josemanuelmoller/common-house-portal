export function classifyFile(filename: string): { category: string; documentType: string; priority: string } {
  const name = filename.toLowerCase();
  if (name.includes("pitch") || name.includes("deck"))
    return { category: "Empresa", documentType: "Pitch Deck", priority: "Critical" };
  if (name.includes("financial") || name.includes("model") || name.includes("p&l") || name.includes("pnl"))
    return { category: "Financials", documentType: "Financial Model (3-year)", priority: "Critical" };
  if (name.includes("cap table") || name.includes("captable") || name.includes("cap_table") || name.includes("equity"))
    return { category: "Cap Table", documentType: "Formal Cap Table (certified)", priority: "Critical" };
  if (name.includes("one pager") || name.includes("onepager") || name.includes("summary") || name.includes("executive"))
    return { category: "Empresa", documentType: "Executive Summary", priority: "High" };
  if (name.includes("legal") || name.includes("certificate") || name.includes("incorporation"))
    return { category: "Legal", documentType: "Certificate of Incorporation", priority: "Critical" };
  if (name.includes("team") || name.includes("bio") || name.includes("founders"))
    return { category: "Equipo", documentType: "Bios of Founders", priority: "High" };
  if (name.includes("pilot") || name.includes("traction") || name.includes("results"))
    return { category: "Traccion", documentType: "Pilot Results / Case Study", priority: "Critical" };
  if (name.includes("impact") || name.includes("sustainability"))
    return { category: "Empresa", documentType: "Impact Report / Sustainability Story", priority: "Medium" };
  return { category: "Other", documentType: filename, priority: "Medium" };
}
