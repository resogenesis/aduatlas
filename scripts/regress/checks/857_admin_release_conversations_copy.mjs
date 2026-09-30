// I4-05c: releasing a claimed listing from its portal account must say what
// happens to its conversations with homeowners. In the database (0011) a thread
// is keyed on builder_id, and owns_builder_conversation() keys on
// builders.owner_user_id, so builders/unlink-owner (which nulls owner_user_id)
// takes every thread away from the released account at once, the homeowner can
// still write (is_conversation_homeowner is untouched), and whichever account
// holds the listing next reads the whole history. RC3 had no release action at
// all, and the first RC4 copy never mentioned conversations.
//
// The check opens a claimed fixture listing in the admin console as the staging
// admin persona, reads the "Release this listing" panel, presses Release
// listing and reads the confirmation, then DISMISSES it, and confirms from the
// database that nothing was released. Fixtures, written with the service role
// and deleted at the end: a builder account row (role pro, no login) and an
// inactive listing it owns, named ${ctx.prefix}-857-*.
export const meta = {
  name: "857 admin: the release panel and confirmation say what happens to the listing's conversations",
  rules: [
    "I4-05c: the release panel says the released account loses the listing's conversations, homeowners can still write, and the next owner sees all of them",
    "I4-05c: the release confirmation says the released account loses the conversations and the next owner sees all of them, and dismissing it releases nothing",
  ],
};

const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const says = (t) => ({
  loses: /can no longer (?:edit it or )?read (?:and|or) reply to (?:its conversations with homeowners|them)/i.test(t),
  stays: /conversations (?:with homeowners )?stay with the listing/i.test(t),
  next: /next account that claims it or is linked to it sees all of them, earlier messages included/i.test(t),
  write: /homeowners can still write in them/i.test(t),
  noDash: !/[—→←]/.test(t),
});
const all = (s) => s.loses && s.stays && s.next && s.noDash;
const show = (s) => `loses access ${s.loses}, stay with the listing ${s.stays}, homeowners can still write ${s.write}, next owner sees them ${s.next}, no dash or arrow ${s.noDash}`;

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `release-copy-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const brief = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`;

  const name = `${ctx.prefix} 857 Release Copy Builders`;
  let builderId = null;
  let proId = null;
  let browser = null;
  try {
    const pro = await svc("users", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ email: `${ctx.prefix}-857-pro@regress.aduatlas.test`, role: "pro" }) });
    proId = pro.body?.[0]?.id || null;
    if (!proId) throw new Error(`fixture builder account: ${brief(pro)}`);
    const b = await svc("builders", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ slug: `${ctx.prefix}-857-listing`, name, state: "WY", profile_status: "approved", active: false, owner_user_id: proId, claimed_at: new Date().toISOString() }),
    });
    builderId = b.body?.[0]?.id || null;
    if (!builderId) throw new Error(`fixture listing: ${brief(b)}`);

    const { browser: br, page } = await adminPage(ctx);
    browser = br;
    const dialogs = [];
    page.on("dialog", (d) => {
      dialogs.push(d.message());
      d.dismiss().catch(() => {});
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

    const panelTitle = drawer.getByText("Release this listing", { exact: true });
    const hasPanel = (await panelTitle.count()) > 0;
    // The innermost block holding the title: the title and its description.
    const panelText = hasPanel ? flat(await drawer.locator("div", { has: page.getByText("Release this listing", { exact: true }) }).last().innerText()) : "";
    const p = says(panelText);
    add(
      "release-panel-names-conversations",
      meta.rules[0],
      hasPanel && all(p) && p.write,
      hasPanel ? `${show(p)}; panel: "${panelText.slice(0, 300)}"` : "no Release this listing panel in the claimed listing's drawer",
    );

    const button = drawer.getByRole("button", { name: /release listing/i });
    let confirmText = "";
    if ((await button.count()) > 0) {
      await button.first().click();
      for (let i = 0; i < 20 && !dialogs.length; i += 1) await page.waitForTimeout(250);
      confirmText = flat(dialogs[0] || "");
      await page.waitForTimeout(1000);
    }
    const after = await svc(`builders?id=eq.${builderId}&select=owner_user_id`);
    const stillOwned = after.body?.[0]?.owner_user_id === proId;
    const c = says(confirmText);
    add(
      "release-confirmation-names-conversations",
      meta.rules[1],
      Boolean(confirmText) && all(c) && stillOwned,
      confirmText ? `${show(c)}; dismissed, listing still owned ${stillOwned}; confirmation: "${confirmText.slice(0, 300)}"` : `no confirmation was shown; listing still owned ${stillOwned}`,
    );
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (builderId) await svc(`builders?id=eq.${builderId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    if (proId) await svc(`users?id=eq.${proId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  }
  return out;
}

// Sign the staging admin in inside an isolated browser by handing supabase-js a
// session of its own (one password sign-in, never shared with the harness
// cache). The same approach as 351.
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
  page.setDefaultNavigationTimeout(120000);
  return { browser, page };
}
