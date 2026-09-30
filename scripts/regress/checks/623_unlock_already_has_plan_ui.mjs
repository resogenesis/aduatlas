// WP2 (b), on the page: a signed-in homeowner who already holds a plan is told
// there is nothing to pay for, never "Payment could not be started", and the
// pay button identifies the signed-in buyer to the server.
//
// RC2's /unlock posted to /api/create-checkout WITHOUT the buyer's access token,
// so the server could not tell a signed-in homeowner from a stranger: it could
// neither apply the upgrade credit the page previews nor say the account already
// holds the plan, and any failure was shown as a generic retry line. RC3 sends
// the token and shows the server's 409 message with a link to the portal.
//
// RC4 (R3-20) answers a held or included plan on the page itself, before any
// email or payment is asked for ([data-buy-covered] in src/pages/Unlock.jsx).
// The RC3 version of this check typed into #unlock-email on
// /unlock?tier=roadmap, a field RC4 never shows to a Platinum holder, so it
// crashed there. Rewritten for the new flow, keeping every rule it guarded that
// is still true:
//   1. the included plan is answered up front, with a portal link, no email
//      field and no request to /api/create-checkout (new in RC4; RED on RC3,
//      which asks for an email and shows "Pay $79");
//   2. the pay button sends the signed-in buyer's access token. RC3 checked it
//      on Golden, which RC4 no longer sells to a Platinum holder, so it moves
//      to Concierge, the plan above the held one. Passes on RC3;
//   3. the server's refusal is still shown as its own plain message with a
//      portal link, not a generic failure. The page reaches the server's 409
//      whenever this browser does not yet know the plan is held (its session
//      mirror is a hint, the server is the boundary: a purchase made on another
//      device, or after this tab last read the account). That is simulated by
//      answering THIS BROWSER's read of its own users row with the row as it
//      stood before the purchase; the request to /api/create-checkout is real,
//      so the 409 is the server's own. This was the RC3 check's first rule and
//      passes on RC3.
// The server's 409 itself, for every holder, is 620's and is unchanged.
//
// platinum_purchased signs in through the real /login page. No side effects:
// the email step's lead capture (rpc/capture_lead) and its "complete your
// plan" email (/api/send-email) are answered inside the browser, and so is
// /api/create-checkout for rules 1 and 2. Only rule 3 reaches the server, whose
// refusal comes before Stripe configuration is consulted (see 620), and only
// behind the same Stripe-mode gate as 620. Navigation to Stripe is aborted.
// Typed values never reach an error or a log.
import { planById } from "../../../src/lib/plans.js";
import { probeWebhook, stripeMode, targetEnv } from "./621_stripe_webhook_paid_only.mjs";

export const meta = {
  name: "623 unlock page shows the already-has-plan message",
  rules: [
    "R3-20: a signed-in holder asking for a plan the held one includes is told there is nothing to pay for, with a portal link, before any email or payment is asked for, and nothing is sent to /api/create-checkout",
    "the pay button sends the signed-in buyer's access token to /api/create-checkout",
    "a signed-in homeowner whose browser does not yet know the plan is held, and asks for it, sees the server's plain message and a link to the portal, not a generic failure",
  ],
};
const [R_COVERED, R_TOKEN, R_SERVER] = meta.rules;

const PERSONA = "platinum_purchased";
const DASHES_OR_ARROWS = /[‒-―←-⇿]|->|=>|<-/;
const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Sign in through the real /login form. A failed fill is replaced by a fixed
// sentence (a Playwright error repeats the value it was typing). A rate-limited
// attempt waits and retries.
const signIn = async (page, ctx, creds) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${ctx.base}/login`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator('main input[type="email"]').fill(creds.email, { timeout: 30000 });
      await page.locator('main input[type="password"]').fill(creds.password, { timeout: 30000 });
    } catch {
      throw new Error(`the sign-in form could not be filled for ${PERSONA} (details withheld)`);
    }
    await page.locator('main button[type="submit"]').click();
    const left = page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }).then(() => "in", () => "stuck");
    const limited = page.locator("main").getByText(/rate limit|too many/i).first().waitFor({ timeout: 45000 }).then(() => "limited", () => "stuck");
    const outcome = await Promise.race([left, limited]);
    if (outcome === "in") return;
    if (outcome === "limited") {
      await page.waitForTimeout(65000);
      continue;
    }
    throw new Error(`sign-in for ${PERSONA} did not leave /login`);
  }
  throw new Error(`sign-in for ${PERSONA} was still rate-limited after four tries`);
};

// The email step, then the Pay button. A made-up address, never the persona's.
const payFor = async (page, ctx, tag) => {
  await page.locator("#unlock-email").fill(`${ctx.prefix}-623-${tag}@example.test`);
  await page.locator("#buy form button[type=submit]", { hasText: "Continue" }).click();
  const pay = page.locator("#buy button", { hasText: /^\s*Pay \$/ }).first();
  await pay.waitFor({ state: "visible" });
  return pay;
};

// RC4a: the page asks /api/create-checkout for its QUOTE ({ quoteOnly: true })
// before it prints a price. That read is answered with the quote the server would
// give this Platinum holder, and is not counted as a checkout.
const isQuote = (route) => {
  try {
    return JSON.parse(route.request().postData() || "{}").quoteOnly === true;
  } catch {
    return false;
  }
};
const quoteFor = (tier) =>
  tier === "concierge"
    ? { ok: true, tier, listCents: 50000, creditCents: 27900, dueCents: 22100, creditFrom: "report" }
    : null;

export default async function (ctx) {
  const skipAll = (detail, status = "skip") => meta.rules.map((rule, i) => ({ name: `unlock-already-has-${i + 1}`, rule, status, detail }));
  if (!ctx.serviceKey) return skipAll("no service role key in REGRESS_ENV_FILE, so the persona's tier cannot be confirmed");
  let creds;
  try {
    creds = ctx.creds(PERSONA);
  } catch (e) {
    return skipAll(String(e.message || e));
  }
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?select=paid_tier,paid_at,refunded_at&email=eq.${encodeURIComponent(creds.email)}`, {
    headers: { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` },
  });
  const row = Array.isArray(r.body) ? r.body[0] : null;
  const heldTier = row?.paid_at && !row.refunded_at ? row.paid_tier : null;
  if (heldTier !== "report") return skipAll(`${PERSONA} holds ${heldTier ?? "nothing live"}, not a live Platinum`);
  const heldName = planById("report").name;
  const lowerName = planById("roadmap").name;

  // Rule 3 is the only request that reaches the server's checkout, so the
  // Stripe-mode gate of 620 decides it alone.
  let serverGate = null;
  const mode = stripeMode(targetEnv());
  if (mode === "live") serverGate = { status: "fail", detail: "REGRESS_ENV_FILE holds a LIVE Stripe key for a non-production target; nothing was sent to /api/create-checkout" };
  else if (mode !== "test") {
    const probe = await probeWebhook(ctx);
    if (probe !== "unconfigured") serverGate = { status: "skip", detail: `Stripe looks configured on ${ctx.base} (webhook answers ${probe}) but REGRESS_ENV_FILE does not prove TEST mode, so nothing was sent to /api/create-checkout` };
  }

  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sb = new URL(ctx.supabaseUrl).origin;
    const site = new URL(ctx.base).origin;
    await context.route((u) => u.origin === sb && u.pathname === "/rest/v1/rpc/capture_lead", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("00000000-0000-0000-0000-000000000000") })
    );
    await context.route((u) => u.origin === site && u.pathname === "/api/send-email", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
    );
    await context.route((u) => /(^|\.)stripe\.com$/i.test(u.hostname), (route) => route.abort("blockedbyclient"));
    // Every request the page makes to /api/create-checkout is recorded here.
    // Rules 1 and 2 answer it in the browser; rule 3 lets it reach the server.
    const calls = [];
    const quotes = [];
    let toServer = false;
    await context.route((u) => u.origin === site && u.pathname === "/api/create-checkout", (route) => {
      let tier = null;
      try {
        tier = JSON.parse(route.request().postData() || "{}").tier || null;
      } catch {
        tier = null;
      }
      if (isQuote(route)) {
        quotes.push({ tier, auth: /^Bearer \S+/.test(route.request().headers().authorization || ""), server: toServer });
        if (toServer) return route.fallback();
        const q = quoteFor(tier);
        return route.fulfill({ status: q ? 200 : 409, contentType: "application/json", body: JSON.stringify(q || { error: "already_has_plan", message: "answered in the browser by regress 623" }) });
      }
      calls.push({ tier, auth: /^Bearer \S+/.test(route.request().headers().authorization || ""), server: toServer });
      if (toServer) return route.fallback();
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "answered in the browser by regress 623" }) });
    });

    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await signIn(page, ctx, creds);

    // 1. Golden, which the held Platinum includes, with the browser's own view
    //    of the account (the server's answer at sign-in).
    await page.goto(`${ctx.base}/unlock?tier=roadmap`, { waitUntil: "domcontentloaded" });
    await page.locator("#buy h2").first().waitFor();
    await page.waitForTimeout(1200);
    const covered = page.locator("#buy [data-buy-covered]");
    const coveredText = (await covered.count()) ? oneLine(await covered.first().innerText()) : "";
    const coveredLinks = (await covered.count()) ? await covered.first().locator("a[href='/dashboard']").count() : 0;
    const emailFields = await page.locator("#unlock-email").count();
    const payButtons = await page.locator("#buy button", { hasText: /^\s*Pay \$/ }).count();
    const alerts = oneLine(await page.locator("#buy [role=alert]").allInnerTexts().then((t) => t.join(" ")).catch(() => ""));
    add(
      "unlock-covered-plan-answered-up-front",
      R_COVERED,
      coveredText.includes(`${lowerName} is included in your ${heldName}`) &&
        /nothing to pay for/.test(coveredText) &&
        coveredLinks === 1 &&
        emailFields === 0 &&
        payButtons === 0 &&
        calls.length === 0 &&
        !/could not be started/i.test(coveredText + alerts) &&
        !DASHES_OR_ARROWS.test(coveredText),
      `panel: "${(coveredText || "none").slice(0, 200)}"; portal links ${coveredLinks}; email fields ${emailFields}; Pay buttons ${payButtons}; create-checkout requests ${calls.length}`
    );

    // 2. Concierge, the plan above the held one, is still sold, and its Pay
    //    button carries the buyer's token. Answered in the browser.
    await page.goto(`${ctx.base}/unlock?tier=concierge`, { waitUntil: "domcontentloaded" });
    await page.locator("#buy h2").first().waitFor();
    await page.waitForTimeout(800);
    if ((await page.locator("#unlock-email").count()) === 0) {
      add("unlock-sends-access-token", R_TOKEN, false, "no email step for Concierge, the plan above the held one");
    } else {
      const before = calls.length;
      const pay = await payFor(page, ctx, "concierge");
      const payText = oneLine(await pay.innerText());
      await Promise.all([page.waitForRequest((req) => new URL(req.url()).pathname === "/api/create-checkout", { timeout: 30000 }), pay.click()]);
      await page.waitForTimeout(500);
      const mine = calls.slice(before);
      const ok = mine.length > 0 && mine.every((c) => c.auth && c.tier === "concierge");
      add(
        "unlock-sends-access-token",
        R_TOKEN,
        ok,
        `button "${payText}"; ${mine.length} create-checkout request(s) for ${[...new Set(mine.map((c) => c.tier))].join(", ") || "nothing"}, answered in-browser; Authorization ${mine.length && mine.every((c) => c.auth) ? "present" : "ABSENT"}`
      );
    }

    // 3. The same Golden request from a browser whose view of the account is
    //    behind the server's. Only this browser's read of its own users row is
    //    answered with the row as it stood before the purchase (no paid_at, no
    //    tier); the account itself is untouched and create-checkout is real.
    if (serverGate) {
      out.push({ name: "unlock-shows-server-refusal", rule: R_SERVER, status: serverGate.status, detail: serverGate.detail });
    } else {
      let staleReads = 0;
      await context.route(
        (u) => u.origin === sb && u.pathname === "/rest/v1/users" && u.searchParams.has("auth_user_id"),
        async (route) => {
          if (route.request().method() !== "GET") return route.fallback();
          const res = await route.fetch();
          let body;
          try {
            body = await res.json();
          } catch {
            return route.fulfill({ response: res });
          }
          const asBefore = (x) => (x && typeof x === "object" ? { ...x, paid_at: null, paid_tier: null, refunded_at: null } : x);
          staleReads += 1;
          return route.fulfill({ response: res, body: JSON.stringify(Array.isArray(body) ? body.map(asBefore) : asBefore(body)) });
        }
      );
      toServer = true;
      const before = calls.length;
      await page.goto(`${ctx.base}/unlock?tier=roadmap`, { waitUntil: "domcontentloaded" });
      await page.locator("#buy h2").first().waitFor();
      await page.waitForTimeout(1200);
      // RC4a: the page reads its quote from the server first, so the server's
      // "already has" answer now arrives BEFORE any email or payment is asked for
      // and is shown in the covered panel. That is the refusal, earlier.
      const quotedPanel = page.locator("#buy [data-buy-covered]");
      const serverQuotes = quotes.filter((q) => q.server);
      if ((await page.locator("#unlock-email").count()) === 0 && (await quotedPanel.count()) && serverQuotes.length) {
        const panelText = oneLine(await quotedPanel.first().innerText());
        const linkOk = (await quotedPanel.first().locator("a[href='/dashboard']").count()) === 1;
        add(
          "unlock-shows-server-refusal",
          R_SERVER,
          panelText.includes(`already has ${heldName}`) && linkOk && serverQuotes.every((q) => q.auth) && !/could not be started/i.test(panelText) && !DASHES_OR_ARROWS.test(panelText),
          `browser's own users read answered as before the purchase ${staleReads}x; the server's quote answered first (${serverQuotes.length} quote request(s), Authorization ${serverQuotes.every((q) => q.auth) ? "present" : "ABSENT"}); shown before any email step: "${panelText.slice(0, 220)}"; portal link ${linkOk ? "present" : "missing"}`
        );
      } else if ((await page.locator("#unlock-email").count()) === 0) {
        const shown = oneLine(await page.locator("#buy").innerText().catch(() => ""));
        add("unlock-shows-server-refusal", R_SERVER, false, `the browser's own read was answered as before the purchase (${staleReads} read(s)), yet no email step appeared; #buy shows "${shown.slice(0, 200)}"`);
      } else {
        const pay = await payFor(page, ctx, "roadmap");
        const [resp] = await Promise.all([
          page.waitForResponse((res) => new URL(res.url()).pathname === "/api/create-checkout", { timeout: 30000 }),
          pay.click(),
        ]);
        const status = resp.status();
        const info = page.locator("[data-testid=checkout-already-has-plan]");
        const alert = page.locator("#buy [role=alert]");
        await Promise.race([info.waitFor({ state: "visible" }).catch(() => {}), alert.first().waitFor({ state: "visible" }).catch(() => {})]);
        const infoText = (await info.count()) ? oneLine(await info.innerText()) : "";
        const alertText = (await alert.count()) ? oneLine(await alert.first().innerText()) : "";
        const linkOk = (await info.locator("a[href='/dashboard']").count()) === 1;
        const mine = calls.slice(before);
        add(
          "unlock-shows-server-refusal",
          R_SERVER,
          status === 409 &&
            mine.length > 0 &&
            mine.every((c) => c.server && c.auth) &&
            infoText.includes(`already has ${heldName}`) &&
            linkOk &&
            !/could not be started/i.test(infoText + alertText) &&
            !DASHES_OR_ARROWS.test(infoText),
          `browser's own users read answered as before the purchase ${staleReads}x; create-checkout reached the server, HTTP ${status}, Authorization ${mine.length && mine.every((c) => c.auth) ? "present" : "ABSENT"}; shown: "${(infoText || alertText || "nothing").slice(0, 220)}"; portal link ${linkOk ? "present" : "missing"}`
        );
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
