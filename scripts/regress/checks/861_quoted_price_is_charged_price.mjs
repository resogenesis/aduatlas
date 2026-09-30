// T4-03 (RC4 rehearsal, promoted to launch-blocking): a sponsored Golden
// resident was shown "your $79 applies as a credit, the upgrade is $200" on the
// Platinum paywall, copy hard coded in PaidGate, while checkout charged $279.
// A customer must never be shown one transaction price and charged another.
//
// The fix: api/create-checkout.js computes ONE quote (computeQuote) for the
// charge, and answers it without charging when asked ({ quoteOnly: true }).
// Every page that prints an upgrade price prints that quote.
//
// The charge itself is BLOCKED BY CONFIGURATION on staging (no Stripe test
// mode), so rules 1 to 3 hold the quote to the price ladder and the credit rule
// (decision 2r: only money paid earns a credit), and rules 4 to 7 hold every
// page to the quote. The charge and the quote are one function by construction.
//   1. sponsored Golden -> Platinum: $279 due, no credit
//   2. purchased Golden -> Platinum: $200 due, $79 credit from Golden
//   3. anonymous -> Platinum: $279 due (no token, no credit)
//   4. the Platinum paywall for the sponsored resident says $279 and never $200
//   5. the Platinum paywall for the Golden buyer says $200
//   6. /unlock?tier=report for the sponsored resident shows $279 one time, no credit line
//   7. the dashboard's upgrade step for the sponsored resident says $279, never $200
//   8. THE PRICE TIE: a real checkout request carries the amount the buyer was
//      shown (expectedDueCents). When it is not the quote, checkout answers 409
//      { error: "price_changed", dueCents: <the quote> } before any Stripe call
//      (so staging, which has no Stripe configuration, answers it too). When it
//      is the quote, the answer is anything but price_changed (on staging the
//      request then fails later, for the missing Stripe configuration).
//   9. /unlock for a signed-in Golden buyer whose quote ($200) differs from the
//      list price never offers "Pay $279" while the quote is on its way. The
//      price reads are held back in the browser (the quote request, and on
//      builds before the quote the my_qualifying_paid_plan read it replaced), so
//      the panel is read in its pre-quote state every time rather than when a
//      race happens to be lost; after the reads are released it must offer
//      "Pay $200". The email step is answered in the browser (capture_lead and
//      /api/send-email never leave it) and the address typed is a regress one.
export const meta = {
  name: "861 the price shown for a plan is the price checkout charges",
  rules: [
    "a sponsored Golden resident is quoted $279 for Platinum with no credit",
    "a Golden buyer is quoted $200 for Platinum with the $79 Golden credit",
    "an anonymous visitor is quoted the $279 list price",
    "the Platinum paywall shows a sponsored Golden resident $279 and never $200",
    "the Platinum paywall shows a Golden buyer $200",
    "the pricing page's Platinum panel shows a sponsored Golden resident $279 one time with no credit line",
    "the dashboard's upgrade step shows a sponsored Golden resident $279 and never $200",
    "a checkout whose expected amount is not the quote is refused with 409 price_changed carrying the quote, and one whose expected amount is the quote is not",
    "the pricing page never offers a signed-in buyer 'Pay $279' before a differing quote ($200) arrives, and offers 'Pay $200' once it has",
  ],
};

const DESKTOP = { viewport: { width: 1280, height: 900 } };

// Sign in through the real /login form. Typed values never reach an error or a
// log (443's pattern): a failed fill is replaced by a fixed sentence.
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
    if (outcome === "in") return;
    if (outcome === "limited") {
      await page.waitForTimeout(65000);
      continue;
    }
    throw new Error(`sign-in for ${persona} did not leave /login`);
  }
  throw new Error(`sign-in for ${persona} was still rate-limited after four tries`);
};

const quote = async (ctx, token, tier) => {
  const r = await ctx.fetchJson(`${ctx.base}/api/create-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ tier, quoteOnly: true }),
  });
  return { status: r.status, body: r.body };
};
// A real checkout request (no quoteOnly), carrying the amount the buyer was shown.
const checkout = async (ctx, token, tier, expectedDueCents) => {
  const r = await ctx.fetchJson(`${ctx.base}/api/create-checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ tier, expectedDueCents }),
  });
  return { status: r.status, body: r.body };
};
const showCheckout = (r) => `HTTP ${r.status} ${r.body && typeof r.body === "object" ? `error ${r.body.error ?? "none"} dueCents ${r.body.dueCents ?? "none"}` : String(r.body || "").slice(0, 80)}`;
const priceChanged = (r) => r.status === 409 && r.body && typeof r.body === "object" && r.body.error === "price_changed";

const show = (q) => (q.body && typeof q.body === "object" ? `HTTP ${q.status} due ${q.body.dueCents} credit ${q.body.creditCents} from ${q.body.creditFrom}` : `HTTP ${q.status}`);

const mainText = async (page) => {
  await page.locator("main").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500); // the quote is fetched after the page renders
  return (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `quoted-price-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  const hasPersona = (p) => {
    try {
      return Boolean(ctx.creds(p)?.email);
    } catch {
      return false;
    }
  };

  // 1-3. The quote.
  if (hasPersona("golden_sponsored")) {
    const q = await quote(ctx, await ctx.token("golden_sponsored"), "report");
    add(0, q.status === 200 && q.body?.ok && q.body.dueCents === 27900 && q.body.creditCents === 0, show(q));
  } else add(0, false, "golden_sponsored not in REGRESS_PERSONAS");
  if (hasPersona("golden_purchased")) {
    const q = await quote(ctx, await ctx.token("golden_purchased"), "report");
    add(1, q.status === 200 && q.body?.ok && q.body.dueCents === 20000 && q.body.creditCents === 7900 && q.body.creditFrom === "roadmap", show(q));
  } else add(1, false, "golden_purchased not in REGRESS_PERSONAS");
  {
    const q = await quote(ctx, "", "report");
    add(2, q.status === 200 && q.body?.ok && q.body.dueCents === 27900 && q.body.creditCents === 0, show(q));
  }

  // 8. The price tie. golden_sponsored's quote is $279 (rule 1).
  if (hasPersona("golden_sponsored")) {
    const t = await ctx.token("golden_sponsored");
    const wrong = await checkout(ctx, t, "report", 1);
    const right = await checkout(ctx, t, "report", 27900);
    add(
      7,
      priceChanged(wrong) && wrong.body.dueCents === 27900 && !priceChanged(right),
      `expected 1 cent: ${showCheckout(wrong)}; expected 27900 (the quote): ${showCheckout(right)}`
    );
  } else add(7, false, "golden_sponsored not in REGRESS_PERSONAS");

  // 4-7 and 9. The pages.
  const browser = await ctx.launch();
  try {
    if (hasPersona("golden_sponsored")) {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      try {
        await signIn(page, ctx, "golden_sponsored");
        await page.goto(`${ctx.base}/packet`, { waitUntil: "domcontentloaded" });
        const gate = await mainText(page);
        add(3, gate.includes("$279") && !gate.includes("$200"), `paywall: ${/is part of Platinum/.test(gate) ? "shown" : "NOT shown"}; $279 ${gate.includes("$279")}; $200 ${gate.includes("$200")}`);

        await page.goto(`${ctx.base}/unlock?tier=report`, { waitUntil: "domcontentloaded" });
        await mainText(page);
        const panel = (await page.locator("#buy").innerText()).replace(/\s+/g, " ");
        add(5, panel.includes("$279 one time") && !/credit/i.test(panel), `panel: ${panel.slice(0, 120)}`);

        await page.goto(`${ctx.base}/dashboard`, { waitUntil: "domcontentloaded" });
        const dash = await mainText(page);
        const step = (/Upgrade for \$[\d,]+/.exec(dash) || [])[0] || "no priced upgrade step";
        add(6, step === "Upgrade for $279", step);
      } finally {
        await context.close();
      }
    } else {
      [3, 5, 6].forEach((i) => add(i, false, "golden_sponsored not in REGRESS_PERSONAS"));
    }
    if (hasPersona("golden_purchased")) {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      try {
        await signIn(page, ctx, "golden_purchased");
        await page.goto(`${ctx.base}/packet`, { waitUntil: "domcontentloaded" });
        const gate = await mainText(page);
        add(4, gate.includes("$200"), `paywall: ${/is part of Platinum/.test(gate) ? "shown" : "NOT shown"}; $200 ${gate.includes("$200")}`);
      } finally {
        await context.close();
      }
    } else add(4, false, "golden_purchased not in REGRESS_PERSONAS");

    // 9. /unlock before the quote lands, for the Golden buyer ($200 quote).
    if (hasPersona("golden_purchased")) {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      let release = () => {};
      let backstop = null;
      try {
        await signIn(page, ctx, "golden_purchased");
        const sb = new URL(ctx.supabaseUrl).origin;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        // A backstop, so a held read can never outlive the rule.
        backstop = setTimeout(() => release(), 30000);
        let held = 0;
        const hold = async (route) => {
          held += 1;
          await gate;
          return route.continue().catch(() => {});
        };
        await page.route(
          (u) => u.origin === new URL(ctx.base).origin && u.pathname === "/api/create-checkout",
          (route) => (/"quoteOnly"\s*:\s*true/.test(route.request().postData() || "") ? hold(route) : route.continue())
        );
        await page.route(
          (u) => u.origin === sb && u.pathname === "/rest/v1/rpc/my_qualifying_paid_plan",
          (route) => (route.request().method() === "OPTIONS" ? route.continue() : hold(route))
        );
        // The email step, answered here: no lead is recorded and no mail is sent.
        await page.route(
          (u) => u.origin === sb && u.pathname === "/rest/v1/rpc/capture_lead",
          (route) => {
            const req = route.request();
            const origin = req.headers().origin || new URL(ctx.base).origin;
            const cors = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
            if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
            return route.fulfill({ status: 200, headers: { ...cors, "content-type": "application/json" }, body: "null" });
          }
        );
        await page.route(
          (u) => u.origin === new URL(ctx.base).origin && u.pathname === "/api/send-email",
          (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
        );
        await page.goto(`${ctx.base}/unlock?tier=report`, { waitUntil: "domcontentloaded" });
        const buy = page.locator("#buy");
        await buy.locator("#unlock-email").waitFor({ timeout: 30000 });
        await buy.locator("#unlock-email").fill(`${ctx.prefix}-861@regress.aduatlas.test`);
        await buy.getByRole("button", { name: "Continue" }).click();
        await buy.getByText("Email saved.").waitFor({ timeout: 15000 });
        await page.waitForTimeout(800);
        const heldDuring = held;
        const during = (await buy.innerText()).replace(/\s+/g, " ");
        release();
        let final = "";
        for (let i = 0; i < 30; i += 1) {
          final = (await buy.innerText()).replace(/\s+/g, " ");
          if (/Pay \$200/.test(final)) break;
          await page.waitForTimeout(500);
        }
        const payDuring = (/Pay \$[\d,]+/.exec(during) || [])[0] || "no pay figure";
        const payFinal = (/Pay \$[\d,]+/.exec(final) || [])[0] || "no pay figure";
        add(
          8,
          heldDuring > 0 && !/Pay \$279/.test(during) && /Pay \$200/.test(final) && !/Pay \$279/.test(final),
          `price reads held while the panel was read: ${heldDuring}; before the quote: "${payDuring}"; after it: "${payFinal}"`
        );
      } finally {
        release();
        clearTimeout(backstop);
        await context.close();
      }
    } else add(8, false, "golden_purchased not in REGRESS_PERSONAS");
  } finally {
    await browser.close().catch(() => {});
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
}
