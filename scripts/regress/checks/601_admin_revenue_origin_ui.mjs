// DEF-21, guarded by what Amy actually sees in the admin console.
//
// 600 proves the admin API. This proves the screens: the staging admin signs in
// through the real /login page, opens /admin and /admin/users in an isolated
// headless Chromium, and reads them.
//   1. /admin/users says golden_sponsored's access is SPONSORED, never bought;
//   2. /admin/users says golden_purchased's access is BOUGHT;
//   3. /admin shows sponsored access as its own figure;
//   4. the Revenue figure on /admin is the list price of plans qualifying money
//      bought, from the database's own authority
//      (homeowner_upgrade_basis.qualifying_paid_plan, read with the service
//      role), so a sponsored Golden adds nothing to it.
//
// Read-only. The admin console can change roles and tiers, so every non-GET
// request to /api/admin/* and every database write from this browser is
// refused before it leaves, and nothing on the page is clicked.
export const meta = {
  name: "601 admin console shows bought and sponsored access apart",
  rules: [
    "the users screen shows a sponsored account as sponsored, never as bought",
    "the users screen shows a purchased account as bought",
    "the overview screen shows sponsored access as its own figure",
    "the overview screen's revenue excludes sponsored access (list price of plans qualifying money bought)",
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

const expectedRevenue = async (ctx) => {
  if (!ctx.serviceKey) return null;
  const h = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` };
  let total = 0;
  for (let from = 0; ; from += 1000) {
    const r = await ctx.fetchJson(
      `${ctx.supabaseUrl}/rest/v1/homeowner_upgrade_basis?select=qualifying_paid_plan&paid_at=not.is.null&refunded_at=is.null&order=user_id`,
      { headers: { ...h, Range: `${from}-${from + 999}` } }
    );
    if (r.status >= 300 || !Array.isArray(r.body)) throw new Error(`homeowner_upgrade_basis read failed: ${r.status}`);
    for (const x of r.body) total += PRICE[x.qualifying_paid_plan] || 0;
    if (r.body.length < 1000) break;
  }
  return total;
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const { email, password } = ctx.creds("admin");
  const sponsoredEmail = ctx.creds("golden_sponsored").email;
  const purchasedEmail = ctx.creds("golden_purchased").email;

  const browser = await ctx.launch();
  try {
    const context = await browser.newContext(DESKTOP);
    const blocked = await guardWrites(context, ctx);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
      page.click("button[type=submit]"),
    ]);

    // Users screen.
    await page.goto(`${ctx.base}/admin/users`, { waitUntil: "networkidle" });
    await page.locator("table tbody tr").first().waitFor({ state: "visible" });
    const accessOf = async (who) => {
      const row = page.locator("table tbody tr", { hasText: who }).first();
      if (!(await row.count())) return { found: false };
      const cell = row.locator("td[data-access]");
      const text = (await row.innerText()).replace(/\s+/g, " ");
      if (!(await cell.count())) return { found: true, attr: null, cellText: null, text };
      return { found: true, attr: await cell.getAttribute("data-access"), cellText: (await cell.innerText()).replace(/\s+/g, " ").trim(), text };
    };
    const s = await accessOf(sponsoredEmail);
    add(
      "users-screen-shows-sponsored",
      meta.rules[0],
      s.attr === "sponsored" && /^Sponsored$/.test(s.cellText || "") && !/Bought/.test(s.text),
      s.found ? (s.attr === null ? `row has no access column: "${s.text.slice(0, 140)}"` : `access cell "${s.cellText}" (data-access=${s.attr})`) : "golden_sponsored not on the users screen"
    );
    const p = await accessOf(purchasedEmail);
    add(
      "users-screen-shows-bought",
      meta.rules[1],
      p.attr === "bought" && /^Bought\b/.test(p.cellText || "") && !/Sponsored/.test(p.cellText || ""),
      p.found ? (p.attr === null ? `row has no access column: "${p.text.slice(0, 140)}"` : `access cell "${p.cellText}" (data-access=${p.attr})`) : "golden_purchased not on the users screen"
    );

    // Overview screen.
    await page.goto(`${ctx.base}/admin`, { waitUntil: "networkidle" });
    await page.getByText("Revenue", { exact: true }).first().waitFor({ state: "visible" });
    const card = (label) => page.locator("div", { has: page.getByText(label, { exact: true }) }).filter({ has: page.locator("p") }).last();
    const figure = async (label) => {
      const c = card(label);
      if (!(await c.count())) return null;
      return ((await c.locator("p").first().innerText()) || "").trim();
    };
    const sponsoredFigure = await figure("Sponsored");
    add(
      "overview-shows-sponsored-figure",
      meta.rules[2],
      sponsoredFigure !== null && /^\d+$/.test(sponsoredFigure) && Number(sponsoredFigure) >= 1,
      sponsoredFigure === null ? "no Sponsored figure on /admin" : `Sponsored figure "${sponsoredFigure}"`
    );
    const shown = await figure("Revenue");
    const want = await expectedRevenue(ctx);
    if (want === null) {
      out.push({ name: "overview-revenue-excludes-sponsored", rule: meta.rules[3], status: "skip", detail: "no service role key; the oracle cannot be read" });
    } else {
      add("overview-revenue-excludes-sponsored", meta.rules[3], shown === money(want), `shown "${shown}"; list price of plans qualifying money bought ${money(want)}`);
    }

    if (blocked.length) ctx.log(`kept the console read-only: refused ${[...new Set(blocked)].join(", ")}`);
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
