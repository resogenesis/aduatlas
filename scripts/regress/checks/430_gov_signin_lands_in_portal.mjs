// 430 — a government user reaches the government portal after signing in, and
// the app shows a way into it (contract C3; RC3 triage R3-08).
//
// RC3: every sign-in by a government user landed on /unlock ("Plans and
// pricing"), the $79 homeowner purchase page, and nothing outside the /gov pages
// linked to /gov. routeForUser() branched only on admin, builder and paid, and a
// government user is an ordinary homeowner-role account.
//
// Personas (read only): education_partner (verified), gov_claimed (pending claim)
// and gov_withdrawn (verified member of an entity whose verification was
// withdrawn). The contract is "any membership in my_government_context", so all
// three must land in /gov. homeowner_unpaid holds none and must NOT be sent there.
//
// Nothing is written: each persona signs in through the real /login page and
// looks at a public page's header. The fourth rule answers
// my_government_context() inside the browser (a failure, then an empty list)
// after a real sign-in; it is a read-only function either way.
export const meta = {
  name: "430 government sign-in lands in the portal",
  rules: [
    "C3: a signed-in government user (any membership) is routed to /gov after sign-in",
    "C3: the public header shows a signed-in government user the way into /gov",
    "a homeowner with no government membership is not sent to /gov",
    "C3 / 2b: a failed read of the government context keeps a known government user pointed at /gov; only an answer from the server clears it",
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

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    for (const persona of ["education_partner", "gov_claimed", "gov_withdrawn"]) {
      try {
        ctx.creds(persona);
      } catch (e) {
        out.push({ name: `${persona}-lands-in-gov`, rule: meta.rules[0], status: "skip", detail: String(e.message || e) });
        continue;
      }
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        const landed = await signIn(page, ctx, persona);
        add(`${persona}-lands-in-gov`, meta.rules[0], landed.startsWith("/gov"), `after /login the page is ${landed}`);

        // A public page: the header must offer the portal, not "Sign In".
        await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
        await page.locator("header").first().waitFor();
        await page.waitForTimeout(800);
        const header = page.locator("header").first();
        const govLinks = await header.locator('a[href="/gov"]').count();
        const signInLinks = await header.getByRole("link", { name: /^\s*Sign In\s*$/ }).count();
        add(
          `${persona}-header-offers-gov`,
          meta.rules[1],
          govLinks > 0 && signInLinks === 0,
          `header links to /gov: ${govLinks}; "Sign In" links: ${signInLinks}`
        );
      } finally {
        await context.close();
      }
    }

    let c = null;
    try {
      c = ctx.creds("homeowner_unpaid");
    } catch (e) {
      out.push({ name: "homeowner-not-sent-to-gov", rule: meta.rules[2], status: "skip", detail: String(e.message || e) });
    }
    if (c) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        const landed = await signIn(page, ctx, "homeowner_unpaid");
        add("homeowner-not-sent-to-gov", meta.rules[2], !landed.startsWith("/gov"), `after /login the page is ${landed}`);
      } finally {
        await context.close();
      }
    }

    // Unknown means unknown (2b). Every page load re-reads the session, and so
    // does every token refresh. One failed read used to be written down as "not
    // a government user", and the header forgot /gov until a later read worked.
    let g = null;
    try {
      g = ctx.creds("gov_claimed");
    } catch (e) {
      out.push({ name: "failed-gov-read-keeps-gov", rule: meta.rules[3], status: "skip", detail: String(e.message || e) });
    }
    if (g) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const sbOrigin = new URL(ctx.supabaseUrl).origin;
      let mode = "real";
      const answered = { fail: 0, empty: 0 };
      await context.route(
        (u) => u.origin === sbOrigin && u.pathname === "/rest/v1/rpc/my_government_context",
        (route) => {
          if (mode === "fail") {
            answered.fail += 1;
            return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "regress: the read failed" }) });
          }
          if (mode === "empty") {
            answered.empty += 1;
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ government_user: null, memberships: [] }) });
          }
          return route.continue();
        }
      );
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const govLinksOnRules = async () => {
        await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
        await page.locator("header").first().waitFor();
        await page.waitForTimeout(1500);
        return page.locator("header").first().locator('a[href="/gov"]').count();
      };
      try {
        const landed = await signIn(page, ctx, "gov_claimed");
        mode = "fail";
        const afterFailure = await govLinksOnRules();
        mode = "empty";
        const afterEmpty = await govLinksOnRules();
        add(
          "failed-gov-read-keeps-gov",
          meta.rules[3],
          landed.startsWith("/gov") && answered.fail > 0 && afterFailure > 0 && answered.empty > 0 && afterEmpty === 0,
          `signed in to ${landed}; with the read failing (${answered.fail} reads answered 500) the header links to /gov ${afterFailure} times; with an empty answer (${answered.empty} reads) ${afterEmpty} times`
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
