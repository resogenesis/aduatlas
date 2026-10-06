#!/usr/bin/env node
// Import a state's ADU rules from the adurules research corpus into ADUAtlas as
// DRAFTS, through the same admin API the console uses (api/admin/_regulatory.js),
// so every validation a person would meet applies here too.
//
// WHY DRAFTS (Richard, 2026-10-04): the public Rules page promises that ADUAtlas
// does not populate requirements from summaries written by a machine. adurules
// values were researched and rechecked by AI agents against official sources, so
// every row lands as review_status 'draft' and verification_status 'unverified'.
// A person opens the source, confirms the value, marks it source checked and
// publishes it from the admin console. Nothing here publishes anything.
//
// CONFLICTS (same decision): where the city's adopted code says something state
// law overrides (adurules `conflict: true`), the city's rule keeps the city's text
// and carries the qualifier below. The state's own rule for the same topic sits
// beside it on the page, because the Rules page shows every level side by side
// and never merges them.
//
// Usage:
//   node scripts/rules-import/import-adurules.mjs --base https://aduatlas-staging.vercel.app \
//     --env-file ~/.config/secrets/aduatlas/staging.env --personas ~/.config/secrets/aduatlas/staging-personas.json \
//     [--data ~/Projects/adurules/data/ca] [--only oakland,ca-state] [--out plan.json] [--apply]
// Without --apply it only builds the plan, reports anything the API would refuse,
// and writes the plan to --out. It refuses the production site unless --production
// is passed as well.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const home = (p) => (p ? p.replace(/^~(?=\/)/, os.homedir()) : p);

const BASE = (opt("base") || "").replace(/\/+$/, "");
const DATA = home(opt("data", "~/Projects/adurules/data/ca"));
const ONLY = (opt("only") || "").split(",").map((s) => s.trim()).filter(Boolean);
const OUT = home(opt("out"));
// A prebuilt plan (for example from worksheet-to-plan.mjs) instead of the adurules corpus.
const PLAN = home(opt("plan"));
const APPLY = flag("apply");
const PRODUCTION_HOSTS = ["aduatlas.com", "www.aduatlas.com", "aduatlas.vercel.app"];


export const CONFLICT_QUALIFIER = "State law overrides local rules here; the city's published code may be out of date.";

// ── adurules field -> ADUAtlas topic ─────────────────────────────────────────
// Several adurules fields can feed one topic (ADUAtlas holds ONE current rule per
// jurisdiction and topic); each becomes a labelled part of that rule's text.
const CITY_TOPICS = {
  max_detached_size_sqft: [["max_size", "Detached ADU"]],
  max_attached_size_sqft: [["max_size", "Attached ADU"]],
  max_height_detached_ft: [["height_limit", null]],
  setbacks_side_rear_ft: [["setback_side", null], ["setback_rear", null]],
  max_adus_per_lot: [["number_allowed", null]],
  parking_rules_local: [["parking_required", null]],
  impact_fees_local: [["impact_fees", null]],
  owner_occupancy_local: [["owner_occupancy_required", null]],
  jadu_rules: [["jadu_allowed", null]],
  separate_conveyance_condo: [["separate_sale_allowed", null]],
  design_standards: [["design_standards_apply", null]],
  preapproved_plans: [["preapproved_plans", null]],
  lot_coverage_rules: [["max_lot_coverage", null]],
  min_rental_term: [["short_term_rental_allowed", null]],
  special_overlay_zones: [["other_restrictions", "Overlay and special zones"]],
  adu_amnesty_program: [["other_restrictions", "Unpermitted ADUs"]],
};
const STATE_TOPICS = {
  state_floor_unit: [["max_size", "Minimum ADU every city must allow"]],
  attached_adu_min_size_floor_sqft: [["max_size", "Attached ADU size a city may not go below"]],
  max_size_more_permissive_allowed: [["max_size", "Larger local limits"]],
  detached_height_base_ft: [["height_limit", "Detached ADU"]],
  detached_height_transit_or_multifamily_ft: [["height_limit", "Detached ADU near transit or on a multifamily lot"]],
  attached_height_max_cap_ft: [["height_limit", "Attached ADU"]],
  max_side_rear_setback_ft: [["setback_side", null], ["setback_rear", null]],
  parking_max_spaces: [["parking_required", null]],
  parking_no_replacement: [["parking_exemptions", "Replacement parking"]],
  parking_exemptions: [["parking_exemptions", "When no parking may be required"]],
  ministerial_review_days: [["review_timeline", null]],
  impact_fees: [["impact_fees", null]],
  owner_occupancy_adu: [["owner_occupancy_required", null]],
  condo_conveyance: [["separate_sale_allowed", null]],
  state_mandated_66323_units: [["number_allowed", null]],
  fire_sprinklers: [["fire_sprinklers_required", null]],
  subjective_design_standards: [["design_standards_apply", null]],
  solar_new_detached: [["other_restrictions", "Solar on new detached ADUs"]],
  unpermitted_adu_amnesty: [["other_restrictions", "Unpermitted ADUs"]],
};
// Links become resources, not rules.
const CITY_RESOURCES = {
  permit_portal: "application_portal",
  fee_schedule_url: "fee_schedule",
};
// Recorded in each rule's admin note; not a rule of its own.
const CONTEXT_ONLY = new Set(["ordinance_number_and_date"]);

// ── text ─────────────────────────────────────────────────────────────────────
// Public copy carries no em dashes or arrows (house style); the reviewer sees the
// result before anything is published.
export const plain = (s) =>
  String(s)
    .replace(/\s+[—]\s+/g, "; ")
    .replace(/[—]/g, ", ")
    .replace(/\s+--\s+/g, "; ")
    .replace(/(\d)\s*[–]\s*(\d)/g, "$1 to $2")
    .replace(/[–]/g, "-")
    .replace(/\s*[→]\s*/g, " to ")
    .replace(/(^|[\s(;,])ss (\d)/g, "$1§§ $2")
    .replace(/(^|[\s(;,])s (\d)/g, "$1§ $2")
    .replace(/[ \t]+/g, " ")
    .trim();

const UNIT = { sqft: "sq ft", "sq ft": "sq ft", ft: "ft", feet: "ft", days: "days", day: "days", usd: "USD", "%": "%", percent: "%" };
const fmtNumber = (n, unit) => {
  const u = String(unit || "").toLowerCase();
  if (u.startsWith("usd")) {
    const per = unit.slice(3).trim();
    return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}${per ? ` ${per}` : ""}`;
  }
  const label = UNIT[u] ?? unit ?? "";
  return `${Number(n).toLocaleString("en-US")}${label ? (label === "%" ? "%" : ` ${label}`) : ""}`;
};
const fmtScalar = (v, unit) => {
  if (typeof v === "number") return fmtNumber(v, unit);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (v == null) return "";
  return plain(v);
};
export const renderValue = (value, unit) => {
  if (value && typeof value === "object" && Array.isArray(value.conditional)) {
    return value.conditional.map((c) => `${plain(c.when)}: ${fmtScalar(c.value, c.unit)}`).join("\n");
  }
  return fmtScalar(value, unit);
};

const sourceTypeOf = (url, level) => {
  const host = (() => {
    try {
      return new URL(url).host.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (/leginfo\.legislature\.ca\.gov$/.test(host)) return "state_statute";
  if (level === "state" || /(^|\.)ca\.gov$/.test(host)) return "state_agency";
  if (/(municode\.com|amlegal\.com|ecode360\.com|codepublishing\.com|qcode\.us|municipal\.codes|mcclibraryfunctions)/.test(host)) return "city_code";
  if (/(legistar|granicus|escribe|laserfiche|primegov)/.test(host)) return "municipal_ordinance";
  if (/accela|etrakit|permit/.test(host)) return "official_permit_system";
  return "planning_department";
};

// The citation is public and limited to 300 characters; the API refuses rather
// than cuts. A longer one keeps its first whole clause here and is recorded in
// full in the admin note.
// Split a citation on the semicolons that separate its clauses, never on one
// inside brackets.
const topLevelClauses = (c) => {
  const out = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === "(" || ch === "[") depth++;
    if ((ch === ")" || ch === "]") && depth > 0) depth--;
    if (ch === ";" && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
};
export const citeFits = (cites) => {
  const clauses = [...new Set(cites.flatMap((c) => topLevelClauses(plain(c))))];
  const all = clauses.join("; ");
  if (all.length <= 300) return { cite: all || null, full: null };
  // Too long for the public field: keep whole clauses that name a section,
  // leaving out any that quote the source (those quotes are kept in the admin
  // note), so a citation never ends inside a bracket or a quotation.
  let out = "";
  for (const clause of clauses) {
    if (/['"\u2018\u2019\u201c\u201d]/.test(clause) || clause.length > 300) continue;
    const next = out ? `${out}; ${clause}` : clause;
    if (next.length > 300) break;
    out = next;
  }
  return { cite: out || null, full: all };
};

// A citation naming a municipal code section is the city's code, wherever the
// city hosts its copy.
const CITY_CODE_CITE = /\b[A-Z]{1,5}MC\b|\bOPC\b|\bSRCC\b|Municipal Code|Planning Code|Zoning Code|Development Code/;

// ── plan ─────────────────────────────────────────────────────────────────────
const readJurisdictions = () => {
  const files = [path.join(DATA, "_state.json"), ...fs.readdirSync(path.join(DATA, "cities")).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(DATA, "cities", f))];
  return files.map((f) => JSON.parse(fs.readFileSync(f, "utf8"))).filter((j) => !ONLY.length || ONLY.includes(j.slug));
};

const adminNoteFor = (j, parts, ordinance, extraCites, fullText = null) => {
  const lines = [
    ...(fullText ? [`FULL RESEARCH TEXT (the rule was shortened to fit):\n${fullText}`] : []),
    `Imported from adurules (machine-researched by AI agents, rechecked against official sources ${[...new Set(parts.map((p) => p.fact.verified))].join(", ")}). NOT yet checked by a person.`,
    "Before publishing: open the source, confirm the value and its wording, then set verification to source checked.",
  ];
  if (parts.some((p) => p.fact.conflict)) lines.push("Flagged: the city's adopted code here conflicts with current state law, so the public rule carries the state-law-overrides note. Confirm the conflict is still live before publishing.");
  if (ordinance) lines.push(`City ADU ordinance history: ${plain(renderValue(ordinance.value, ordinance.unit))}`);
  for (const p of parts) {
    lines.push(`[${p.key}${p.label ? `, ${p.label}` : ""}] source ${p.fact.source}${p.fact.cite ? ` | cite ${plain(p.fact.cite)}` : ""}`);
    if (p.fact.notes) lines.push(`Research notes: ${plain(p.fact.notes)}`);
  }
  for (const c of extraCites) lines.push(`Full citation: ${c}`);
  let note = lines.join("\n");
  if (note.length > 4000) note = `${note.slice(0, 3900)}\n[Research notes continue in adurules data/ca and monitor/rechecks/2026-10-05.json.]`;
  return note;
};

// adurules names carry the state ("Oakland, CA"); ADUAtlas shows the state
// beside the name already, so the record is "Oakland" / "City of Oakland".
const OFFICIAL_NAMES = { "san-francisco": "City and County of San Francisco" };
const displayName = (j) => String(j.jurisdiction).replace(/,\s*[A-Z]{2}$/, "").trim();
const officialName = (j) => OFFICIAL_NAMES[j.slug] || `City of ${displayName(j)}`;

export const planJurisdiction = (j) => {
  const isState = j.level === "state";
  const name = isState ? "California" : displayName(j);
  const map = isState ? STATE_TOPICS : CITY_TOPICS;
  const byTopic = new Map();
  const unmapped = [];
  for (const [key, fact] of Object.entries(j.fields)) {
    if (CONTEXT_ONLY.has(key) || (!isState && CITY_RESOURCES[key])) continue;
    const targets = map[key];
    if (!targets) {
      unmapped.push(key);
      continue;
    }
    for (const [topic, label] of targets) {
      if (!byTopic.has(topic)) byTopic.set(topic, []);
      byTopic.get(topic).push({ key, label, fact });
    }
  }
  const ordinance = j.fields.ordinance_number_and_date || null;
  const provisions = [];
  const problems = [];
  const warnings = [];
  for (const [topic, parts] of byTopic) {
    const labelled = parts.length > 1 || parts.some((p) => p.label);
    let text = parts
      .map((p) => {
        const body = renderValue(p.fact.value, p.fact.unit);
        return labelled && p.label ? `${p.label}:\n${body}` : body;
      })
      .join("\n\n");
    const primary = parts[0].fact;
    const { cite, full } = citeFits(parts.map((p) => p.fact.cite).filter(Boolean));
    const conflict = parts.some((p) => p.fact.conflict);
    // ADUAtlas refuses a rule over 2000 characters rather than cutting it. A
    // longer research text keeps its whole lines up to the limit, says so in the
    // rule itself, and is kept in full at the top of the admin note; it is a draft,
    // and the reviewer shortens it before it can be published.
    let fullText = null;
    if (text.length > 2000) {
      fullText = text;
      const marker = "\n(Shortened on import: the full research text is in the admin note. A reviewer must finish this rule before publishing.)";
      let kept = "";
      for (const line of text.split("\n")) {
        if ((kept ? kept.length + 1 : 0) + line.length + marker.length > 2000) break;
        kept = kept ? `${kept}\n${line}` : line;
      }
      text = `${kept}${marker}`;
      warnings.push(`${j.slug}/${topic}: ${fullText.length} characters, shortened to ${text.length} with a marker; full text in the admin note`);
    }
    const provision = {
      topic_key: topic,
      field_state: "verified_from_source",
      value_text: text,
      value_qualifier: conflict && !isState ? CONFLICT_QUALIFIER : null,
      source_url: primary.source,
      source_document_title: primary.source_title ? plain(primary.source_title).slice(0, 300) : null,
      source_citation: cite,
      source_type: !isState && CITY_CODE_CITE.test(primary.cite || "") && sourceTypeOf(primary.source, j.level) === "planning_department" ? "city_code" : sourceTypeOf(primary.source, j.level),
      supplied_by: "aduatlas_research",
      review_status: "draft",
      verification_status: "unverified",
      source_checked_date: parts.map((p) => p.fact.verified).sort().at(-1),
      admin_note: adminNoteFor(j, parts, ordinance, full ? [full] : [], fullText),
    };
    if ((provision.source_document_title || "").length > 300) problems.push(`${j.slug}/${topic}: source title over 300`);
    provisions.push(provision);
  }
  const resources = [];
  const addResource = (type, url, label, fact) => {
    if (!url || !/^https?:\/\//.test(url)) return;
    resources.push({
      resource_type: type,
      url,
      label: plain(label).slice(0, 200),
      field_state: "verified_from_source",
      source_url: fact?.source || url,
      source_type: sourceTypeOf(fact?.source || url, j.level),
      supplied_by: "aduatlas_research",
      review_status: "draft",
      verification_status: "unverified",
      source_checked_date: fact?.verified || null,
      admin_note: `Imported from adurules (machine-researched, rechecked ${fact?.verified || "n/a"}). NOT yet checked by a person.${fact?.notes ? `\nResearch notes: ${plain(fact.notes).slice(0, 3000)}` : ""}`,
    });
  };
  const firstUrl = (v) => (String(renderValue(v)).match(/https?:\/\/[^\s)"';,]+/) || [])[0];
  // The ADU page itself has no fact of its own; it was read during the same
  // recheck, so it carries the jurisdiction's latest check date.
  const lastChecked = Object.values(j.fields).map((f) => f.verified).filter(Boolean).sort().at(-1) || null;
  if (j.official_adu_page) addResource("official_adu_page", j.official_adu_page, isState ? "HCD Accessory Dwelling Units page" : `${name} ADU page`, { source: j.official_adu_page, verified: lastChecked });
  if (j.ordinance_url) addResource("ordinance", j.ordinance_url, isState ? "Gov. Code §§ 66310-66342" : `${name} ADU ordinance`, ordinance);
  if (!isState) {
    for (const [key, type] of Object.entries(CITY_RESOURCES)) {
      const f = j.fields[key];
      if (!f) continue;
      const url = firstUrl(f.value) || null;
      addResource(type, url, type === "fee_schedule" ? `${name} fee schedule` : `${name} permit portal`, f);
    }
  }
  return { slug: j.slug, name, official_name: isState ? null : officialName(j), level: j.level, state_code: j.state || "CA", change_note: "Imported from adurules (October 2026 recheck)", provisions, resources, unmapped, problems, warnings };
};

// ── API ──────────────────────────────────────────────────────────────────────
const readEnv = (file) =>
  Object.fromEntries(
    fs
      .readFileSync(home(file), "utf8")
      .split("\n")
      .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
      .filter(Boolean)
      .map(([, k, v]) => [k, v.replace(/^["']|["']$/g, "")]),
  );

const signIn = async () => {
  const env = readEnv(opt("env-file"));
  const admin = JSON.parse(fs.readFileSync(home(opt("personas")), "utf8")).admin;
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: admin.email, password: admin.password }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.access_token) throw new Error(`admin sign-in failed (HTTP ${r.status}; details withheld)`);
  return body.access_token;
};

const api = (token) => async (action, { method = "GET", body, query = "" } = {}) => {
  const r = await fetch(`${BASE}/api/admin/regulatory/${action}${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => ({}));
  return { status: r.status, ok: r.ok, json };
};

const run = async () => {
  if (!BASE) {
    console.error("--base is required");
    process.exit(2);
  }
  if (PRODUCTION_HOSTS.includes(new URL(BASE).host) && !flag("production")) {
    console.error(`${BASE} is production. Pass --production as well, and only with Richard's approval.`);
    process.exit(2);
  }
  const plans = PLAN ? JSON.parse(fs.readFileSync(PLAN, "utf8")) : readJurisdictions().map(planJurisdiction);
  const report = { base: BASE, apply: APPLY, jurisdictions: [] };
  let problems = 0;
  for (const p of plans) {
    problems += p.problems.length;
    console.log(`${p.slug.padEnd(14)} ${String(p.provisions.length).padStart(2)} rules, ${p.resources.length} links${p.unmapped.length ? `, unmapped: ${p.unmapped.join(", ")}` : ""}`);
    for (const pr of p.problems) console.log(`   ! ${pr}`);
    for (const w of p.warnings) console.log(`   ~ ${w}`);
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(plans, null, 1));
  if (!APPLY) {
    console.log(`plan only (no --apply). ${problems} problem(s).${OUT ? ` Plan written to ${OUT}.` : ""}`);
    return;
  }
  if (problems) {
    console.error("refusing to apply while the plan has problems");
    process.exit(1);
  }
  const call = api(await signIn());
  // Each plan names its state; the state's record and its jurisdictions are read once per state.
  const byState = new Map();
  const stateScope = async (code) => {
    if (byState.has(code)) return byState.get(code);
    const list = await call("jurisdictions", { query: `?state=${code}` });
    if (!list.ok) throw new Error(`could not list ${code} jurisdictions: HTTP ${list.status} ${list.json.error || ""}`);
    const items = list.json.items || [];
    const state = items.find((x) => x.jurisdiction_type === "state" && x.state_code === code);
    if (!state) throw new Error(`the state ${code} is not in this database`);
    byState.set(code, { items, state });
    return byState.get(code);
  };
  for (const p of plans) {
    const code = p.state_code || "CA";
    const { items, state } = await stateScope(code);
    const out = { slug: p.slug, created: 0, updated: 0, skipped: [], errors: [] };
    report.jurisdictions.push(out);
    let jur = p.level === "state" ? state : items.find((x) => x.slug === p.slug && x.parent_id === state.id) || items.find((x) => x.slug === p.slug);
    if (!jur) {
      const made = await call("jurisdiction-save", {
        method: "POST",
        body: { jurisdiction: { jurisdiction_type: "municipality", parent_id: state.id, name: p.name, official_name: p.official_name, slug: p.slug, state_code: code } },
      });
      if (!made.ok) {
        out.errors.push(`jurisdiction: HTTP ${made.status} ${made.json.error || ""}`);
        console.log(`${p.slug}: could not create the jurisdiction: ${made.json.error || made.status}`);
        continue;
      }
      jur = made.json.jurisdiction;
      out.jurisdiction_created = true;
    } else if (p.level !== "state" && (jur.name !== p.name || jur.official_name !== p.official_name)) {
      // Correct a name an earlier run of this importer wrote. Publish state is
      // not sent, so the record keeps whatever it has.
      const fixed = await call("jurisdiction-save", {
        method: "POST",
        body: { jurisdiction: { id: jur.id, jurisdiction_type: jur.jurisdiction_type, parent_id: jur.parent_id, name: p.name, official_name: p.official_name, slug: jur.slug, state_code: code } },
      });
      if (fixed.ok) out.renamed = `${jur.name} -> ${p.name}`;
      else out.errors.push(`rename: HTTP ${fixed.status} ${fixed.json.error || ""}`);
    }
    const detail = await call("jurisdiction", { query: `?id=${jur.id}` });
    const existing = detail.json.provisions || [];
    const existingRes = detail.json.resources || [];
    for (const prov of p.provisions) {
      const same = existing.filter((e) => e.topic_key === prov.topic_key && !["superseded", "retracted", "rejected"].includes(e.review_status));
      if (same.some((e) => e.review_status === "published")) {
        out.skipped.push(`${prov.topic_key}: a published rule exists; left untouched`);
        continue;
      }
      const draft = same.find((e) => e.supplied_by === "aduatlas_research" && ["draft", "in_review"].includes(e.review_status));
      if (same.length && !draft) {
        out.skipped.push(`${prov.topic_key}: an open record not from ADUAtlas research exists; left untouched`);
        continue;
      }
      const r = await call("provision-save", { method: "POST", body: { provision: { ...prov, id: draft?.id, jurisdiction_id: jur.id, change_note: p.change_note || "Imported by the rules importer" } } });
      if (r.ok) draft ? out.updated++ : out.created++;
      else out.errors.push(`${prov.topic_key}: HTTP ${r.status} ${r.json.error || ""}`);
    }
    for (const res of p.resources) {
      // Same kind AND same link: a city can list two resources of one kind
      // (two "other" links), and the second must not overwrite the first.
      const same = existingRes.find((e) => e.resource_type === res.resource_type && (e.url || "") === (res.url || "") && !["superseded", "retracted", "rejected"].includes(e.review_status));
      if (same && same.review_status === "published") {
        out.skipped.push(`resource ${res.resource_type}: a published link exists; left untouched`);
        continue;
      }
      if (same && same.supplied_by !== "aduatlas_research") {
        out.skipped.push(`resource ${res.resource_type}: an open record not from ADUAtlas research exists; left untouched`);
        continue;
      }
      const r = await call("resource-save", { method: "POST", body: { resource: { ...res, id: same?.id, jurisdiction_id: jur.id } } });
      if (r.ok) same ? out.updated++ : out.created++;
      else out.errors.push(`resource ${res.resource_type}: HTTP ${r.status} ${r.json.error || ""}`);
    }
    console.log(`${p.slug.padEnd(14)} created ${out.created}, updated ${out.updated}, skipped ${out.skipped.length}, errors ${out.errors.length}${out.renamed ? `, renamed ${out.renamed}` : ""}`);
    for (const e of out.errors) console.log(`   ! ${e}`);
  }
  if (OUT) fs.writeFileSync(OUT.replace(/\.json$/, ".result.json"), JSON.stringify(report, null, 1));
};

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((e) => {
    console.error(String(e?.message || e));
    process.exit(1);
  });
}
