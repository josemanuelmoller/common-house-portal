/**
 * inspect-notion-schema.mjs
 * Retrieves and prints all property names + types from the Opportunities DB.
 * Usage: node scripts/inspect-notion-schema.mjs
 */
import { Client } from "@notionhq/client";
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* already set */ }
}
loadEnv();

const NOTION_DB_OPPORTUNITIES = "687caa98594a41b595c9960c141be0c0";

async function main() {
  const key = process.env.NOTION_API_KEY;
  if (!key) { console.error("NOTION_API_KEY not set"); process.exit(1); }

  const notion = new Client({ auth: key });
  const db = await notion.databases.retrieve({ database_id: NOTION_DB_OPPORTUNITIES });

  console.log(`Database: ${db.title?.[0]?.plain_text ?? "(untitled)"}\n`);
  console.log("Properties:");

  const entries = Object.entries(db.properties).sort(([a], [b]) => a.localeCompare(b));
  for (const [name, prop] of entries) {
    console.log(`  "${name}" [${prop.type}]`);
    if (prop.type === "select" && prop.select?.options?.length) {
      const opts = prop.select.options.map(o => o.name).join(" | ");
      console.log(`    options: ${opts}`);
    }
    if (prop.type === "multi_select" && prop.multi_select?.options?.length) {
      const opts = prop.multi_select.options.map(o => o.name).join(" | ");
      console.log(`    options: ${opts}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
