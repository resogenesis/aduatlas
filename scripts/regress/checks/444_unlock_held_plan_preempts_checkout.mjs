// 444 — /unlock does not ask a holder to pay for a plan they already have, and
// still sells the plan above it (RC3 triage R3-20, "shows a held plan as held").
//
// RC3: platinum_purchased on /unlock?tier=roadmap (Golden, which Platinum
// includes) was asked for an email address, then shown "Pay $79", and only the
// server's 409 after the click said there was nothing to pay for. The plan cards
// above now say "You have Platinum" and "Included in your Platinum", so the buy
// panel says the same thing up front and asks for nothing.
//
// This check carries the two rules of 623, which was written for RC3's flow
// (fill #unlock-email, click Pay, read the 409) and cannot reach its Pay button
// on RC4 for a held plan:
//   1. a held or included plan is answered before any email or payment is asked
//      for, with a link to the portal, and nothing is sent to /api/create-checkout;
//   2. a plan above the held one is still sold, and its Pay button sends the
//      signed-in buyer's access token (the upgrade credit and the server's own
//      "already has" refusal both depend on it). The server's 409 itself is
//      covered by 620.
//
// Nothing is written. The email step's lead capture (rpc/capture_lead), its
// "complete your plan" email (/api/send-email) and /api/create-checkout are all
// answered inside the browser, and Stripe is unreachable from the page.
import { planById } from "../../../src/lib/plans.js";

export const meta = {
  name: "444 unlock pre-empts a held plan and still sells the upgrade",
  rules: [
    "R3-20: a signed-in holder asking for a plan at or below the one held is told there is nothing to pay for, with a portal link, before any email or payment is asked for",
    "R3-20: a plan above the held one is still offered, and its Pay button sends the signed-in buyer's access token to /api/create-checkout",
  ],
};

const PERSONA = "platinum_purchased";
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

const DASHES_OR_ARROWS = /[‒-―←-⇿]|->|=>|<-/;

// Sign in through the real /login form. Typed values never reach an error or a
// log: a failed fill is replaced by a fixed sentence (a Playwright error once
// echoed a persona password). A rate-limited attempt waits and retries.
const signIn = async (page, ctx, persona) => {
  const c = ctx.creds(persona);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${ctx.base}/login`, { waitUntil: "domcontentloaded" });
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
  const skipAll = (detail) => meta.rules.map((rule, i) => ({ name: `unlock-held-${i + 1}`, rule, status: "skip", detail }));
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

  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sb = new URL(ctx.supabaseUrl).origin;
    const site = new URL(ctx.base).origin;
    const seen = { lead: 0, email: 0, checkout: [] };
    await context.route((u) => u.origin === sb && u.pathname === "/rest/v1/rpc/capture_lead", (route) => {
      seen.lead += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("00000000-0000-0000-0000-000000000000") });
    });
    await context.route((u) => u.origin === site && u.pathname === "/api/send-email", (route) => {
      seen.email += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });
    // Answered here, never forwarded: the rule is about what the page sends.
    await context.route((u) => u.origin === site && u.pathname === "/api/create-checkout", (route) => {
      if (isQuote(route)) {
        let tier = null;
        try {
          tier = JSON.parse(route.request().postData() || "{}").tier || null;
        } catch {
          tier = null;
        }
        const q = quoteFor(tier);
        return route.fulfill({ status: q ? 200 : 409, contentType: "application/json", body: JSON.stringify(q || { error: "already_has_plan", message: "Your account already has Platinum." }) });
      }
      seen.checkout.push({ auth: /^Bearer \S+/.test(route.request().headers().authorization || "") });
      return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "answered in the browser by regress 444" }) });
    });
    await context.route((u) => /(^|\.)stripe\.com$/i.test(u.hostname), (route) => route.abort("blockedbyclient"));

    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await signIn(page, ctx, PERSONA);

    // 1. The included plan.
    await page.goto(`${ctx.base}/unlock?tier=roadmap`, { waitUntil: "domcontentloaded" });
    await page.locator("#buy h2").first().waitFor();
    await page.waitForTimeout(1200);
    const covered = page.locator("#buy [data-buy-covered]");
    const coveredText = (await covered.count()) ? (await covered.first().innerText()).replace(/\s+/g, " ").trim() : "";
    const portalLink = (await covered.locator("a[href='/dashboard']").count()) === 1;
    const emailFields = await page.locator("#unlock-email").count();
    const payButtons = await page.locator("#buy button", { hasText: /^\s*Pay \$/ }).count();
    const checkoutBefore = seen.checkout.length;
    add(
      "unlock-held-preempts",
      meta.rules[0],
      coveredText.includes(`${lowerName} is included in your ${heldName}`) &&
        /nothing to pay for/.test(coveredText) &&
        portalLink &&
        emailFields === 0 &&
        payButtons === 0 &&
        checkoutBefore === 0 &&
        !DASHES_OR_ARROWS.test(coveredText),
      `panel: "${(coveredText || "none").slice(0, 200)}"; portal link ${portalLink ? "present" : "missing"}; email fields ${emailFields}; Pay buttons ${payButtons}; create-checkout requests ${checkoutBefore}`
    );

    // 2. The plan above it.
    await page.goto(`${ctx.base}/unlock?tier=concierge`, { waitUntil: "domcontentloaded" });
    await page.locator("#buy h2").first().waitFor();
    await page.waitForTimeout(800);
    let detail;
    let ok = false;
    if ((await page.locator("#unlock-email").count()) === 0) {
      detail = "no email step for the plan above the held one";
    } else {
      // A made-up address, never the persona's own.
      await page.locator("#unlock-email").fill(`${ctx.prefix}@example.test`);
      await page.locator("#buy form button[type=submit]", { hasText: "Continue" }).click();
      const pay = page.locator("#buy button", { hasText: /^\s*Pay \$/ }).first();
      await pay.waitFor({ state: "visible" });
      const payText = (await pay.innerText()).replace(/\s+/g, " ").trim();
      await Promise.all([page.waitForRequest((req) => new URL(req.url()).pathname === "/api/create-checkout", { timeout: 30000 }), pay.click()]);
      await page.waitForTimeout(500);
      const calls = seen.checkout.slice(checkoutBefore);
      ok = calls.length > 0 && calls.every((c) => c.auth);
      detail = `button "${payText}"; ${calls.length} create-checkout request(s), answered in-browser; Authorization ${calls.length && calls.every((c) => c.auth) ? "present" : "ABSENT"}; lead capture answered in-browser ${seen.lead}x, email ${seen.email}x`;
    }
    add("unlock-upgrade-sends-token", meta.rules[1], ok, detail);
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
