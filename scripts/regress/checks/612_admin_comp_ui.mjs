// Admin-comped access, as Amy SEES it (Richard's decision of 2026-09-27,
// migration 0023).
//
// 610 proves the admin API. This proves the screens. A regress- account is
// comped through the real admin API (from this process, not from the page), then
// the staging admin signs in through the real /login page and opens /admin/users
// and /admin in an isolated headless Chromium:
//   1. /admin/users says the comped account's access is COMPED, never bought;
//   2. /admin shows comps as their own figure, equal to the number of live
//      comps in the database;
//   3. the Revenue figure on /admin is the list price of plans qualifying money
//      bought (oracle read with the service role), and the comped account's own
//      basis is NO-CREDIT, so the comp adds nothing to it.
// The page itself is kept read-only: every non-GET request to /api/admin/* and
// every database write from the browser is refused before it leaves, and
// nothing on the page is clicked. The account is deleted afterwards.
export const meta = {
  name: "612 admin console shows comped access as comped",
  rules: [
    "the users screen shows a comped account as Comped, never as Bought",
    "the overview screen shows comped access as its own figure",
    "the overview screen's revenue excludes comped access",
  ],
};

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const PRICE = { roadmap: 79, report: 279, concierge: 500 }; // src/lib/plans.js, dollars
const money = (n) => `$${Number(n || 0).toLocaleString("en-US")}`;

const guardWrites = async (context, ctx) => {
  const blocked = [];
  const sb = new URL(ctx.supabaseUrl).origin;
  const site = new URL(ctx.base).origin;
  await context.route(
    (u) => (u.origin === sb && u.pathname.startsWith("/rest/v1/")) || (u.origin === site && u.pathname.startsWith("/api/admin/")),
    (route) => {
      const req = route.request();
      const m = req.method();
      const p = new URL(req.url()).pathname;
      const readRpc = /^\/rest\/v1\/rpc\/(get_|my_|jurisdiction_)/.test(p);
      if (m === "GET" || m === "HEAD" || (m === "POST" && readRpc)) return route.fallback();
      blocked.push(`${m} ${p}`);
      return route.abort("blockedbyclient");
    }
  );
  return blocked;
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) {
    return meta.rules.map((rule, i) => ({ name: `comp-ui-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the comped account cannot be created" }));
  }
  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const email = `${ctx.prefix}-compui@rehearsal.aduatlas.test`;
  const { email: adminEmail, password } = ctx.creds("admin");

  const oracle = async () => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const r = await ctx.fetchJson(
        `${rest}/homeowner_upgrade_basis?select=paid_tier,paid_origin,qualifying_paid_plan&paid_at=not.is.null&refunded_at=is.null&order=user_id`,
        { headers: { ...H, Range: `${from}-${from + 999}` } }
      );
      if (r.status >= 300 || !Array.isArray(r.body)) throw new Error(`oracle read failed: ${r.status}`);
      rows.push(...r.body);
      if (r.body.length < 1000) break;
    }
    return {
      revenue: rows.reduce((s, x) => s + (PRICE[x.qualifying_paid_plan] || 0), 0),
      comped: rows.filter((x) => x.paid_origin === "admin_comp" && PRICE[x.paid_tier]).length,
    };
  };

  let browser;
  try {
    const ins = await ctx.fetchJson(`${rest}/users`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ email }) });
    if (ins.status >= 300 || !ins.body?.[0]?.id) throw new Error(`fixture insert failed: ${ins.status} ${JSON.stringify(ins.body).slice(0, 160)}`);
    const comp = await ctx.fetchJson(`${ctx.base}/api/admin/update-user`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await ctx.token("admin")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: ins.body[0].id, paid: true, paid_tier: "report" }),
    });
    if (comp.status !== 200) throw new Error(`the admin API did not comp the fixture: ${comp.status} ${JSON.stringify(comp.body).slice(0, 160)}`);
    const own = await ctx.fetchJson(`${rest}/homeowner_upgrade_basis?select=paid_origin,qualifying_paid_plan&user_id=eq.${ins.body[0].id}`, { headers: H });
    const ownBasis = own.body?.[0] || null;

    browser = await ctx.launch();
    const context = await browser.newContext(DESKTOP);
    const blocked = await guardWrites(context, ctx);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
    await page.fill("input[type=email]", adminEmail);
    await page.fill("input[type=password]", password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
      page.click("button[type=submit]"),
    ]);

    // Users screen.
    await page.goto(`${ctx.base}/admin/users`, { waitUntil: "networkidle" });
    await page.locator("table tbody tr").first().waitFor({ state: "visible" });
    const row = page.locator("table tbody tr", { hasText: email }).first();
    let attr = null;
    let cellText = null;
    if (await row.count()) {
      const cell = row.locator("td[data-access]");
      if (await cell.count()) {
        attr = await cell.getAttribute("data-access");
        cellText = (await cell.innerText()).replace(/\s+/g, " ").trim();
      }
    }
    add(
      "users-screen-shows-comped",
      meta.rules[0],
      attr === "comped" && /^Comped$/.test(cellText || "") && !/Bought/.test(cellText || ""),
      (await row.count()) ? `access cell "${cellText}" (data-access=${attr})` : "the comped account is not on the users screen"
    );

    // Overview screen.
    await page.goto(`${ctx.base}/admin`, { waitUntil: "networkidle" });
    await page.getByText("Revenue", { exact: true }).first().waitFor({ state: "visible" });
    const figure = async (label) => {
      const c = page.locator("div", { has: page.getByText(label, { exact: true }) }).filter({ has: page.locator("p") }).last();
      if (!(await c.count())) return null;
      return ((await c.locator("p").first().innerText()) || "").trim();
    };
    const want = await oracle();
    const compedFigure = await figure("Comped");
    add(
      "overview-shows-comped-figure",
      meta.rules[1],
      compedFigure !== null && /^\d+$/.test(compedFigure) && Number(compedFigure) >= 1 && Number(compedFigure) === want.comped,
      compedFigure === null ? "no Comped figure on /admin" : `Comped figure "${compedFigure}"; live comps in the database ${want.comped}`
    );
    const shown = await figure("Revenue");
    add(
      "overview-revenue-excludes-comped",
      meta.rules[2],
      shown === money(want.revenue) && ownBasis?.paid_origin === "admin_comp" && ownBasis?.qualifying_paid_plan === null,
      `shown "${shown}"; list price of plans qualifying money bought ${money(want.revenue)}; this comp: origin=${ownBasis?.paid_origin ?? "not recorded"} basis=${ownBasis?.qualifying_paid_plan ?? "NO-CREDIT"}`
    );

    if (blocked.length) ctx.log(`kept the console read-only: refused ${[...new Set(blocked)].join(", ")}`);
    await context.close();
  } finally {
    if (browser) await browser.close();
    await ctx.fetchJson(`${rest}/users?email=eq.${encodeURIComponent(email)}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  }
  return out;
}
