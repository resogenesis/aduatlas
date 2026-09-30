// 863: five minor government portal defects from the RC4 rehearsal
// (/Users/xy/Projects/_weld/aduatlas-ledger/triage-rc4.md), fixed for RC4a.
//
//   T4-07  a government account that is also a builder had no link from /gov
//          back to /builder. No persona is a builder with a government
//          membership, but the link belongs to role "pro" and GovLayout draws the
//          same sidebar at /gov/claim for a builder with no membership, so
//          builder_claimed exercises it there. gov_verified (not a builder) is
//          the control: it must see no such link.
//   T4-10  the portal header said "Can submit" for a verified entity holding no
//          jurisdiction grant. No persona is verified without a grant, so
//          gov_verified's own my_government_context() answer is fetched from the
//          target and handed to the page with its grants removed and its role
//          set to contributor, which is the RC4 rehearsal's state exactly. The
//          unmodified answer is the control: a live may_submit grant still says
//          "Can submit".
//   T4-11  the withdrawn portal spoke of "links and codes issued earlier" to an
//          entity that never had a partnership. The portal can only know what
//          the server lets it read, and a withdrawn entity cannot read its
//          partnership row (0014), so the rule is: the sentence appears only when
//          the partnership row the page read shows the partnership was active
//          (activated_at). gov_withdrawn reads no row, so it must not see the
//          sentence. The control answers the page's partnership read with a
//          suspended row that was once active, and the sentence must appear.
//   T4-12  after a reload of /gov/claim the "Claim recorded" confirmation was
//          gone. gov_claimed holds a pending membership: after a browser reload
//          the page must still confirm it, and still offer the form.
//   T4-13  the portal sent a submission with no source type, which publish then
//          refused. gov_verified fills a rule and a resource completely except
//          for the source type: the page must send nothing and say why, and the
//          resource form's send button stays disabled until a type is chosen.
//
// Nothing is written. Every POST to regulatory_submissions is answered inside
// the browser, so even the RC4 build, which sends the row, reaches no database;
// the check counts whether the page TRIED to send it. The two in-browser answers
// for T4-10 and T4-11 change only what that one page sees.
export const meta = {
  name: "863 government portal minors (T4-07, T4-10, T4-11, T4-12, T4-13)",
  rules: [
    "T4-07: a builder account in the government portal has a link back to the builder portal, and only a builder has it",
    "T4-10: the portal header says 'Can submit' only when the entity holds a live grant with may_submit",
    "T4-11: the withdrawn portal speaks of earlier links and codes only when the partnership it read was once active",
    "T4-12: after a browser reload /gov/claim still confirms a claim that is waiting for review",
    "T4-13: the portal sends no rule or resource without a source type, and says why",
  ],
};
const [R07, R10, R11, R12, R13] = meta.rules;

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const EARLIER = /issued earlier/i;
const SOURCE_TYPE_MESSAGE = /needs its source type|Choose a source type/i;
// Anchored: "Resource type" contains "source type", and a plain substring label
// match finds both selects in the resource form.
const SOURCE_TYPE_LABEL = /^Source type/;

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

// Until the portal has its answers: the layout's first read, the partnership
// read, then the network going quiet.
const settle = async (page) => {
  await page
    .waitForFunction(
      () => !/Reading your government access from the server|Reading your partnership|Reading this entity's partnership|Reading the partnership/.test(document.body.innerText),
      null,
      { timeout: 30000 }
    )
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);
};

const open = async (page, ctx, path) => {
  await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
  await page.locator("main h1").first().waitFor({ timeout: 30000 });
  await settle(page);
};

const builderLinks = (page) => page.locator("aside").first().getByRole("link", { name: "Builder portal" });

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
  const sb = new URL(ctx.supabaseUrl).origin;
  const isPath = (p) => (u) => u.origin === sb && u.pathname === p;

  const browser = await ctx.launch();
  try {
    // ── T4-07: builder_claimed in the government portal ─────────────────────
    if (!has("builder_claimed")) skip("t4-07-builder-link", R07, "builder_claimed not in REGRESS_PERSONAS");
    else {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await signIn(page, ctx, "builder_claimed");
        await open(page, ctx, "/gov/claim");
        const links = builderLinks(page);
        const n = await links.count();
        const href = n ? await links.first().getAttribute("href") : null;
        add("t4-07-builder-link", R07, n === 1 && href === "/builder", `at ${new URL(page.url()).pathname}; "Builder portal" links in the sidebar: ${n}; href ${href || "none"}`);
      } finally {
        await context.close();
      }
    }

    // ── gov_verified: T4-07 control, T4-13, T4-10 ───────────────────────────
    if (!has("gov_verified")) {
      skip("t4-07-no-link-for-non-builder", R07, "gov_verified not in REGRESS_PERSONAS");
      skip("t4-13-rule-needs-source-type", R13, "gov_verified not in REGRESS_PERSONAS");
      skip("t4-13-resource-needs-source-type", R13, "gov_verified not in REGRESS_PERSONAS");
      skip("t4-10-granted-header-control", R10, "gov_verified not in REGRESS_PERSONAS");
      skip("t4-10-no-grant-header", R10, "gov_verified not in REGRESS_PERSONAS");
    } else {
      const v = ctx.creds("gov_verified");
      const context = await browser.newContext(DESKTOP);
      let posts = 0;
      await context.route(isPath("/rest/v1/regulatory_submissions"), (route) => {
        if (route.request().method() !== "POST") return route.continue();
        posts += 1;
        // Answered here, never sent: nothing reaches the database.
        return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      // What the server really said about this persona's entity, for the control.
      let real = null;
      page.on("response", async (r) => {
        const u = new URL(r.url());
        if (u.origin !== sb || u.pathname !== "/rest/v1/rpc/my_government_context" || r.status() !== 200) return;
        try {
          const body = await r.json();
          const m = (body?.memberships || []).find((x) => x.entity_id === v.entity_id) || null;
          if (m) real = m;
        } catch {
          /* an answer the page could not read either */
        }
      });
      try {
        await signIn(page, ctx, "gov_verified", `/login?next=${encodeURIComponent("/gov")}`);
        await open(page, ctx, "/gov");

        // T4-07 control.
        {
          const n = await builderLinks(page).count();
          add("t4-07-no-link-for-non-builder", R07, n === 0, `a non-builder government account sees ${n} "Builder portal" link(s)`);
        }

        // T4-10 control: the real answer.
        {
          const header = (await page.locator("main header").first().innerText()).replace(/\s+/g, " ");
          const role = real?.membership_role || null;
          const live = (real?.jurisdictions || []).filter((j) => j.may_submit === true).length;
          if (!real) skip("t4-10-granted-header-control", R10, "the page's my_government_context() answer was not observed");
          else if (!["contributor", "administrator"].includes(role) || !live) {
            skip("t4-10-granted-header-control", R10, `gov_verified is ${role || "no role"} with ${live} may_submit grant(s), so the control does not apply`);
          } else {
            add("t4-10-granted-header-control", R10, /Can submit/.test(header), `role ${role}, ${live} live may_submit grant(s); header "${header}"`);
          }
        }

        // T4-13: a rule complete except for its source type.
        await page.goto(`${ctx.base}/gov/regulatory`, { waitUntil: "domcontentloaded" });
        const ruleForm = page.locator("form").filter({ has: page.getByText("Which requirement") }).first();
        await ruleForm.waitFor({ timeout: 30000 });
        await settle(page);
        {
          const topicSelect = ruleForm.locator("select").first();
          const numberTopic = await topicSelect.evaluate((el) => {
            const wanted = ["max_size", "min_size", "min_lot_size", "number_allowed", "max_size_share"];
            const values = [...el.options].map((o) => o.value);
            return wanted.find((w) => values.includes(w)) || "";
          });
          if (!numberTopic) skip("t4-13-rule-needs-source-type", R13, "no number topic offered in the rule form");
          else {
            posts = 0;
            await topicSelect.selectOption(numberTopic);
            await ruleForm.locator('input[type="radio"][value="verified_from_source"]').check();
            await ruleForm.locator('input[type="number"]').first().fill("800");
            await ruleForm.getByLabel("Source link").fill("https://example.gov/regress-863-source");
            const chosen = await ruleForm.getByLabel(SOURCE_TYPE_LABEL).inputValue();
            await ruleForm.getByRole("button", { name: /Send to ADUAtlas for review/ }).click();
            await page.waitForTimeout(2500);
            const text = await page.locator("main").innerText();
            const said = SOURCE_TYPE_MESSAGE.test(text);
            add(
              "t4-13-rule-needs-source-type",
              R13,
              chosen === "" && posts === 0 && said,
              `topic ${numberTopic}, value and source link filled, source type "${chosen}"; submission POSTs the page attempted: ${posts} (answered in-browser, nothing written); source type named in a refusal: ${said}`
            );
          }
        }

        // T4-13: a resource complete except for its source type.
        {
          posts = 0;
          await page.getByRole("button", { name: "Submit an official resource" }).click();
          const resForm = page.locator("form").filter({ has: page.getByText("Resource type") }).first();
          await resForm.waitFor({ timeout: 30000 });
          const typeSelect = resForm.locator("select").first();
          const type = await typeSelect.evaluate((el) => {
            const values = [...el.options].map((o) => o.value).filter(Boolean);
            return values.includes("permit_application") ? "permit_application" : values[0] || "";
          });
          await typeSelect.selectOption(type);
          await resForm.getByPlaceholder("ADU permit application").fill("Regress 863 permit application");
          await resForm.getByLabel("Link", { exact: true }).fill("https://example.gov/regress-863-permit");
          await resForm.getByLabel("Source link").fill("https://example.gov/regress-863-source");
          const send = resForm.getByRole("button", { name: /Send to ADUAtlas for review/ });
          const disabledBefore = await send.isDisabled();
          if (!disabledBefore) {
            await send.click();
            await page.waitForTimeout(2500);
          }
          const text = await page.locator("main").innerText();
          const said = SOURCE_TYPE_MESSAGE.test(text);
          const sent = posts;
          // Choosing a type is what enables it. Nothing is clicked afterwards.
          let enabledAfter = null;
          if (disabledBefore) {
            const sourceSelect = resForm.getByLabel(SOURCE_TYPE_LABEL);
            const firstType = await sourceSelect.evaluate((el) => [...el.options].map((o) => o.value).find(Boolean) || "");
            await sourceSelect.selectOption(firstType);
            enabledAfter = !(await send.isDisabled());
          }
          add(
            "t4-13-resource-needs-source-type",
            R13,
            sent === 0 && said && disabledBefore && enabledAfter === true,
            `type ${type}, label, link and source link filled, no source type; send button disabled: ${disabledBefore}; submission POSTs the page attempted: ${sent} (answered in-browser, nothing written); plain message about the source type: ${said}; enabled once a type is chosen: ${enabledAfter === null ? "not tried" : enabledAfter}`
          );
        }

        // T4-10: the same persona's answer with its grants removed. Everything
        // else in the answer is the target's own.
        {
          await context.route(isPath("/rest/v1/rpc/my_government_context"), async (route) => {
            const resp = await route.fetch();
            let body;
            try {
              body = await resp.json();
            } catch {
              return route.fulfill({ response: resp });
            }
            for (const m of body?.memberships || []) {
              if (m.entity_id !== v.entity_id) continue;
              m.jurisdictions = [];
              m.membership_role = "contributor";
            }
            return route.fulfill({ response: resp, json: body });
          });
          await open(page, ctx, "/gov");
          const header = (await page.locator("main header").first().innerText()).replace(/\s+/g, " ");
          const main = await page.locator("main").innerText();
          const noGrantBody = /holds no jurisdiction grant yet/i.test(main);
          add(
            "t4-10-no-grant-header",
            R10,
            noGrantBody && !/Can submit/.test(header) && /Verified/.test(header),
            `answered in-browser as a verified contributor with no grant; body says no grant: ${noGrantBody}; header "${header}"`
          );
        }
      } finally {
        await context.close();
      }
    }

    // ── T4-11: gov_withdrawn ────────────────────────────────────────────────
    if (!has("gov_withdrawn")) {
      skip("t4-11-withdrawn-no-partnership-read", R11, "gov_withdrawn not in REGRESS_PERSONAS");
      skip("t4-11-once-active-control", R11, "gov_withdrawn not in REGRESS_PERSONAS");
    } else {
      const w = ctx.creds("gov_withdrawn");
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      // Every partnership row the page was given, and whether any was once active.
      const seen = { reads: 0, rows: 0, wasActive: false };
      page.on("response", async (r) => {
        const u = new URL(r.url());
        if (u.origin !== sb || u.pathname !== "/rest/v1/government_partnerships" || r.request().method() !== "GET") return;
        seen.reads += 1;
        try {
          const body = await r.json();
          const rows = Array.isArray(body) ? body : [];
          seen.rows += rows.length;
          if (rows.some((row) => row?.activated_at)) seen.wasActive = true;
        } catch {
          /* an answer the page could not read either */
        }
      });
      try {
        await signIn(page, ctx, "gov_withdrawn", `/login?next=${encodeURIComponent("/gov")}`);
        await open(page, ctx, "/gov");
        const portal = await page.locator("main").innerText();
        await open(page, ctx, "/gov/partnership");
        const partnership = await page.locator("main").innerText();
        const said = EARLIER.test(portal) || EARLIER.test(partnership);
        const withdrawnShown = /withdrawn/i.test(portal) && /cannot be issued/i.test(partnership);
        // A former partner must still learn that its residents keep their access,
        // so with no row to read the rule is stated as a condition.
        const conditional = /If this entity gave residents sponsored access before/i.test(portal) || /If this entity gave residents sponsored access before/i.test(partnership);
        add(
          "t4-11-withdrawn-no-partnership-read",
          R11,
          withdrawnShown && (seen.wasActive || (!said && conditional)),
          `partnership reads ${seen.reads}, rows returned ${seen.rows}, a row showing it was once active: ${seen.wasActive}; "issued earlier" on /gov: ${EARLIER.test(portal)}, on /gov/partnership: ${EARLIER.test(partnership)}; conditional sentence shown: ${conditional}; withdrawal and "cannot be issued" shown: ${withdrawnShown}`
        );

        // Control: the page is given a suspended row that was once active.
        await context.route(isPath("/rest/v1/government_partnerships"), (route) => {
          if (route.request().method() !== "GET") return route.continue();
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify([
              {
                id: w.partnership_id || "00000000-0000-4000-8000-000000000863",
                entity_id: w.entity_id,
                status: "suspended",
                requested_at: "2026-09-01T12:00:00Z",
                activated_at: "2026-09-02T12:00:00Z",
                suspended_at: "2026-09-20T12:00:00Z",
                created_at: "2026-09-01T12:00:00Z",
                updated_at: "2026-09-20T12:00:00Z",
              },
            ]),
          });
        });
        await open(page, ctx, "/gov");
        const portal2 = await page.locator("main").innerText();
        await open(page, ctx, "/gov/partnership");
        const partnership2 = await page.locator("main").innerText();
        add(
          "t4-11-once-active-control",
          R11,
          EARLIER.test(portal2) && EARLIER.test(partnership2),
          `partnership read answered in-browser with a suspended row activated earlier; "issued earlier" on /gov: ${EARLIER.test(portal2)}, on /gov/partnership: ${EARLIER.test(partnership2)}`
        );
      } finally {
        await context.close();
      }
    }

    // ── T4-12: gov_claimed reloads /gov/claim ───────────────────────────────
    if (!has("gov_claimed")) skip("t4-12-reload-keeps-confirmation", R12, "gov_claimed not in REGRESS_PERSONAS");
    else {
      const c = ctx.creds("gov_claimed");
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await signIn(page, ctx, "gov_claimed", `/login?next=${encodeURIComponent("/gov/claim")}`);
        await open(page, ctx, "/gov/claim");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor({ timeout: 30000 });
        await settle(page);
        const h1 = ((await page.locator("main h1").first().innerText()) || "").trim();
        const main = await page.locator("main").innerText();
        const named = c.entity_name ? main.includes(c.entity_name) : true;
        const status = /Awaiting verification/.test(main);
        const formStill = (await page.getByRole("heading", { name: "Claim a government entity" }).count()) === 1 &&
          (await page.getByRole("button", { name: "Send this claim for review" }).count()) === 1;
        add(
          "t4-12-reload-keeps-confirmation",
          R12,
          /Claim recorded/.test(h1) && named && status && formStill,
          `after reload: first heading "${h1}"; entity named: ${named}; "Awaiting verification" shown: ${status}; claim form still offered: ${formStill}`
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}
