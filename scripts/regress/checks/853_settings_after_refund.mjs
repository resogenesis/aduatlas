// Contract C1, the refunded state: a customer whose refund has been processed
// still opens /settings and still reads the refund thread there, including the
// reply ADUAtlas wrote.
//
// THE DEFECT (RC3, and the RC4 tree before this pass). /settings sat behind
// <PaidGate>, and PaidGate asks isPaid(), which is paid_at && !refunded_at.
// charge.refunded (api/stripe-webhook.js) sets paid_at null and stamps
// refunded_at, so the moment the refund landed the account page turned into
// "This is part of the paid system." and the refund thread, the one place the
// customer reads ADUAtlas's answer, went with it. 731 files, answers and reads
// the thread BEFORE any refund is stamped, so it cannot see this.
//
// What this proves, on one regress- account it creates and deletes:
//   1. a customer who bought Golden (stamped the way api/stripe-webhook.js
//      stamps a paid checkout session) and was then refunded (stamped exactly
//      as charge.refunded stamps it: paid_at null, refunded_at now) signs in,
//      opens /settings and gets their own account page, not a paywall;
//   2. the refund thread written before the refund, the customer's request and
//      the ADUAtlas reply, both kind 'refund_request', is still on that page.
//
// Rule 2 needs support_messages.kind (migration 0024). On a target without that
// column the thread cannot be seeded as a refund thread, so rule 2 is reported
// as skip there, unless the page is a paywall, which hides any thread and is a
// failure whatever the schema.
//
// Fixtures are named ${ctx.prefix}-853-* and removed at the end (support rows
// cascade from users). A failed sign-in is reported with the typed values
// redacted, because a Playwright fill() error repeats the value it was typing.
// /api/send-email is answered inside the browser, so the page sends no mail.
export const meta = {
  name: "853 a refunded customer keeps /settings and the refund thread (C1)",
  rules: [
    "C1: a refunded customer opens /settings and gets their account page, not a paywall",
    "C1: the refund thread and ADUAtlas's reply stay on /settings after the refund is processed",
  ],
};
const [R_PAGE, R_THREAD] = meta.rules;

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (text, secrets) => secrets.filter(Boolean).reduce((s, v) => s.split(v).join("[redacted]"), String(text || ""));
const oneLine = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n);

export default async function (ctx) {
  const out = [];
  const add = (name, rule, status, detail) => out.push({ name, rule, status, detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `settings-after-refund-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const brief = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`;

  const email = `${ctx.prefix}-853-refunded@regress.aduatlas.test`;
  const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
  const request = `Refund request under the 48 hour policy. regress 853 ${ctx.prefix}`;
  const reply = `ADUAtlas here. Your refund is on its way. regress 853 reply ${ctx.prefix}`;
  let authId = null;
  let rowId = null;
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

    // Bought Golden an hour ago.
    const bought = await svc(`users?id=eq.${rowId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ paid_at: new Date(Date.now() - 3600e3).toISOString(), paid_tier: "roadmap", paid_origin: "purchase", refunded_at: null }),
    });
    if (bought.status >= 300) throw new Error(`paid stamp failed: ${brief(bought)}`);

    // The refund thread as it stands before the refund: the customer's request
    // and ADUAtlas's reply, each with the kind of the thread (C1). The service
    // role writes both, as the admin console writes a reply.
    const t0 = Date.now() - 1800e3;
    const seeded = await svc("support_messages", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        { user_id: rowId, author: "homeowner", body: request, kind: "refund_request", created_at: new Date(t0).toISOString() },
        { user_id: rowId, author: "admin", body: reply, kind: "refund_request", created_at: new Date(t0 + 600e3).toISOString() },
      ]),
    });
    const noKind = seeded.status >= 300 && /kind/i.test(JSON.stringify(seeded.body || ""));
    if (seeded.status >= 300 && !noKind) throw new Error(`refund thread seed failed: ${brief(seeded)}`);

    // The refund lands, stamped exactly as charge.refunded stamps it.
    const refunded = await svc(`users?id=eq.${rowId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ paid_at: null, refunded_at: new Date().toISOString() }),
    });
    if (refunded.status >= 300) throw new Error(`refund stamp failed: ${brief(refunded)}`);

    browser = await ctx.launch();
    const context = await browser.newContext(DESKTOP);
    await context.route("**/api/send-email", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
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

    await page.goto(`${ctx.base}/settings`, { waitUntil: "networkidle" });
    const paywallText = page.getByText(/this is part of (the paid system|golden|platinum|concierge)/i);
    // The account page names the account's own email inside <main>; the app
    // sidebar also shows it, so the sidebar's copy proves nothing.
    const ownEmail = page.locator("main").getByText(email);
    // Whichever the page settles on: the account page, or a paywall.
    await Promise.race([
      ownEmail.first().waitFor({ state: "visible", timeout: 15000 }),
      paywallText.first().waitFor({ state: "visible", timeout: 15000 }),
    ]).catch(() => {});
    const paywall = await paywallText.count();
    const accountShown = await ownEmail.first().isVisible().catch(() => false);
    const path = new URL(page.url()).pathname;
    const heading = await page.locator("main h1").first().innerText({ timeout: 3000 }).then((t) => oneLine(t, 60)).catch(() => "(no h1)");
    const isAccountPage = /your account/i.test(heading);
    const refundState = await page.locator("[data-testid=refund-section]").first().getAttribute("data-refund", { timeout: 3000 }).catch(() => null);
    add(
      "refunded-customer-gets-the-account-page",
      R_PAGE,
      paywall === 0 && isAccountPage && accountShown && path === "/settings" ? "pass" : "fail",
      `on ${path}, heading "${heading}", paywall text ${paywall}, own email on the page ${accountShown}, refund section state ${refundState ?? "(none)"}`
    );

    if (paywall > 0 || !isAccountPage || !accountShown) {
      add("refund-thread-survives-the-refund", R_THREAD, "fail", `the page is not the account page (heading "${heading}", paywall text ${paywall}, own email on the page ${accountShown}), so no refund thread or reply can be read${noKind ? "; the target also lacks support_messages.kind (0024)" : ""}`);
    } else if (noKind) {
      add("refund-thread-survives-the-refund", R_THREAD, "skip", "the target has no support_messages.kind column (migration 0024), so a refund thread cannot be seeded; the account page itself is shown (rule 1)");
    } else {
      const thread = page.locator("[data-testid=refund-thread]");
      const threadShown = await thread.first().waitFor({ state: "visible", timeout: 10000 }).then(() => true, () => false);
      const text = threadShown ? await thread.first().innerText().catch(() => "") : "";
      const hasReply = text.includes(reply);
      const hasRequest = text.includes(request);
      add(
        "refund-thread-survives-the-refund",
        R_THREAD,
        threadShown && hasReply && hasRequest ? "pass" : "fail",
        `refund thread shown ${threadShown}; carries the request ${hasRequest}; carries ADUAtlas's reply ${hasReply}`
      );
    }
    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (rowId) await svc(`users?id=eq.${rowId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    if (authId) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: H }).catch(() => {});
  }
  return out;
}
