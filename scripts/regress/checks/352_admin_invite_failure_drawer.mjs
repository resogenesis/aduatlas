// R3-22: an invitation that fails to send can still mint a claim code (the route
// puts the code on the row BEFORE it mails, so an invitation always carries a
// working one). The drawer must then show the code state the server holds.
//
// On RC3 the failed call answered 502 with code_issued:true, but the console's
// POST helper threw before the returned row was merged and the drawer was never
// refreshed, so it kept saying "No code issued yet." and "No claim code has been
// issued yet; the invitation issues one and carries it." beside a code that now
// existed and that nobody had received (j3).
//
// Fixture, named with ctx.prefix and removed at the end: one INACTIVE, unclaimed
// listing with a contact email on the reserved .test domain and no claim code.
// The staging admin opens it in the real console and presses Invite to claim.
// Where email IS configured and the invitation actually leaves, there is no
// failure to observe and the check reports skip.
export const meta = {
  name: "352 admin: a failed invitation leaves the drawer showing the claim code it minted",
  rules: [
    "R3-22: after a failed invitation that minted a code, the drawer says a code is issued",
    "R3-22: the drawer no longer says no claim code has been issued",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `invite-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be read back" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const adminToken = await ctx.token("admin");
  const api = (route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/builders/${route}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const name = `${ctx.prefix} 352 Invite Builders`;
  let builderId = null;
  let browser = null;
  try {
    const saved = await api("save", { builder: { name, state: "WY", active: false, contact_email: `${ctx.prefix}-352@builder.aduatlas.test` } });
    builderId = saved.body?.builder?.id || null;
    if (!builderId) throw new Error(`fixture listing: HTTP ${saved.status} ${JSON.stringify(saved.body).slice(0, 200)}`);

    const { browser: b, page } = await adminPage(ctx);
    browser = b;
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await page.goto(`${ctx.base}/admin/builders`, { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder("Search by name, state, city or contact");
    await search.waitFor({ timeout: 45000 });
    await search.fill(name);
    const row = page.locator("tr", { hasText: name }).first();
    await row.waitFor({ timeout: 30000 });
    await row.click();
    const drawer = page.locator("div.fixed", { has: page.getByRole("heading", { name, exact: true }) }).last();
    await drawer.waitFor({ timeout: 20000 });
    const before = (await drawer.innerText()).replace(/\s+/g, " ");
    if (!/No code issued yet/.test(before)) throw new Error("the fixture listing did not start without a claim code");

    await drawer.getByRole("button", { name: /^Invite to claim$/ }).click();
    const alert = drawer.locator('[role="alert"]').first();
    const sent = drawer.getByText(/^Invitation sent to /);
    const outcome = await Promise.race([
      alert.waitFor({ timeout: 45000 }).then(() => "failed"),
      sent.first().waitFor({ timeout: 45000 }).then(() => "sent"),
    ]).catch(() => "timeout");
    if (outcome === "sent") {
      return meta.rules.map((rule, i) => ({ name: `invite-${i + 1}`, rule, status: "skip", detail: "email is configured here and the invitation was sent, so there is no failed invitation to observe" }));
    }
    if (outcome === "timeout") throw new Error("pressing Invite to claim produced neither an error nor a sent notice");
    // Let a refresh the console makes after the failure land.
    await page.waitForTimeout(4000);
    const stored = (await ctx.fetchJson(`${rest}/builders?id=eq.${builderId}&select=claim_code,invited_at`, { headers: H })).body?.[0] || {};
    const text = (await drawer.innerText()).replace(/\s+/g, " ");
    const errorText = ((await alert.innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    add(
      "drawer says a code is issued",
      meta.rules[0],
      Boolean(stored.claim_code) && /Code issued\. It is waiting to be used\./.test(text),
      `server: claim code ${stored.claim_code ? "set" : "NOT set"}, invited_at ${stored.invited_at ?? "null"}; console error: ${errorText.slice(0, 200)}`,
    );
    add(
      "drawer no longer says none was issued",
      meta.rules[1],
      Boolean(stored.claim_code) && !/No code issued yet/.test(text) && !/No claim code has been issued yet/.test(text),
      /No code issued yet|No claim code has been issued yet/.test(text) ? "the drawer still says no claim code has been issued" : "no stale no-code wording",
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
