// R3-09: editing a government entity's official website in the console saves it.
//
// On RC3 the entity Edit form was seeded from the whole stored row, which carries
// the website twice (official_website_url, and the console alias website_url).
// The input edited website_url, and entity-save read whichever key came first,
// official_website_url, which was the stale copy. The save "succeeded", the
// drawer refreshed, and the edit was gone: the homeowner entity card could not
// show the website and Amy was not told (j4).
//
// Fixture, named with ctx.prefix: one UNPUBLISHED jurisdiction under a state and
// one government entity on it, made through the admin API (jurisdictions have no
// delete, so the unpublished record stays, as in 330).
export const meta = {
  name: "360 admin: editing a government entity's official website is saved",
  rules: [
    "R3-09: a website edited in the console's entity form is the website stored",
    "R3-09: an entity save carrying the stored website under one spelling and an edit under the other keeps the edit",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const adminToken = await ctx.token("admin");
  const api = (method, route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/regulatory/${route}`, {
      method,
      headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const must = (r, what) => {
    if (r.status !== 200) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body;
  };

  const m = must(await api("GET", "meta"), "meta");
  const state = (m.states || []).find((s) => s.state_code === "WY") || (m.states || [])[0];
  const name = `${ctx.prefix} 360 Website Town`;
  const domain = `${ctx.prefix}-360.test`;
  const site = (n) => `https://www.${domain}/${n}`;
  const j = must(
    await api("POST", "jurisdiction-save", {
      jurisdiction: { type: "municipality", name, slug: `${ctx.prefix}-360-website-town`, parent_id: state.id, is_published: false },
    }),
    "jurisdiction-save",
  ).jurisdiction;
  const entityName = `${ctx.prefix} City of Website Town`;
  const entity = must(
    await api("POST", "entity-save", { entity: { name: entityName, entity_type: "city", official_website_url: site("first"), official_domains: [domain], jurisdiction_id: j.id } }),
    "entity-save",
  ).entity;
  const storedSite = async () => (must(await api("GET", `jurisdiction?id=${j.id}`), "read back").entity || {}).official_website_url || null;

  // 1. Through the real console.
  let browser = null;
  try {
    const { browser: b, page } = await adminPage(ctx);
    browser = b;
    await page.goto(`${ctx.base}/admin/regulatory`, { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder("Search every jurisdiction by name");
    await search.waitFor({ timeout: 45000 });
    for (let attempt = 0; ; attempt += 1) {
      await search.fill("");
      await search.fill(name);
      const row = page.locator("tr", { hasText: name }).first();
      try {
        await row.waitFor({ timeout: 25000 });
        await row.click();
        break;
      } catch (e) {
        if (attempt >= 2) throw e;
      }
    }
    const drawer = page.locator("div.fixed", { has: page.getByRole("heading", { name, exact: true }) }).last();
    await drawer.waitFor({ timeout: 30000 });
    const entitySection = drawer.locator("section", { has: page.getByRole("heading", { name: /^Government entity$/ }) });
    await entitySection.getByText(entityName, { exact: true }).waitFor({ timeout: 30000 });
    await entitySection.getByRole("button", { name: "Edit" }).click();
    const websiteInput = entitySection.locator("label", { has: page.getByText("Official website", { exact: true }) }).locator("input");
    await websiteInput.fill(site("edited-in-console"));
    await entitySection.getByRole("button", { name: /Save entity/ }).click();
    await entitySection.getByRole("button", { name: /Save entity|Saving/ }).waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
    const alert = ((await drawer.locator('[role="alert"]').first().innerText().catch(() => "")) || "").trim();
    const stored = await storedSite();
    add(
      "console edit stored",
      meta.rules[0],
      stored === site("edited-in-console"),
      `stored ${stored ?? "no website"} after typing ${site("edited-in-console")}${alert ? `; console said: ${alert.slice(0, 160)}` : ""}`,
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // 2. The request an older console sends: the stored website echoed under the
  // column's name, the edit under the alias.
  const now = await storedSite();
  const echo = await api("POST", "entity-save", {
    entity: { id: entity.id, jurisdiction_id: j.id, name: entityName, entity_type: "city", official_website_url: now || "", website_url: site("edited-by-alias"), official_domains: [domain] },
  });
  const afterEcho = await storedSite();
  add(
    "edit under the alias kept",
    meta.rules[1],
    afterEcho === site("edited-by-alias"),
    `entity-save -> HTTP ${echo.status}; stored ${afterEcho ?? "no website"} (sent official_website_url=${now ?? "empty"}, website_url=${site("edited-by-alias")})`,
  );
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
