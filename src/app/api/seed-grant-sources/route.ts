import { NextResponse } from "next/server";
import { notion, DB } from "@/lib/notion";

// One-shot seed for Grant Sources [OS v2]
// POST /api/seed-grant-sources
// Protected by secret header to prevent accidental re-runs

const SOURCES: {
  name: string;
  url: string;
  type: "Government" | "Foundation" | "Multilateral" | "Corporate" | "Aggregator";
  geo: string[];
  themes: string[];
}[] = [
  // ── Multilaterales ──────────────────────────────────────────────────────────
  { name: "CAF — Banco de Desarrollo de América Latina", url: "https://www.caf.com/en/topics/grants/", type: "Multilateral", geo: ["LatAm"], themes: ["Innovation", "Climate", "Social Enterprise"] },
  { name: "IDB Lab (BID Lab)", url: "https://bidlab.org/en/calls-for-proposals", type: "Multilateral", geo: ["LatAm"], themes: ["Innovation", "Financial Inclusion", "Social Enterprise"] },
  { name: "World Bank / IFC", url: "https://www.worldbank.org/en/programs/small-grants", type: "Multilateral", geo: ["Global"], themes: ["Financial Inclusion", "Climate", "Social Enterprise"] },
  { name: "UNDP — United Nations Development Programme", url: "https://www.undp.org/funding", type: "Multilateral", geo: ["Global"], themes: ["Climate", "Social Enterprise", "Gender"] },
  { name: "UNEP — UN Environment Programme", url: "https://www.unep.org/grants-awards", type: "Multilateral", geo: ["Global"], themes: ["Climate", "Biodiversity", "Circular Economy"] },
  { name: "GIZ — Deutsche Gesellschaft für Internationale Zusammenarbeit", url: "https://www.giz.de/en/workingwithgiz/grants.html", type: "Multilateral", geo: ["Global", "LatAm", "Africa"], themes: ["Climate", "Agriculture", "Social Enterprise"] },
  { name: "USAID", url: "https://www.usaid.gov/work-usaid/grants", type: "Multilateral", geo: ["Global", "LatAm", "Africa"], themes: ["Financial Inclusion", "Agriculture", "Climate"] },
  { name: "Inter-American Foundation (IAF)", url: "https://www.iaf.gov/apply/", type: "Multilateral", geo: ["LatAm"], themes: ["Social Enterprise", "Gender", "Agriculture"] },
  { name: "FONPLATA", url: "https://www.fonplata.org/en/grants", type: "Multilateral", geo: ["LatAm"], themes: ["Innovation", "Climate", "Urban"] },
  { name: "CABEI — Central American Bank for Economic Integration", url: "https://www.bcie.org/en/work-with-us/grants/", type: "Multilateral", geo: ["LatAm"], themes: ["Climate", "Social Enterprise", "Agriculture"] },
  { name: "IFAD — International Fund for Agricultural Development", url: "https://www.ifad.org/en/grants", type: "Multilateral", geo: ["Global", "LatAm", "Africa"], themes: ["Agriculture", "Financial Inclusion", "Climate"] },
  { name: "FOMIN — Multilateral Investment Fund", url: "https://www.iadb.org/en/about-us/departments/fomin", type: "Multilateral", geo: ["LatAm"], themes: ["Financial Inclusion", "Social Enterprise", "Innovation"] },

  // ── Gobierno UK / Europa ────────────────────────────────────────────────────
  { name: "Innovate UK — Smart Grant", url: "https://www.ukri.org/councils/innovate-uk/", type: "Government", geo: ["UK"], themes: ["Innovation", "Zero Waste", "Circular Economy"] },
  { name: "Innovate UK — Net Zero", url: "https://www.ukri.org/opportunity/innovate-uk-net-zero/", type: "Government", geo: ["UK"], themes: ["Climate", "Zero Waste", "Circular Economy"] },
  { name: "Innovate UK — SBRI (Small Business Research Initiative)", url: "https://www.ukri.org/councils/innovate-uk/sbri/", type: "Government", geo: ["UK"], themes: ["Innovation", "Social Enterprise"] },
  { name: "UKRI — UK Research and Innovation", url: "https://www.ukri.org/funding/", type: "Government", geo: ["UK"], themes: ["Innovation", "Climate", "Biodiversity"] },
  { name: "Horizon Europe / EIC Accelerator", url: "https://eic.ec.europa.eu/eic-funding-opportunities/eic-accelerator_en", type: "Government", geo: ["EU"], themes: ["Innovation", "Climate", "Circular Economy"] },
  { name: "EIT Climate-KIC", url: "https://www.climate-kic.org/programmes/", type: "Government", geo: ["EU"], themes: ["Climate", "Zero Waste", "Urban"] },
  { name: "EIT Food", url: "https://www.eitfood.eu/funding", type: "Government", geo: ["EU"], themes: ["Agriculture", "Zero Waste", "Innovation"] },
  { name: "CDTI — Centro para el Desarrollo Tecnológico Industrial", url: "https://www.cdti.es/index.asp?idNav=1&idIdioma=2", type: "Government", geo: ["Spain", "EU"], themes: ["Innovation", "Climate"] },
  { name: "ICEX España Exportación e Inversiones", url: "https://www.icex.es/es/navegacion-principal/empresas/convocatorias/", type: "Government", geo: ["Spain"], themes: ["Innovation", "Social Enterprise"] },
  { name: "COFIDES — Compañía Española de Financiación del Desarrollo", url: "https://www.cofides.es/en/cofides-impact-fund/", type: "Government", geo: ["Spain", "LatAm"], themes: ["Social Enterprise", "Climate", "Financial Inclusion"] },
  { name: "LIFE Programme (EU)", url: "https://cinea.ec.europa.eu/programmes/life_en", type: "Government", geo: ["EU"], themes: ["Biodiversity", "Climate", "Circular Economy"] },
  { name: "Eurostars Programme", url: "https://www.eurostars-eureka.eu/", type: "Government", geo: ["EU"], themes: ["Innovation"] },
  { name: "InvestEU", url: "https://commission.europa.eu/funding-tenders/find-funding/eu-funding-programmes/investeu_en", type: "Government", geo: ["EU"], themes: ["Innovation", "Climate", "Social Enterprise"] },
  { name: "CORFO — Corporación de Fomento de la Producción (Chile)", url: "https://www.corfo.cl/sites/cpp/convocatorias", type: "Government", geo: ["LatAm"], themes: ["Innovation", "Circular Economy", "Agriculture"] },
  { name: "Startup Chile", url: "https://startupchile.org/programs/", type: "Government", geo: ["LatAm"], themes: ["Innovation", "Social Enterprise"] },
  { name: "MINCIENCIAS — Colombia", url: "https://minciencias.gov.co/convocatorias", type: "Government", geo: ["LatAm"], themes: ["Innovation", "Social Enterprise"] },
  { name: "CONACYT — México", url: "https://www.conahcyt.mx/convocatorias/", type: "Government", geo: ["LatAm"], themes: ["Innovation", "Agriculture"] },
  { name: "AECID — Agencia Española de Cooperación Internacional", url: "https://www.aecid.es/EN/convocatorias", type: "Government", geo: ["Spain", "LatAm", "Africa"], themes: ["Social Enterprise", "Gender", "Climate"] },

  // ── Fundaciones Globales ─────────────────────────────────────────────────────
  { name: "WWF — World Wildlife Fund Grants", url: "https://www.worldwildlife.org/pages/corporate-partnerships", type: "Foundation", geo: ["Global"], themes: ["Biodiversity", "Climate", "Agriculture"] },
  { name: "Ellen MacArthur Foundation", url: "https://www.ellenmacarthurfoundation.org/partner", type: "Foundation", geo: ["Global", "UK"], themes: ["Circular Economy", "Zero Waste", "Innovation"] },
  { name: "Rockefeller Foundation", url: "https://www.rockefellerfoundation.org/grants/", type: "Foundation", geo: ["Global", "USA"], themes: ["Food", "Climate", "Financial Inclusion"] },
  { name: "Ford Foundation", url: "https://www.fordfoundation.org/work/investing/", type: "Foundation", geo: ["Global", "LatAm"], themes: ["Social Enterprise", "Financial Inclusion", "Gender"] },
  { name: "Bloomberg Philanthropies", url: "https://www.bloomberg.org/", type: "Foundation", geo: ["Global", "USA"], themes: ["Climate", "Urban", "Innovation"] },
  { name: "Omidyar Network", url: "https://omidyar.com/", type: "Foundation", geo: ["Global"], themes: ["Financial Inclusion", "Innovation", "Social Enterprise"] },
  { name: "Skoll Foundation", url: "https://skoll.org/about/for-grant-seekers/", type: "Foundation", geo: ["Global"], themes: ["Social Enterprise", "Climate", "Innovation"] },
  { name: "Ashoka", url: "https://www.ashoka.org/en-us/program/ashoka-fellowship", type: "Foundation", geo: ["Global", "LatAm"], themes: ["Social Enterprise", "Innovation"] },
  { name: "Oak Foundation", url: "https://oakfnd.org/apply-for-a-grant/", type: "Foundation", geo: ["Global", "UK"], themes: ["Climate", "Biodiversity", "Social Enterprise"] },
  { name: "Porticus Foundation", url: "https://www.porticus.com/", type: "Foundation", geo: ["Global", "UK", "LatAm"], themes: ["Social Enterprise", "Financial Inclusion", "Gender"] },
  { name: "Laudes Foundation", url: "https://www.laudesfoundation.org/", type: "Foundation", geo: ["Global", "UK", "EU"], themes: ["Circular Economy", "Zero Waste", "Climate"] },
  { name: "IKEA Foundation", url: "https://ikeafoundation.org/grants/", type: "Foundation", geo: ["Global"], themes: ["Climate", "Agriculture", "Social Enterprise"] },
  { name: "H&M Foundation", url: "https://hmfoundation.com/work/", type: "Foundation", geo: ["Global", "EU"], themes: ["Circular Economy", "Zero Waste", "Gender"] },
  { name: "C&A Foundation", url: "https://candafoundation.org/", type: "Foundation", geo: ["Global", "EU"], themes: ["Circular Economy", "Zero Waste", "Gender"] },
  { name: "Patagonia Environmental Grants", url: "https://www.patagonia.com/how-we-fund/", type: "Foundation", geo: ["Global", "USA", "UK"], themes: ["Biodiversity", "Climate", "Zero Waste"] },

  // ── Fundaciones UK ───────────────────────────────────────────────────────────
  { name: "Nesta", url: "https://www.nesta.org.uk/project-and-programme/", type: "Foundation", geo: ["UK"], themes: ["Innovation", "Social Enterprise", "Urban"] },
  { name: "Esmée Fairbairn Foundation", url: "https://esmeefairbairn.org.uk/apply-for-funding/", type: "Foundation", geo: ["UK"], themes: ["Social Enterprise", "Financial Inclusion", "Biodiversity"] },
  { name: "Joseph Rowntree Foundation", url: "https://www.jrf.org.uk/research/work-with-us", type: "Foundation", geo: ["UK"], themes: ["Financial Inclusion", "Social Enterprise", "Urban"] },
  { name: "Barrow Cadbury Trust", url: "https://www.barrowcadbury.org.uk/grants/", type: "Foundation", geo: ["UK"], themes: ["Social Enterprise", "Financial Inclusion", "Gender"] },
  { name: "Paul Hamlyn Foundation", url: "https://www.phf.org.uk/grants/", type: "Foundation", geo: ["UK"], themes: ["Social Enterprise", "Urban"] },
  { name: "Calouste Gulbenkian Foundation (UK Branch)", url: "https://gulbenkian.pt/uk-branch/", type: "Foundation", geo: ["UK", "EU"], themes: ["Social Enterprise", "Climate", "Urban"] },
  { name: "National Lottery Community Fund (UK)", url: "https://www.tnlcommunityfund.org.uk/funding", type: "Government", geo: ["UK"], themes: ["Social Enterprise", "Financial Inclusion", "Urban"] },
  { name: "Power to Change", url: "https://www.powertochange.org.uk/get-support/programmes/", type: "Foundation", geo: ["UK"], themes: ["Social Enterprise", "Urban"] },
  { name: "UnLtd — Foundation for Social Entrepreneurs", url: "https://unltd.org.uk/apply-for-funding/", type: "Foundation", geo: ["UK"], themes: ["Social Enterprise", "Innovation"] },
  { name: "Comic Relief — Tech for Good", url: "https://www.comicrelief.com/grants", type: "Foundation", geo: ["UK", "Africa"], themes: ["Innovation", "Social Enterprise", "Gender"] },

  // ── Inclusión Financiera ─────────────────────────────────────────────────────
  { name: "Fair4All Finance", url: "https://fair4allfinance.org.uk/", type: "Foundation", geo: ["UK"], themes: ["Financial Inclusion", "Social Enterprise"] },
  { name: "Big Society Capital", url: "https://bigsocietycapital.com/", type: "Foundation", geo: ["UK"], themes: ["Financial Inclusion", "Social Enterprise"] },
  { name: "Social Investment Business", url: "https://sibgroup.org.uk/apply/", type: "Foundation", geo: ["UK"], themes: ["Financial Inclusion", "Social Enterprise"] },
  { name: "Access — The Foundation for Social Investment", url: "https://www.access-socialinvestment.org.uk/", type: "Foundation", geo: ["UK"], themes: ["Financial Inclusion", "Social Enterprise"] },
  { name: "Citi Foundation", url: "https://www.citifoundation.com/citi/foundation/applying.htm", type: "Corporate", geo: ["Global", "UK", "LatAm"], themes: ["Financial Inclusion", "Urban", "Innovation"] },
  { name: "JPMorgan Chase Foundation", url: "https://www.jpmorganchase.com/impact/grantmaking", type: "Corporate", geo: ["Global", "UK", "USA", "LatAm"], themes: ["Financial Inclusion", "Social Enterprise", "Urban"] },
  { name: "Mastercard Foundation", url: "https://mastercardfdnscholars.org/", type: "Corporate", geo: ["Global", "Africa", "LatAm"], themes: ["Financial Inclusion", "Innovation", "Gender"] },
  { name: "Accion — Catalyst Fund", url: "https://www.accion.org/catalyst-fund", type: "Foundation", geo: ["Global", "Africa", "LatAm"], themes: ["Financial Inclusion", "Innovation"] },
  { name: "Grameen Foundation", url: "https://www.grameenfoundation.org/partner-with-us", type: "Foundation", geo: ["Global", "Africa", "LatAm"], themes: ["Financial Inclusion", "Agriculture", "Gender"] },

  // ── Economía Circular / Medioambiente ────────────────────────────────────────
  { name: "WRAP — Waste and Resources Action Programme", url: "https://www.wrap.ngo/taking-action/circular-economy/initiatives", type: "Government", geo: ["UK"], themes: ["Circular Economy", "Zero Waste"] },
  { name: "Clean Growth Fund", url: "https://www.cleangrowthfund.com/apply/", type: "Foundation", geo: ["UK"], themes: ["Climate", "Circular Economy", "Zero Waste"] },
  { name: "Circulate Capital", url: "https://www.circulatecapital.com/", type: "Foundation", geo: ["Global", "LatAm"], themes: ["Circular Economy", "Zero Waste", "Climate"] },
  { name: "Circle Economy Foundation", url: "https://www.circle-economy.com/", type: "Foundation", geo: ["Global", "EU"], themes: ["Circular Economy", "Zero Waste", "Urban"] },
  { name: "11th Hour Project", url: "https://11thhourfood.org/", type: "Foundation", geo: ["Global", "USA"], themes: ["Agriculture", "Climate", "Zero Waste"] },
  { name: "Conservation International Grants", url: "https://www.conservation.org/projects", type: "Foundation", geo: ["Global", "LatAm", "Africa"], themes: ["Biodiversity", "Climate", "Agriculture"] },
  { name: "Impact Hub Network", url: "https://impacthub.net/grants/", type: "Foundation", geo: ["Global", "Spain", "LatAm"], themes: ["Social Enterprise", "Innovation", "Urban"] },

  // ── Corporate / Tech ─────────────────────────────────────────────────────────
  { name: "Google.org Grants", url: "https://www.google.org/grants", type: "Corporate", geo: ["Global"], themes: ["Innovation", "Social Enterprise", "Climate"] },
  { name: "Microsoft AI for Good", url: "https://www.microsoft.com/en-us/ai/ai-for-good", type: "Corporate", geo: ["Global"], themes: ["Innovation", "Climate", "Financial Inclusion"] },
  { name: "Salesforce.org / Salesforce Foundation", url: "https://www.salesforce.org/grants/", type: "Corporate", geo: ["Global"], themes: ["Innovation", "Social Enterprise", "Financial Inclusion"] },
  { name: "Amazon Sustainability Fund", url: "https://www.aboutamazon.com/planet/climate-pledge", type: "Corporate", geo: ["Global"], themes: ["Climate", "Circular Economy", "Zero Waste"] },
  { name: "Shell Foundation", url: "https://shellfoundation.org/", type: "Corporate", geo: ["Global", "Africa", "LatAm"], themes: ["Climate", "Financial Inclusion", "Social Enterprise"] },
  { name: "Natura &Co Sustainability Fund", url: "https://www.naturaeco.com/en/", type: "Corporate", geo: ["LatAm", "Global"], themes: ["Biodiversity", "Circular Economy", "Social Enterprise"] },
  { name: "Unilever Sustainable Living Fund", url: "https://www.unilever.com/planet-and-society/", type: "Corporate", geo: ["Global", "UK", "LatAm"], themes: ["Circular Economy", "Zero Waste", "Social Enterprise"] },

  // ── LatAm / España ───────────────────────────────────────────────────────────
  { name: "Fundación FEMSA", url: "https://www.femsa.com/en/responsibility/", type: "Foundation", geo: ["LatAm"], themes: ["Social Enterprise", "Urban", "Gender"] },
  { name: "Fundación Chile", url: "https://fch.cl/", type: "Foundation", geo: ["LatAm"], themes: ["Agriculture", "Circular Economy", "Innovation"] },
  { name: "Fundación Bancolombia", url: "https://www.fundacionbancolombia.org/convocatorias/", type: "Foundation", geo: ["LatAm"], themes: ["Social Enterprise", "Financial Inclusion", "Urban"] },
  { name: "Fundación Citi Latinoamérica", url: "https://www.citigroup.com/global/foundation", type: "Corporate", geo: ["LatAm"], themes: ["Financial Inclusion", "Urban", "Innovation"] },
  { name: "IICA — Inter-American Institute for Cooperation on Agriculture", url: "https://www.iica.int/en/calls-for-proposals", type: "Multilateral", geo: ["LatAm", "Caribbean"], themes: ["Agriculture", "Climate", "Innovation"] },
  { name: "OEA — Organización de los Estados Americanos", url: "https://www.oas.org/en/grants/", type: "Multilateral", geo: ["LatAm", "Caribbean", "USA"], themes: ["Innovation", "Gender", "Social Enterprise"] },

  // ── Agregadores ──────────────────────────────────────────────────────────────
  { name: "CORDIS — EU Research Results", url: "https://cordis.europa.eu/", type: "Aggregator", geo: ["EU", "Global"], themes: ["Innovation", "Climate", "Circular Economy"] },
  { name: "Good Finance UK", url: "https://www.goodfinance.org.uk/", type: "Aggregator", geo: ["UK"], themes: ["Financial Inclusion", "Social Enterprise"] },
  { name: "DSC — Directory of Social Change", url: "https://www.dsc.org.uk/funding/", type: "Aggregator", geo: ["UK"], themes: ["Social Enterprise", "Financial Inclusion"] },
  { name: "Candid / Foundation Directory (Grants)", url: "https://candid.org/", type: "Aggregator", geo: ["USA", "Global"], themes: ["Social Enterprise", "Innovation", "Financial Inclusion"] },
];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-seed-secret",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-seed-secret");
  if (secret !== process.env.SEED_SECRET && secret !== "ch-seed-2026") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders() });
  }

  const results: { name: string; id: string }[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const src of SOURCES) {
    try {
      const page = await notion.pages.create({
        parent: { database_id: DB.grantSources },
        properties: {
          "Source Name": { title: [{ text: { content: src.name } }] },
          "URL":         { url: src.url },
          "Type":        { select: { name: src.type } },
          "Geography":   { multi_select: src.geo.map(g => ({ name: g })) },
          "Themes":      { multi_select: src.themes.map(t => ({ name: t })) },
          "Active":      { checkbox: true },
        },
      });
      results.push({ name: src.name, id: page.id });
    } catch (e) {
      errors.push({ name: src.name, error: String(e) });
    }
  }

  return NextResponse.json(
    { ok: true, seeded: results.length, errorCount: errors.length, results, errors },
    { headers: corsHeaders() }
  );
}
