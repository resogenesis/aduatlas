// DEF-01 (address lookup authentication), guarded by behaviour.
//
// /api/property-lookup spends a metered provider call, so it answers only a
// signed-in account entitled to Platinum. RC1 shipped the feasibility tool
// calling it with NO Authorization header, so every Platinum lookup got 401 and
// the homeowner read "Lookup failed". This check goes RED on that defect and on
// the tempting wrong fix (relaxing the endpoint so a bare call "works"):
//
//   1. an anonymous call and a garbage bearer both get 401 from the endpoint;
//   2. a Golden account's real token gets 403 (the tier boundary is the server's);
//   3. a Platinum homeowner who signs in through the real /login page and runs
//      Look up on /feasibility issues a request that carries
//      "Authorization: Bearer <session token>", and the server answers one of
//      {200, 404, 501, 502}, never 401/403 and never some other failure. Staging
//      has no RentCast key, so 501 and the amber "isn't enabled yet" message are
//      the expected answer there; the message shown must match the status;
//   4. a Golden homeowner who signs in gets the Platinum paywall on /feasibility,
//      no address box, and no lookup request.
//
// Personas are used read-only (platinum_purchased, golden_purchased). One real
// lookup per run: the endpoint allows 8 per account per 10 minutes per instance,
// so running this many times in a row can trip a 429, which reads as a failure.
export const meta = {
  name: "700 address lookup authentication",
  rules: [
    "the metered lookup endpoint refuses anonymous and forged callers (401)",
    "the lookup endpoint refuses a signed-in account below Platinum (403)",
    "the feasibility tool sends the session's access token as Authorization: Bearer",
    "a Platinum lookup passes authentication and gets an honest answer (200, 404, 501 or 502)",
    "the message shown matches what the server answered",
    "a Golden account reaches no lookup tool",
  ],
};

const ADDRESS = "123 Main St, Phoenix, AZ 85004";
const PLACEHOLDER = "123 Main St, City, ST 90210";
const DESKTOP = { viewport: { width: 1280, height: 900 } };
const OK_STATUSES = [200, 404, 501, 502];
// What the homeowner must read for each status the server may legitimately give.
const EXPECTED_MSG = {
  200: /Filled from public records/,
  404: /No public record found/,
  501: /isn't enabled yet/,
  502: /Lookup failed/,
};
const isLookup = (u) => {
  try { return new URL(u).pathname === "/api/property-lookup"; } catch { return false; }
};

// Personas are read-only here. Typing an address makes the page save the lot
// (rpc save_homeowner_worksheets, PATCH users), so every database write from
// this browser is refused before it leaves. Reads, read-only RPCs and sign-in
// pass through.
const guardPersonaWrites = async (context, supabaseUrl) => {
  const blocked = [];
  const origin = new URL(supabaseUrl).origin;
  await context.route((u) => u.origin === origin && u.pathname.startsWith("/rest/v1/"), (route) => {
    const req = route.request();
    const m = req.method();
    const p = new URL(req.url()).pathname;
    const readRpc = /^\/rest\/v1\/rpc\/(get_|my_|jurisdiction_)/.test(p);
    if (m === "GET" || m === "HEAD" || (m === "POST" && readRpc)) return route.fallback();
    blocked.push(`${m} ${p}`);
    return route.abort("blockedbyclient");
  });
  return blocked;
};

const uiLogin = async (browser, ctx, persona) => {
  const context = await browser.newContext(DESKTOP);
  context.blockedWrites = await guardPersonaWrites(context, ctx.supabaseUrl);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  const { email, password } = ctx.creds(persona);
  await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.click("button[type=submit]"),
  ]);
  return { context, page };
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const url = `${ctx.base}/api/property-lookup?address=${encodeURIComponent(ADDRESS)}`;

  // 1. Closed to anonymous and forged callers.
  const anon = await ctx.fetchJson(url);
  add("endpoint-refuses-anonymous", meta.rules[0], anon.status === 401, `no token -> ${anon.status} ${JSON.stringify(anon.body).slice(0, 120)}`);
  const garbage = await ctx.fetchJson(url, { headers: { Authorization: "Bearer not-a-real-token" } });
  add("endpoint-refuses-garbage-token", meta.rules[0], garbage.status === 401, `garbage bearer -> ${garbage.status}`);

  // 2. Closed to a signed-in account below Platinum.
  const goldenToken = await ctx.token("golden_purchased");
  const golden = await ctx.fetchJson(url, { headers: { Authorization: `Bearer ${goldenToken}` } });
  add("endpoint-refuses-golden", meta.rules[1], golden.status === 403, `golden token -> ${golden.status} ${JSON.stringify(golden.body).slice(0, 120)}`);

  const browser = await ctx.launch();
  try {
    // 3. Platinum, through the real UI.
    {
      const { context, page } = await uiLogin(browser, ctx, "platinum_purchased");
      await page.goto(`${ctx.base}/feasibility`, { waitUntil: "networkidle" });
      const box = page.getByPlaceholder(PLACEHOLDER);
      await box.waitFor({ state: "visible" });
      await box.fill(ADDRESS);
      const [req] = await Promise.all([
        page.waitForRequest((r) => isLookup(r.url())),
        page.getByRole("button", { name: "Look up" }).click(),
      ]);
      const headers = await req.allHeaders();
      const authz = headers.authorization || "";
      const bearer = /^Bearer (\S+)$/.exec(authz);
      const sentAnonKey = Boolean(bearer) && bearer[1] === ctx.anonKey;
      add(
        "ui-lookup-sends-bearer",
        meta.rules[2],
        Boolean(bearer) && !sentAnonKey,
        `authorization header ${authz ? (bearer ? (sentAnonKey ? "is the public anon key" : "is Bearer <token>") : "is malformed") : "absent"}`
      );
      const res = await req.response();
      const status = res ? res.status() : -1;
      const body = res ? (await res.text().catch(() => "")).slice(0, 120) : "";
      add("ui-lookup-authenticated", meta.rules[3], OK_STATUSES.includes(status), `status=${status} body=${body}`);

      // The message below the address box, read once the lookup has settled.
      const msg = box.locator("xpath=../../p");
      let text = "";
      let cls = "";
      try {
        await page.getByRole("button", { name: "Look up" }).waitFor({ state: "visible", timeout: 20000 });
        await msg.waitFor({ state: "visible", timeout: 20000 });
        text = ((await msg.textContent()) || "").trim();
        cls = (await msg.getAttribute("class")) || "";
      } catch (e) {
        text = `(no message: ${String(e?.message || e).slice(0, 80)})`;
      }
      const want = EXPECTED_MSG[status];
      const tone = /text-amber-700/.test(cls) ? "amber" : /text-red-700/.test(cls) ? "red" : /text-accent/.test(cls) ? "accent" : "other";
      add(
        "ui-lookup-message-matches-status",
        meta.rules[4],
        Boolean(want) && want.test(text),
        `status=${status} tone=${tone} message="${text.slice(0, 160)}"`
      );
      if (context.blockedWrites.length) ctx.log(`kept platinum_purchased read-only: refused ${[...new Set(context.blockedWrites)].join(", ")}`);
      await context.close();
    }

    // 4. Golden, through the real UI: the paywall, and nothing that can call the endpoint.
    {
      const { context, page } = await uiLogin(browser, ctx, "golden_purchased");
      let lookups = 0;
      page.on("request", (r) => { if (isLookup(r.url())) lookups += 1; });
      await page.goto(`${ctx.base}/feasibility`, { waitUntil: "networkidle" });
      let paywall = false;
      try {
        await page.getByText(/This is part of\s+Platinum/).first().waitFor({ state: "visible", timeout: 20000 });
        paywall = true;
      } catch { /* reported below */ }
      const boxes = await page.getByPlaceholder(PLACEHOLDER).count();
      const buttons = await page.getByRole("button", { name: "Look up" }).count();
      add(
        "ui-golden-gets-no-tool",
        meta.rules[5],
        paywall && boxes === 0 && buttons === 0 && lookups === 0,
        `paywall=${paywall} addressBoxes=${boxes} lookUpButtons=${buttons} lookupRequests=${lookups} at ${new URL(page.url()).pathname}`
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}
