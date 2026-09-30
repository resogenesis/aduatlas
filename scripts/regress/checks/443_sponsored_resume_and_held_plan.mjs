// 443 — a sponsored resident comes back to the partner entry after signing in,
// and the pricing page shows a held plan as held (RC3 triage R3-20).
//
// RC3: a resident who opened the city's sponsored link while signed out and chose
// "Sign in" was sent by routeForUser() to /unlock, which offered "Choose Golden"
// at $79 and never mentioned the sponsorship; the grant only happened if they
// found their way back to /partner. And a signed-in resident holding sponsored
// Golden still saw "Choose Golden" at $79 on /unlock.
//
// Nothing is written. The partner link is a made-up token and every
// /api/partner-redeem call is answered inside the browser, so no redemption,
// visit count or attempt reaches the server. The personas only sign in and look.
export const meta = {
  name: "443 sponsored resume after sign-in and held plan on pricing",
  rules: [
    "R3-20: 'Sign in' on a sponsored entry brings the resident back to that entry, not to $79 pricing",
    "R3-20: a remembered sponsored entry brings the resident back after an ordinary sign-in",
    "R3-20: a signed-in resident with a remembered entry and no plan is pointed back to it from pricing and the header",
    "R3-20: the pricing page shows a held plan as held, with no 'Choose' for it",
    "R3-20 / C3: a government user who taps 'Sign in' on a sponsored entry goes to /gov, and the entry is not redeemed for them",
    "R3-20 / C3: a sponsored entry in `next` spelled with percent-encoding (/%70artner/...) does not carry a government user into it",
    "R3-20: opened directly while signed in, the sponsored entry does not redeem for a government account; it says the access is for residents and offers to log out and continue as one",
  ],
};

// Sign in through the real /login form. Typed values never reach an error or a
// log: a failed fill is replaced by a fixed sentence (a Playwright error once
// echoed a persona password). A rate-limited attempt waits and retries.
// `path` null means the form is already open.
const signIn = async (page, ctx, persona, path = "/login") => {
  const c = ctx.creds(persona);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (path !== null || attempt > 0) await page.goto(`${ctx.base}${path || "/login"}`, { waitUntil: "domcontentloaded" });
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

// Every partner-redeem call answered here. GET (the link's context) says nothing
// is known about the link; POST (a redemption) answers `redeem`.
const answerPartnerRedeem = async (context, redeem) => {
  const seen = { get: 0, post: 0 };
  await context.route(
    (u) => u.pathname === "/api/partner-redeem",
    (route) => {
      if (route.request().method() === "GET") {
        seen.get += 1;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ context: null }) });
      }
      seen.post += 1;
      return route.fulfill({ status: redeem.status, contentType: "application/json", body: JSON.stringify(redeem.body) });
    }
  );
  return seen;
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const has = (p) => {
    try {
      ctx.creds(p);
      return true;
    } catch {
      return false;
    }
  };
  const token = `${ctx.prefix}-not-a-real-link`;
  const browser = await ctx.launch();
  try {
    if (!has("homeowner_unpaid")) {
      for (const i of [0, 1, 2]) out.push({ name: `resume-${i}`, rule: meta.rules[i], status: "skip", detail: "homeowner_unpaid not in REGRESS_PERSONAS" });
    } else {
      // A. "Sign in" on the entry itself. The redemption is answered 401 so the
      // entry stays remembered for C below.
      {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const seen = await answerPartnerRedeem(context, {
          status: 401,
          body: { message: "Create your account or sign in first, then open this link again." },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        try {
          await page.goto(`${ctx.base}/partner/${token}`, { waitUntil: "domcontentloaded" });
          const signInLink = page.locator("main").getByRole("link", { name: /^\s*Sign in\s*$/ });
          await signInLink.first().waitFor();
          await signInLink.first().click();
          await page.waitForURL((u) => u.pathname.startsWith("/login"));
          const landed = await signIn(page, ctx, "homeowner_unpaid", null);
          add(
            "sign-in-from-entry-returns-to-it",
            meta.rules[0],
            landed.startsWith("/partner"),
            `after "Sign in" on the entry the page is ${landed}; redemptions answered in-browser: ${seen.post}`
          );

          // C. Still no plan, entry still remembered: pricing and the header point back.
          await page.goto(`${ctx.base}/unlock`, { waitUntil: "domcontentloaded" });
          await page.locator("main h1").first().waitFor();
          await page.waitForTimeout(800);
          const waiting = await page.locator("[data-partner-waiting]").count();
          const headerLink = await page.locator("header").first().locator('a[href="/partner"]').count();
          add(
            "pricing-and-header-point-back-to-entry",
            meta.rules[2],
            waiting > 0 && headerLink > 0,
            `pricing names the remembered entry: ${waiting > 0}; header links to /partner: ${headerLink > 0}`
          );
        } finally {
          await context.close();
        }
      }

      // B. An ordinary sign-in (no `next`) with a remembered entry.
      {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const seen = await answerPartnerRedeem(context, {
          status: 200,
          body: { granted: false, message: "This access link or code is not available. Nothing has been added to your account, and no plan has been started." },
        });
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        try {
          await page.goto(`${ctx.base}/partner/${token}`, { waitUntil: "domcontentloaded" });
          await page.locator("main h1").first().waitFor();
          await page.waitForTimeout(500);
          const landed = await signIn(page, ctx, "homeowner_unpaid", "/login");
          add(
            "remembered-entry-returns-after-sign-in",
            meta.rules[1],
            landed.startsWith("/partner"),
            `after an ordinary sign-in the page is ${landed}; redemptions answered in-browser: ${seen.post}`
          );
        } finally {
          await context.close();
        }
      }
    }

    // D. A held plan on the pricing page.
    if (!has("golden_sponsored")) {
      out.push({ name: "pricing-shows-held-plan", rule: meta.rules[3], status: "skip", detail: "golden_sponsored not in REGRESS_PERSONAS" });
    } else {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await signIn(page, ctx, "golden_sponsored");
        await page.goto(`${ctx.base}/unlock`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        await page.waitForTimeout(1000);
        const main = page.locator("main");
        const chooseGolden = await main.getByRole("button", { name: /Choose Golden/ }).count();
        const heldGolden = await main.getByText(/You have Golden/).count();
        const choosePlatinum = await main.getByRole("button", { name: /Choose Platinum|Selected, continue below/ }).count();
        add(
          "pricing-shows-held-plan",
          meta.rules[3],
          chooseGolden === 0 && heldGolden > 0 && choosePlatinum > 0,
          `"Choose Golden" buttons: ${chooseGolden}; "You have Golden": ${heldGolden}; an upgrade is still offered: ${choosePlatinum > 0}`
        );
      } finally {
        await context.close();
      }
    }

    // E. Sponsored access is for residents. A government user (a staff or builder
    // account behaves the same way in landingAfterSignIn) who signs in from the
    // entry goes to their own portal, and nothing is posted for a redemption.
    if (!has("gov_claimed")) {
      out.push({ name: "gov-sign-in-from-entry-goes-to-gov", rule: meta.rules[4], status: "skip", detail: "gov_claimed not in REGRESS_PERSONAS" });
    } else {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const seen = await answerPartnerRedeem(context, {
        status: 200,
        body: { granted: false, message: "This access link or code is not available. Nothing has been added to your account, and no plan has been started." },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await page.goto(`${ctx.base}/partner/${token}`, { waitUntil: "domcontentloaded" });
        const signInLink = page.locator("main").getByRole("link", { name: /^\s*Sign in\s*$/ });
        await signInLink.first().waitFor();
        await signInLink.first().click();
        await page.waitForURL((u) => u.pathname.startsWith("/login"));
        const landed = await signIn(page, ctx, "gov_claimed", null);
        await page.waitForTimeout(1500);
        const settled = new URL(page.url()).pathname;
        add(
          "gov-sign-in-from-entry-goes-to-gov",
          meta.rules[4],
          landed.startsWith("/gov") && settled.startsWith("/gov") && seen.post === 0,
          `after "Sign in" on the entry the page is ${landed} (then ${settled}); redemptions attempted: ${seen.post}`
        );
      } finally {
        await context.close();
      }
    }

    // F and G. The same government user, two other ways into the entry. F: a
    // `next` that the router reads as /partner/<token> but whose text is
    // "/%70artner/<token>" (React Router decodes each segment before it
    // matches). G: the entry opened directly while signed in. Every
    // partner-redeem call is answered here, and so is Log out: supabase-js signs
    // out globally by default, which would end this shared persona's sessions
    // elsewhere; the page still clears its own session exactly as it would.
    if (!has("gov_claimed")) {
      for (const i of [5, 6]) out.push({ name: `gov-entry-${i}`, rule: meta.rules[i], status: "skip", detail: "gov_claimed not in REGRESS_PERSONAS" });
    } else {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const seen = await answerPartnerRedeem(context, {
        status: 200,
        body: { granted: false, message: "This access link or code is not available. Nothing has been added to your account, and no plan has been started." },
      });
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
        const encoded = `/%70artner/${token}`;
        const landed = await signIn(page, ctx, "gov_claimed", `/login?next=${encodeURIComponent(encoded)}`);
        await page.waitForTimeout(1500);
        const settled = new URL(page.url()).pathname;
        add(
          "encoded-entry-next-does-not-carry-gov-user",
          meta.rules[5],
          landed.startsWith("/gov") && settled.startsWith("/gov") && seen.post === 0,
          `signed in from /login?next=${encoded}: the page is ${landed} (then ${settled}); redemptions attempted: ${seen.post}`
        );

        const before = seen.post;
        await page.goto(`${ctx.base}/partner/${token}`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor();
        await page.waitForTimeout(2000);
        const posted = seen.post - before;
        const card = page.locator('main [data-partner-entry="portal-account"]');
        const cardShown = (await card.count()) > 0;
        const cardText = cardShown ? await card.innerText() : "";
        const saysResidents = /Sponsored access is for residents/.test(cardText) && /Nothing has been added/.test(cardText);
        const codeForm = await page.locator("main form input").count();
        let afterLogout = "not tried";
        let residentWayIn = false;
        const leave = card.getByRole("button", { name: /Log out and continue as a resident/ });
        if (cardShown && (await leave.count()) > 0) {
          await leave.click();
          await page.waitForTimeout(1500);
          const path = new URL(page.url()).pathname;
          const headerState = await page.locator('header [data-header-account]').first().getAttribute("data-header-account");
          const signInHref = await page.locator("main").getByRole("link", { name: /^\s*Sign in\s*$/ }).first().getAttribute("href").catch(() => null);
          residentWayIn =
            path === `/partner/${token}` &&
            headerState === "signed-out" &&
            Boolean(signInHref) &&
            new URLSearchParams(signInHref.split("?")[1] || "").get("next") === `/partner/${token}`;
          afterLogout = `page ${path}; header ${headerState}; Sign in link carries next: ${signInHref ? new URLSearchParams(signInHref.split("?")[1] || "").get("next") : "none"}`;
        }
        add(
          "entry-does-not-redeem-for-gov-account",
          meta.rules[6],
          posted === 0 && seen.post === before && saysResidents && codeForm === 0 && residentWayIn,
          `opened directly while signed in: redemptions attempted ${posted}; residents card ${cardShown} (${saysResidents ? "says it" : "wording missing"}); code fields ${codeForm}; after "Log out and continue as a resident": ${afterLogout}; redemptions after that ${seen.post - before - posted}; logout calls answered in-browser ${logouts}`
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
