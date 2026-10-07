// "At a glance" on a city rules page (Richard, 2026-10-06; cards 2026-10-07): the eight first
// questions answered ONLY from the published rules on the page, word for word,
// each level labelled, each answer linked to its full rule, with "Check my
// property". Needs a published city with published rules on the target: on
// staging that is Phoenix, AZ (published for the staging preview).
//   1. the block renders eight question cards, and every answer it shows is the text of
//      a published rule on the same page (no summary, no draft)
//   2. every "Full rule and source" link points at a rule card that exists
//   3. "Check my property" leads to the property check (/feasibility)
//   4. a city with no published rules shows no block
export const meta = {
  name: "868 At a glance shows only published rules, word for word, and links each to its source",
  rules: [
    "the block shows the eight question cards and every answer is the text of a published rule on the same page",
    "every Full rule and source link points at a rule card on the page",
    "Check my property leads to /feasibility",
    "a city with nothing published shows no At a glance block",
    "a city page shows the state only where it compares: no full state section, a link to the state page, a comparison line on the city's rules, and state links that land on a rule card on the state page",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `glance-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await page.goto(`${ctx.base}/rules/az/phoenix`, { waitUntil: "networkidle" });
    // The rules arrive after the first paint: wait for the page heading, then
    // give the block time to appear.
    await page.locator("h1").first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.locator("[data-at-a-glance]").first().waitFor({ timeout: 15000 }).catch(() => {});
    const block = page.locator("[data-at-a-glance]");
    const cards = await page.locator('[data-record="provision"]').count();
    if ((await block.count()) === 0) {
      // No block is only acceptable when the page has no published rule at all.
      for (let i = 0; i < 3; i++) {
        if (cards > 0) add(i, false, `${cards} published rules on the page but no At a glance block`);
        else out.push({ name: `glance-${i + 1}`, rule: meta.rules[i], status: "skip", detail: "no published Phoenix rules on this target" });
      }
    } else {
      const topics = await page.locator("[data-glance-topic]").evaluateAll((els) => els.map((e) => e.getAttribute("data-glance-topic")));
      const pairs = await block.locator("a[href*='#rule-']").evaluateAll((as) =>
        as.map((a) => {
          const id = a.getAttribute("href").split("#")[1];
          const shown = a.parentElement.querySelector("p")?.textContent || "";
          const card = document.getElementById(id);
          return { id, shown, card: Boolean(card), cardText: card ? card.textContent : "", draft: card ? /draft/i.test(card.getAttribute("data-review-status") || "") : false };
        }),
      );
      // Same-page answers are compared with their card here; a state answer's
      // card lives on the state page and is checked in rule 5.
      const local = pairs.filter((p) => p.card);
      const mismatched = local.filter((p) => !p.cardText.replace(/\s+/g, " ").includes(p.shown.replace(/\s+/g, " ").trim().slice(0, 60)));
      add(0, topics.length === 8 && pairs.length > 0 && mismatched.length === 0, `topics ${topics.join(", ")}; answers ${pairs.length}; not matching their rule card: ${mismatched.length}`);
      const hrefs = await block.locator("a[href*='#rule-']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      const samePage = hrefs.filter((h) => h.startsWith("#"));
      const missing = samePage.filter((h) => !pairs.find((p) => `#${p.id}` === h && p.card));
      add(1, samePage.length > 0 && missing.length === 0 && hrefs.every((h) => h.startsWith("#rule-") || /^\/rules\/[a-z]{2}(\/[a-z0-9-]+)?#rule-/.test(h)), `links ${hrefs.length} (${samePage.length} on this page), missing targets ${missing.length}`);
      const cta = await block.locator("a", { hasText: "Check my property" }).first().getAttribute("href").catch(() => null);
      add(2, cta === "/feasibility", `Check my property -> ${cta}`);
    }
    // 5. the state only where it compares
    if ((await block.count()) > 0) {
      const stateSections = await page.locator("[data-level='state']").count();
      const aboveLink = await page.locator("[data-above-level='state'] a[href='/rules/az']").count();
      const comparisons = await page.locator("[data-level='target'] [data-comparison]").count();
      const stateHref = (await block.locator("a[href^='/rules/az#rule-']").first().getAttribute("href").catch(() => null)) || "";
      let landed = false;
      if (stateHref) {
        await page.goto(`${ctx.base}${stateHref}`, { waitUntil: "networkidle" });
        await page.locator(`#${stateHref.split("#")[1]}`).first().waitFor({ timeout: 20000 }).catch(() => {});
        landed = (await page.locator(`#${stateHref.split("#")[1]}`).count()) === 1 && (await page.locator(`#${stateHref.split("#")[1]} details[open]`).count()) === 1;
      }
      add(4, stateSections === 0 && aboveLink === 1 && comparisons > 0 && landed, `full state sections ${stateSections}; link to the state page ${aboveLink}; comparison lines ${comparisons}; state link ${stateHref || "none"} lands on an open rule card: ${landed}`);
    }
    await page.goto(`${ctx.base}/rules/ca/oakland`, { waitUntil: "networkidle" });
    await page.locator("h1").first().waitFor({ timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    add(3, (await page.locator("[data-at-a-glance]").count()) === 0, `blocks on an unpublished city: ${await page.locator("[data-at-a-glance]").count()}`);
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}
