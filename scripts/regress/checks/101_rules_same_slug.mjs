// 101 — DEF-06. A jurisdiction page is looked up by (state, slug), so the same slug
// in two states renders two different records, each under its own canonical url.
//
// On RC1 the page looked the record up by slug alone and took the lowest state
// code, so /rules/mt/<slug> rendered Idaho's record with Idaho's canonical,
// /rules/wy/<slug> (no Wyoming record) rendered Idaho too, and an unpublished
// record's url served a sibling state's rules (evidence: d6 and refute-d6).
//
// Fixture (100): "<prefix> Twin" in ID, MT and NV, one rule each; NV unpublished.
import { noindexed, openPage, rulesFixture } from "./100_rules_fixture.mjs";

export const meta = {
  name: "101 rules: same slug in two states",
  rules: [
    "DEF-06: /rules/<code>/<slug> renders the record of THAT state, with its own canonical",
    "DEF-06: a state name segment resolves to its code and canonicalises to /rules/<code>/<slug>",
    "DEF-06: a state with no such record, or an unresolvable state segment, renders missing and never a sibling",
    "DEF-06: an unpublished record's url renders missing and never a sibling state's record",
  ],
};

const ORIGIN = "https://aduatlas.com";

export default async function (ctx) {
  const f = await rulesFixture(ctx);
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const slug = f.twinSlug;
  const all = ["ID", "MT", "NV"].map((c) => f.twins[c]);
  const browser = await ctx.launch();
  try {
    // Each published member renders itself, not a sibling.
    for (const [code, param] of [["ID", "id"], ["MT", "mt"], ["MT", "montana"]]) {
      const own = f.twins[code];
      const snap = await openPage(browser, ctx, `/rules/${param}/${slug}`);
      const others = all.filter((j) => j !== own);
      const leaked = others.filter((j) => snap.text.includes(j.value) || snap.h1 === j.official_name).map((j) => j.state_code);
      const canonical = `${ORIGIN}/rules/${code.toLowerCase()}/${slug}`;
      add(
        `/rules/${param}/<twin> renders the ${code} record`,
        param.length > 2 ? meta.rules[1] : meta.rules[0],
        snap.h1 === own.official_name && snap.text.includes(own.value) && leaked.length === 0 && snap.canonical === canonical,
        `h1="${snap.h1}" (want "${own.official_name}"); own value ${snap.text.includes(own.value) ? "shown" : "MISSING"}; sibling records shown: ${leaked.join(",") || "none"}; canonical ${snap.canonical} (want ${canonical})`,
      );
    }

    // No record in that state, or no such state: missing, never a sibling.
    for (const [param, rule, why] of [
      ["wy", meta.rules[2], "a state with no such record"],
      ["zz", meta.rules[2], "a segment that names no state"],
      ["nv", meta.rules[3], "the unpublished NV record"],
    ]) {
      const snap = await openPage(browser, ctx, `/rules/${param}/${slug}`);
      const leaked = all.filter((j) => snap.text.includes(j.value) || snap.h1 === j.official_name).map((j) => j.state_code);
      add(
        `/rules/${param}/<twin> (${why}) renders missing`,
        rule,
        leaked.length === 0 && /do not have a (published )?record/i.test(snap.h1) && noindexed(snap),
        `h1="${snap.h1}"; records shown: ${leaked.join(",") || "none"}; canonical ${snap.canonical}; robots ${JSON.stringify(snap.robots)}`,
      );
    }
  } finally {
    await browser.close();
  }
  return out;
}
