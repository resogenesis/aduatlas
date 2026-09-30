// 432 — government portal copy and the "verified with no value" refusal (RC3
// triage R3-23).
//
// RC3, four things a government user saw:
//   1. the portal header printed the raw entity type key: "city · Can submit";
//   2. after a withdrawal the portal said "any grant listed below is not in
//      effect" while listing nothing below;
//   3. after a withdrawal /gov/regulatory showed only the withdrawn notice and
//      nothing at all about what the entity had sent. The database keeps those
//      rows but no longer lets the member read them (0012
//      regulatory_submissions_select_own_entity needs a verified entity), so the
//      page must say where the history is rather than go silent;
//   4. a number rule sent as "Verified from source" with no number went to
//      review; only the admin's publish caught it.
//
// Nothing is written. For (4) every POST to regulatory_submissions is answered
// inside the browser, so even the RC3 build, which sends the row, reaches no
// database; the check counts whether the page TRIED to send it.
export const meta = {
  name: "432 government portal copy and verified-value refusal",
  rules: [
    "R3-23: the portal names the entity type in words, never the raw key",
    "R3-23: a withdrawn portal does not point at a grant list that is not shown",
    "R3-23: after a withdrawal /gov/regulatory says where the submission history is",
    "R3-23: the portal refuses a 'Verified from source' rule with no value, before sending anything",
  ],
};

// Sign in through the real /login form. Typed values never reach an error or a
// log: a failed fill is replaced by a fixed sentence (a Playwright error once
// echoed a persona password). A rate-limited attempt waits and retries.
const signIn = async (page, ctx, persona, path = "/login") => {
  const c = ctx.creds(persona);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator('main input[type="email"]').fill(c.email, { timeout: 30000 });
      await page.locator('main input[type="password"]').fill(c.password, { timeout: 30000 });
    } catch {
      throw new Error(`the sign-in form could not be filled for ${persona} (details withheld)`);
    }
    await page.locator('main button[type="submit"]').click();
    const left = page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }).then(() => "in", () => "stuck");
    const limited = page.locator("main").getByText(/rate limit|too many/i).first().waitFor({ timeout: 45000 }).then(() => "limited", () => "stuck");
    const outcome = await Promise.race([left, limited]);
    if (outcome === "in") return new URL(page.url()).pathname;
    if (outcome === "limited") {
      await page.waitForTimeout(65000);
      continue;
    }
    throw new Error(`sign-in for ${persona} did not leave /login`);
  }
  throw new Error(`sign-in for ${persona} was still rate-limited after four tries`);
};

const settle = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const skip = (name, rule, detail) => out.push({ name, rule, status: "skip", detail });
  const has = (p) => {
    try {
      ctx.creds(p);
      return true;
    } catch {
      return false;
    }
  };
  const browser = await ctx.launch();
  try {
    // 1. Entity type in words, for a verified member.
    if (!has("education_partner")) skip("entity-type-in-words", meta.rules[0], "education_partner not in REGRESS_PERSONAS");
    else {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await signIn(page, ctx, "education_partner", `/login?next=${encodeURIComponent("/gov")}`);
        await page.goto(`${ctx.base}/gov`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        await settle(page);
        const text = await page.locator("main").innerText();
        const raw = /(^|\n)\s*(city|county|state|state_agency|regional|tribal|special_district|other)\s·/.test(text);
        const worded = /(City|County|State) government|State agency|Regional body|Tribal government|Special district|Other government body|Government body/.test(text);
        add("entity-type-in-words", meta.rules[0], !raw && worded, `raw key line present: ${raw}; worded label present: ${worded}`);
      } finally {
        await context.close();
      }
    }

    // 2 and 3. The withdrawn entity.
    if (!has("gov_withdrawn")) {
      skip("withdrawn-grant-sentence", meta.rules[1], "gov_withdrawn not in REGRESS_PERSONAS");
      skip("withdrawn-history-explained", meta.rules[2], "gov_withdrawn not in REGRESS_PERSONAS");
    } else {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await signIn(page, ctx, "gov_withdrawn", `/login?next=${encodeURIComponent("/gov")}`);
        await page.goto(`${ctx.base}/gov`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        await settle(page);
        const portal = await page.locator("main").innerText();
        const withdrawnShown = /withdrawn/i.test(portal);
        const pointsBelow = /listed below/i.test(portal);
        add(
          "withdrawn-grant-sentence",
          meta.rules[1],
          withdrawnShown && !pointsBelow,
          `withdrawn state shown: ${withdrawnShown}; still says "listed below": ${pointsBelow}`
        );

        await page.goto(`${ctx.base}/gov/regulatory`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        await settle(page);
        const reg = await page.locator("main").innerText();
        const historyCard = /What you have sent/.test(reg);
        const explained = /kept|nothing was deleted|cannot show/i.test(reg) || /Withdrawn|Accepted|Published|Rejected|Submitted/.test(reg.split("What you have sent")[1] || "");
        add(
          "withdrawn-history-explained",
          meta.rules[2],
          historyCard && explained,
          `"What you have sent" shown: ${historyCard}; history listed or its whereabouts explained: ${explained}`
        );
      } finally {
        await context.close();
      }
    }

    // 4. Verified from source with no value.
    if (!has("gov_verified")) skip("verified-needs-a-value", meta.rules[3], "gov_verified not in REGRESS_PERSONAS");
    else {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const sb = new URL(ctx.supabaseUrl).origin;
      let posts = 0;
      await context.route(
        (u) => u.origin === sb && u.pathname === "/rest/v1/regulatory_submissions",
        (route) => {
          if (route.request().method() !== "POST") return route.continue();
          posts += 1;
          // Answered here, never sent: nothing reaches the database.
          return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
        }
      );
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await signIn(page, ctx, "gov_verified", `/login?next=${encodeURIComponent("/gov/regulatory")}`);
        await page.goto(`${ctx.base}/gov/regulatory`, { waitUntil: "domcontentloaded" });
        const form = page.locator("form").filter({ has: page.getByText("Which requirement") }).first();
        await form.waitFor({ timeout: 30000 });
        await settle(page);
        const topicSelect = form.locator("select").first();
        const numberTopic = await topicSelect.evaluate((el) => {
          const wanted = ["max_size", "min_size", "min_lot_size", "number_allowed", "max_size_share"];
          const values = [...el.options].map((o) => o.value);
          return wanted.find((w) => values.includes(w)) || "";
        });
        if (!numberTopic) {
          skip("verified-needs-a-value", meta.rules[3], "no number topic offered in the rule form");
        } else {
          await topicSelect.selectOption(numberTopic);
          await form.locator('input[type="radio"][value="verified_from_source"]').check();
          await form.getByLabel("Source link").fill("https://example.gov/regress-source-page");
          const numberField = form.locator('input[type="number"]');
          const numberShown = await numberField.count();
          if (numberShown) await numberField.first().fill("");
          await form.getByRole("button", { name: /Send to ADUAtlas for review/ }).click();
          await page.waitForTimeout(2500);
          const text = await page.locator("main").innerText();
          const refused = /needs the value the source gives/i.test(text);
          add(
            "verified-needs-a-value",
            meta.rules[3],
            posts === 0 && refused,
            `topic ${numberTopic}; number field shown: ${numberShown > 0}; submission POSTs the page attempted: ${posts} (answered in-browser, nothing written); refusal shown: ${refused}`
          );
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}
