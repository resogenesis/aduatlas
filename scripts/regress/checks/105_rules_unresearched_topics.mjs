// 105 — DEF-15 (2l three states). A partly researched jurisdiction names every
// topic nobody has researched, so a homeowner can tell "no rule" from "not
// researched".
//
// On RC1 the page never read jurisdiction_topic_coverage: the 27 unresearched
// topics of a partly researched jurisdiction simply did not appear, and "Not yet
// researched" was only a legend entry (evidence: d4, refute-d4).
//
// Fixture (100): Rich Falls holds six rules; every other catalogue topic comes back
// from jurisdiction_topic_coverage as not_yet_researched, BY NAME, and each of
// those names must appear in Rich Falls's own block on the page.
import { openPage, rulesFixture, targetSection } from "./100_rules_fixture.mjs";

export const meta = {
  name: "105 rules: not-yet-researched topics are named",
  rules: [
    "DEF-15/2l: every not_yet_researched topic of a partly researched jurisdiction is named on its page",
    "DEF-15/2l: a researched topic is never listed as not researched",
  ],
};

export default async function (ctx) {
  const f = await rulesFixture(ctx);
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const cov = await ctx.fetchJson(
    `${ctx.supabaseUrl}/rest/v1/jurisdiction_topic_coverage?select=topic_key,topic_label,field_state&jurisdiction_id=eq.${f.rich.id}`,
    { headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}` } },
  );
  if (cov.status !== 200 || !Array.isArray(cov.body)) {
    return [{ name: "topic coverage readable", rule: meta.rules[0], status: "fail", detail: `anon jurisdiction_topic_coverage: HTTP ${cov.status}` }];
  }
  const open = cov.body.filter((t) => t.field_state === "not_yet_researched");
  const researched = cov.body.filter((t) => t.field_state !== "not_yet_researched");
  const browser = await ctx.launch();
  try {
    const snap = await openPage(browser, ctx, f.rich.url);
    const own = targetSection(snap, f.rich.official_name);
    const text = own?.text || "";
    const missing = open.filter((t) => !text.includes(t.topic_label)).map((t) => t.topic_label);
    add(
      "every unresearched topic is named in the jurisdiction's block",
      meta.rules[0],
      Boolean(own) && open.length > 0 && missing.length === 0,
      `${open.length} not_yet_researched topics, ${researched.length} researched; missing from the page: ${missing.length ? missing.slice(0, 8).join(", ") + (missing.length > 8 ? ` and ${missing.length - 8} more` : "") : "none"}`,
    );
    // Only the fixed page marks the list; on a page with no such marks there is
    // nothing mislabelled to find, and the first assertion carries the defect.
    const listed = new Set(snap.cards.filter((c) => c.data.topicState === "not_yet_researched").map((c) => c.data.topicKey));
    const wrong = researched.filter((t) => listed.has(t.topic_key)).map((t) => t.topic_key);
    add("researched topics are not listed as unresearched", meta.rules[1], wrong.length === 0, `wrongly listed: ${wrong.join(", ") || "none"}`);
  } finally {
    await browser.close();
  }
  return out;
}
