// Load a researched builder seed file into the builders table.
//
// WHY THIS EXISTS. The Arizona seed is 86 ready records shaped for the builders
// table, and all three packages sell a directory that reads that table. The file
// lives at data/seed/builders-az.json, which is gitignored on purpose: it carries
// third-party contact details and this repository is public. Until this script
// existed there was no way to get it into a database, so the directory would have
// launched empty behind a paid feature.
//
// RUN IT
//   node scripts/seed-builders.mjs data/seed/builders-az.json              dry run
//   node scripts/seed-builders.mjs data/seed/builders-az.json --confirm    writes
//   node scripts/seed-builders.mjs data/seed/builders-az.json --limit 5    first N
//
//   SUPABASE_URL                (or VITE_SUPABASE_URL) the project to write to
//   SUPABASE_SERVICE_ROLE_KEY   service role. RLS does not let anything else
//                               insert a builder.
//
// A dry run is the default and it never writes. It reads the database, works out
// exactly what it would create, update and skip, prints that, and stops. Nothing
// is written without --confirm.
//
// THE RULES IT KEEPS, from the Phase 1 spec and from the seed file's own
// loader_rules block:
//
//   • Every record is an UNCLAIMED listing: owner_user_id null, profile_status
//     'approved'. A well researched record is still a listing nobody at the
//     company agreed to (decision 2c).
//   • UNKNOWN MEANS UNKNOWN (decision 2b). Where the seed says null, the column
//     is not written at all, so the value stays null instead of picking up a
//     default. build_approach is null on every record in the Arizona file and
//     turnkey is null on 74 of 86; a database that has not applied migration
//     0008 would silently turn those into "Custom and prefab" and "No", which is
//     exactly the defect 0008 was written to fix. The run VERIFIES this after
//     writing and fails loudly if the database did that.
//   • Only the `columns` block of a record maps to a FACT column. The
//     `aduatlas_account` block is never written anywhere.
//   • PROVENANCE IS NOW LOADED, which is the one rule this script has changed.
//     The seed file's own loader_rules say "research and aduatlas_account are
//     provenance and must not be written to it", and that rule was written when
//     no provenance column existed: decision 2f lists "factual provenance" among
//     the builder attributes Amy maintains, and until migration 0017 there was
//     nowhere to put any of it, so every page the research read was discarded at
//     import. 0017 adds the columns, so exactly two pieces of evidence now load:
//         research.pages_read  ->  builders.source_urls
//         research.collected   ->  builders.sources_checked_on
//     Nothing else from the `research` block is written: not `status`, not
//     `confidence`, not the per-attribute `stated` flags or their reasons, not
//     `found_by_city_search`. Those are the research's working notes, and 2f's
//     provenance is the evidence a reader can check.
//   • SOURCE URLS ARE MERGED, NEVER REPLACED. An existing listing keeps every
//     source URL already on the record and gains the ones this file adds. A
//     source an admin recorded by hand — the page behind a price she established
//     — is evidence, and 2l's standard is that "provenance is maintained so a
//     claim cannot silently lose its source". Removing a wrong URL is an admin
//     action in the console, not something a re-run does silently.
//   • sources_checked_on only ever MOVES FORWARD. It answers "when did ADUAtlas
//     last look", so re-running an older seed file does not rewind it, and it is
//     not written at all when the record names no pages to have looked at.
//   • IT NEVER WRITES A PRICE OR A RESIDENTIAL/COMMERCIAL ANSWER, and that is a
//     refusal rather than an omission. 0017's pricing_note, pricing_source_url,
//     serves_residential and serves_commercial record only what a company itself
//     established, and NOT ONE of the 96 researched Arizona companies established
//     any of them: two records note that a company's site mentions pricing without
//     stating a price, which is not an established price. Deriving one from a build
//     method, a square-foot rule of thumb or the description text is exactly the
//     inference the seed file's own unknown_rule already had to remove once from
//     build_approach. If a future research file states one, this loader says so
//     and still does not write it: an established price belongs in the admin
//     console, entered deliberately (decision 2f).
//   • It never writes imagery (logo_path, photos, videos), the commercial fields
//     (relationship_type, commercial_terms, membership_price_cents,
//     success_fee_cents, intro_days), the claim and verification fields
//     (claim_code, claimed_at, verified_at, verified_by), admin_notes, featured
//     or active. Seeding a listing from a company's own material is grounds to
//     describe the company, not permission to republish its pictures or to invent
//     a commercial relationship.
//   • A CLAIMED listing is never touched. Once a builder owns the row, the
//     company's own information wins over ADUAtlas's research, and the update is
//     also guarded server-side with `owner_user_id is null` so a claim that lands
//     mid-run cannot be overwritten.
//   • An existing unclaimed listing is corrected, not clobbered: only fields the
//     seed actually states are written, so a value an admin typed by hand is
//     never replaced with a blank.
//   • Re-running is safe. It matches on slug, writes only what differs, and says
//     "unchanged" for the rest.
//   • A referral code is generated on insert, the same way api/admin/_builders.js
//     does it. A code is not a link: referralLinkFor() in src/lib/builders.js
//     resolves nothing until the listing is claimed and approved, and no
//     invitation should ever carry one (decision 2c).
//
// It does not approve, verify, claim, feature, bill or email anything.

import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// ── the vocabulary, mirroring the database and src/lib/builders.js ───────────
// specialties and service_types have no check constraint in the schema, so a
// typo would land a row that no filter can find. Validated here instead, and a
// bad value stops the run rather than being quietly dropped.
const SPECIALTIES = ["detached", "attached", "garage_conversion", "jadu", "prefab", "two_story"];
const SERVICE_TYPES = ["design_build", "general_contractor", "prefab_manufacturer", "architect", "permit_expediter"];
const BUILD_METHODS = ["site_built", "modular", "manufactured", "panelized", "kit"];
const BUILD_APPROACHES = ["custom", "prefab", "both"];
const STATE_RE = /^[A-Z]{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Every column a seed record is allowed to name. Anything else in the `columns`
// block stops the run: a new field must be a deliberate decision here, not
// something a loader silently ignores or silently writes.
const TEXT_COLUMNS = ["slug", "name", "description", "website", "contact_email", "contact_phone", "state", "city"];
const ARRAY_COLUMNS = ["cities", "service_zips", "service_states", "specialties", "service_types", "build_methods", "licensed_states"];
// Tri-state: a real answer, or null for "the company never stated it". Null is
// never written.
const TRI_COLUMNS = ["turnkey", "build_approach"];
// Read from the record, checked, and applied on INSERT only.
const INSERT_ONLY = ["profile_status"];
const ALLOWED = [...TEXT_COLUMNS, ...ARRAY_COLUMNS, ...TRI_COLUMNS, ...INSERT_ONLY];

// Provenance (migration 0017). These two are NOT read from the `columns` block —
// they come from `research`, which is where the evidence actually lives — so they
// stay out of ALLOWED on purpose: a seed file that names one of them in `columns`
// still stops the run and makes somebody decide what it meant.
const PROVENANCE_COLUMNS = ["source_urls", "sources_checked_on"];

// The 0017 columns this loader will NEVER write, and the research keys that would
// be trying to. A price and a residential/commercial answer are recorded only
// where the company itself established them, through the admin console (2f).
const NEVER_WRITTEN = ["pricing_note", "pricing_source_url", "serves_residential", "serves_commercial"];
const NEVER_WRITTEN_RESEARCH_KEYS = ["pricing", "price", "pricing_note", "serves_residential", "serves_commercial", "residential", "commercial"];

// A source URL is an absolute http(s) link with no whitespace in it, which is the
// same rule the builders_source_urls_are_links constraint enforces in 0017. Checked
// here so a bad seed file stops before the first write instead of half way through
// it. 300 characters matches the link cap save_my_builder applies in the portal.
const LINK_RE = /^https?:\/\/\S+$/;
const MAX_URL = 300;
// An ISO calendar date, and a real one: 2026-13-40 matches a naive regex and is
// not a date. The round trip through Date is what rejects it, and the NaN guard is
// what stops an impossible date throwing RangeError out of a validator whose whole
// job is to report the problem.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

// Referral codes: 8 chars, uppercase, no 0/O/1/I. Mirrors the check constraint
// in migration 0005 and genCode() in api/admin/_builders.js. 32 symbols divide a
// byte evenly, so `byte % 32` is unbiased.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_TRIES = 5;
const genCode = () => Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % 32]).join("");
const isCodeCollision = (error) => error?.code === "23505" && /referral_code/.test(error.message || "");

// PostgREST and Postgres both have a way of saying "that column or relation is
// not there yet", which always means a migration is missing rather than a bad
// record. 23502 is a NOT NULL violation, which on this table means 0008 has not
// been applied and turnkey or build_approach is still mandatory.
const MISSING = ["42703", "42P01", "PGRST204", "PGRST205"];
const explain = (error) => {
  if (!error) return "";
  if (MISSING.includes(error.code)) {
    // Name the migration the message is actually about. A missing source_urls is
    // a missing 0017, and telling somebody to check "0006 or later" would send
    // them looking in the wrong place.
    if (new RegExp(`(${[...PROVENANCE_COLUMNS, ...NEVER_WRITTEN].join("|")})`).test(error.message || ""))
      return `${error.message} — migration 0017 is not applied to this database, so there is nowhere to record the pages of a company's own site that the research read.`;
    return `${error.message} — a builder migration (0006 or later) is not applied to this database.`;
  }
  if (error.code === "23502") return `${error.message} — migration 0008 is not applied: turnkey and build_approach are still NOT NULL, so "not stated" cannot be stored.`;
  return error.message;
};

const CHUNK = 50;
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const clip = (v, n = 48) => {
  const s = Array.isArray(v) ? `[${v.join(", ")}]` : v === null ? "null" : String(v);
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const same = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = a || [];
    const y = b || [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? null) === (b ?? null);
};

const die = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

// ── arguments ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? null : argv[i + 1];
};
const file = argv.find((a) => !a.startsWith("--") && a !== value("limit"));
const confirm = flag("confirm");
const limit = value("limit") ? Number(value("limit")) : null;

if (!file || flag("help")) {
  die(
    [
      "Load a researched builder seed file into the builders table.",
      "",
      "  node scripts/seed-builders.mjs <seed.json>             dry run, prints the plan",
      "  node scripts/seed-builders.mjs <seed.json> --confirm   applies it",
      "  node scripts/seed-builders.mjs <seed.json> --limit 5   first N ready records only",
      "",
      "  SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set.",
    ].join("\n"),
  );
}
if (limit !== null && (!Number.isInteger(limit) || limit < 1)) die("--limit takes a whole number of records, 1 or more.");

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url) die("Set SUPABASE_URL (or VITE_SUPABASE_URL) to the project this seed goes into.");
if (!key) die("Set SUPABASE_SERVICE_ROLE_KEY. Row-level security does not let any other key insert a builder.");

// ── validate the file ───────────────────────────────────────────────────────
// A validation failure stops the whole run. Loading 80 of 86 records and
// printing six warnings would leave a directory nobody can trust.
const validate = (records, fallbackDate) => {
  const problems = [];
  const seen = new Map();
  const rows = [];
  // Keyed by slug, which validate() has already proved unique. Kept beside the
  // rows rather than folded into them because it comes from a different block of
  // the record and is written to different columns.
  const provenance = new Map();
  const statedButRefused = [];

  records.forEach((record, i) => {
    const at = `ready[${i}]`;
    const c = record?.columns;
    const say = (m) => problems.push(`${at}${c?.slug ? ` (${c.slug})` : ""}: ${m}`);
    if (!c || typeof c !== "object") return say("has no `columns` block.");

    const unknown = Object.keys(c).filter((k) => !ALLOWED.includes(k));
    if (unknown.length) say(`names column(s) this loader will not write: ${unknown.join(", ")}. Decide what they mean before loading.`);

    if (!c.slug || !SLUG_RE.test(c.slug)) say(`slug ${JSON.stringify(c.slug)} is not a lowercase hyphenated slug.`);
    else if (seen.has(c.slug)) say(`slug is already used by ready[${seen.get(c.slug)}]. Slugs identify a listing and must be unique.`);
    else seen.set(c.slug, i);
    if (!c.name || !String(c.name).trim()) say("has no company name.");
    if (!STATE_RE.test(c.state || "")) say(`state ${JSON.stringify(c.state)} is not a two-letter code. It is NOT NULL on the table.`);
    if (c.profile_status !== undefined && c.profile_status !== "approved") say(`profile_status ${JSON.stringify(c.profile_status)}: this loader creates approved, unclaimed listings only.`);

    for (const k of ARRAY_COLUMNS) {
      if (c[k] === undefined || c[k] === null) continue;
      if (!Array.isArray(c[k]) || c[k].some((v) => typeof v !== "string")) say(`${k} must be an array of strings.`);
    }
    const bad = (k, allow) => (c[k] || []).filter((v) => !allow.includes(v));
    for (const [k, allow] of [["specialties", SPECIALTIES], ["service_types", SERVICE_TYPES], ["build_methods", BUILD_METHODS]]) {
      const wrong = bad(k, allow);
      if (wrong.length) say(`${k} has value(s) the app has no label for: ${wrong.join(", ")}.`);
    }
    for (const k of ["service_states", "licensed_states"]) {
      const wrong = (c[k] || []).filter((v) => !STATE_RE.test(v));
      if (wrong.length) say(`${k} has entries that are not two-letter state codes: ${wrong.join(", ")}.`);
    }
    if (c.turnkey !== null && c.turnkey !== undefined && typeof c.turnkey !== "boolean") say("turnkey must be true, false or null. Null is what the company never stated.");
    if (c.build_approach !== null && c.build_approach !== undefined && !BUILD_APPROACHES.includes(c.build_approach)) say(`build_approach ${JSON.stringify(c.build_approach)} must be custom, prefab, both or null.`);

    // ── the provenance block (migration 0017) ───────────────────────────────
    // research.pages_read is per record, not per field, "because that is how the
    // research was collected" (the seed file's own evidence_note). Every entry has
    // to be a link somebody can open, checked here so a bad file stops before the
    // first write rather than against a check constraint half way through it.
    const research = record?.research;
    if (research !== undefined && (research === null || typeof research !== "object")) say("has a `research` block that is not an object.");
    const pages = Array.isArray(research?.pages_read) ? research.pages_read : [];
    if (research?.pages_read !== undefined && !Array.isArray(research.pages_read)) say("research.pages_read must be an array of URLs.");
    const urls = [];
    for (const raw of pages) {
      const v = typeof raw === "string" ? raw.trim() : raw;
      if (typeof v !== "string" || !v) { say("research.pages_read has an entry that is not a URL. A blank source is not evidence."); continue; }
      if (!LINK_RE.test(v)) { say(`research.pages_read entry ${JSON.stringify(v)} is not an absolute http(s) URL with no spaces. 0017 refuses it, and a source nobody can open is a note, not provenance.`); continue; }
      if (v.length > MAX_URL) { say(`research.pages_read entry is longer than ${MAX_URL} characters: ${JSON.stringify(v.slice(0, 60))}…`); continue; }
      // The same page read twice is not two pieces of evidence.
      if (!urls.includes(v)) urls.push(v);
    }

    // The date ADUAtlas looked, per record, falling back to the file's own
    // generated date. Recorded only where there is something to have looked at:
    // "we checked nothing on this date" is not a fact worth storing, and null
    // means never recorded (2b).
    const collected = typeof research?.collected === "string" && research.collected.trim() ? research.collected.trim() : fallbackDate;
    if (urls.length && collected && !isDate(collected)) say(`research.collected ${JSON.stringify(collected)} is not a real YYYY-MM-DD date. sources_checked_on answers "when did ADUAtlas last look", so a made-up date is worse than none.`);

    // A research file that DOES state a price or a residential/commercial answer
    // is told plainly that this loader is not the way in, rather than having its
    // work silently dropped.
    for (const k of Object.keys(research?.attributes || {})) {
      if (NEVER_WRITTEN_RESEARCH_KEYS.includes(k) && research.attributes[k]?.stated) statedButRefused.push(`${c.slug}: research states ${k}`);
    }

    provenance.set(c.slug, {
      source_urls: urls,
      sources_checked_on: urls.length && isDate(collected) ? collected : null,
    });
    rows.push(c);
  });

  if (problems.length) die(`This seed file was not loaded. ${problems.length} problem(s):\n\n  ${problems.join("\n  ")}`);
  return { rows, provenance, statedButRefused };
};

// The payload for one record: only what the seed actually states.
//
//   • A null or blank value is left out entirely. On an insert that leaves the
//     column null, which is what "not stated" means; on an update it means a
//     value an admin typed by hand is never blanked by research that did not
//     find it.
//   • turnkey and build_approach are left out when null, so 0008's nullable
//     columns keep their null instead of taking a default (decision 2b).
//   • Empty arrays are left out for the same reason. The columns default to '{}'.
//   • source_urls is MERGED with what the record already holds, so a source an
//     admin recorded by hand is never dropped by a re-run (2l: provenance is
//     maintained so a claim cannot silently lose its source). Merging keeps the
//     run idempotent: the second pass computes the same array and reports no
//     change.
//   • sources_checked_on is written only when it MOVES FORWARD. Re-running an
//     older seed file does not rewind the date ADUAtlas last looked.
//   • The other four 0017 columns are never written at all. See NEVER_WRITTEN.
const mergeSources = (existing, found) => {
  const out = (Array.isArray(existing) ? existing : []).filter((v) => typeof v === "string" && v);
  for (const u of found) if (!out.includes(u)) out.push(u);
  return out;
};
const payload = (c, prov, row) => {
  const out = {};
  for (const k of TEXT_COLUMNS) {
    const v = typeof c[k] === "string" ? c[k].trim() : c[k];
    if (v) out[k] = v;
  }
  for (const k of ARRAY_COLUMNS) if (Array.isArray(c[k]) && c[k].length) out[k] = c[k];
  if (typeof c.turnkey === "boolean") out.turnkey = c.turnkey;
  if (typeof c.build_approach === "string" && c.build_approach) out.build_approach = c.build_approach;

  const found = prov?.source_urls || [];
  if (found.length) out.source_urls = mergeSources(row?.source_urls, found);
  const when = prov?.sources_checked_on || null;
  const had = typeof row?.sources_checked_on === "string" ? row.sources_checked_on : null;
  // ISO dates compare correctly as strings, which is why the format is validated.
  if (when && (!had || when > had)) out.sources_checked_on = when;
  return out;
};

// ── plan ────────────────────────────────────────────────────────────────────
const main = async () => {
  const raw = JSON.parse(await readFile(file, "utf8"));
  const ready = raw?.ready;
  if (!Array.isArray(ready)) die(`${file} has no \`ready\` array. Only the ready list is loadable; needs_manual_review is resolved by hand first.`);

  // The file's own generated date is the fallback for a record whose research
  // block does not carry its own collected date.
  const { rows: records, provenance, statedButRefused } = validate(limit ? ready.slice(0, limit) : ready, typeof raw?.meta?.generated === "string" ? raw.meta.generated.trim() : null);
  const host = new URL(url).host;

  console.log(`\nSeed file   ${file}`);
  if (raw.meta?.market || raw.meta?.generated) console.log(`Market      ${raw.meta.market || "unstated"}, researched ${raw.meta.generated || "date unstated"}`);
  console.log(`Records     ${records.length} ready${limit ? ` (--limit ${limit} of ${ready.length})` : ""}${raw.needs_manual_review?.length ? `, plus ${raw.needs_manual_review.length} needs_manual_review left alone` : ""}`);
  console.log(`Database    ${host}`);
  console.log(`Mode        ${confirm ? "WRITE (--confirm)" : "dry run, nothing will be written"}\n`);

  const db = createClient(url, key, { auth: { persistSession: false } });

  // Existing rows, by slug. Read in chunks so a long seed does not build one
  // enormous query string.
  const existing = new Map();
  for (const slugs of chunk(records.map((c) => c.slug), CHUNK)) {
    const { data, error } = await db
      .from("builders")
      .select(["id", "owner_user_id", "profile_status", "referral_code", ...TEXT_COLUMNS, ...ARRAY_COLUMNS, ...TRI_COLUMNS, ...PROVENANCE_COLUMNS, ...NEVER_WRITTEN].join(", "))
      .in("slug", slugs);
    if (error) die(`Could not read the builders table: ${explain(error)}`);
    for (const row of data || []) existing.set(row.slug, row);
  }

  const creates = [];
  const updates = [];
  const claimedSkips = [];
  const unchanged = [];
  // An unclaimed row that already holds an answer the company never gave. The
  // loader cannot cause this (it never writes those columns), so it is a row
  // from before migration 0008, when turnkey defaulted to false and
  // build_approach to 'both'. Worth saying out loud: it is a live 2b breach.
  const stale = [];

  // A row that already carries a price or a residential/commercial answer. The
  // loader did not write it and will not touch it: an established price is Amy's
  // record, entered in the console (2f). Reported so a re-run says what it left
  // alone rather than being silent about it.
  const established = [];

  for (const c of records) {
    const row = existing.get(c.slug);
    const prov = provenance.get(c.slug);
    const body = payload(c, prov, row);
    if (!row) {
      creates.push({ slug: c.slug, name: c.name, body });
      continue;
    }
    if (row.owner_user_id) {
      claimedSkips.push({ slug: c.slug, name: row.name });
      continue;
    }
    for (const k of NEVER_WRITTEN) if (row[k] !== null && row[k] !== undefined) established.push(`${c.slug}: ${k} = ${clip(row[k])}`);
    if (typeof c.turnkey !== "boolean" && row.turnkey !== null && row.turnkey !== undefined) stale.push(`${c.slug}: turnkey is ${JSON.stringify(row.turnkey)} in the database, and the company never stated it`);
    if (!c.build_approach && row.build_approach !== null && row.build_approach !== undefined) stale.push(`${c.slug}: build_approach is ${JSON.stringify(row.build_approach)} in the database, and the company never stated it`);
    const changed = Object.keys(body).filter((k) => !same(body[k], row[k]));
    if (!changed.length) unchanged.push(c.slug);
    else updates.push({ slug: c.slug, name: row.name, body: Object.fromEntries(changed.map((k) => [k, body[k]])), before: Object.fromEntries(changed.map((k) => [k, row[k]])) });
  }

  // What it would do, in full, before it does any of it.
  if (creates.length) {
    console.log(`CREATE ${creates.length} unclaimed, approved listing(s):`);
    for (const c of creates) console.log(`  + ${c.slug.padEnd(28)} ${c.name} · ${clip(c.body.state)}${c.body.city ? `, ${c.body.city}` : ""}${c.body.turnkey === undefined ? "" : ` · turnkey ${c.body.turnkey}`}`);
    console.log(`  Each gets owner_user_id null, profile_status approved and a fresh referral code.`);
    const unknownTurnkey = creates.filter((c) => c.body.turnkey === undefined).length;
    const unknownApproach = creates.filter((c) => c.body.build_approach === undefined).length;
    console.log(`  Not written because the company never stated it: turnkey on ${unknownTurnkey}, build approach on ${unknownApproach}.`);
    const withSources = creates.filter((c) => (c.body.source_urls || []).length);
    const urlCount = withSources.reduce((n, c) => n + c.body.source_urls.length, 0);
    console.log(`  Provenance: ${withSources.length} listing(s) carry ${urlCount} source URL(s) from the company's own site, and ${creates.filter((c) => c.body.sources_checked_on).length} carry the date ADUAtlas read them.`);
    console.log(`  Left unknown on every one of them (${NEVER_WRITTEN.join(", ")}): the research established no price and no residential or commercial answer, and this loader never derives one.\n`);
  }
  if (updates.length) {
    console.log(`UPDATE ${updates.length} existing unclaimed listing(s):`);
    for (const u of updates) {
      console.log(`  ~ ${u.slug} (${u.name})`);
      for (const k of Object.keys(u.body)) console.log(`      ${k}: ${clip(u.before[k])}  ->  ${clip(u.body[k])}`);
    }
    console.log("");
  }
  if (claimedSkips.length) {
    console.log(`SKIP ${claimedSkips.length} claimed listing(s). The company owns its profile; research does not overwrite it:`);
    for (const s of claimedSkips) console.log(`  = ${s.slug} (${s.name})`);
    console.log("");
  }
  if (unchanged.length) console.log(`UNCHANGED ${unchanged.length} listing(s) already match the seed.\n`);

  if (established.length) {
    console.log(`LEFT ALONE. ${established.length} value(s) on these listings were established somewhere other than this seed — the admin console, where decision 2f puts a price and a residential or commercial answer. This loader does not write those columns and did not touch them:`);
    console.log(`  ${established.slice(0, 10).join("\n  ")}`);
    if (established.length > 10) console.log(`  … and ${established.length - 10} more`);
    console.log("");
  }

  if (statedButRefused.length) {
    console.log(`NOT LOADED, DELIBERATELY. ${statedButRefused.length} record(s) state a price or a residential/commercial answer in their research block. This loader records provenance only: an established price and a capability answer go in through the admin console, so somebody decides what the company actually said (2f, 2b):`);
    console.log(`  ${statedButRefused.slice(0, 10).join("\n  ")}`);
    if (statedButRefused.length > 10) console.log(`  … and ${statedButRefused.length - 10} more`);
    console.log("");
  }

  if (stale.length) {
    console.log(`WARNING. ${stale.length} unclaimed listing(s) already hold an attribute the company never stated. This loader does not write those columns, so the values came from a column default before migration 0008. Set them back to null:`);
    console.log(`  ${stale.slice(0, 10).join("\n  ")}`);
    if (stale.length > 10) console.log(`  … and ${stale.length - 10} more`);
    console.log("");
  }

  console.log(`Plan: ${creates.length} create, ${updates.length} update, ${claimedSkips.length} skipped as claimed, ${unchanged.length} unchanged.`);

  if (!confirm) {
    console.log("\nDry run. Nothing was written. Re-run with --confirm to apply this plan.\n");
    return;
  }
  if (!creates.length && !updates.length) {
    console.log("\nNothing to write.\n");
    return;
  }

  // ── write ─────────────────────────────────────────────────────────────────
  console.log(`\nWriting to ${host} …\n`);
  const failures = [];
  let created = 0;
  let updated = 0;

  for (const c of creates) {
    // A fresh referral code per attempt; retry only on a code collision.
    let error = null;
    for (let i = 0; i < CODE_TRIES; i++) {
      const insert = { ...c.body, owner_user_id: null, profile_status: "approved", referral_code: genCode() };
      ({ error } = await db.from("builders").insert(insert));
      if (!isCodeCollision(error)) break;
    }
    if (error) failures.push(`create ${c.slug}: ${explain(error)}`);
    else created += 1;
  }

  for (const u of updates) {
    // `is("owner_user_id", null)` is the race guard: a listing claimed between
    // the read and this write matches nothing and is reported, never overwritten.
    const { data, error } = await db.from("builders").update(u.body).eq("slug", u.slug).is("owner_user_id", null).select("slug");
    if (error) failures.push(`update ${u.slug}: ${explain(error)}`);
    else if (!data?.length) console.log(`  = ${u.slug} (${u.name}) was claimed between the plan and the write. Left alone.`);
    else updated += 1;
  }

  console.log(`Created ${created}, updated ${updated}.`);
  if (failures.length) console.log(`\n${failures.length} failure(s):\n  ${failures.join("\n  ")}`);

  // ── verify unknown stayed unknown (decision 2b) ───────────────────────────
  // The one thing a write cannot be trusted about: on a database without
  // migration 0008, turnkey defaults to false and build_approach to 'both', so
  // omitting the column turns "never stated" into "No" and "Custom and prefab".
  // Read the rows back and say so plainly if that happened.
  // Only the unclaimed listings this loader owns. A claimed listing's turnkey is
  // the builder's own answer and none of this script's business.
  const ours = new Set([...creates.map((c) => c.slug), ...updates.map((u) => u.slug), ...unchanged]);
  const expectNull = [];
  for (const c of records) {
    if (!ours.has(c.slug)) continue;
    const wants = [];
    if (typeof c.turnkey !== "boolean") wants.push("turnkey");
    if (!c.build_approach) wants.push("build_approach");
    if (wants.length) expectNull.push({ slug: c.slug, wants });
  }
  const wrong = [];
  let checked = 0;
  for (const group of chunk(expectNull, CHUNK)) {
    const { data, error } = await db.from("builders").select("slug, turnkey, build_approach").in("slug", group.map((g) => g.slug));
    if (error) {
      console.log(`\nCould not verify that unknown stayed unknown: ${explain(error)}`);
      break;
    }
    const byslug = new Map((data || []).map((r) => [r.slug, r]));
    for (const g of group) {
      const row = byslug.get(g.slug);
      // A row that is not there proves nothing either way, and it must not be
      // counted as a listing whose unknown stayed unknown.
      if (!row) continue;
      checked += 1;
      for (const k of g.wants) if (row[k] !== null) wrong.push(`${g.slug}: ${k} is ${JSON.stringify(row[k])} but the company never stated it`);
    }
  }
  if (wrong.length) {
    console.log("");
    die(
      [
        `UNKNOWN DID NOT STAY UNKNOWN on ${wrong.length} field(s). This database is printing a default as a claim, which decision 2b forbids:`,
        "",
        `  ${wrong.slice(0, 10).join("\n  ")}`,
        wrong.length > 10 ? `  … and ${wrong.length - 10} more` : "",
        "",
        "Apply migration 0008_unknown_means_unknown.sql, then set those columns back to null.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (expectNull.length) console.log(`Verified: ${checked} of ${expectNull.length} listing(s) read back, and each kept its unstated turnkey or build approach as null.`);

  // ── verify the provenance landed, and that nothing invented a price ───────
  // The mirror of the check above, for the 0017 columns. Two different failures,
  // and both matter:
  //   • evidence that did not arrive — a database missing 0017, a column silently
  //     dropped by PostgREST, a merge that lost the URLs — means the record still
  //     cannot say where its facts came from, which is the gap this change closes.
  //   • a price or a residential/commercial answer appearing on a row this run
  //     created is a value NOBODY established, because the loader never writes
  //     those four columns. That is a 2b breach and it stops the run.
  const expectSources = records
    .filter((c) => ours.has(c.slug) && (provenance.get(c.slug)?.source_urls || []).length)
    .map((c) => ({ slug: c.slug, urls: provenance.get(c.slug).source_urls }));
  const createdSlugs = new Set(creates.map((c) => c.slug));
  const missingEvidence = [];
  const invented = [];
  for (const group of chunk(expectSources, CHUNK)) {
    const { data, error } = await db
      .from("builders")
      .select(["slug", ...PROVENANCE_COLUMNS, ...NEVER_WRITTEN].join(", "))
      .in("slug", group.map((g) => g.slug));
    if (error) {
      console.log(`\nCould not verify that the provenance landed: ${explain(error)}`);
      break;
    }
    const byslug = new Map((data || []).map((r) => [r.slug, r]));
    for (const g of group) {
      const row = byslug.get(g.slug);
      // NOT A PASS. A row this run should have created or corrected and that is
      // not on the database records nothing at all, and skipping it here is how
      // "Verified: 86 listings carry their sources" gets printed after 86 failed
      // inserts. Found exactly that way, against a stub whose insert was broken.
      if (!row) { missingEvidence.push(`${g.slug}: the listing is not on the database, so nothing was recorded`); continue; }
      const held = Array.isArray(row.source_urls) ? row.source_urls : [];
      const lost = g.urls.filter((u) => !held.includes(u));
      if (lost.length) missingEvidence.push(`${g.slug}: ${lost.length} source URL(s) the research read are not on the record (${clip(lost[0])})`);
      if (!row.sources_checked_on) missingEvidence.push(`${g.slug}: source URLs are recorded with no date ADUAtlas read them`);
      // Only on a row THIS RUN created. An existing row's price is Amy's.
      if (createdSlugs.has(g.slug)) for (const k of NEVER_WRITTEN) if (row[k] !== null && row[k] !== undefined) invented.push(`${g.slug}: ${k} is ${clip(row[k])} on a listing this run just created`);
    }
  }
  if (invented.length) {
    console.log("");
    die(
      [
        `A PRICE OR A CAPABILITY ANSWER WAS MANUFACTURED on ${invented.length} field(s). This loader never writes those four columns, so a value on a row it just created came from a column DEFAULT, which decision 2b forbids: unknown means unknown, and a price nobody quoted must not appear on a company's listing.`,
        "",
        `  ${invented.slice(0, 10).join("\n  ")}`,
        invented.length > 10 ? `  … and ${invented.length - 10} more` : "",
        "",
        "Check migration 0017: pricing_note, pricing_source_url, serves_residential and serves_commercial are nullable with NO default on purpose.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (missingEvidence.length) {
    console.log("");
    console.log(`WARNING. The provenance did not fully land on ${missingEvidence.length} record(s), so those records cannot say where their facts came from (decision 2f: factual provenance):`);
    console.log(`  ${missingEvidence.slice(0, 10).join("\n  ")}`);
    if (missingEvidence.length > 10) console.log(`  … and ${missingEvidence.length - 10} more`);
    console.log("");
  } else if (expectSources.length) {
    console.log(`Verified: ${expectSources.length} listing(s) carry the pages of the company's own site the research read, with the date it read them.`);
  }

  if (failures.length) process.exit(1);
  console.log("\nDone. These are unclaimed listings: no referral link resolves, no dashboard exists and no badge is shown until a builder claims one.\n");
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
