// I4-03 (client half) and I4-05b, decision 2h, as the two people see it.
//
// 1. When a message row is written, the page asks /api/send-email for a
//    "message-waiting" mail and does NOT wait for the answer. The check holds
//    every /api/send-email request unanswered in the browser, so a page that
//    awaited it would never show the message. The request must name the
//    conversation and nothing else: no message text, no address. Proven for
//    the homeowner's first message (from the profile dialog) and for the
//    builder's reply (from the portal thread). RC3 fires no such request.
// 2. The homeowner copy (I4-05b). The message dialog and the thread page say
//    the builder CAN read the messages and that replies appear on the page;
//    they do not state as fact that the builder reads them (a released listing
//    has nobody to read them), and they promise no email.
// 3. The builder's empty Messages page makes no claim about email either way:
//    the mail is sent only where it is configured, so "we do not email you"
//    and "we email you" would each be false somewhere.
//
// Fixtures, created with the service role and named ${ctx.prefix}-855-*: a
// Golden homeowner, a builder account (role pro) and an approved listing that
// builder has claimed. Deleted at the end. Nothing here can send mail: the
// browser's /api/send-email requests are held and never reach a server.
// Sign-in errors are reported with the typed values redacted.
import crypto from "node:crypto";

export const meta = {
  name: "855 messaging: message-waiting is fired and never awaited; the copy promises no email",
  rules: [
    "2h: after a homeowner's message is written, the page asks for a message-waiting mail naming only the conversation, and shows the message while that request is unanswered",
    "2h: after a builder's reply is written, the same request is fired for that conversation, and the reply shows while it is unanswered",
    "I4-05b: the message dialog and the thread page say the builder can read the messages and that replies appear on the page, and never state that it reads them",
    "the builder's empty Messages page makes no claim about email either way",
  ],
};

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (text, secrets) => secrets.filter(Boolean).reduce((s, v) => s.split(v).join("[redacted]"), String(text || ""));
const seen = (loc, timeout = 15000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `message-client-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; fixtures cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const brief = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`;

  const made = { auth: [], users: [], builders: [] };
  const mkAccount = async (tag, role) => {
    const email = `${ctx.prefix}-855-${tag}@regress.aduatlas.test`;
    const password = `R${crypto.randomBytes(12).toString("base64url")}!${Date.now().toString(36)}`;
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
    return { tag, email, password, authId, rowId };
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
  // Hold every /api/send-email request unanswered and record what it carried.
  const holdMail = async (context) => {
    const held = [];
    await context.route("**/api/send-email", (route) => {
      const req = route.request();
      let body = null;
      try {
        body = JSON.parse(req.postData() || "null");
      } catch {
        body = req.postData();
      }
      held.push({ route, method: req.method(), bearer: /^Bearer \S+/.test(req.headers().authorization || ""), raw: req.postData() || "", body });
      // Deliberately neither fulfilled nor aborted until the end.
    });
    return held;
  };
  const release = async (held) => {
    for (const h of held) await h.route.abort().catch(() => {});
  };
  const waiting = (held, conversationId) => held.filter((h) => h.body?.template === "message-waiting" && h.body?.data?.conversationId === conversationId);

  let browser;
  const heldAll = [];
  try {
    const home = await mkAccount("home");
    const stamp = await svc(`users?id=eq.${home.rowId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ paid_at: new Date().toISOString(), paid_tier: "roadmap", paid_origin: "purchase", refunded_at: null }),
    });
    if (stamp.status >= 300) throw new Error(`paid stamp failed: ${brief(stamp)}`);
    const pro = await mkAccount("pro", "pro");
    const lr = await svc("builders", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ slug: `${ctx.prefix}-855-claimed`, name: `Regress 855 ${ctx.prefix}`, state: "AZ", profile_status: "approved", active: true, owner_user_id: pro.rowId, claimed_at: new Date().toISOString() }),
    });
    const listing = Array.isArray(lr.body) ? lr.body[0] : null;
    if (!listing?.id) throw new Error(`fixture listing failed: ${brief(lr)}`);
    made.builders.push(listing.id);

    browser = await ctx.launch();

    // ── Rule 4: the builder's empty Messages page, before any thread exists ──
    const bctx = await browser.newContext(DESKTOP);
    const bheld = await holdMail(bctx);
    const bp = await bctx.newPage();
    bp.setDefaultTimeout(20000);
    await signIn(bp, pro);
    await bp.goto(`${ctx.base}/builder/messages`, { waitUntil: "networkidle" });
    const emptyHeading = bp.getByRole("heading", { name: /no messages yet/i });
    const hasEmpty = await seen(emptyHeading);
    const emptyText = hasEmpty ? flat(await bp.locator("section", { has: emptyHeading }).first().innerText()) : "";
    add(
      "builder-empty-state-no-email-claim",
      meta.rules[3],
      hasEmpty && !/e-?mail/i.test(emptyText) && /check/i.test(emptyText),
      hasEmpty ? `empty state: "${emptyText.slice(0, 240)}"` : `no empty Messages state at /builder/messages (ended on ${new URL(bp.url()).pathname})`,
    );

    // ── Rules 1 and 3: the homeowner writes from the claimed profile ─────────
    const hctx = await browser.newContext(DESKTOP);
    const hheld = await holdMail(hctx);
    heldAll.push(hheld, bheld);
    const hp = await hctx.newPage();
    hp.setDefaultTimeout(20000);
    await signIn(hp, home);
    await hp.goto(`${ctx.base}/builders/${listing.slug}`, { waitUntil: "networkidle" });
    await hp.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible" });
    const messageButton = hp.getByRole("button", { name: /message this builder/i });
    const hasButton = await seen(messageButton);
    const firstText = `Hello from ${ctx.prefix}-855, a private question about a detached ADU`;
    let dialogText = "";
    let threadShown = false;
    let threadIntro = "";
    if (hasButton) {
      await messageButton.first().click();
      const dialog = hp.getByRole("dialog");
      await dialog.waitFor({ state: "visible" });
      dialogText = flat(await dialog.innerText());
      await dialog.locator("textarea").fill(firstText);
      await Promise.all([
        hp.waitForURL((u) => /^\/messages\/[0-9a-f-]{36}$/.test(u.pathname), { timeout: 30000 }).catch(() => {}),
        dialog.getByRole("button", { name: /send message/i }).click(),
      ]);
      threadShown = await seen(hp.getByText(firstText));
      threadIntro = flat(await hp.locator("h1 + p").first().innerText().catch(() => ""));
    }
    const conv = await svc(`builder_conversations?builder_id=eq.${listing.id}&select=id`);
    const convId = Array.isArray(conv.body) ? conv.body[0]?.id || null : null;
    await sleep(500);
    const homeReqs = convId ? waiting(hheld, convId) : [];
    const homeLeaks = hheld.some((h) => h.raw.includes(firstText) || h.raw.includes(home.email));
    const homeUnanswered = hheld.length > 0; // every held request is still pending at this point
    add(
      "homeowner-message-fires-unawaited-notification",
      meta.rules[0],
      hasButton && threadShown && Boolean(convId) && homeReqs.length === 1 && homeReqs[0].method === "POST" && homeReqs[0].bearer && !homeLeaks && homeUnanswered
        && Object.keys(homeReqs[0].body.data || {}).join() === "conversationId",
      `entry point ${hasButton}; message shown on the thread page while the request is held ${threadShown}; thread in the database ${Boolean(convId)}; message-waiting requests for it ${homeReqs.length}${homeReqs[0] ? ` (POST ${homeReqs[0].method === "POST"}, bearer token ${homeReqs[0].bearer}, data keys [${Object.keys(homeReqs[0].body.data || {}).join(",")}])` : ""}; message text or email in any request ${homeLeaks}; other send-email requests ${hheld.length - homeReqs.length}`,
    );
    const dialogOk = /can read your message/i.test(dialogText) && /replies appear on your messages page/i.test(dialogText) && !/\breads your message/i.test(dialogText) && !/e-?mail you/i.test(dialogText);
    const threadOk = /can read your messages/i.test(threadIntro) && /replies appear on this page/i.test(threadIntro) && !/\breads your messages/i.test(threadIntro) && !/e-?mail you/i.test(threadIntro);
    add(
      "homeowner-copy-can-read-replies-here",
      meta.rules[2],
      dialogOk && threadOk,
      `dialog: "${dialogText.slice(0, 260)}"; thread page: "${threadIntro.slice(0, 260)}"`,
    );

    // ── Rule 2: the builder replies in the portal thread ─────────────────────
    const replyText = `Reply from the builder, ${ctx.prefix}-855, about the detached ADU`;
    let replyShown = false;
    let hasBox = false;
    if (convId) {
      await bp.goto(`${ctx.base}/builder/messages/${convId}`, { waitUntil: "networkidle" });
      const box = bp.getByLabel(/your message/i);
      hasBox = await seen(box);
      if (hasBox) {
        await box.first().fill(replyText);
        await bp.getByRole("button", { name: /^send$/i }).first().click();
        replyShown = await seen(bp.getByText(replyText));
      }
    }
    await sleep(500);
    const builderReqs = convId ? waiting(bheld, convId) : [];
    const builderLeaks = bheld.some((h) => h.raw.includes(replyText) || h.raw.includes(pro.email) || h.raw.includes(home.email));
    const rows = convId ? await svc(`builder_messages?conversation_id=eq.${convId}&select=author&order=created_at.asc`) : { body: [] };
    const authors = (Array.isArray(rows.body) ? rows.body : []).map((m) => m.author).join(",");
    add(
      "builder-reply-fires-unawaited-notification",
      meta.rules[1],
      hasBox && replyShown && builderReqs.length === 1 && builderReqs[0].bearer && !builderLeaks && authors === "homeowner,builder",
      `reply box ${hasBox}; reply shown while the request is held ${replyShown}; message-waiting requests for the thread ${builderReqs.length}; reply text or an email in any request ${builderLeaks}; authors in the database [${authors}]`,
    );

    for (const h of heldAll) await release(h);
    await hctx.close();
    await bctx.close();
  } finally {
    for (const h of heldAll) await release(h);
    if (browser) await browser.close().catch(() => {});
    for (const id of made.builders) await svc(`builders?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.users) await svc(`users?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.auth) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H }).catch(() => {});
  }
  return out;
}
