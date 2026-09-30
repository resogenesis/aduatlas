// The "Request introduction" dialog on a phone (R3-15) and what it says it
// shares (R3-17).
//
// A Golden homeowner fixture (stamped the way api/stripe-webhook.js stamps a
// paid session) signs in through /login at 390 x 664, the viewport where RC3's
// dialog opened below the fold because the overlay was positioned against the
// animated <main> instead of the screen. It opens an approved regress- listing
// (unclaimed, so "Request introduction" is the only contact route), lets the
// page-enter animation finish as a person would, and taps the button without
// scrolling.
//
//   1. The dialog's form is entirely inside the viewport.
//   2. The dialog says the message is what is forwarded and that nothing else
//      is sent, and does not promise the project brief, which the intro-forward
//      email never carries.
//   3. Cancel closes it and nothing was written: no intro_requests row exists.
//
// Fixtures are created with the service role, named ${ctx.prefix}-851-* so they
// share no namespace with another check in the same run (512 uses -intro-*),
// and removed at the end. A failed sign-in is reported with the typed values
// redacted, because a Playwright fill() error repeats the value it was typing.
export const meta = {
  name: "851 introduction dialog on a phone, and what it says it shares",
  rules: [
    "R3-15: the introduction dialog opens inside the viewport at 390 px",
    "R3-17: the introduction dialog describes what the forward actually sends",
  ],
};

const PHONE = { viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (text, secrets) => secrets.filter(Boolean).reduce((s, v) => s.split(v).join("[redacted]"), String(text || ""));

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `intro-dialog-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; fixtures cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const brief = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`;
  const email = `${ctx.prefix}-851-home@regress.aduatlas.test`;
  const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
  let authId = null;
  let rowId = null;
  let listingId = null;
  let browser;
  try {
    const c = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix } }),
    });
    authId = c.body?.id || c.body?.user?.id;
    if (!authId) throw new Error(`fixture sign-up failed: HTTP ${c.status}`);
    for (let i = 0; i < 12 && !rowId; i += 1) {
      const r = await svc(`users?auth_user_id=eq.${authId}&select=id`);
      rowId = Array.isArray(r.body) && r.body[0]?.id;
      if (!rowId) await sleep(400);
    }
    if (!rowId) throw new Error("fixture users row never appeared");
    const stamp = await svc(`users?id=eq.${rowId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ paid_at: new Date().toISOString(), paid_tier: "roadmap", paid_origin: "purchase", refunded_at: null }),
    });
    if (stamp.status >= 300) throw new Error(`paid stamp failed: ${brief(stamp)}`);
    const l = await svc("builders", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ slug: `${ctx.prefix}-851-listing`, name: `Regress 851 ${ctx.prefix}`, state: "AZ", profile_status: "approved", active: true }),
    });
    listingId = Array.isArray(l.body) && l.body[0]?.id;
    if (!listingId) throw new Error(`fixture listing failed: ${brief(l)}`);

    browser = await ctx.launch();
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    try {
      await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
      await page.locator("main input[type=email]").waitFor({ state: "visible" });
      await page.fill("main input[type=email]", email);
      await page.fill("main input[type=password]", password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click("main button[type=submit]")]);
    } catch (e) {
      throw new Error(`sign-in through /login failed: ${redact(e?.message, [password, email]).slice(0, 240)}`);
    }

    await page.goto(`${ctx.base}/builders/${ctx.prefix}-851-listing`, { waitUntil: "networkidle" });
    const open = page.getByRole("button", { name: /request introduction/i }).first();
    await open.waitFor({ state: "visible" });
    // Let every finite animation finish, as a person would before tapping. On
    // RC3 the defect is what the page-enter animation LEAVES behind (fill-mode
    // both keeps a transform on <main>), so waiting does not hide it.
    await page.evaluate(() => Promise.race([
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))),
      new Promise((r) => setTimeout(r, 5000)),
    ]));
    await page.evaluate(() => window.scrollTo(0, 0));
    let how = "tap";
    try {
      await open.tap({ timeout: 10000 });
    } catch {
      // A button that never settles is still pressable by a person; record
      // that the synthetic click was used rather than fail on the gesture.
      how = "dispatched click";
      await open.dispatchEvent("click");
    }
    const heading = page.getByRole("heading", { name: /request an introduction/i }).first();
    await heading.waitFor({ state: "attached" });
    await sleep(400);
    const form = page.locator("form", { has: heading }).first();
    const box = await form.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: window.innerWidth, vh: window.innerHeight, scrollY: window.scrollY };
    });
    const inside = box.top >= 0 && box.left >= 0 && box.bottom <= box.vh && box.right <= box.vw;
    add(
      "intro-dialog-inside-viewport-390",
      meta.rules[0],
      inside,
      `form top ${Math.round(box.top)} bottom ${Math.round(box.bottom)} left ${Math.round(box.left)} right ${Math.round(box.right)} in a ${box.vw}x${box.vh} viewport (scrollY ${Math.round(box.scrollY)}; opened by ${how})`
    );

    const text = ((await form.innerText()) || "").replace(/\s+/g, " ").trim();
    const promisesBrief = /share your project brief|project brief will|send your project brief|and your project brief/i.test(text);
    const saysMessage = /forwards? the message you write/i.test(text);
    const saysNothingElse = /nothing else is sent/i.test(text);
    add(
      "intro-dialog-says-only-the-message-is-sent",
      meta.rules[1],
      !promisesBrief && saysMessage && saysNothingElse,
      `promises the project brief: ${promisesBrief}; says the message is forwarded: ${saysMessage}; says nothing else is sent: ${saysNothingElse}; text "${text.slice(0, 260)}"`
    );

    await form.getByRole("button", { name: /cancel/i }).dispatchEvent("click");
    await sleep(400);
    const stillOpen = await page.getByRole("heading", { name: /request an introduction/i }).count();
    const rows = await svc(`intro_requests?user_id=eq.${rowId}&select=id`);
    const written = Array.isArray(rows.body) ? rows.body.length : -1;
    add(
      "intro-dialog-cancel-writes-nothing",
      meta.rules[0],
      stillOpen === 0 && written === 0,
      `dialog headings left after Cancel: ${stillOpen}; intro_requests rows for the fixture: ${written}`
    );
    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (listingId) await svc(`builders?id=eq.${listingId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    if (rowId) await svc(`users?id=eq.${rowId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    if (authId) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: H }).catch(() => {});
  }
  return out;
}
