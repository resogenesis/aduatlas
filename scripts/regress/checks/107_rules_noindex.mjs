// 107 — DEF-03 (page side), DEF-26b where cheap. A page that carries too little
// verified content, or no record at all, asks not to be indexed; a page the
// database rates indexable does not.
//
// On RC1 no rules page and no builder page ever emitted a robots directive: thin
// jurisdictions (linked from their state page), an unpublished record's url, a url
// with no record behind it and an unavailable builder profile all answered with a
// self canonical and nothing asking a crawler to stay away (evidence: d3, refute-d3).
//
// What "indexable" means is the database's answer, read here as an anonymous
// visitor reads it (jurisdiction_coverage_public.is_indexable), so this check stays
// right whatever threshold the migrations set.
import { noindexed, openPage, rulesFixture } from "./100_rules_fixture.mjs";

export const meta = {
  name: "107 rules and builders: noindex where the page has no indexable content",
  rules: [
    "DEF-03/2l: a jurisdiction page asks to be indexed exactly when jurisdiction_coverage_public says it is indexable",
    "DEF-03: a missing, unpublished or unresolvable rules url is noindex",
    "DEF-03/2l: a state page with no indexable content in it is noindex; one with indexable content is not",
    "DEF-03/DEF-26b: an unavailable builder profile is noindex",
  ],
};

export default async function (ctx) {
  const f = await rulesFixture(ctx);
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const anon = (q) => ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${q}`, { headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}` } });

  const ids = [f.rich.id, f.twins.ID.id, f.twins.MT.id];
  const cov = await anon(`jurisdiction_coverage_public?select=jurisdiction_id,state_code,is_indexable&jurisdiction_id=in.(${ids.join(",")})`);
  if (cov.status !== 200) return [{ name: "coverage readable", rule: meta.rules[0], status: "fail", detail: `HTTP ${cov.status}` }];
  const indexable = new Map(cov.body.map((r) => [r.jurisdiction_id, r.is_indexable === true]));

  // States for the state-page probe: one with an indexable jurisdiction in it and
  // one with none (read-only; any state will do).
  const idx = await anon("jurisdiction_coverage_public?select=state_code&is_indexable=is.true&limit=1000");
  const withIndexable = new Set((idx.body || []).map((r) => r.state_code));
  const quiet = "AK DE HI ME NH RI SD WV".split(" ").find((c) => !withIndexable.has(c)) || null;
  const busy = [...withIndexable].sort()[0] || null;

  const browser = await ctx.launch();
  try {
    for (const [label, url, id] of [
      ["Rich Falls", f.rich.url, f.rich.id],
      ["Twin (ID)", `/rules/id/${f.twinSlug}`, f.twins.ID.id],
    ]) {
      const snap = await openPage(browser, ctx, url);
      const want = !indexable.get(id);
      add(
        `${label}: noindex ${want ? "present" : "absent"} as the database rates it`,
        meta.rules[0],
        noindexed(snap) === want,
        `is_indexable=${indexable.get(id)}; robots ${JSON.stringify(snap.robots)}`,
      );
    }

    for (const [label, url] of [
      ["no such jurisdiction", `/rules/vt/${f.prefix}-no-such-place`],
      ["unpublished record", `/rules/nv/${f.twinSlug}`],
      ["state segment that names no state", `/rules/nowhere/${f.twinSlug}`],
    ]) {
      const snap = await openPage(browser, ctx, url);
      add(`${label} is noindex`, meta.rules[1], noindexed(snap), `h1="${snap.h1}"; robots ${JSON.stringify(snap.robots)}`);
    }

    if (quiet) {
      const snap = await openPage(browser, ctx, `/rules/${quiet.toLowerCase()}`);
      add(`state page with nothing indexable (${quiet}) is noindex`, meta.rules[2], noindexed(snap), `robots ${JSON.stringify(snap.robots)}`);
    }
    if (busy) {
      const snap = await openPage(browser, ctx, `/rules/${busy.toLowerCase()}`);
      add(`state page with indexable content (${busy}) is not noindex`, meta.rules[2], !noindexed(snap), `robots ${JSON.stringify(snap.robots)}`);
    }

    const snap = await openPage(browser, ctx, `/builders/${f.prefix}-no-such-builder`, { ready: /builder profile is not available|Contact and links/ });
    add(
      "unavailable builder profile is noindex",
      meta.rules[3],
      /not available/i.test(snap.text) && noindexed(snap),
      `text ${/not available/i.test(snap.text) ? "says not available" : "does NOT say not available"}; robots ${JSON.stringify(snap.robots)}`,
    );
  } finally {
    await browser.close();
  }
  return out;
}
