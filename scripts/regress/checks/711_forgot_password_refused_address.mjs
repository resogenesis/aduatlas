// R3-19 (found at the RC3 rehearsal, journey j1 step 4.1): Supabase Auth
// refused the address itself (POST /auth/v1/recover -> 400
// email_address_invalid), and /forgot-password said "We could not send the reset
// link just now. Try again in a moment", advice that cannot work.
//
// The recovery call is answered INSIDE the browser, never by the auth server:
// the public auth-mail budget is small and shared, and a refusal of the address
// is the exact response the journey recorded (the current GoTrue shape, with the
// API version header auth-js reads). So nothing reaches Supabase Auth and no
// mail can be sent.
//   1. a refused address is reported plainly: the address was not accepted and
//      no link was sent, with no "try again in a moment";
//   2. STANDING GUARD (passes on RC3 by design): an accepted request still shows
//      the one neutral sentence that never says whether an account exists.
export const meta = {
  name: "711 forgot-password says plainly when the address was not accepted",
  rules: [
    "when the auth server refuses the address, forgot-password says it was not accepted and that no link was sent",
    "when the auth server accepts the request, forgot-password shows only the neutral confirmation",
  ],
};

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const DASHES_OR_ARROWS = /[‒-―←-⇿]|->|=>|<-/;
const ADDRESS = "someone@regress.aduatlas.test";

const answerRecover = async (context, ctx, { status, body }) => {
  const sb = new URL(ctx.supabaseUrl).origin;
  const seen = [];
  await context.route(
    (u) => u.origin === sb && u.pathname === "/auth/v1/recover",
    (route) => {
      const req = route.request();
      const origin = req.headers().origin || new URL(ctx.base).origin;
      const cors = {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-expose-headers": "x-supabase-api-version",
      };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
      seen.push(req.method());
      return route.fulfill({
        status,
        headers: { ...cors, "content-type": "application/json", "x-supabase-api-version": "2024-01-01" },
        body: JSON.stringify(body),
      });
    }
  );
  return seen;
};

const submit = async (page, ctx) => {
  await page.goto(`${ctx.base}/forgot-password`, { waitUntil: "domcontentloaded" });
  const email = page.locator("form input[type=email]").first();
  await email.waitFor({ state: "visible" });
  await email.fill(ADDRESS);
  await page.locator("form button[type=submit]").first().click();
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `forgot-password-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    // 1. Refused address.
    try {
      const context = await browser.newContext(DESKTOP);
      const seen = await answerRecover(context, ctx, {
        status: 400,
        body: { code: "email_address_invalid", message: `Email address "${ADDRESS}" is invalid` },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await submit(page, ctx);
      const box = page.locator("p.text-red-700").first();
      await box.waitFor({ state: "visible" });
      const said = ((await box.innerText()) || "").replace(/\s+/g, " ").trim();
      const confirmed = await page.getByText("Check your email.", { exact: true }).count();
      add(
        0,
        seen.length === 1 && /not accept/i.test(said) && /no (reset )?link was sent/i.test(said) && !/try again in a moment/i.test(said) && !confirmed && !DASHES_OR_ARROWS.test(said),
        `recover calls answered in the browser: ${seen.length}; page said: "${said.slice(0, 240)}"`
      );
      await context.close();
    } catch (e) {
      add(0, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
    }

    // 2. Accepted request (standing guard).
    try {
      const context = await browser.newContext(DESKTOP);
      const seen = await answerRecover(context, ctx, { status: 200, body: {} });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await submit(page, ctx);
      await page.getByText("Check your email.", { exact: true }).waitFor({ state: "visible" });
      const neutral = await page.getByText(/If an ADUAtlas account uses that address/).count();
      const errors = await page.locator("p.text-red-700").count();
      add(1, seen.length === 1 && neutral > 0 && errors === 0, `recover calls answered in the browser: ${seen.length}; neutral sentence shown: ${neutral > 0}; error boxes: ${errors}`);
      await context.close();
    } catch (e) {
      add(1, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
    }
  } finally {
    await browser.close();
  }
  return out;
}
