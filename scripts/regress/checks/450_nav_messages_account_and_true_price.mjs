// 450 — the ways back to what a person is waiting for, and a plan price shown
// only where it is true (RC4 integration findings I4-04b and I4-06).
//
// RC3 and the RC4 tree before this pass:
//   - a signed-in account with no portal (no plan: a new account, or a customer
//     whose refund was processed, who lands on /unlock) was offered only "See
//     Packages" and Log out by the public header. Nothing pointed to /settings,
//     the page where the reply to a refund request appears;
//   - nothing in the homeowner portal or the builder portal linked Messages, so
//     a builder's reply, or a homeowner's message to a builder, was reached only
//     from a builder profile or the builder dashboard; /messages and
//     /builder/messages had no page title of their own;
//   - the builder portal had no way into /gov for a builder account that also
//     represents a government entity (contract C3), which the homeowner and
//     admin sidebars already had;
//   - the Overview printed the list price beside the plan held ("$79 · ...") for
//     a comped or sponsored homeowner, who paid nothing. The level held and what
//     money bought are separate facts (2r); my_qualifying_paid_plan() is null for
//     comped and sponsored access.
//
// One regress- account is created (${ctx.prefix}-450-home@...) and deleted at
// the end. It starts with no plan (rule 1), is comped Golden through
// public.admin_comp_entitlement() with the service role, the one writer of a
// comp (rules 2 and 3), and is then stamped as a Golden purchase the way
// api/stripe-webhook.js records a paid session (rule 4, the control). The shared
// builder_verified persona only signs in and looks (rules 5 and 6): its database
// writes are refused in the browser, and my_government_context() is answered in
// the browser for the membership half of rule 6, because no staging persona is a
// builder with a membership. Typed values never reach an error or a log.
import { planById } from "../../../src/lib/plans.js";

export const meta = {
  name: "450 messages and account links, and the Overview price comped access did not pay",
  rules: [
    "I4-04b: a signed-in account with no portal reaches its account page (/settings) from the public header: in the row from 1280 px, in the Account menu from 1024 to 1279 px and in the phone menu, and the header still fits",
    "I4-06: the homeowner portal's sidebar links Messages (/messages) on desktop and in the phone drawer, and /messages has its own page title",
    "I4-06, 2r: a comped homeowner's Overview names the plan without a price, because no money bought it, and quotes the upgrade at what checkout would charge",
    "control: once money bought the plan, the Overview shows its price and the upgrade credit",
    "I4-06: the builder portal's sidebar links Messages (/builder/messages), which has its own page title",
    "I4-06, C3: the builder portal's sidebar links /gov only for a builder account that holds a government membership",
  ],
};
const [R_ACCOUNT, R_MESSAGES, R_COMP_PRICE, R_PAID_PRICE, R_BUILDER_MESSAGES, R_BUILDER_GOV] = meta.rules;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const oneLine = (s, n = 200) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);
const SITE_TITLE = /·\s*ADUAtlas$/;

// Sign in through the real /login form. A failed fill is replaced by a fixed
// sentence; a rate-limited attempt waits and retries.
const signIn = async (page, ctx, who, email, password) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${ctx.base}/login`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator('main input[type="email"]').fill(email, { timeout: 30000 });
      await page.locator('main input[type="password"]').fill(password, { timeout: 30000 });
    } catch {
      throw new Error(`the sign-in form could not be filled for ${who} (details withheld)`);
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
    throw new Error(`sign-in for ${who} did not leave /login`);
  }
  throw new Error(`sign-in for ${who} was still rate-limited after four tries`);
};

// The public header at one width: does it fit, with no nav link wrapped?
const headerFits = (page) =>
  page.evaluate(() => {
    const h = document.querySelector("header");
    const wrapped = [...h.querySelectorAll('nav[aria-label="Primary"] > *')].filter((e) => e.getBoundingClientRect().height > 30).length;
    return h.scrollWidth <= window.innerWidth && wrapped === 0;
  });

// The page's heading once the route has rendered: after a client-side
// navigation the previous page's heading can still be in the DOM for a moment.
const headingOf = async (page, expected) => {
  await page.locator("main h1", { hasText: expected }).first().waitFor({ timeout: 10000 }).catch(() => {});
  return page.locator("main h1").first().innerText({ timeout: 5000 }).then((t) => oneLine(t, 40)).catch(() => "(no h1)");
};

const titleOf = async (page, pattern) => {
  await page.waitForFunction((src) => new RegExp(src).test(document.title), pattern.source, { timeout: 5000 }).catch(() => {});
  return page.title();
};

// The "Your plan" card on the Overview, found by its label so RC3 is read too.
const planCard = (page) => page.locator("main div", { has: page.locator("p", { hasText: /^\s*Your plan\s*$/ }) }).last();

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail, status) => out.push({ name, rule, status: status || (ok ? "pass" : "fail"), detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `nav-and-price-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const golden = planById("roadmap");
  const platinum = planById("report");
  const fmt = (cents) => `$${(cents / 100).toLocaleString("en-US")}`;

  const email = `${ctx.prefix}-450-home@regress.aduatlas.test`;
  const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
  let authId = null;
  let rowId = null;
  let browser;
  // Each block reports its own rules, so a failure in one never hides another.
  const guarded = async (rules, fn) => {
    try {
      await fn();
    } catch (e) {
      const msg = String(e?.message || e).split("Call log:")[0].split(password).join("[redacted]");
      for (const [name, rule] of rules) if (!out.some((o) => o.rule === rule)) add(name, rule, false, `could not run: ${oneLine(msg, 300)}`);
    }
  };

  try {
    const c = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix } }),
    });
    authId = c.body?.id || c.body?.user?.id || null;
    if (!authId) throw new Error(`fixture sign-up failed: HTTP ${c.status}`);
    for (let i = 0; i < 20 && !rowId; i += 1) {
      const r = await svc(`users?auth_user_id=eq.${authId}&select=id`);
      rowId = Array.isArray(r.body) && r.body[0]?.id;
      if (!rowId) await sleep(500);
    }
    if (!rowId) throw new Error("fixture users row never appeared");

    browser = await ctx.launch();
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route("**/api/send-email", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const landed = await signIn(page, ctx, "the 450 fixture", email, password);

    // 1. No plan, so no portal: the account page from the public header.
    await guarded([["account-link-for-no-portal", R_ACCOUNT]], async () => {
      const seen = [];
      const settingsIn = (scope) => scope.locator('[data-header-account="signed-in"] a[href="/settings"]').filter({ visible: true });
      // From 1280 px: a link in the row.
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
      const header = page.locator("header").first();
      await header.waitFor();
      await page.waitForTimeout(800);
      const row1280 = await settingsIn(header).count();
      const text1280 = row1280 ? oneLine(await settingsIn(header).first().innerText(), 40) : "";
      seen.push(`1280px: ${row1280} row link${text1280 ? ` "${text1280}"` : ""}, fits ${await headerFits(page)}`);
      const ok1280 = row1280 === 1 && /account/i.test(text1280) && (await headerFits(page));
      // 1024 to 1279 px: the Account menu, which then opens the account page.
      let ok1024 = true;
      let opened = "";
      for (const width of [1024, 1279]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
        await header.waitFor();
        await page.waitForTimeout(800);
        const fits = await headerFits(page);
        let found = await settingsIn(header).count();
        let via = found ? "row" : "none";
        if (!found) {
          const menu = header.locator('[data-header-account="signed-in"] button[aria-haspopup="menu"]').filter({ visible: true });
          if (await menu.count()) {
            await menu.first().click();
            await page.waitForTimeout(300);
            found = await header.locator('[role="menu"] a[href="/settings"]').filter({ visible: true }).count();
            via = found ? "Account menu" : "menu without /settings";
          }
        }
        if (width === 1024 && found) {
          await header.locator('a[href="/settings"]').filter({ visible: true }).first().click();
          await page.waitForURL((u) => u.pathname === "/settings", { timeout: 10000 }).catch(() => {});
          const h1 = await headingOf(page, /your account/i);
          opened = `${new URL(page.url()).pathname} "${h1}"`;
          if (!(new URL(page.url()).pathname === "/settings" && /your account/i.test(h1))) ok1024 = false;
        }
        seen.push(`${width}px: /settings via ${via}, fits ${fits}${width === 1024 ? `, opened ${opened || "nothing"}` : ""}`);
        if (!fits || !found) ok1024 = false;
      }
      // The phone menu.
      await page.setViewportSize({ width: 390, height: 780 });
      await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
      await header.waitFor();
      await page.waitForTimeout(500);
      await header.getByRole("button", { name: "Toggle menu" }).click();
      await page.waitForTimeout(300);
      const phone = await settingsIn(header).count();
      const phoneFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      seen.push(`390px phone menu: ${phone} link(s), page fits ${phoneFits}`);
      add("account-link-for-no-portal", R_ACCOUNT, ok1280 && ok1024 && phone === 1 && phoneFits, `signed in to ${landed}; ${seen.join("; ")}`);
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    // Comp Golden, through the one writer of a comp.
    const comp = await svc("rpc/admin_comp_entitlement", { method: "POST", body: JSON.stringify({ p_user_id: rowId, p_tier: "roadmap" }) });
    const basisOf = async () => {
      const b = await svc(`homeowner_upgrade_basis?select=paid_tier,paid_origin,qualifying_paid_plan&user_id=eq.${rowId}`);
      return Array.isArray(b.body) ? b.body[0] || null : null;
    };
    const compBasis = await basisOf();
    const comped = comp.status < 300 && comp.body?.result === "comped" && compBasis?.paid_tier === "roadmap" && compBasis?.paid_origin === "admin_comp" && compBasis?.qualifying_paid_plan === null;
    if (!comped) {
      const why = `the comp was not recorded as expected (HTTP ${comp.status}, result ${comp.body?.result ?? "none"}, basis ${JSON.stringify(compBasis)})`;
      add("portal-links-messages", R_MESSAGES, false, why);
      add("overview-no-price-for-comped", R_COMP_PRICE, false, why);
      add("overview-price-when-bought", R_PAID_PRICE, false, why);
    } else {
      // 2. Messages in the homeowner portal.
      await guarded([["portal-links-messages", R_MESSAGES]], async () => {
        await page.goto(`${ctx.base}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        const side = page.locator("aside a[href='/messages']").filter({ visible: true });
        const desktop = await side.count();
        const label = desktop ? oneLine(await side.first().innerText(), 30) : "";
        let path = "";
        let heading = "";
        let title = "";
        if (desktop) {
          await side.first().click();
          await page.waitForURL((u) => u.pathname === "/messages", { timeout: 10000 }).catch(() => {});
          path = new URL(page.url()).pathname;
          heading = await headingOf(page, /^\s*messages\s*$/i);
          title = await titleOf(page, /^Messages\b/);
        } else {
          await page.goto(`${ctx.base}/messages`, { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(1000);
          title = await page.title();
        }
        await page.setViewportSize({ width: 390, height: 780 });
        await page.goto(`${ctx.base}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        await page.getByRole("button", { name: "Toggle menu" }).first().click();
        await page.waitForTimeout(300);
        const phone = await page.locator("aside a[href='/messages']").filter({ visible: true }).count();
        await page.setViewportSize({ width: 1280, height: 900 });
        add(
          "portal-links-messages",
          R_MESSAGES,
          desktop === 1 && /^messages$/i.test(label) && path === "/messages" && /^messages$/i.test(heading) && /^Messages\b/.test(title) && SITE_TITLE.test(title) && phone === 1,
          `desktop sidebar links ${desktop}${label ? ` "${label}"` : ""}${path ? `, opened ${path} "${heading}"` : ""}; title "${title}"; phone drawer links ${phone}`
        );
      });

      // 3. The comped Overview.
      await guarded([["overview-no-price-for-comped", R_COMP_PRICE]], async () => {
        await page.goto(`${ctx.base}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        // Wait for the server's answer: the upgrade step then carries a figure.
        const upgrade = page.locator("main a[href='/unlock?tier=report']", { hasText: /Upgrade for \$/ });
        await upgrade.first().waitFor({ timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(500);
        const cta = (await upgrade.count()) ? oneLine(await upgrade.first().innerText(), 40) : "(no priced upgrade step)";
        const card = oneLine(await planCard(page).innerText().catch(() => ""), 240);
        add(
          "overview-no-price-for-comped",
          R_COMP_PRICE,
          card.includes(golden.name) && !/\$\s?\d/.test(card) && cta.includes(`Upgrade for ${fmt(platinum.priceCents)}`),
          `plan card "${card}"; upgrade step "${cta}"; basis ${compBasis.paid_origin}, qualifying ${compBasis.qualifying_paid_plan ?? "none"}`
        );
      });

      // 4. Control: the same plan, now bought.
      await guarded([["overview-price-when-bought", R_PAID_PRICE]], async () => {
        const stamp = await svc(`users?id=eq.${rowId}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ paid_at: new Date().toISOString(), paid_tier: "roadmap", refunded_at: null, paid_origin: "purchase" }),
        });
        const bought = await basisOf();
        if (stamp.status >= 300 || bought?.qualifying_paid_plan !== "roadmap") {
          add("overview-price-when-bought", R_PAID_PRICE, false, `the purchase stamp did not qualify (HTTP ${stamp.status}, basis ${JSON.stringify(bought)})`);
          return;
        }
        await page.goto(`${ctx.base}/dashboard`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        const upgrade = page.locator("main a[href='/unlock?tier=report']", { hasText: /Upgrade for \$/ });
        await upgrade.first().waitFor({ timeout: 15000 }).catch(() => {});
        const card = planCard(page);
        await card.getByText(fmt(golden.priceCents)).first().waitFor({ timeout: 10000 }).catch(() => {});
        const cta = (await upgrade.count()) ? oneLine(await upgrade.first().innerText(), 40) : "(no priced upgrade step)";
        const text = oneLine(await card.innerText().catch(() => ""), 240);
        const due = fmt(platinum.priceCents - golden.priceCents);
        add(
          "overview-price-when-bought",
          R_PAID_PRICE,
          text.includes(golden.name) && text.includes(fmt(golden.priceCents)) && cta.includes(`Upgrade for ${due}`),
          `plan card "${text}"; upgrade step "${cta}"`
        );
      });
    }
    await context.close();

    // 5 and 6. The builder portal, as the shared builder_verified persona.
    let b = null;
    try {
      b = ctx.creds("builder_verified");
    } catch (e) {
      add("builder-links-messages", R_BUILDER_MESSAGES, false, String(e.message || e), "skip");
      add("builder-gov-link-only-with-membership", R_BUILDER_GOV, false, String(e.message || e), "skip");
    }
    if (b) {
      const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const sb = new URL(ctx.supabaseUrl).origin;
      const refused = [];
      await bctx.route((u) => u.origin === sb && (u.pathname.startsWith("/rest/v1/") || u.pathname === "/auth/v1/logout"), (route) => {
        const req = route.request();
        const p = new URL(req.url()).pathname;
        const read = req.method() === "GET" || req.method() === "HEAD" || (req.method() === "POST" && /^\/rest\/v1\/rpc\/(get_|my_)/.test(p));
        if (read) return route.fallback();
        refused.push(`${req.method()} ${p}`);
        return route.fulfill({ status: p === "/auth/v1/logout" ? 204 : 403, contentType: "application/json", body: p === "/auth/v1/logout" ? "" : "{\"message\":\"refused in the browser by regress 450\"}" });
      });
      let membership = false;
      let contextReads = 0;
      await bctx.route((u) => u.origin === sb && u.pathname === "/rest/v1/rpc/my_government_context", async (route) => {
        if (!membership) return route.fallback();
        contextReads += 1;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            government_user: null,
            memberships: [
              { membership_id: null, entity_id: "00000000-0000-0000-0000-00000000beef", entity_name: "Regress Probe City", entity_type: "city", entity_state: "claimed", membership_status: "pending", jurisdictions: [] },
            ],
          }),
        });
      });
      const bpage = await bctx.newPage();
      bpage.setDefaultTimeout(30000);
      try {
        const blanded = await signIn(bpage, ctx, "builder_verified", b.email, b.password);
        let govWithout = -1;
        await guarded([["builder-links-messages", R_BUILDER_MESSAGES]], async () => {
          await bpage.goto(`${ctx.base}/builder`, { waitUntil: "domcontentloaded" });
          await bpage.locator("main h1").first().waitFor();
          await bpage.waitForTimeout(800);
          govWithout = await bpage.locator("aside a[href='/gov']").count();
          const side = bpage.locator("aside a[href='/builder/messages']").filter({ visible: true });
          const n = await side.count();
          const label = n ? oneLine(await side.first().innerText(), 30) : "";
          let path = "";
          let heading = "";
          if (n) {
            await side.first().click();
            await bpage.waitForURL((u) => u.pathname === "/builder/messages", { timeout: 10000 }).catch(() => {});
            path = new URL(bpage.url()).pathname;
            heading = await headingOf(bpage, /^\s*messages\s*$/i);
          } else {
            await bpage.goto(`${ctx.base}/builder/messages`, { waitUntil: "domcontentloaded" });
            await bpage.waitForTimeout(1000);
          }
          const title = await titleOf(bpage, /^Messages\b/);
          add(
            "builder-links-messages",
            R_BUILDER_MESSAGES,
            n === 1 && /^messages$/i.test(label) && path === "/builder/messages" && /^messages$/i.test(heading) && /^Messages\b/.test(title) && SITE_TITLE.test(title),
            `builder signed in to ${blanded}; sidebar links ${n}${label ? ` "${label}"` : ""}${path ? `, opened ${path} "${heading}"` : ""}; title "${title}"`
          );
        });
        await guarded([["builder-gov-link-only-with-membership", R_BUILDER_GOV]], async () => {
          membership = true;
          await bpage.goto(`${ctx.base}/builder`, { waitUntil: "domcontentloaded" });
          await bpage.locator("main h1").first().waitFor();
          await bpage.waitForTimeout(800);
          const govWith = await bpage.locator("aside a[href='/gov']").filter({ visible: true }).count();
          add(
            "builder-gov-link-only-with-membership",
            R_BUILDER_GOV,
            govWithout === 0 && govWith === 1 && contextReads > 0,
            `without a membership ${govWithout} /gov link(s); with one (answered in-browser ${contextReads}x) ${govWith}`
          );
        });
        if (refused.length) ctx.log(`kept the builder persona read-only: refused ${[...new Set(refused)].join(", ")}`);
      } finally {
        await bctx.close();
      }
    }
  } catch (e) {
    const msg = oneLine(String(e?.message || e).split("Call log:")[0].split(password).join("[redacted]"), 300);
    for (const [i, rule] of meta.rules.entries()) if (!out.some((o) => o.rule === rule)) add(`nav-and-price-${i + 1}`, rule, false, `could not run: ${msg}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (rowId) await svc(`users?id=eq.${rowId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    if (authId) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: H }).catch(() => {});
  }
  return out;
}
