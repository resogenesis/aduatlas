// 106 — DEF-16. The /rules index says "we hold records" only for states where a
// rule or resource is actually published, at the state level or below.
//
// On RC1 every state's structural row counted as a record: the index said "We hold
// records in 51 of the fifty states and the District of Columbia" and every card
// said "We hold records here", while each state page said it had nothing verified
// (evidence: d6 05-index-copy).
//
// Read-only. The expected set is counted from jurisdiction_coverage_public as an
// anonymous visitor reads it (paged: PostgREST caps a response at 1000 rows).
import { openPage } from "./100_rules_fixture.mjs";

export const meta = {
  name: "106 rules index: records claimed only where published",
  rules: [
    "DEF-16: the index's count of states with records equals the states with published rules or resources",
    "DEF-16: a state card links as holding records only when that state has published content",
  ],
};

const FIFTY_ONE = new Set("AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" "));

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const rows = [];
  for (let from = 0; from < 200000; from += 1000) {
    const r = await ctx.fetchJson(
      `${ctx.supabaseUrl}/rest/v1/jurisdiction_coverage_public?select=jurisdiction_id,state_code,topics_verified,topics_source_silent,resources_published&order=jurisdiction_id`,
      { headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}`, Range: `${from}-${from + 999}`, "Range-Unit": "items" } },
    );
    if (r.status !== 200 && r.status !== 206) {
      return [{ name: "coverage readable", rule: meta.rules[0], status: "fail", detail: `anon jurisdiction_coverage_public: HTTP ${r.status}` }];
    }
    rows.push(...r.body);
    if (r.body.length < 1000) break;
  }
  const expected = new Set(
    rows
      .filter((r) => Number(r.topics_verified || 0) + Number(r.topics_source_silent || 0) + Number(r.resources_published || 0) > 0)
      .map((r) => String(r.state_code || "").toUpperCase())
      .filter((c) => FIFTY_ONE.has(c)),
  );

  const browser = await ctx.launch();
  try {
    const snap = await openPage(browser, ctx, "/rules", { settle: /Loading our current coverage/ });
    const claimed = snap.text.match(/We hold records in (\d+) of the fifty states/i);
    add(
      "count of states with records",
      meta.rules[0],
      claimed ? Number(claimed[1]) === expected.size : expected.size === 0 && /researching our first jurisdictions/i.test(snap.text),
      `page says ${claimed ? claimed[1] : "(no count)"}; published content in ${expected.size} states: ${[...expected].sort().join(" ")}`,
    );
    // Cards that present a state as holding records: a link to /rules/<code>
    // saying so. (A card for a state with nothing published does not link.)
    const linked = new Set(
      snap.links
        .filter((l) => /^\/rules\/[a-z]{2}$/i.test(l.href) && /We hold records here/i.test(l.text))
        .map((l) => l.href.slice(-2).toUpperCase()),
    );
    const extra = [...linked].filter((c) => !expected.has(c)).sort();
    const lacking = [...expected].filter((c) => !linked.has(c)).sort();
    add(
      "state cards claim records only where published",
      meta.rules[1],
      extra.length === 0 && lacking.length === 0,
      `cards claiming records: ${linked.size}; with nothing published: ${extra.join(" ") || "none"}; with records but no claim: ${lacking.join(" ") || "none"}`,
    );
  } finally {
    await browser.close();
  }
  return out;
}
