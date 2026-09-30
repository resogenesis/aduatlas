// Decision 2h, homeowner to builder messaging, as the two people SEE it (R3-05).
//
// Fixtures, all created here with the service role, named ${ctx.prefix}-850-*
// (no other check in the same run shares that namespace) and removed at the
// end:
//   a Golden homeowner (stamped the way api/stripe-webhook.js stamps a paid
//   session: paid_at, paid_tier roadmap, paid_origin purchase), a builder
//   account (role pro), an approved listing that builder has CLAIMED, and an
//   approved listing nobody has claimed.
//
// 1. The homeowner signs in through /login, opens the claimed profile, presses
//    "Message this builder", writes, and lands on their Messages page with the
//    message on it. The builder signs in, finds the thread from the portal
//    dashboard, reads the message and replies. The homeowner sees the reply.
//    The database holds exactly the homeowner message then the builder reply,
//    and the builder's thread page never shows the homeowner's email address.
// 2. A builder cannot start a conversation: the portal messages view exists and
//    offers no way to start one, the homeowner Messages page sends a builder
//    back to the portal, and the database refuses the builder's own insert into
//    builder_conversations (0011, rule 2).
// 3. A homeowner cannot message an unclaimed listing: the unclaimed profile has
//    no "Message this builder" while the claimed one does, and the database
//    refuses the homeowner's insert against the unclaimed listing (rules 1, 2c).
//
// On RC3 the database refusals in 2 and 3 already hold; the screens do not
// exist (no entry point on the profile, no /messages, no /builder/messages), so
// every rule fails there on its UI half.
//
// Passwords are random per run and the accounts are deleted at the end. A
// failed sign-in is still reported with the typed values redacted, because a
// Playwright fill() error repeats the value it was typing.
export const meta = {
  name: "850 homeowner to builder messaging (2h)",
  rules: [
    "2h: a homeowner starts a conversation from a claimed builder profile and the builder replies inside ADUAtlas",
    "2h: a builder can never open a conversation",
    "2h: a homeowner cannot message an unclaimed listing",
  ],
};

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (text, secrets) => secrets.filter(Boolean).reduce((s, v) => s.split(v).join("[redacted]"), String(text || ""));
// Waits for the locator, unlike isVisible(), which answers at once.
const seen = (loc, timeout = 15000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `messaging-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; fixtures cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const asUser = (token) => ({ apikey: ctx.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
  const brief = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`;

  const made = { auth: [], users: [], builders: [] };
  const mkAccount = async (tag, role) => {
    const email = `${ctx.prefix}-850-${tag}@regress.aduatlas.test`;
    const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
    const c = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST", headers: H,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix, ...(role ? { role } : {}) } }),
    });
    const authId = c.body?.id || c.body?.user?.id;
    if (!authId) throw new Error(`fixture ${tag} sign-up failed: HTTP ${c.status}`);
    made.auth.push(authId);
    let rowId = null;
    for (let i = 0; i < 12 && !rowId; i += 1) {
      const r = await svc(`users?auth_user_id=eq.${authId}&select=id`);
      rowId = Array.isArray(r.body) && r.body[0]?.id;
      if (!rowId) await sleep(400);
    }
    if (!rowId) throw new Error(`fixture ${tag} users row never appeared`);
    made.users.push(rowId);
    let token = null;
    for (let i = 0; i < 6 && !token; i += 1) {
      const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ctx.anonKey }, body: JSON.stringify({ email, password }),
      });
      if (r.status === 429) { await sleep(60000); continue; }
      if (!r.ok) throw new Error(`fixture ${tag} sign-in failed: HTTP ${r.status}`);
      token = (await r.json()).access_token;
    }
    return { tag, email, password, authId, rowId, token };
  };
  const mkListing = async (tag, ownerRowId) => {
    const now = new Date().toISOString();
    const r = await svc("builders", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug: `${ctx.prefix}-850-${tag}`, name: `Regress 850 ${tag} ${ctx.prefix}`, state: "AZ", profile_status: "approved", active: true,
        ...(ownerRowId ? { owner_user_id: ownerRowId, claimed_at: now } : {}),
      }),
    });
    const row = Array.isArray(r.body) ? r.body[0] : null;
    if (!row?.id) throw new Error(`fixture listing ${tag} failed: ${brief(r)}`);
    made.builders.push(row.id);
    return row;
  };
  const signIn = async (page, acct) => {
    try {
      await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
      await page.locator("main input[type=email]").waitFor({ state: "visible" });
      await page.fill("main input[type=email]", acct.email);
      await page.fill("main input[type=password]", acct.password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click("main button[type=submit]")]);
    } catch (e) {
      throw new Error(`sign-in through /login failed for the ${acct.tag} fixture: ${redact(e?.message, [acct.password, acct.email]).slice(0, 240)}`);
    }
  };
  const messageButton = (page) => page.getByRole("button", { name: /message this builder/i });

  let browser;
  try {
    const home = await mkAccount("msg-home");
    const stamp = await svc(`users?id=eq.${home.rowId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ paid_at: new Date().toISOString(), paid_tier: "roadmap", paid_origin: "purchase", refunded_at: null }),
    });
    if (stamp.status >= 300) throw new Error(`paid stamp failed: ${brief(stamp)}`);
    const pro = await mkAccount("msg-pro", "pro");
    const claimed = await mkListing("msg-claimed", pro.rowId);
    const unclaimed = await mkListing("msg-unclaimed", null);

    browser = await ctx.launch();

    // ── Rule 3 (UI half) and rule 1 (homeowner half) ──────────────────────────
    const hctx = await browser.newContext(DESKTOP);
    const hp = await hctx.newPage();
    hp.setDefaultTimeout(20000);
    await signIn(hp, home);

    await hp.goto(`${ctx.base}/builders/${unclaimed.slug}`, { waitUntil: "networkidle" });
    await hp.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible" });
    // The paid controls arrive after the paid read; wait for them before
    // counting what is not there.
    await seen(hp.getByRole("button", { name: /request introduction/i }));
    const onUnclaimed = await messageButton(hp).count();

    await hp.goto(`${ctx.base}/builders/${claimed.slug}`, { waitUntil: "networkidle" });
    await hp.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible" });
    await seen(messageButton(hp));
    const onClaimed = await messageButton(hp).count();

    const refusedUnclaimed = await ctx.fetchJson(`${rest}/builder_conversations?select=id`, {
      method: "POST", headers: { ...asUser(home.token), Prefer: "return=representation" }, body: JSON.stringify({ builder_id: unclaimed.id }),
    });
    add(
      "homeowner-cannot-message-unclaimed",
      meta.rules[2],
      onUnclaimed === 0 && onClaimed === 1 && refusedUnclaimed.status === 403,
      `"Message this builder" on the unclaimed profile: ${onUnclaimed}; on the claimed profile (control): ${onClaimed}; database insert against the unclaimed listing: ${brief(refusedUnclaimed)}`
    );

    // The homeowner writes the first message.
    const firstText = `Hello from ${ctx.prefix}. Do you build detached ADUs in Phoenix?`;
    let homeownerThreadUrl = "";
    let homeownerSaw = false;
    if (onClaimed) {
      await messageButton(hp).first().click();
      const dialog = hp.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      await dialog.locator("textarea").fill(firstText);
      await Promise.all([
        hp.waitForURL((u) => /^\/messages\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 30000 }),
        dialog.getByRole("button", { name: /send message/i }).click(),
      ]);
      homeownerThreadUrl = hp.url();
      homeownerSaw = await seen(hp.getByText(firstText));
    }

    // ── Rule 2 and rule 1 (builder half) ──────────────────────────────────────
    const refusedBuilder = await ctx.fetchJson(`${rest}/builder_conversations?select=id`, {
      method: "POST", headers: { ...asUser(pro.token), Prefer: "return=representation" }, body: JSON.stringify({ builder_id: claimed.id }),
    });
    const bctx = await browser.newContext(DESKTOP);
    const bp = await bctx.newPage();
    bp.setDefaultTimeout(20000);
    await signIn(bp, pro);
    await bp.goto(`${ctx.base}/builder`, { waitUntil: "networkidle" });
    const hasPortalLink = await seen(bp.getByRole("link", { name: /open messages/i }));
    await bp.goto(`${ctx.base}/builder/messages`, { waitUntil: "networkidle" });
    const hasView = await seen(bp.getByRole("heading", { level: 1, name: /^messages$/i }));
    // Let the thread list load, then look for anything that composes or starts:
    // no text box, and no button or link offering to start or write a message.
    if (hasView) await seen(bp.locator('a[href^="/builder/messages/"]'), 10000);
    const composeControls = await bp.locator("textarea, input[type=text]").count();
    const START = /^\s*(new (message|conversation)|start|compose|write|message a homeowner)/i;
    const startControls = (await bp.getByRole("button", { name: START }).count()) + (await bp.getByRole("link", { name: START }).count());
    // A builder sent to the homeowner Messages page is redirected to the portal.
    await bp.goto(`${ctx.base}/messages`, { waitUntil: "networkidle" });
    const redirected = await bp.waitForURL((u) => u.pathname.startsWith("/builder"), { timeout: 10000 }).then(() => true, () => false);
    add(
      "builder-cannot-start-conversation",
      meta.rules[1],
      refusedBuilder.status === 403 && hasView && composeControls === 0 && startControls === 0 && redirected,
      `database insert by the builder into builder_conversations: ${brief(refusedBuilder)}; portal messages view present: ${hasView}; text boxes on the list view: ${composeControls}; start or compose controls: ${startControls}; builder at /messages ends on ${new URL(bp.url()).pathname}`
    );

    // The builder reads and replies.
    const replyText = `Reply from the builder, ${ctx.prefix}. Yes, we build detached ADUs.`;
    let builderSaw = false;
    let builderReplied = false;
    let leaksEmail = null;
    if (hasView) {
      await bp.goto(`${ctx.base}/builder/messages`, { waitUntil: "networkidle" });
      const thread = bp.locator('a[href^="/builder/messages/"]');
      if (await seen(thread)) {
        await thread.first().click();
        builderSaw = await seen(bp.getByText(firstText));
        leaksEmail = (await bp.content()).includes(home.email);
        const box = bp.getByLabel(/your message/i);
        if (await seen(box)) {
          await box.first().fill(replyText);
          await bp.getByRole("button", { name: /^send$/i }).first().click();
          builderReplied = await seen(bp.getByText(replyText));
        }
      }
    }
    let homeownerSawReply = false;
    if (homeownerThreadUrl) {
      await hp.goto(homeownerThreadUrl, { waitUntil: "networkidle" });
      homeownerSawReply = await seen(hp.getByText(replyText));
    }
    const conv = await svc(`builder_conversations?builder_id=eq.${claimed.id}&select=id,homeowner_user_id`);
    const convId = Array.isArray(conv.body) && conv.body[0]?.id;
    const msgs = convId ? await svc(`builder_messages?conversation_id=eq.${convId}&select=author,body&order=created_at.asc`) : { body: [] };
    const authors = (Array.isArray(msgs.body) ? msgs.body : []).map((m) => m.author).join(",");
    add(
      "homeowner-starts-builder-replies",
      meta.rules[0],
      onClaimed === 1 && homeownerSaw && hasPortalLink && builderSaw && leaksEmail === false && builderReplied && homeownerSawReply
        && conv.body?.[0]?.homeowner_user_id === home.rowId && authors === "homeowner,builder",
      `homeowner: entry point ${onClaimed === 1}, own message shown ${homeownerSaw}, reply shown ${homeownerSawReply}; builder: dashboard link ${hasPortalLink}, message shown ${builderSaw}, homeowner email on the builder's page ${leaksEmail === null ? "not checked" : leaksEmail}, reply sent ${builderReplied}; database thread ${convId ? "present" : "absent"}, authors in order [${authors}]`
    );

    await hctx.close();
    await bctx.close();
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const id of made.builders) await svc(`builders?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.users) await svc(`users?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.auth) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H }).catch(() => {});
  }
  return out;
}
