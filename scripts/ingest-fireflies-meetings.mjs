/**
 * One-time script: ingest Fireflies meeting transcripts into CH Sources [OS v2]
 * Links each meeting to its Notion project via "Linked Projects" relation.
 *
 * Run: node scripts/ingest-fireflies-meetings.mjs
 */

import { Client } from "@notionhq/client";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse .env.local manually
const envPath = join(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const SOURCES_DB = "d88aff1b019d4110bcefab7f5bfbd0ae";

// Project IDs
const IREFILL_ID = "33f45e5b-6633-81f6-9b68-d898237d6533";
const SUFI_ID    = "33f45e5b-6633-81f4-bde2-f97d7a11bfb3";

const MEETINGS = [
  // ── iRefill ────────────────────────────────────────────────────────────────
  {
    projectId: IREFILL_ID,
    title: "Refill Project Update",
    date: "2026-04-10",
    url: "https://teams.microsoft.com/l/meetup-join/19:meeting_NmRiMzE0NWEtMWJhNC00MzYzLWE3NDQtYTQ0ZmQxOTAwZmMx@thread.v2/0",
    summary: "The team addressed high costs and logistics issues related to sample shipments (~$4,000). A comprehensive dashboard prototype was presented to monitor machine usage and inventory, enabling real-time tracking of product refills and maintenance alerts. The discussion covered container refill processes using QR codes for tracking and legal labeling. Training support for machine installation in Costa Rica was discussed.",
  },
  {
    projectId: IREFILL_ID,
    title: "Reunión Refill MP- Mercadeo",
    date: "2026-04-08",
    url: "https://teams.microsoft.com/l/meetup-join/19:meeting_ZDNlY2UxYzgtZjMzOC00YWQ2LWExZjktMGE2NzUwZDBmMzRk@thread.v2/0",
    summary: "El equipo trabaja en la implementación del plan piloto para la máquina refill, con lanzamiento programado para junio alineado al Día del Ambiente. Se abordan materiales promocionales con la agencia Dixania. El piloto se llevará a cabo en los supermercados Automercado con apoyo de PNUD. Si resulta exitoso, se considerará expansión a otros supermercados.",
  },
  {
    projectId: IREFILL_ID,
    title: "Sesiones avance proyecto Refill — Operaciones",
    date: "2026-04-08",
    url: "https://teams.microsoft.com/l/meetup-join/19:meeting_ZDg1Njk0MWQtMzg1ZS00YThmLTkxMGYtNGRhNmNjZWY5ZGUy@thread.v2/0",
    summary: "Se discutió el progreso del proyecto de máquinas de refill, con llegada prevista a Costa Rica para finales de mayo o junio. Se definieron las ubicaciones en supermercados Moravia y Guayabos. Se propusieron ajustes en las bolsas y cajas para minimizar mermas y se revisó el mantenimiento preventivo. Se estableció un sistema de tickets con información de lote y fecha de vencimiento. No se permitirán devoluciones de envases usados por riesgos sanitarios.",
  },
  {
    projectId: IREFILL_ID,
    title: "Reunión Refill MP- TI AM Auto Mercado (QR implementation)",
    date: "2026-04-06",
    url: "https://teams.microsoft.com/l/meetup-join/19:meeting_ZDZmMmVjZTktOWFiMC00YmFjLThmMDEtYjQyOTFlZjFkOTE5@thread.v2/0",
    summary: "Se acordó implementar una etiqueta única con código QR para identificar y controlar envases, simplificando el proceso de cobro mediante un sistema que permite la reversión del costo del envase. Se decidió iniciar la venta de envases de 3 y 5 litros, aplicando incentivos como ofrecer envases gratuitos por dos meses. Se enfatizó el cumplimiento de regulaciones de etiquetado con información de lote y fecha de vencimiento.",
  },
  {
    projectId: IREFILL_ID,
    title: "Reunión Refill -TI (QR vs RFID decision)",
    date: "2026-03-30",
    url: "https://teams.microsoft.com/l/meetup-join/19:meeting_YzMxMmJlMTUtYTFiNC00OTZlLWFhMTgtYzRiOGJmYjA5ZTdm@thread.v2/0",
    summary: "Se decidió sustituir la tecnología RFID por código QR para simplificar el proceso y reducir costos, dado que hay dificultades en la obtención de etiquetas RFID. Se evaluará con el proveedor Etiplast la viabilidad y costos del código QR después de Semana Santa. Se destacó la importancia de la trazabilidad para la marca privada. Se programó reunión con equipo de mercadeo para el 8 de abril.",
  },
  {
    projectId: IREFILL_ID,
    title: "Reunión Refill MP- Mercadeo (campaign planning)",
    date: "2026-03-25",
    url: "https://teams.microsoft.com/l/meetup-join/19:meeting_ZDNlY2UxYzgtZjMzOC00YWQ2LWExZjktMGE2NzUwZDBmMzRk@thread.v2/0",
    summary: "Se coordinó y planificó una campaña con entregables y fechas específicas. Concepto visual programado para última semana de abril. Lanzamiento de campaña para junio, alineado con el mes ambiental. Se priorizó la colaboración con medios importantes y el uso de convenios de cooperación con PNUD como ventaja clave para difusión gratuita.",
  },
  {
    projectId: IREFILL_ID,
    title: "Sesiones avance proyecto Refill — Operaciones (logistics)",
    date: "2026-03-25",
    url: "https://teams.microsoft.com/l/meetup-join/19:meeting_ZDg1Njk0MWQtMzg1ZS00YThmLTkxMGYtNGRhNmNjZWY5ZGUy@thread.v2/0",
    summary: "El proyecto de la máquina para Costa Rica ha sufrido un retraso de ~1 mes por cambio técnico de RFID a código QR. Se planea envío de muestras a India para pruebas con apoyo logístico de PNUD. Se definió un flujo operativo con escaneo de QR para gestionar productos y prevenir fraudes. Se discutieron responsabilidades de mantenimiento y preparación física en puntos de venta.",
  },
  {
    projectId: IREFILL_ID,
    title: "Reunión Refill MP- TI AM Auto Mercado (QR specs)",
    date: "2026-03-23",
    url: "https://teams.microsoft.com/l/meetup-join/19:meeting_ZDZmMmVjZTktOWFiMC00YmFjLThmMDEtYjQyOTFlZjFkOTE5@thread.v2/0",
    summary: "Se abordó la gestión y generación de códigos QR para el proyecto de refill. Automercado generará los códigos únicos y un proveedor imprimirá las etiquetas (coordinando con Etiplast). Se discutieron los flujos operativos de la máquina y limitaciones técnicas como la incapacidad de detectar envases parcialmente llenos. Se clarificaron roles y responsabilidades para cada parte involucrada.",
  },

  // ── SUFI ───────────────────────────────────────────────────────────────────
  {
    projectId: SUFI_ID,
    title: "SUFI — Packaging & Production (Apr 7)",
    date: "2026-04-07",
    url: "https://meet.google.com/xtj-yyxn-azt",
    summary: "Se decide usar un embalaje sencillo de papel encerado y caja para los primeros 200 productos, optando por un cilindro de 40x50 cm y empaque al vacío por su bajo costo y protección. Las muestras de producción llegarán en 7 días, con un pedido mayor en 15-20 días. En marketing, se propone crear videos dinámicos con participación estudiantil. Se identifican riesgos regulatorios al vender sin registro ANMAT, sugiriendo un 'club de testeo'. Meta de financiamiento inicial: USD 50,000 para producir 5,000 unidades.",
  },
  {
    projectId: SUFI_ID,
    title: "SUFI catch up — Pricing & Strategy (Apr 7)",
    date: "2026-04-07",
    url: "https://meet.google.com/eng-nzgw-iau",
    summary: "Se discutió la estrategia tras no avanzar a la fase final de un proyecto significativo. Se analizó el desempeño de la unidad Home y Circlo, identificando problemas de cohesión del equipo. Se definió una estrategia de precios para los desodorantes buscando un margen bruto del 60%. El modelo híbrido de fabricación se consideró para asegurar control de calidad y menores costos. Se presentaron avances en prototipos de desodorantes y se enfatizó la construcción de una marca fuerte y sostenible.",
  },
  {
    projectId: SUFI_ID,
    title: "SUFI — Investor Strategy with Davis (Apr 1)",
    date: "2026-04-01",
    url: "https://meet.google.com/hhx-kppj-mxy",
    summary: "El proyecto Sufi avanza con diseño y prototipos listos para validar en el mercado latinoamericano. Common House posee 25% de participación, fundador argentino tiene 75% (diseñador industrial con experiencia global). Se lanzará tirada inicial de 100 unidades y producción de 5,000 en el segundo semestre, con enfoque en empaques ecoamigables. Modelo de negocio busca márgenes en venta de recargas con precio más bajo que Old Spice.",
  },
  {
    projectId: SUFI_ID,
    title: "SUFI catch up — Capital Raising (Mar 31)",
    date: "2026-03-31",
    url: "https://meet.google.com/kpe-yuzv-oqw",
    summary: "Se discutió la estrategia para levantar capital con 20 posibles inversores tras producción inicial de 100 unidades. Se mencionó la reducción de CAPEX gracias a moldes chinos a menor costo. Se planea escalar producción a 5,000 unidades y validar fórmula simple de desodorante de ingredientes vegetales. La producción inicial será artesanal o en laboratorios pequeños. Estrategia de marketing enfocada en educar al público y fomentar participación en redes sociales.",
  },
];

async function main() {
  console.log(`Creating ${MEETINGS.length} CH Sources records...\n`);
  let created = 0;
  let errors = 0;

  for (const m of MEETINGS) {
    try {
      const props = {
        "Source Title":      { title: [{ text: { content: m.title } }] },
        "Source Type":       { select: { name: "Meeting" } },
        "Source Platform":   { select: { name: "Fireflies" } },
        "Processing Status": { select: { name: "Processed" } },
        "Linked Projects":   { relation: [{ id: m.projectId }] },
        "Processed Summary": { rich_text: [{ text: { content: m.summary.slice(0, 2000) } }] },
      };
      if (m.date) props["Source Date"] = { date: { start: m.date } };
      if (m.url)  props["Source URL"]  = { url: m.url };

      await notion.pages.create({
        parent: { database_id: SOURCES_DB },
        properties: props,
      });

      console.log(`  ✓ ${m.title} (${m.date}) → ${m.projectId === IREFILL_ID ? "iRefill" : "SUFI"}`);
      created++;
    } catch (err) {
      console.error(`  ✗ ${m.title}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Created: ${created}, Errors: ${errors}`);
}

main().catch(console.error);
