// Vercel-style serverless function: the XML sitemap, served at /sitemap.xml
// through the rewrite in vercel.json and named in public/robots.txt.
//
// Public and READ ONLY. It lists the static public routes plus one url per
// published builder profile, because an individual profile is public and
// indexable while the marketplace around it is not (Phase 1 spec, decision 2a).
// Nothing else about a builder is in the response: only the slug, which is
// already in the url of a page anyone may open.
//
// It also lists the ADU Rules and Resources pages that EARN an index entry
// (Phase 1 spec, decision 2l: "a jurisdiction page is indexable where there is
// enough verified content to justify one. ADUAtlas does not generate thousands
// of thin pages carrying essentially no verified information"). This file does
// NOT decide which pages those are. The database decides, once, in
// jurisdiction_coverage_public.is_indexable (migration 0012 and its
// successors), and this file only reads that answer. There is deliberately no
// threshold here: a second copy of the rule is a copy that drifts. Everything
// is_indexable says no to (a record with nothing researched, a jurisdiction
// holding one unsourced note, an unpublished or draft-only record, the states
// that exist structurally and hold no data) is absent. /rules itself is static
// and always listed: it is an honest index of coverage, including the gaps.
//
// The regulatory half reads ONLY the two anon-granted views,
// jurisdiction_coverage_public and jurisdictions_public. Both withhold every
// jurisdiction whose published_at is null, so the answer is the same whichever
// key is configured, and the sitemap can never advertise a rules page that the
// public page itself would refuse to show.
//
// The builder slugs come from public.builders_public_profile, the anon-safe
// view, so the sitemap can never advertise a page that the profile route would
// refuse to render: the view is the one definition of "published" (active and
// approved). Since migration 0015 anon may no longer read that view as a set,
// so the builder half needs the service key.
//
// lastmod for a profile comes from builders.updated_at, which is not in the
// view. It is read separately, filtered to the same active and approved rows,
// and only when a service key is configured. Without one the urls simply carry
// no lastmod, which is valid; the sitemap is never withheld over it.
//
// Every read is paged. PostgREST caps each response (max-rows, 1000 on
// staging) whatever .limit() asks for, so a single read would silently drop
// every row past the cap. The pager below keeps asking until a page comes back
// empty, so it cannot stop early even when the server's cap is lower than the
// page size it asked for.
//
// GET /sitemap.xml -> 200 application/xml
//
// Env (server-side, never VITE_-prefixed for the service key):
//   SUPABASE_URL                 (or VITE_SUPABASE_URL)
//   SUPABASE_SERVICE_ROLE_KEY    preferred for builders; also enables lastmod
//   SUPABASE_ANON_KEY            (or VITE_SUPABASE_ANON_KEY) preferred for the
//                                regulatory views
// With none of them set the function still answers with the static routes.

import { createClient } from "@supabase/supabase-js";

const ORIGIN = "https://aduatlas.com";

// The public, indexable routes. Deliberately absent: the auth forms (/login,
// /create-account, /builders/join, /forgot-password), the post-purchase
// /welcome page, /pricing and /signup and /property (they redirect), and every
// route public/robots.txt disallows.
const STATIC_PATHS = [
  "/",
  "/how-to-adu",
  "/course-outline",
  "/unlock",
  "/feasibility-study",
  "/find-a-builder",
  "/for-builders",
  "/rules",
  "/adu-types",
  "/faq",
  "/about",
  "/methodology",
  "/legal",
];

// The sitemap protocol allows 50,000 urls in one file. Past that the site needs
// a sitemap index, and the function says so in its log rather than emitting an
// invalid file.
const MAX_SITEMAP_URLS = 50000;

// Far below the protocol limit. It only exists so a runaway table cannot
// produce an unbounded response.
const MAX_BUILDERS = 10000;

// How many rows one request asks for. The server may return fewer (its own
// max-rows cap); the pager copes with that.
const PAGE_SIZE = 1000;

// How many ids go into one `in.(...)` filter, and how many of those reads run
// at once. Small, so the query string stays well inside any proxy's url limit.
const ID_CHUNK = 100;
const PARALLEL_READS = 8;

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Sitemaps take a W3C date; the day is enough here.
const asDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const laterOf = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

const urlEntry = ({ path, lastmod }) => {
  const loc = `    <loc>${escapeXml(`${ORIGIN}${path}`)}</loc>`;
  const mod = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return `  <url>\n${loc}${mod}\n  </url>`;
};

const render = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(urlEntry).join("\n")}\n</urlset>\n`;

const clientFor = (key) => {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

// Reads every row a query returns, one page at a time. makeQuery() must build a
// fresh, deterministically ORDERED query on each call, so consecutive pages
// neither overlap nor skip. It stops on an empty page, never on a short one,
// because a short page may only mean the server capped it.
//
// `max` bounds the total. For a read whose size is already known (ids asked for
// by id) it is that size and reaching it is the normal end. Otherwise it is a
// safety cap, and reaching it is logged, so a cap is never silent.
const readAll = async (makeQuery, { max, label, known = false }) => {
  const rows = [];
  let from = 0;
  while (rows.length < max) {
    const want = Math.min(PAGE_SIZE, max - rows.length);
    const { data, error } = await makeQuery().range(from, from + want - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const page = data || [];
    if (page.length === 0) break;
    rows.push(...page);
    from += page.length;
  }
  if (!known && rows.length >= max) console.error(`sitemap ${label}: stopped at ${max} rows; later rows are not listed`);
  return rows;
};

// Published profiles. Throws on a failed slug read, which the handler turns
// into "no builder urls this time": a sitemap with the static routes is worth
// far more than a 500.
const publishedBuilders = async () => {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const supabase = clientFor(serviceKey || anonKey);
  if (!supabase) return [];

  const profiles = await readAll(
    () => supabase.from("builders_public_profile").select("slug").order("slug", { ascending: true }),
    { max: MAX_BUILDERS, label: "builders_public_profile" },
  );
  const slugs = [...new Set(profiles.map((row) => row.slug).filter(Boolean))];
  if (slugs.length === 0 || !serviceKey) return slugs.map((slug) => ({ slug, lastmod: null }));

  // lastmod, best effort. The filter repeats the view's own rule so this read
  // can only see rows the view already published.
  let stamps = [];
  try {
    stamps = await readAll(
      () =>
        supabase
          .from("builders")
          .select("slug, updated_at")
          .eq("active", true)
          .eq("profile_status", "approved")
          .order("slug", { ascending: true }),
      { max: MAX_BUILDERS, label: "builders lastmod" },
    );
  } catch (err) {
    console.error("sitemap lastmod error:", err?.message || err);
  }
  const byslug = new Map(stamps.map((row) => [row.slug, asDate(row.updated_at)]));
  return slugs.map((slug) => ({ slug, lastmod: byslug.get(slug) || null }));
};

// ── ADU Rules and Resources ─────────────────────────────────────────────────
// The two url shapes the rules pages use as their canonical link
// (src/pages/RulesState.jsx and src/pages/RulesJurisdiction.jsx):
//   /rules/<state code, lowercase>          a state-level record
//   /rules/<state code, lowercase>/<slug>   everything beneath a state
// The canonical key of a jurisdiction is (state_code, slug), never the slug
// alone, because two states may each have a jurisdiction with the same slug.
// Every jurisdiction url here therefore carries its own state code.
//
// State level means what the rules pages mean by it (STATE_LEVELS in
// src/lib/regulatory.js): the state and federal_district rows. Any other row
// with a state code, a territory included, renders at /rules/<code>/<slug> and
// is listed there.
const STATE_LEVELS = new Set(["state", "federal_district"]);
const STATE_CODE = /^[A-Z]{2}$/;

// Prefer the ANON key: these are anon-granted views, and reading them the way a
// visitor does is the plainest proof that nothing unpublished can leak. The
// views filter on published_at themselves, so the service key, the fallback for
// a deployment that only has one, returns exactly the same rows.
const regulatoryClient = () => {
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return clientFor(anonKey) || clientFor(process.env.SUPABASE_SERVICE_ROLE_KEY);
};

// Every rules page that has earned an entry, at most `budget` of them. Returns
// [{ path, lastmod }] and throws on a failed read, which costs the regulatory
// urls and nothing else.
const regulatoryPages = async (budget) => {
  const supabase = regulatoryClient();
  if (!supabase || budget <= 0) return [];

  // 1. The database's verdict: every indexable row, plus every published
  //    state-level row whether indexable or not. A state page may be listed
  //    because of a jurisdiction beneath it, and then its own row proves the
  //    state page is published and supplies its lastmod.
  const coverage = await readAll(
    () =>
      supabase
        .from("jurisdiction_coverage_public")
        .select("jurisdiction_id, state_code, jurisdiction_type, is_indexable, last_record_published_at")
        .or(`is_indexable.eq.true,jurisdiction_type.in.(${[...STATE_LEVELS].join(",")})`)
        .order("jurisdiction_id", { ascending: true }),
    { max: MAX_SITEMAP_URLS, label: "jurisdiction_coverage_public" },
  );

  // lastmod is the last time ADUAtlas published a change to THIS page's own
  // records (last_record_published_at), never a row's updated_at and never a
  // date borrowed from another page. A page with none carries no lastmod.
  const states = new Map(); // state code -> { indexable, lastmod, hasIndexableChild }
  const local = new Map(); // jurisdiction id -> lastmod
  for (const row of coverage) {
    const code = String(row.state_code || "").trim().toUpperCase();
    if (!STATE_CODE.test(code)) continue;
    const lastmod = asDate(row.last_record_published_at);
    if (STATE_LEVELS.has(String(row.jurisdiction_type || "").toLowerCase())) {
      const current = states.get(code);
      states.set(code, {
        indexable: Boolean(current?.indexable) || row.is_indexable === true,
        lastmod: laterOf(current?.lastmod || null, lastmod),
        hasIndexableChild: false,
      });
    } else if (row.is_indexable === true && row.jurisdiction_id) {
      local.set(String(row.jurisdiction_id), lastmod);
    }
  }

  // 2. The slug of each indexable local row, from jurisdictions_public, read by
  //    id in small chunks. A row unpublished between the two reads is simply
  //    not found, so it is not listed.
  const ids = [...local.keys()];
  const chunks = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
  const published = [];
  for (let i = 0; i < chunks.length; i += PARALLEL_READS) {
    const batch = await Promise.all(
      chunks.slice(i, i + PARALLEL_READS).map((chunk) =>
        readAll(
          () =>
            supabase
              .from("jurisdictions_public")
              .select("id, slug, state_code, jurisdiction_type")
              .in("id", chunk)
              .order("id", { ascending: true }),
          { max: chunk.length, label: "jurisdictions_public", known: true },
        ),
      ),
    );
    for (const rows of batch) published.push(...rows);
  }

  const pages = new Map(); // path -> lastmod
  for (const row of published) {
    const id = String(row.id);
    if (!local.has(id) || !row.slug) continue;
    if (STATE_LEVELS.has(String(row.jurisdiction_type || "").toLowerCase())) continue;
    const code = String(row.state_code || "").trim().toUpperCase();
    if (!STATE_CODE.test(code)) continue;
    pages.set(`/rules/${code.toLowerCase()}/${encodeURIComponent(row.slug)}`, local.get(id));
    const state = states.get(code);
    if (state) state.hasIndexableChild = true;
  }

  // 3. A state page is listed when the state's own record is indexable, or when
  //    it is the index of at least one indexable jurisdiction. Either way only a
  //    published state-level row gets one: a code with no such row has no state
  //    page to invite anybody to.
  const statePages = [...states.entries()]
    .filter(([, state]) => state.indexable || state.hasIndexableChild)
    .map(([code, state]) => ({ path: `/rules/${code.toLowerCase()}`, lastmod: state.lastmod }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const localPages = [...pages.entries()]
    .map(([path, lastmod]) => ({ path, lastmod }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const all = [...statePages, ...localPages];
  if (all.length > budget) {
    console.error(`sitemap: ${all.length} rules urls exceed the ${budget} left in one sitemap file; a sitemap index is needed`);
  }
  return all.slice(0, budget);
};

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // The two halves are independent: a failure in either one costs its own urls
  // and never the whole sitemap.
  let degraded = false;
  let builders = [];
  try {
    builders = await publishedBuilders();
  } catch (err) {
    degraded = true;
    console.error("sitemap builders error:", err?.message || err);
  }

  let regulatory = [];
  try {
    regulatory = await regulatoryPages(MAX_SITEMAP_URLS - STATIC_PATHS.length - builders.length);
  } catch (err) {
    degraded = true;
    console.error("sitemap regulatory error:", err?.message || err);
  }

  const entries = [
    ...STATIC_PATHS.map((path) => ({ path })),
    ...builders.map(({ slug, lastmod }) => ({ path: `/builders/${encodeURIComponent(slug)}`, lastmod })),
    ...regulatory,
  ];

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  // A sitemap that lost a half to a failed read is cached only briefly, so one
  // bad moment does not hide those pages from crawlers for an hour or more.
  res.setHeader(
    "Cache-Control",
    degraded
      ? "public, max-age=0, s-maxage=300"
      : "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
  );
  res.status(200).send(render(entries));
}
