// R3-25 (builder console part): the console speaks current, true words.
//
// On RC3 the Introductions tab printed the homeowner's stored tier id ("roadmap")
// where Amy needs the plan name ("Golden"), and every listing's Referral activity
// said "Messaging ships in the next pass" under Conversations, although messaging
// is IN Phase 1 (2h) (j5).
//
// Fixture, named with ctx.prefix and removed at the end: one INACTIVE listing and
// one introduction request to it from the golden_purchased persona (a live Golden
// purchase, stored tier "roadmap"). The page is kept read-only: the staging admin
// opens it in an isolated headless Chromium and nothing is clicked except tabs,
// rows and the drawer.
export const meta = {
  name: "353 admin: the builder console names plans and does not promise messaging later",
  rules: [
    "R3-25: the Introductions tab names the homeowner's plan (Golden), not its stored id (roadmap)",
    "R3-25: a listing's Referral activity no longer says messaging ships in the next pass",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `copy-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const adminToken = await ctx.token("admin");
  const api = (route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/builders/${route}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const golden = ctx.creds("golden_purchased");

  const name = `${ctx.prefix} 353 Copy Builders`;
  let builderId = null;
  let browser = null;
  try {
    const saved = await api("save", { builder: { name, state: "WY", active: false } });
    builderId = saved.body?.builder?.id || null;
    if (!builderId) throw new Error(`fixture listing: HTTP ${saved.status} ${JSON.stringify(saved.body).slice(0, 200)}`);
    const u = (await ctx.fetchJson(`${rest}/users?id=eq.${golden.app_user_id}&select=paid_tier,paid_at,refunded_at`, { headers: H })).body?.[0];
    if (u?.paid_tier !== "roadmap" || !u?.paid_at || u?.refunded_at) throw new Error(`golden_purchased is not a live Golden purchase here: ${JSON.stringify(u)}`);
    const i = await ctx.fetchJson(`${rest}/intro_requests`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ user_id: golden.app_user_id, builder_id: builderId, message: `${ctx.prefix} regression fixture introduction (353)` }),
    });
    if (!i.body?.[0]?.id) throw new Error(`fixture introduction: HTTP ${i.status} ${JSON.stringify(i.body).slice(0, 200)}`);

    const { browser: b, page } = await adminPage(ctx);
    browser = b;
    await page.goto(`${ctx.base}/admin/builders`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("Search by name, state, city or contact").waitFor({ timeout: 45000 });

    // Introductions tab.
    await page.getByRole("button", { name: /^Introductions \(/ }).click();
    const introRow = page.locator("tr", { hasText: name }).first();
    await introRow.waitFor({ timeout: 30000 });
    const homeowner = ((await introRow.locator("td").first().innerText()) || "").replace(/\s+/g, " ").trim();
    add(
      "plan named, not its id",
      meta.rules[0],
      /\bGolden\b/.test(homeowner) && !/\broadmap\b/.test(homeowner),
      `homeowner cell: "${homeowner.replace(golden.email, "<golden_purchased>").slice(0, 160)}"`,
    );

    // Profiles tab, the fixture's drawer.
    await page.getByRole("button", { name: /^Profiles \(/ }).click();
    const search = page.getByPlaceholder("Search by name, state, city or contact");
    await search.fill(name);
    const row = page.locator("tr", { hasText: name }).first();
    await row.waitFor({ timeout: 30000 });
    await row.click();
    const drawer = page.locator("div.fixed", { has: page.getByRole("heading", { name, exact: true }) }).last();
    await drawer.waitFor({ timeout: 20000 });
    await drawer.getByText("Referral activity", { exact: true }).waitFor({ timeout: 20000 });
    const text = (await drawer.innerText()).replace(/\s+/g, " ");
    add(
      "no stale messaging promise",
      meta.rules[1],
      !/ships in the next pass/i.test(text) && /Conversations/.test(text),
      /ships in the next pass/i.test(text) ? 'the drawer still says "Messaging ships in the next pass"' : "Conversations shown without the stale line",
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (builderId) await api("delete", { id: builderId }).catch(() => {});
  }
  return out;
}

async function adminPage(ctx) {
  const c = ctx.creds("admin");
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ctx.anonKey },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (r.status !== 200) throw new Error(`admin browser sign-in failed: HTTP ${r.status}`);
  const ref = new URL(ctx.supabaseUrl).hostname.split(".")[0];
  const browser = await ctx.launch();
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(
    ([key, session]) => {
      try {
        window.localStorage.setItem(key, session);
      } catch {
        /* storage blocked: the page then shows the sign-in wall, which the check reports */
      }
    },
    [`sb-${ref}-auth-token`, JSON.stringify(r.body)],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  // A shared, busy staging (or a cold dev server) can take well over 30s to
  // answer the first navigation; a slow page is not the defect being checked.
  page.setDefaultNavigationTimeout(120000);
  return { browser, page };
}
