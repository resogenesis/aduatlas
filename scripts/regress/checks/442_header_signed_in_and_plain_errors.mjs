// 442 — the public header reflects sign-in, and sign-up / sign-in refusals are
// said in plain words (RC3 triage R3-21).
//
// RC3: Header.jsx never read the session, so a signed-in homeowner, a sponsored
// resident or a paying customer on a public page (/rules, /unlock, a builder
// profile) was still offered "Sign In" and "See Packages", with no account shown
// and no way to log out outside the app sidebar. And the sign-up form printed
// Supabase Auth's own string, "email rate limit exceeded", verbatim.
//
// Read only. The header half signs a paid persona in and looks; Log out ends
// only this browser's session. The refusal half never reaches Supabase Auth: the
// sign-up and token requests are answered inside the browser with the provider's
// real refusal shapes, so no account is created and no persona is involved.
export const meta = {
  name: "442 public header signed-in state and plain auth errors",
  rules: [
    "R3-21: a signed-in person on a public page sees the account and Log out, not Sign In",
    "R3-21: the phone menu shows the same signed-in state",
    "R3-21: Log out from the public header signs the person out",
    "R3-21: a sign-up refusal is shown in plain words, never the provider's raw string",
    "R3-21: a sign-in refusal is shown in plain words, never the provider's raw string",
    "C3: between 1024 and 1279 px, a builder account that also holds a government membership can reach /gov from the public header, and the header still fits",
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

const PERSONA = "golden_sponsored";

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    // ── the header ──────────────────────────────────────────────────────────
    let c = null;
    try {
      c = ctx.creds(PERSONA);
    } catch (e) {
      for (const i of [0, 1, 2]) out.push({ name: `header-${i}`, rule: meta.rules[i], status: "skip", detail: String(e.message || e) });
    }
    if (c) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      // supabase-js signs out globally by default, which would end this shared
      // persona's sessions everywhere else too. The logout call is answered here
      // instead; the page still clears its own session exactly as it would.
      const sbOrigin = new URL(ctx.supabaseUrl).origin;
      let logouts = 0;
      await context.route(
        (u) => u.origin === sbOrigin && u.pathname === "/auth/v1/logout",
        (route) => {
          logouts += 1;
          return route.fulfill({ status: 204, body: "" });
        }
      );
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await signIn(page, ctx, PERSONA);
        await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
        const header = page.locator("header").first();
        await header.waitFor();
        await page.waitForTimeout(800);
        const text = await header.innerText();
        const signIn_ = await header.getByRole("link", { name: /^\s*Sign In\s*$/ }).count();
        const logOut = await header.getByRole("button", { name: /^\s*Log out\s*$/ }).count();
        const showsAccount = text.includes(c.email);
        add(
          "header-shows-signed-in-state",
          meta.rules[0],
          signIn_ === 0 && logOut > 0 && showsAccount,
          `"Sign In" links: ${signIn_}; "Log out" buttons: ${logOut}; account shown: ${showsAccount}`
        );

        await page.setViewportSize({ width: 390, height: 780 });
        await page.waitForTimeout(300);
        await header.getByRole("button", { name: "Toggle menu" }).click();
        await page.waitForTimeout(300);
        const mobileLogOut = await header.getByRole("button", { name: /^\s*Log out\s*$/ }).filter({ visible: true }).count();
        const mobileSignIn = await header.getByRole("link", { name: /^\s*Sign In\s*$/ }).filter({ visible: true }).count();
        add(
          "phone-menu-shows-signed-in-state",
          meta.rules[1],
          mobileLogOut > 0 && mobileSignIn === 0,
          `phone menu: "Log out" ${mobileLogOut}, "Sign In" ${mobileSignIn}`
        );

        if (mobileLogOut > 0) {
          await header.getByRole("button", { name: /^\s*Log out\s*$/ }).filter({ visible: true }).first().click();
          await page.waitForTimeout(1500);
          await page.setViewportSize({ width: 1280, height: 900 });
          await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
          await page.locator("header").first().waitFor();
          await page.waitForTimeout(800);
          const after = await page.locator("header").first().getByRole("link", { name: /^\s*Sign In\s*$/ }).count();
          const session = await page.evaluate(() => Object.keys(localStorage).filter((k) => /auth-token|aduatlas\.mock\.session/.test(k)).length);
          add(
            "header-log-out-signs-out",
            meta.rules[2],
            after > 0 && session === 0,
            `"Sign In" back in the header: ${after > 0}; session keys left: ${session}; logout calls answered in-browser: ${logouts}`
          );
        } else {
          add("header-log-out-signs-out", meta.rules[2], false, "no Log out control in the public header");
        }
      } finally {
        await context.close();
      }
    }

    // ── two portals, at the widths where the row is full ────────────────────
    // No staging persona holds both a builder role and a government membership,
    // so my_government_context() (read-only) is answered here with one pending
    // membership of a made-up entity. The builder only signs in and looks.
    let b = null;
    try {
      b = ctx.creds("builder_verified");
    } catch (e) {
      out.push({ name: "two-portals-header-reaches-gov", rule: meta.rules[5], status: "skip", detail: String(e.message || e) });
    }
    if (b) {
      const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
      const sbOrigin = new URL(ctx.supabaseUrl).origin;
      let reads = 0;
      await context.route(
        (u) => u.origin === sbOrigin && u.pathname === "/rest/v1/rpc/my_government_context",
        (route) => {
          reads += 1;
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
        }
      );
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        const landed = await signIn(page, ctx, "builder_verified");
        const results = [];
        for (const width of [1024, 1100, 1279]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
          const header = page.locator("header").first();
          await header.waitFor();
          await page.waitForTimeout(800);
          const fits = await page.evaluate(() => document.querySelector("header").scrollWidth <= window.innerWidth);
          let way = await header.locator('a[href="/gov"]').filter({ visible: true }).count();
          let via = way > 0 ? "row" : "none";
          if (way === 0) {
            const menuButton = header.locator('[data-header-account="signed-in"] button[aria-haspopup="menu"]').filter({ visible: true });
            if ((await menuButton.count()) > 0) {
              await menuButton.first().click();
              await page.waitForTimeout(300);
              way = await header.locator('[role="menu"] a[href="/gov"]').filter({ visible: true }).count();
              via = way > 0 ? "menu" : "menu without /gov";
            }
          }
          let reached = "";
          if (width === 1100 && way > 0) {
            await header.locator('a[href="/gov"]').filter({ visible: true }).first().click();
            await page.waitForTimeout(1200);
            reached = new URL(page.url()).pathname;
          }
          results.push({ width, fits, way, via, reached });
        }
        const ok = results.every((r) => r.fits && r.way > 0) && results.find((r) => r.width === 1100)?.reached.startsWith("/gov");
        add(
          "two-portals-header-reaches-gov",
          meta.rules[5],
          Boolean(ok),
          `builder signed in to ${landed}; context reads answered in-browser ${reads}; ${results.map((r) => `${r.width}px: fits ${r.fits}, /gov ${r.via}${r.reached ? `, opened ${r.reached}` : ""}`).join("; ")}`
        );
      } finally {
        await context.close();
      }
    }

    // ── refusals, answered in the browser ───────────────────────────────────
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sb = new URL(ctx.supabaseUrl).origin;
    let signups = 0;
    let tokens = 0;
    await context.route(
      (u) => u.origin === sb && u.pathname === "/auth/v1/signup",
      (route) => {
        signups += 1;
        return route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({ code: 429, error_code: "over_email_send_rate_limit", msg: "email rate limit exceeded" }),
        });
      }
    );
    await context.route(
      (u) => u.origin === sb && u.pathname === "/auth/v1/token",
      (route) => {
        tokens += 1;
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" }),
        });
      }
    );
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      // Made-up values: the request never leaves the browser.
      const email = `${ctx.prefix}-signup@example.test`;
      await page.goto(`${ctx.base}/create-account`, { waitUntil: "domcontentloaded" });
      await page.locator('main input[type="email"]').fill(email);
      await page.locator('main input[type="password"]').fill("regress-not-a-secret-1");
      await page.locator('main button[type="submit"]').click();
      await page.waitForTimeout(2000);
      const s = await page.locator("main").innerText();
      const raw = /email rate limit exceeded/i.test(s);
      const plain = /could not create your account|try again/i.test(s);
      add("signup-refusal-in-plain-words", meta.rules[3], signups === 1 && !raw && plain, `sign-up requests answered in-browser: ${signups}; raw string shown: ${raw}; plain message shown: ${plain}`);

      await page.goto(`${ctx.base}/login`, { waitUntil: "domcontentloaded" });
      await page.locator('main input[type="email"]').fill(email);
      await page.locator('main input[type="password"]').fill("regress-not-a-secret-1");
      await page.locator('main button[type="submit"]').click();
      await page.waitForTimeout(2000);
      const l = await page.locator("main").innerText();
      const rawL = /Invalid login credentials/.test(l);
      const plainL = /Email or password is incorrect/.test(l);
      add("login-refusal-in-plain-words", meta.rules[4], tokens === 1 && !rawL && plainL, `token requests answered in-browser: ${tokens}; raw string shown: ${rawL}; plain message shown: ${plainL}`);
    } finally {
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}
