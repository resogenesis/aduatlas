// R3-11: Amy can release a claimed listing from its portal account, in the
// console, without touching the database. 2f makes claimed status part of builder
// management and 2g names ownership changes and badge invalidation.
//
// On RC3 a claimed listing's drawer offered Set inactive, Remove Verified, Save,
// Delete and Record signed project, and nothing to unlink or reassign the owner;
// the API had no unlink route although link-owner said "unlink first" (j5).
//
// Fixture, named with ctx.prefix and removed at the end: one builder account row
// (role pro) and one INACTIVE builder listing, linked and verified through the
// admin API. The staging admin then opens the listing in the real console in an
// isolated headless Chromium and releases it; the database is read back with the
// service role.
export const meta = {
  name: "351 admin: a claimed listing can be released, and the Verified badge goes with the claim",
  rules: [
    "R3-11: a claimed listing's drawer offers a release action",
    "R3-11: releasing leaves the listing unclaimed, and 0007's trigger clears verified_at and claimed_at",
    "R3-11: the console says the Verified badge was removed",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `release-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const adminToken = await ctx.token("admin");
  const api = (route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/builders/${route}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const must = (r, what) => {
    if (r.status !== 200) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    return r.body;
  };
  const readBuilder = async (id) =>
    (await ctx.fetchJson(`${rest}/builders?id=eq.${id}&select=id,owner_user_id,verified_at,verified_by,claimed_at`, { headers: H })).body?.[0] || null;

  const name = `${ctx.prefix} 351 Release Builders`;
  const proEmail = `${ctx.prefix}-351-pro@regress.aduatlas.test`;
  let builderId = null;
  let proId = null;
  let browser = null;
  try {
    const pro = await ctx.fetchJson(`${rest}/users`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ email: proEmail, role: "pro" }) });
    proId = pro.body?.[0]?.id || null;
    if (!proId) throw new Error(`fixture builder account: HTTP ${pro.status} ${JSON.stringify(pro.body).slice(0, 200)}`);
    builderId = must(await api("save", { builder: { name, state: "WY", active: false } }), "fixture listing").builder.id;
    must(await api("link-owner", { id: builderId, email: proEmail }), "link the owner");
    must(await api("verify", { id: builderId }), "verify the listing");
    const before = await readBuilder(builderId);
    if (!before?.owner_user_id || !before?.verified_at) throw new Error(`fixture is not claimed and verified: ${JSON.stringify(before)}`);

    const { browser: b, page } = await adminPage(ctx);
    browser = b;
    const dialogs = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      d.accept().catch(() => {});
    });
    await page.goto(`${ctx.base}/admin/builders`, { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder("Search by name, state, city or contact");
    await search.waitFor({ timeout: 45000 });
    await search.fill(name);
    const row = page.locator("tr", { hasText: name }).first();
    await row.waitFor({ timeout: 30000 });
    await row.click();
    const drawer = page.locator("div.fixed", { has: page.getByRole("heading", { name, exact: true }) }).last();
    await drawer.waitFor({ timeout: 20000 });
    const release = drawer.getByRole("button", { name: /release listing/i });
    const offered = (await release.count()) > 0;
    add("release offered", meta.rules[0], offered, offered ? "the claimed listing's drawer offers Release listing" : "no release action in the claimed listing's drawer");

    let notice = "";
    if (offered) {
      await release.first().click();
      const said = drawer.getByText(/Released /);
      await said.first().waitFor({ timeout: 30000 }).catch(() => {});
      notice = (await said.count()) ? (await said.first().innerText()).replace(/\s+/g, " ").trim() : ((await drawer.locator('[role="alert"]').first().innerText().catch(() => "")) || "nothing");
    }
    const after = await readBuilder(builderId);
    add(
      "unclaimed, badge and claim date cleared",
      meta.rules[1],
      Boolean(after) && after.owner_user_id == null && after.verified_at == null && after.verified_by == null && after.claimed_at == null,
      `after: owner=${after?.owner_user_id ?? "null"} verified_at=${after?.verified_at ?? "null"} claimed_at=${after?.claimed_at ?? "null"}`,
    );
    add(
      "console says the badge was removed",
      meta.rules[2],
      /Verified badge was removed/i.test(notice),
      `console: ${notice.slice(0, 240) || "no release happened"}${dialogs.length ? ` (confirmed: ${dialogs[0].slice(0, 80)}...)` : ""}`,
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (builderId) await api("delete", { id: builderId }).catch(() => {});
    if (proId) await ctx.fetchJson(`${rest}/users?id=eq.${proId}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  }
  return out;
}

// Sign the staging admin in inside an isolated browser by handing supabase-js a
// session of its own (one password sign-in, never shared with the harness cache).
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
