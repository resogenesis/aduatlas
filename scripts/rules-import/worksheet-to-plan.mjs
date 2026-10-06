#!/usr/bin/env node
// Turn one city's tabs of the ADUAtlas city ADU rules worksheet (the .xlsx Amy
// fills in, Phoenix as the worked example) into a plan for import-adurules.mjs
// --plan. Nothing is written to ADUAtlas here.
//
//   node scripts/rules-import/worksheet-to-plan.mjs --file "<worksheet>.xlsx" \
//     --rules-sheet "Phoenix example" --links-sheet "Phoenix links" \
//     --city Phoenix --state AZ --state-name Arizona --out plan.json
//   then: node scripts/rules-import/import-adurules.mjs --plan plan.json --base ... [--apply]
//
// Rows whose Level is the state name become the state's rules; every other row
// is the city's. Status "Found in source" is a rule with its value, "Source is
// silent" is recorded as "the source did not state" with the source that was
// read, and "Not researched yet" is left out. Everything lands as a DRAFT,
// unverified, for a person to check and publish in the console (same rule as the
// adurules import). The worksheet's exact wording, second check and notes go in
// the admin note, never on the public page.
//
// The .xlsx is read with the system unzip, so the repo takes no new dependency.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { plain, citeFits } from "./import-adurules.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const home = (p) => (p ? p.replace(/^~(?=\/)/, os.homedir()) : p);

// ── xlsx ─────────────────────────────────────────────────────────────────────
const unzip = (file, member) => {
  try {
    return execFileSync("unzip", ["-p", file, member], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
};
const xmlText = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
const runsText = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join("");
const colIndex = (ref) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export const readSheet = (file, sheetName) => {
  const workbook = unzip(file, "xl/workbook.xml");
  const rels = unzip(file, "xl/_rels/workbook.xml.rels");
  const sheet = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((tag) => xmlText((tag.match(/name="([^"]*)"/) || [])[1] || "") === sheetName);
  if (!sheet) throw new Error(`no sheet named "${sheetName}"`);
  const rid = (sheet.match(/r:id="([^"]+)"/) || [])[1];
  const target = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((tag) => tag.includes(`Id="${rid}"`));
  const member = `xl/${(target.match(/Target="([^"]+)"/) || [])[1].replace(/^\/?xl\//, "")}`;
  const shared = [...unzip(file, "xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runsText(m[1]));
  const rows = [];
  for (const row of unzip(file, member).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const c of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] || "";
      const ref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1];
      const type = (attrs.match(/t="([^"]+)"/) || [])[1];
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let value = null;
      if (type === "s") value = shared[Number(v)];
      else if (type === "inlineStr") value = runsText(body);
      else if (v !== undefined) value = xmlText(v);
      if (ref) cells[colIndex(ref)] = value;
    }
    rows.push(cells);
  }
  return rows;
};

// Rows after the header row (the first row whose first cell is `firstHeader`),
// as objects keyed by the header names.
const tableFrom = (rows, firstHeader) => {
  const h = rows.findIndex((r) => (r[0] || "").trim() === firstHeader);
  if (h < 0) throw new Error(`no header row starting "${firstHeader}"`);
  const headers = rows[h].map((x) => (x || "").trim());
  return rows
    .slice(h + 1)
    .filter((r) => r && r.some((x) => x !== null && x !== undefined && String(x).trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((name, i) => [name, r[i] == null ? "" : String(r[i]).trim()])));
};

// ── vocabularies ─────────────────────────────────────────────────────────────
const HERE = path.dirname(fileURLToPath(import.meta.url));
// The 33 topics, keyed by the label the worksheet uses (0012's seed is the source).
const topicByLabel = () => {
  const sql = fs.readFileSync(path.resolve(HERE, "../../supabase/migrations/0012_rules_and_resources.sql"), "utf8");
  const seed = sql.slice(sql.indexOf("insert into public.regulatory_topics"));
  return Object.fromEntries([...seed.matchAll(/\(\s*'([a-z_]+)',\s*'[a-z_]+',\s*'([^']+)'/g)].map((m) => [m[2], m[1]]));
};
const SOURCE_TYPE = {
  "State statute": "state_statute",
  "State agency": "state_agency",
  "County code": "county_code",
  "City code": "city_code",
  "Municipal ordinance": "municipal_ordinance",
  "Planning department": "planning_department",
  "Building department": "building_department",
  "Official permit system": "official_permit_system",
  "Other official source": "other_official",
};
const RESOURCE_TYPE = {
  "Official ADU page": "official_adu_page",
  "Planning and zoning page": "planning_zoning_page",
  "ADU ordinance or code section": "ordinance",
  "Permit application": "permit_application",
  "Online permit portal": "application_portal",
  "Zoning map": "zoning_map",
  "Planning department": "planning_department",
  "Building department": "building_department",
  "Named ADU contact": "adu_contact",
  "ADU handbook or guide": "adu_handbook",
  "Fee schedule": "fee_schedule",
  "Design standards": "design_standards",
  "Pre-approved plans": "preapproved_plans",
  FAQ: "faq",
  Other: "other",
};
const FOUND = "Found in source";
const SILENT = "Source is silent";

// A date cell is either "YYYY-MM-DD" text or an Excel serial number.
const isoDate = (v) => {
  const s = String(v || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000).toISOString().slice(0, 10);
  return null;
};

// ── plan ─────────────────────────────────────────────────────────────────────
const LIMIT = { value_text: 2000, value_qualifier: 500, title: 300, admin_note: 4000 };

const noteFor = (source, parts, extra = []) => {
  const lines = [
    `From the ADUAtlas city worksheet (${source}): researched and second-checked from official sources. NOT yet checked by a person in the console.`,
    "Before publishing: open the source, confirm the value and its wording, then set verification to source checked.",
    ...extra,
  ];
  for (const p of parts) {
    const r = p.row;
    lines.push(`[${r.Rule}${r["Applies to"] && r["Applies to"] !== "all" ? `, applies to ${r["Applies to"]}` : ""}] ${r.Status}`);
    if (r["Exact wording from the source"]) lines.push(`Source wording: ${plain(r["Exact wording from the source"])}`);
    if (r["Effective date or ordinance"] && !isoDate(r["Effective date or ordinance"])) lines.push(`Effective date or ordinance: ${plain(r["Effective date or ordinance"])}`);
    if (r["Second check"]) lines.push(`Second check: ${plain(r["Second check"])}`);
    if (r.Notes) lines.push(`Notes: ${plain(r.Notes)}`);
  }
  let note = lines.join("\n");
  if (note.length > LIMIT.admin_note) note = `${note.slice(0, LIMIT.admin_note - 120)}\n[Continues in the worksheet: ${source}]`;
  return note;
};

export const planFromWorksheet = ({ file, rulesSheet, linksSheet, city, stateCode, stateName, slug, officialName, changeNote }) => {
  const source = path.basename(file);
  const topics = topicByLabel();
  const rules = tableFrom(readSheet(file, rulesSheet), "Level");
  const links = linksSheet ? tableFrom(readSheet(file, linksSheet), "Kind of resource") : [];
  const groups = { state: [], city: [] };
  for (const r of rules) (r.Level === stateName ? groups.state : groups.city).push(r);
  const lastChecked = rules.map((r) => isoDate(r["Date checked"])).filter(Boolean).sort().at(-1) || null;

  const planFor = (level, rows) => {
    const problems = [];
    const warnings = [];
    const byTopic = new Map();
    for (const row of rows) {
      if (row.Status !== FOUND && row.Status !== SILENT) continue; // not researched yet
      const known = topics[row.Rule];
      const topic = known || "other_restrictions";
      const label = known ? null : row.Rule;
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push({ row, label });
    }
    const provisions = [];
    for (const [topic, parts] of byTopic) {
      const found = parts.filter((p) => p.row.Status === FOUND);
      const primary = (found[0] || parts[0]).row;
      const sourceType = SOURCE_TYPE[primary["Source type"]] || null;
      if (primary["Source type"] && !sourceType) problems.push(`${topic}: unknown source type "${primary["Source type"]}"`);
      const { cite, full } = citeFits(parts.map((p) => p.row.Section).filter(Boolean));
      const checked = parts.map((p) => isoDate(p.row["Date checked"])).filter(Boolean).sort().at(-1) || null;
      const base = {
        topic_key: topic,
        source_url: primary["Source link"] || null,
        source_document_title: primary["Source document"] ? plain(primary["Source document"]).slice(0, LIMIT.title) : null,
        source_citation: cite,
        source_type: sourceType,
        supplied_by: "aduatlas_research",
        review_status: "draft",
        verification_status: "unverified",
        source_checked_date: checked,
      };
      if (!found.length) {
        // Every part says the source is silent: the field records that, with the
        // source that was read and no value.
        provisions.push({ ...base, field_state: "source_did_not_state", value_text: null, value_qualifier: null, admin_note: noteFor(source, parts, full ? [`Full citation: ${full}`] : []) });
        continue;
      }
      const silent = parts.filter((p) => p.row.Status === SILENT);
      const labelled = found.length > 1 || found.some((p) => p.label);
      const bodyOf = (r) => [plain(r.Value), r["Condition or detail"] ? plain(r["Condition or detail"]) : ""].filter(Boolean).join("\n");
      let text;
      let qualifier = null;
      if (!labelled && found[0].row["Condition or detail"] && plain(found[0].row["Condition or detail"]).length <= LIMIT.value_qualifier) {
        text = plain(found[0].row.Value);
        qualifier = plain(found[0].row["Condition or detail"]);
      } else {
        text = found.map((p) => (labelled ? `${p.label || p.row.Rule}:\n${bodyOf(p.row)}` : bodyOf(p.row))).join("\n\n");
      }
      const extra = [];
      if (full) extra.push(`Full citation: ${full}`);
      if (silent.length) extra.push(`Also asked, and the source is silent on: ${silent.map((p) => p.row.Rule).join("; ")}`);
      if (text.length > LIMIT.value_text) {
        extra.unshift(`FULL TEXT (the rule was shortened to fit):\n${text}`);
        const marker = "\n(Shortened on import: the full text is in the admin note. A reviewer must finish this rule before publishing.)";
        let kept = "";
        for (const line of text.split("\n")) {
          if ((kept ? kept.length + 1 : 0) + line.length + marker.length > LIMIT.value_text) break;
          kept = kept ? `${kept}\n${line}` : line;
        }
        text = `${kept}${marker}`;
        warnings.push(`${topic}: shortened to fit 2000 characters; full text in the admin note`);
      }
      const effective = found.map((p) => isoDate(p.row["Effective date or ordinance"])).find(Boolean) || null;
      provisions.push({ ...base, field_state: "verified_from_source", value_text: text, value_qualifier: qualifier, effective_date: effective, admin_note: noteFor(source, parts, extra) });
      if (!base.source_url) problems.push(`${topic}: no source link`);
    }
    return { provisions, problems, warnings };
  };

  const resources = [];
  const linkWarnings = [];
  for (const r of links) {
    const kind = RESOURCE_TYPE[r["Kind of resource"]];
    if (!kind) {
      linkWarnings.push(`unknown kind of resource "${r["Kind of resource"]}"; left out`);
      continue;
    }
    if (r.Status !== FOUND || !/^https?:\/\//.test(r.Link || "")) {
      linkWarnings.push(`${r["Kind of resource"]}: ${r.Status || "no status"}${r.Link ? "" : ", no link"}; left out`);
      continue;
    }
    // ADUAtlas refuses an over-long field rather than cutting it. One that does
    // not fit is left empty and kept whole in the admin note for the reviewer.
    const LINK_LIMITS = { Phone: ["phone", 40], Email: ["email", 254], "Contact name": ["contact_name", 160], "Contact title": ["contact_title", 160], Department: ["department_name", 200], Address: ["address", 300], Hours: ["hours", 200] };
    const fields = {};
    const tooLong = [];
    for (const [col, [key, max]] of Object.entries(LINK_LIMITS)) {
      const v = plain(r[col] || "");
      if (v.length > max) {
        fields[key] = null;
        tooLong.push(`${col} (too long for the field, ${v.length} of ${max} characters; shorten it): ${v}`);
        linkWarnings.push(`${r["Kind of resource"]}: ${col} is ${v.length} characters (limit ${max}); moved to the admin note`);
      } else fields[key] = v || null;
    }
    resources.push({
      resource_type: kind,
      url: r.Link,
      label: plain(r.Label || r["Kind of resource"]).slice(0, 200),
      field_state: "verified_from_source",
      source_url: /^https?:\/\//.test(r["Found on (source page)"] || "") ? r["Found on (source page)"] : r.Link,
      source_type: SOURCE_TYPE[r["Source type"]] || (/(\.gov|\.us)(\/|$)/.test(r.Link) ? "planning_department" : null),
      ...fields,
      supplied_by: "aduatlas_research",
      review_status: "draft",
      verification_status: "unverified",
      source_checked_date: lastChecked,
      admin_note: [
        `From the ADUAtlas city worksheet (${source}). NOT yet checked by a person in the console. The links tab has no date column; this carries the city's latest rule check date.`,
        r["Exact wording from the source"] ? `Source wording: ${plain(r["Exact wording from the source"])}` : "",
        r["Second check"] ? `Second check: ${plain(r["Second check"])}` : "",
        r.Notes ? `Notes: ${plain(r.Notes)}` : "",
        ...tooLong,
      ].filter(Boolean).join("\n").slice(0, LIMIT.admin_note),
    });
  }

  const note = changeNote || `Imported from the city worksheet (${source})`;
  const plans = [];
  if (groups.state.length) {
    const s = planFor("state", groups.state);
    plans.push({ slug: stateName.toLowerCase().replace(/\s+/g, "-"), name: stateName, official_name: null, level: "state", state_code: stateCode, change_note: note, provisions: s.provisions, resources: [], unmapped: [], problems: s.problems, warnings: s.warnings });
  }
  const c = planFor("city", groups.city);
  plans.push({ slug, name: city, official_name: officialName, level: "municipality", state_code: stateCode, change_note: note, provisions: c.provisions, resources, unmapped: [], problems: c.problems, warnings: [...c.warnings, ...linkWarnings] });
  return plans;
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = home(opt("file"));
  const city = opt("city");
  const stateCode = (opt("state") || "").toUpperCase();
  const stateName = opt("state-name");
  if (!file || !city || !stateCode || !stateName || !opt("rules-sheet")) {
    console.error("usage: --file <xlsx> --rules-sheet <tab> [--links-sheet <tab>] --city <name> --state <XX> --state-name <name> [--slug] [--official] [--out plan.json]");
    process.exit(2);
  }
  const plans = planFromWorksheet({
    file,
    rulesSheet: opt("rules-sheet"),
    linksSheet: opt("links-sheet"),
    city,
    stateCode,
    stateName,
    slug: opt("slug") || city.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    officialName: opt("official") || `City of ${city}`,
    changeNote: opt("change-note"),
  });
  for (const p of plans) {
    console.log(`${p.slug.padEnd(14)} ${p.level.padEnd(12)} ${String(p.provisions.length).padStart(2)} rules (${p.provisions.filter((x) => x.field_state === "source_did_not_state").length} "source did not state"), ${p.resources.length} links`);
    for (const pr of p.problems) console.log(`   ! ${pr}`);
    for (const w of p.warnings) console.log(`   ~ ${w}`);
  }
  const out = home(opt("out"));
  if (out) {
    fs.writeFileSync(out, JSON.stringify(plans, null, 1));
    console.log(`plan written to ${out}`);
  }
}
