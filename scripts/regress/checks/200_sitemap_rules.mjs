// DEF-03 (decision 2l). /sitemap.xml lists exactly the ADU Rules pages the
// database rates indexable, each at its state-qualified url, and never a thin,
// draft-only or unpublished one.
//
// The check makes its own jurisdictions through the admin console API (the
// staging admin persona, signed in once), with ctx.prefix in every name and
// slug:
//   S1  <p>-rules5    five verified, published rules              indexable
//   S1  <p>-res3      three verified, published resources         indexable
//   S1  <p>-twin      five verified rules                         indexable
//   S2  <p>-twin      the SAME slug in a second state             indexable
//   S1  <p>-thin4     four verified rules                         thin
//   S1  <p>-drafts5   five verified rules, all still drafts       thin
//   S1  <p>-unpub     five published rules, then unpublished      not public
//   S3  <p>-thinonly  one verified rule                           thin
// S1, S2 and S3 are states that held nothing indexable when the run began, so
// their state pages are listed (S1, S2) or not (S3) because of these rows alone.
//
// The expected set is the database's own answer, read as anon from
// jurisdiction_coverage_public.is_indexable and jurisdictions_public, before and
// after the sitemap is fetched: a url indexable in both reads must be listed,
// and a listed url must be indexable in at least one. The check repeats no
// threshold of its own. The fixture preconditions only confirm that the rows it
// made came out the way the plan says, so the check has teeth.
//
// The sitemap is fetched with a query string, because /sitemap.xml is cached at
// the edge for an hour. At the end every fixture jurisdiction is unpublished
// again, so a run leaves nothing indexable behind.
export const meta = {
  name: "200 sitemap rules pages",
  rules: [
    "2l: the sitemap lists exactly the rules pages jurisdiction_coverage_public.is_indexable rates indexable",
    "a thin, draft-only or unpublished jurisdiction is never listed",
    "a jurisdiction url is state-qualified, /rules/<code>/<slug>, so a slug used in two states is listed once per state",
    "a state page /rules/<code> is listed only when the state or a jurisdiction beneath it is indexable",
    "a rules url's lastmod is the day of its last_record_published_at, and absent when that is null",
  ],
};

const STATE_LEVELS = new Set(["state", "federal_district"]);
const TOPICS = ["adu_allowed", "detached_allowed", "attached_allowed", "max_size", "height_limit"];
const RESOURCE_TYPES = ["official_adu_page", "permit_application", "zoning_map"];
const PREFERRED_STATES = [
  "WY", "ID", "OR", "AK", "HI", "RI", "DE", "WV", "NH", "NM", "UT", "OK", "AR", "IA", "MS", "AL", "LA", "KY",
  "SC", "WI", "MN", "IN", "OH", "MI", "PA", "NJ", "NY", "CT", "MA", "MD", "VA", "NC", "GA", "FL", "TN", "TX",
  "CO", "AZ", "WA", "CA", "MT", "ND", "SD", "NE", "KS", "ME", "VT", "NV", "MO", "IL",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export default async function (ctx) {
  const results = [];
  const add = (name, rule, ok, detail) => results.push({ name, rule, status: ok ? "pass" : "fail", detail });
  // Its own namespace: check 100 also builds a "<prefix> Twin" pair in the same run,
  // and the database rightly refuses a second record with the same slug in one state.
  const p = `${ctx.prefix}-sm`;

  // ── anon reads of the two public views, paged past PostgREST's row cap ──
  const anonAll = async (view, query) => {
    const rows = [];
    for (let offset = 0; offset < 200000; ) {
      const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${view}?${query}&offset=${offset}&limit=1000`, {
        headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}` },
      });
      if (r.status !== 200 || !Array.isArray(r.body)) throw new Error(`anon read of ${view}: HTTP ${r.status}`);
      if (r.body.length === 0) break;
      rows.push(...r.body);
      offset += r.body.length;
    }
    return rows;
  };
  const readViews = async () => {
    const [coverage, published] = await Promise.all([
      anonAll("jurisdiction_coverage_public", "select=jurisdiction_id,is_indexable,last_record_published_at&order=jurisdiction_id"),
      anonAll("jurisdictions_public", "select=id,slug,state_code,jurisdiction_type&order=id"),
    ]);
    const cov = new Map(coverage.map((c) => [c.jurisdiction_id, c]));
    const jurisdictionUrls = new Map(); // path -> { indexable, lastmod, id }
    const statePages = new Map(); // path -> { indexable (own), hasIndexableChild }
    for (const j of published) {
      const code = String(j.state_code || "").toLowerCase();
      if (!/^[a-z]{2}$/.test(code)) continue;
      const c = cov.get(j.id);
      const indexable = c?.is_indexable === true;
      if (STATE_LEVELS.has(j.jurisdiction_type)) {
        const s = statePages.get(`/rules/${code}`) || { indexable: false, hasIndexableChild: false };
        s.indexable = s.indexable || indexable;
        statePages.set(`/rules/${code}`, s);
      } else {
        jurisdictionUrls.set(`/rules/${code}/${j.slug}`, { indexable, lastmod: day(c?.last_record_published_at), id: j.id });
      }
    }
    for (const [path, j] of jurisdictionUrls) {
      if (!j.indexable) continue;
      const s = statePages.get(path.split("/").slice(0, 3).join("/"));
      if (s) s.hasIndexableChild = true;
    }
    return { published, cov, jurisdictionUrls, statePages };
  };

  // ── the admin console API, as the staging admin ──
  const token = await ctx.token("admin");
  const admin = async (action, body) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const r = await ctx.fetchJson(`${ctx.base}/api/admin/regulatory/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.status === 429) { await sleep(60000); continue; }
      return r;
    }
    return { status: 429, body: { error: "still rate-limited" } };
  };

  const before = await readViews();
  const indexableCodes = new Set();
  for (const [path, j] of before.jurisdictionUrls) if (j.indexable) indexableCodes.add(path.split("/")[2]);
  for (const [path, s] of before.statePages) if (s.indexable) indexableCodes.add(path.split("/")[2]);
  const stateIds = new Map(
    before.published.filter((j) => j.jurisdiction_type === "state").map((j) => [String(j.state_code).toUpperCase(), j.id]),
  );
  const quiet = PREFERRED_STATES.filter((code) => stateIds.has(code) && !indexableCodes.has(code.toLowerCase()));
  if (quiet.length < 3) {
    add("fixtures-created", "a check that cannot set up proves nothing", false, `need three states with nothing indexable, found ${quiet.length}`);
    return results;
  }
  const [S1, S2, S3] = quiet;

  const plan = [
    { key: "rules5", state: S1, slug: `${p}-rules5`, rules: 5, resources: 0, indexable: true },
    { key: "res3", state: S1, slug: `${p}-res3`, rules: 0, resources: 3, indexable: true },
    { key: "twin-1", state: S1, slug: `${p}-twin`, rules: 5, resources: 0, indexable: true },
    { key: "twin-2", state: S2, slug: `${p}-twin`, rules: 5, resources: 0, indexable: true },
    { key: "thin4", state: S1, slug: `${p}-thin4`, rules: 4, resources: 0, indexable: false },
    { key: "drafts5", state: S1, slug: `${p}-drafts5`, rules: 5, resources: 0, indexable: false, draft: true },
    { key: "unpub", state: S1, slug: `${p}-unpub`, rules: 5, resources: 0, indexable: false, unpublish: true },
    { key: "thinonly", state: S3, slug: `${p}-thinonly`, rules: 1, resources: 0, indexable: false },
  ];
  const src = (slug, n) => `https://${slug}.regress.aduatlas.test/source/${n}`;
  const setupErrors = [];
  const created = [];

  try {
    for (const f of plan) {
      const jurisdiction = {
        jurisdiction_type: "municipality",
        name: `${p} ${f.key}`,
        slug: f.slug,
        parent_id: stateIds.get(f.state),
        is_published: true,
      };
      const j = await admin("jurisdiction-save", { jurisdiction });
      const id = j.body?.jurisdiction?.id;
      if (j.status !== 200 || !id) {
        setupErrors.push(`${f.state}/${f.slug}: jurisdiction-save HTTP ${j.status} ${j.body?.error || ""}`);
        continue;
      }
      f.id = id;
      f.slug = j.body.jurisdiction.slug || f.slug;
      f.jurisdiction = jurisdiction;
      created.push(f);
      for (let i = 0; i < f.rules; i += 1) {
        const r = await admin("provision-save", {
          provision: {
            jurisdiction_id: id, topic_key: TOPICS[i], field_state: "verified_from_source",
            value_text: `${p} ${f.key} rule ${i + 1}`, source_url: src(f.slug, i), source_type: "city_code",
            source_checked_date: "2026-09-20", review_status: f.draft ? "draft" : "published",
            verification_status: "source_checked", change_note: `${p} sitemap regression fixture`,
          },
        });
        if (r.status !== 200) setupErrors.push(`${f.slug} rule ${i + 1}: HTTP ${r.status} ${r.body?.error || ""}`);
      }
      for (let i = 0; i < f.resources; i += 1) {
        const r = await admin("resource-save", {
          resource: {
            jurisdiction_id: id, resource_type: RESOURCE_TYPES[i], field_state: "verified_from_source",
            label: `${p} ${f.key} resource ${i + 1}`, url: src(f.slug, `link${i}`), source_url: src(f.slug, `r${i}`),
            source_type: "planning_department", source_checked_date: "2026-09-20", review_status: "published",
            verification_status: "source_checked",
          },
        });
        if (r.status !== 200) setupErrors.push(`${f.slug} resource ${i + 1}: HTTP ${r.status} ${r.body?.error || ""}`);
      }
      if (f.unpublish) {
        const u = await admin("jurisdiction-save", { jurisdiction: { ...jurisdiction, id, is_published: false } });
        if (u.status !== 200) setupErrors.push(`${f.slug} unpublish: HTTP ${u.status} ${u.body?.error || ""}`);
      }
    }

    // ── the sitemap, between two reads of the database's verdict ──
    const viewsA = await readViews();
    const sm = await ctx.fetchJson(`${ctx.base}/sitemap.xml?regress=${p}-${Date.now()}`);
    const viewsB = await readViews();
    const xml = typeof sm.body === "string" ? sm.body : "";
    add(
      "sitemap-served",
      "GET /sitemap.xml answers 200 with a urlset",
      sm.status === 200 && xml.includes("<urlset"),
      `HTTP ${sm.status}, ${xml.length} bytes`,
    );
    const listed = new Map(); // pathname -> lastmod or null
    for (const m of xml.matchAll(/<url>\s*<loc>([^<]*)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?/g)) {
      try {
        listed.set(new URL(m[1].replace(/&amp;/g, "&")).pathname.replace(/\/+$/, ""), m[2] || null);
      } catch { /* not a url; ignored */ }
    }
    const rulesListed = [...listed.keys()].filter((path) => /^\/rules\/[^/]+/.test(path));

    // Preconditions: the rows came out the way the plan says.
    const pathOf = (f) => `/rules/${f.state.toLowerCase()}/${f.slug}`;
    const pre = [];
    for (const f of plan) {
      if (!f.id) continue;
      const row = viewsA.jurisdictionUrls.get(pathOf(f));
      if (f.unpublish) { if (row) pre.push(`${pathOf(f)} is still public after unpublishing`); continue; }
      if (!row) { pre.push(`${pathOf(f)} is not in jurisdictions_public`); continue; }
      if (row.indexable !== f.indexable) pre.push(`${pathOf(f)} is_indexable=${row.indexable}, planned ${f.indexable}`);
    }
    if (viewsA.statePages.get(`/rules/${S3.toLowerCase()}`)?.indexable || viewsA.statePages.get(`/rules/${S3.toLowerCase()}`)?.hasIndexableChild) {
      pre.push(`${S3} gained indexable content from elsewhere during the run`);
    }
    add(
      "fixtures-created",
      "a check that cannot set up proves nothing",
      setupErrors.length === 0 && pre.length === 0,
      [...setupErrors, ...pre].join("; ") || `states ${S1}, ${S2}, ${S3}; ${created.length} jurisdictions`,
    );

    // A. every indexable fixture is listed at its state-qualified url.
    for (const f of plan.filter((x) => x.indexable)) {
      add(
        `lists-indexable-${f.key}`,
        "an indexable jurisdiction is listed at /rules/<code>/<slug>",
        listed.has(pathOf(f)),
        `${pathOf(f)} ${listed.has(pathOf(f)) ? "listed" : "MISSING"}; sitemap has ${rulesListed.length} rules urls`,
      );
    }
    // The same slug in two states: one url per state, each state-qualified.
    const twins = plan.filter((x) => x.key.startsWith("twin"));
    const twinSlug = twins[0].slug;
    const twinUrls = rulesListed.filter((path) => path.split("/")[3] === twinSlug);
    add(
      "same-slug-two-states",
      "a slug used in two states is listed once per state, each under its own state code",
      twins.every((f) => listed.has(pathOf(f))) && twinUrls.length === twins.length,
      `expected ${twins.map(pathOf).join(" and ")}; listed ${twinUrls.join(", ") || "none"}`,
    );

    // B. no thin, draft-only or unpublished fixture appears in any form.
    for (const f of plan.filter((x) => !x.indexable)) {
      const hits = rulesListed.filter((path) => path.split("/")[3] === f.slug);
      add(
        `omits-${f.key}`,
        "a thin, draft-only or unpublished jurisdiction is never listed",
        hits.length === 0,
        hits.length ? `listed: ${hits.join(", ")}` : `${pathOf(f)} absent`,
      );
    }

    // C. state pages.
    for (const code of [S1, S2]) {
      const path = `/rules/${code.toLowerCase()}`;
      add(`state-page-${code.toLowerCase()}`, "a state page is listed when a jurisdiction beneath it is indexable", listed.has(path), `${path} ${listed.has(path) ? "listed" : "MISSING"}`);
    }
    {
      const path = `/rules/${S3.toLowerCase()}`;
      add(`no-state-page-${S3.toLowerCase()}`, "a state page with nothing indexable beneath it is not listed", !listed.has(path), `${path} ${listed.has(path) ? "LISTED" : "absent"}`);
    }

    // The whole set against the database, not only this run's rows.
    const problems = [];
    for (const [path, a] of viewsA.jurisdictionUrls) {
      const b = viewsB.jurisdictionUrls.get(path);
      if (a.indexable && b?.indexable && !listed.has(path)) problems.push(`missing ${path}`);
    }
    for (const path of rulesListed) {
      const parts = path.split("/");
      if (parts.length === 4) {
        const a = viewsA.jurisdictionUrls.get(path);
        const b = viewsB.jurisdictionUrls.get(path);
        if (!a?.indexable && !b?.indexable) problems.push(`${a || b ? "thin" : "unpublished or unknown"} ${path} listed`);
      } else if (parts.length === 3) {
        const ok = (v) => v && (v.indexable || v.hasIndexableChild);
        if (!ok(viewsA.statePages.get(path)) && !ok(viewsB.statePages.get(path))) problems.push(`state page ${path} listed with nothing indexable`);
      } else {
        problems.push(`unexpected rules url ${path}`);
      }
    }
    for (const [path, a] of viewsA.statePages) {
      const b = viewsB.statePages.get(path);
      if ((a.indexable || a.hasIndexableChild) && (b?.indexable || b?.hasIndexableChild) && !listed.has(path)) problems.push(`missing state page ${path}`);
    }
    add(
      "exactly-the-indexable-set",
      "2l: the sitemap's rules urls are exactly those jurisdiction_coverage_public.is_indexable rates indexable",
      problems.length === 0,
      problems.length ? problems.slice(0, 12).join("; ") + (problems.length > 12 ? `; and ${problems.length - 12} more` : "") : `${rulesListed.length} rules urls, all indexable`,
    );

    // lastmod: the record's own publication day, never another date.
    const lm = [];
    for (const f of plan.filter((x) => x.indexable)) {
      const path = pathOf(f);
      if (!listed.has(path)) { lm.push(`${path} not listed, so its lastmod cannot be judged`); continue; }
      const want = viewsB.jurisdictionUrls.get(path)?.lastmod ?? null;
      const got = listed.get(path);
      if (got !== want) lm.push(`${path} lastmod ${got ?? "absent"}, last_record_published_at day ${want ?? "null (so no lastmod)"}`);
    }
    add(
      "lastmod-is-record-published",
      "a rules url's lastmod is the day of last_record_published_at, and absent when that is null",
      lm.length === 0,
      lm.join("; ") || "every fixture's lastmod matches",
    );
  } finally {
    // Leave nothing indexable behind: unpublish every fixture jurisdiction.
    for (const f of created) {
      if (f.unpublish) continue;
      const u = await admin("jurisdiction-save", { jurisdiction: { ...f.jurisdiction, id: f.id, is_published: false } }).catch(() => null);
      if (!u || u.status !== 200) ctx.log(`cleanup: could not unpublish ${f.state}/${f.slug} (HTTP ${u?.status})`);
    }
  }
  return results;
}
