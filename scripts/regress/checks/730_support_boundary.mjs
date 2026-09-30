// R3-01, the Concierge written-support boundary, proven on the deployed target.
//
// THE DEFECT (RC3, journey j7). Migration 0003's support_messages_insert_own
// checks only that the row is the caller's own and written as 'homeowner'. It
// carries no entitlement predicate, so ANY signed-in homeowner can create a
// Concierge support message, and the $500 capability is guarded only by PaidGate
// on /support: a client check that a forged local tier copy defeats. Journey j7
// sent support messages from a free account and from a Golden account that way,
// and both persisted.
//
// THE LOCKED FIX (contract C1). support_messages gains kind ('support' |
// 'refund_request', default 'support'). A homeowner may write kind 'support'
// only with a LIVE Concierge entitlement. LIVE means paid_at set and refunded_at
// null, and CONCIERGE is the level held, whatever its origin (2r: level and origin
// are separate facts). Refund requests are the other kind and are 731's subject.
//
// What this proves, on regress- accounts it creates and deletes:
//   1. accounts WITHOUT a live Concierge entitlement cannot write a support
//      message through PostgREST, in the exact row shape the RC3 client sends
//      (no kind, so the column default applies, which is the tamper): unpaid,
//      purchased Golden, purchased Platinum, sponsored Golden, comped Golden and
//      a Concierge buyer whose payment was refunded;
//   2. the same five non-Concierge accounts cannot send one from /support with the
//      browser's local tier copy forged to 'concierge'. The forgery is the j7
//      tamper: localStorage first, then an in-app navigation, because a full page
//      load re-hydrates the tier from the server;
//   3. afterwards no support thread exists for any of them (j7 condition 2);
//   4. positive control: a purchased Concierge account CAN write and read its
//      thread through PostgREST, so a refusal above is the gate and not a broken
//      path;
//   5. positive control: the same account CAN send from /support and sees its
//      message there, so the page drive above can observe a send;
//   6. a Concierge message is recorded as kind 'support';
//   7. a comped Concierge holds the Concierge level and can write support (the
//      gate reads the level, never the origin).
// A refusal in 1 counts only from a session that answered its own read, as a
// 4xx that is not "no such column", and only when the same row shape was
// accepted for an entitled account in this run (4, and for kind
// 'refund_request' the purchased Concierge account after 6).
//
// How entitlements are stamped. Stripe is not configured on staging, so a
// purchase is stamped with the service role exactly as api/stripe-webhook.js
// recordPurchase stamps a paid checkout session: paid_at, paid_tier, refunded_at
// null and paid_origin 'purchase' in one update, then the origin restatement
// that fills a null. A refund is its charge.refunded stamp (paid_at null,
// refunded_at set). A sponsored Golden is what redeem_partner_access() and
// 0019's partner_redemption_stamp_paid_origin() leave on the row (Golden,
// origin 'sponsorship'); a comp is what 0023's admin_comp_entitlement() leaves
// (origin 'admin_comp'). Every stamp is read back before it is relied on.
//
// Side effects: rows under regress- accounts only, all deleted at the end
// (support_messages cascade with the users row). /api/send-email is answered
// inside the browser so no page can send mail. No shared persona is used.
//
// The helpers below are exported for 731_refund_thread.mjs.
import crypto from "node:crypto";

export const meta = {
  name: "730 Concierge support is gated on the server (R3-01)",
  rules: [
    "an account without a live Concierge entitlement cannot create a support message through PostgREST",
    "an account without a live Concierge entitlement cannot send a support message from /support, even with the browser's tier copy forged to Concierge",
    "no support thread exists for an account without Concierge after it tried",
    "a live Concierge account can write and read its own support thread through PostgREST",
    "a live Concierge account can send from /support and sees its message there",
    "a Concierge support message is recorded as kind 'support'",
    "a comped Concierge holds the Concierge level and can write support (level and origin are separate facts, 2r)",
  ],
};
const [R_REST, R_UI, R_NONE, R_OK_REST, R_OK_UI, R_KIND, R_LEVEL] = meta.rules;

// ── shared helpers (also used by 731) ─────────────────────────────────────────
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const nowIso = () => new Date().toISOString();
export const svcHeaders = (ctx) => ({ apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" });
const brief = (r) => `HTTP ${r.status} ${typeof r.body === "string" ? r.body.slice(0, 140) : JSON.stringify(r.body).slice(0, 140)}`;
export const oneLine = (s, n = 160) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// SECRETS NEVER REACH THE LOG. A Playwright error carries a "Call log" that
// quotes what was typed, so a failed fill() of the password field would print
// the password. Only the text before the call log is ever reported, and every
// password this run generated is masked in it. Every check body runs inside
// `guarded`, so a throw reaches the harness (which prints e.message and stores
// e.stack) already cleaned.
const SECRETS = new Set();
export const safeMessage = (e, n = 160) => {
  let s = String(e?.message ?? e ?? "").split("Call log:")[0];
  for (const v of SECRETS) if (v) s = s.split(v).join("<redacted>");
  return oneLine(s, n);
};
export const guarded = (fn) => async (ctx) => {
  try {
    return await fn(ctx);
  } catch (e) {
    throw new Error(safeMessage(e, 400));
  }
};

const svc = async (ctx, pathAndQuery, { method = "GET", body, prefer } = {}) =>
  ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${pathAndQuery}`, {
    method,
    headers: { ...svcHeaders(ctx), ...(prefer ? { Prefer: prefer } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// A homeowner account that can sign in: GoTrue admin create (the public signup
// refuses the .test domain), then the public.users row handle_new_auth_user()
// makes. `role` other than homeowner is set afterwards with the service role,
// which is how api/admin/_create_admin.js promotes an admin.
export const makeAccount = async (ctx, tag, label, { role } = {}) => {
  const email = `${tag}-${label}@rehearsal.aduatlas.test`;
  const password = `Rg-${crypto.randomUUID()}`;
  SECRETS.add(password);
  const created = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: svcHeaders(ctx),
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: "homeowner", regress: ctx.prefix } }),
  });
  const authId = created.body?.id || created.body?.user?.id || null;
  if (!authId) throw new Error(`could not create the ${label} account: ${brief(created)}`);
  const acct = { label, email, password, authId, id: null };
  for (let i = 0; i < 20 && !acct.id; i += 1) {
    const r = await svc(ctx, `users?select=id&auth_user_id=eq.${authId}`);
    acct.id = Array.isArray(r.body) && r.body[0]?.id;
    if (!acct.id) await sleep(500);
  }
  if (!acct.id) {
    await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: svcHeaders(ctx) }).catch(() => null);
    throw new Error(`the ${label} account's users row never appeared`);
  }
  if (role) {
    const r = await svc(ctx, `users?id=eq.${acct.id}`, { method: "PATCH", body: { role }, prefer: "return=minimal" });
    if (r.status >= 300) throw new Error(`could not set role ${role} on ${label}: ${brief(r)}`);
  }
  return acct;
};

export const dropAccounts = async (ctx, accounts) => {
  for (const a of accounts) {
    if (a?.id) await svc(ctx, `users?id=eq.${a.id}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => null);
    if (a?.authId) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${a.authId}`, { method: "DELETE", headers: svcHeaders(ctx) }).catch(() => null);
  }
};

export const readUser = async (ctx, id) => {
  const r = await svc(ctx, `users?select=role,paid_at,paid_tier,refunded_at,paid_origin&id=eq.${id}`);
  if (r.status >= 300 || !Array.isArray(r.body)) throw new Error(`users read failed: ${brief(r)}`);
  return r.body[0] || null;
};
export const describeUser = (u) =>
  u ? `tier=${u.paid_tier ?? "none"} live=${Boolean(u.paid_at) && !u.refunded_at} origin=${u.paid_origin ?? "not recorded"} refunded=${Boolean(u.refunded_at)}` : "no row";

const patchUser = async (ctx, filter, patch) => {
  const r = await svc(ctx, `users?${filter}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
  if (r.status >= 300) throw new Error(`stamp ${JSON.stringify(patch)} failed: ${brief(r)}`);
};
const expectUser = async (ctx, acct, want) => {
  const u = await readUser(ctx, acct.id);
  const live = Boolean(u?.paid_at) && !u?.refunded_at;
  const ok = u && live === want.live && (want.tier === undefined || u.paid_tier === want.tier) && (want.origin === undefined || u.paid_origin === want.origin);
  if (!ok) throw new Error(`fixture ${acct.label} is not what the check needs: ${describeUser(u)}`);
  return u;
};

// api/stripe-webhook.js recordPurchase: the grant, then the restatement.
export const stampPurchase = async (ctx, acct, tier) => {
  await patchUser(ctx, `id=eq.${acct.id}`, { paid_at: nowIso(), paid_tier: tier, refunded_at: null, paid_origin: "purchase" });
  await patchUser(ctx, `id=eq.${acct.id}&paid_tier=eq.${tier}&paid_at=not.is.null&refunded_at=is.null&paid_origin=is.null`, { paid_origin: "purchase" });
  return expectUser(ctx, acct, { live: true, tier, origin: "purchase" });
};
// api/stripe-webhook.js charge.refunded.
export const stampRefund = async (ctx, acct) => {
  await patchUser(ctx, `id=eq.${acct.id}`, { paid_at: null, refunded_at: nowIso() });
  return expectUser(ctx, acct, { live: false });
};
// What a granted partner redemption leaves on the row (0014 + 0019).
export const stampSponsorship = async (ctx, acct) => {
  await patchUser(ctx, `id=eq.${acct.id}`, { paid_at: nowIso(), paid_tier: "roadmap", refunded_at: null, paid_origin: "sponsorship" });
  return expectUser(ctx, acct, { live: true, tier: "roadmap", origin: "sponsorship" });
};
// What 0023's admin_comp_entitlement() leaves on the row.
export const stampComp = async (ctx, acct, tier) => {
  await patchUser(ctx, `id=eq.${acct.id}`, { paid_at: nowIso(), paid_tier: tier, refunded_at: null, paid_origin: "admin_comp" });
  return expectUser(ctx, acct, { live: true, tier, origin: "admin_comp" });
};

// Every support message on the account, read with the service role. `kind` is
// asked for separately so a target without the column (RC3) still reports its
// rows, and says plainly that the kind is not recorded.
export const supportRows = async (ctx, userId) => {
  const r = await svc(ctx, `support_messages?select=id,author,body,created_at&user_id=eq.${userId}&order=created_at.asc`);
  if (r.status >= 300 || !Array.isArray(r.body)) throw new Error(`support_messages read failed: ${brief(r)}`);
  return r.body;
};
export const supportKinds = async (ctx, userId) => {
  const r = await svc(ctx, `support_messages?select=id,author,body,kind&user_id=eq.${userId}&order=created_at.asc`);
  if (r.status === 200 && Array.isArray(r.body)) return { ok: true, rows: r.body };
  return { ok: false, detail: /kind/.test(JSON.stringify(r.body)) ? "support_messages has no kind column" : brief(r) };
};
export const waitRows = async (ctx, userId, done, ms) => {
  const until = Date.now() + ms;
  let rows = await supportRows(ctx, userId);
  while (!done(rows) && Date.now() < until) {
    await sleep(1000);
    rows = await supportRows(ctx, userId);
  }
  return rows;
};

// A write as the signed-in homeowner, straight to PostgREST.
export const insertAs = (ctx, token, row) =>
  ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/support_messages`, {
    method: "POST",
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
export const readAs = (ctx, token) =>
  ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/support_messages?select=author,body&order=created_at.asc`, {
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${token}` },
  });
// A refusal that proves the GATE, and not something else going wrong:
//   - the caller's session is live (its own read answered 200 just before), so
//     a 401 from a dead token is never mistaken for a refusal;
//   - the answer is a client refusal (4xx), not a server fault (5xx);
//   - it is not "this column does not exist". A target without the kind column
//     refuses a write naming kind for a schema reason, which says nothing about
//     who may write.
// The caller also requires that the same row shape was ACCEPTED for an entitled
// account in the same run, so the write path itself is known to work.
export const schemaMissing = (r) => r.status >= 400 && /PGRST204|42703/.test(String(r.body?.code || "")) && /kind/.test(JSON.stringify(r.body));
export const refused = (r) => r.status >= 400 && r.status < 500 && !schemaMissing(r);
export const refusal = (r) => (r.status < 400 ? `accepted (HTTP ${r.status})` : schemaMissing(r) ? `not exercised: ${brief(r)}` : `refused ${brief(r)}`);
export const sessionLive = async (ctx, token) => (await readAs(ctx, token)).status === 200;

// Signs in through the real /login page. The access token the app now holds is
// read back from supabase-js's own storage so each account signs in once (the
// auth endpoint is rate limited); the password grant is the fallback.
const passwordGrant = async (ctx, acct) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ctx.anonKey },
      body: JSON.stringify({ email: acct.email, password: acct.password }),
    });
    if (r.status === 429) {
      ctx.log(`auth rate limit signing in ${acct.label} (password grant); waiting 60s`);
      await sleep(60000);
      continue;
    }
    if (!r.ok) throw new Error(`sign-in for ${acct.label} failed: HTTP ${r.status}`);
    return (await r.json()).access_token;
  }
  throw new Error(`sign-in for ${acct.label} still rate-limited`);
};
export const apiToken = passwordGrant;

// Navigation that does not depend on the network going quiet. Several agents
// and suites share this target and its per-IP auth limit, and supabase-js
// retries a refused token call in the page, so network idle can take minutes.
// Pages are opened to "load"; each step then waits for the element it needs.
export const settle = (page, ms = 6000) => page.waitForLoadState("networkidle", { timeout: ms }).catch(() => {});
export const open = async (page, url) => {
  await page.goto(url, { waitUntil: "load", timeout: 45000 });
  await settle(page);
};

const stubMail = async (context, base) => {
  const site = new URL(base).origin;
  await context.route(
    (u) => u.origin === site && u.pathname === "/api/send-email",
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );
};

export const uiLogin = async (browser, ctx, acct) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await stubMail(context, ctx.base);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  let stuck = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const opened = await open(page, `${ctx.base}/login`).then(() => true).catch((e) => {
      stuck = `could not open /login: ${safeMessage(e, 120)}`;
      return false;
    });
    if (!opened) {
      ctx.log(`${stuck}; trying again (${acct.label})`);
      continue;
    }
    // The form that holds a password field: the footer's newsletter box is a
    // second email input on every page.
    const form = page.locator("form").filter({ has: page.locator("input[type=password]") }).first();
    const filled = await form
      .waitFor({ state: "visible", timeout: 15000 })
      .then(() => form.locator("input[type=email]").fill(acct.email, { timeout: 15000 }))
      .then(() => form.locator("input[type=password]").fill(acct.password, { timeout: 15000 }))
      .then(() => true)
      .catch((e) => {
        stuck = safeMessage(e, 160); // never the call log: it quotes the typed value
        return false;
      });
    if (!filled) {
      stuck = `${stuck} (at ${new URL(page.url()).pathname}, heading "${oneLine(await page.locator("h1").first().innerText({ timeout: 2000 }).catch(() => ""), 60)}")`;
      ctx.log(`the /login form was not usable for ${acct.label}; loading it again: ${stuck}`);
      continue; // a fresh load of /login
    }
    const grant = page.waitForResponse((r) => new URL(r.url()).pathname === "/auth/v1/token", { timeout: 30000 }).catch(() => null);
    const submitted = await form.locator("button[type=submit]").click({ timeout: 15000 }).then(() => true).catch(() => false);
    const resp = submitted ? await grant : null;
    if (resp?.status() === 429) {
      ctx.log(`auth rate limit signing in ${acct.label} through /login; waiting 60s`);
      await sleep(60000);
      continue;
    }
    if (resp && !resp.ok()) throw new Error(`sign-in for ${acct.label} through /login failed: HTTP ${resp.status()}`);
    const left = await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).then(() => true).catch(() => false);
    if (!left) {
      stuck = `still on /login after ${submitted ? `submitting (auth ${resp ? `HTTP ${resp.status()}` : "no answer"})` : "the submit button could not be pressed"}`;
      ctx.log(`${stuck}; trying again (${acct.label})`);
      continue;
    }
    await settle(page);
    const stored = await page
      .evaluate(() => {
        for (const k of Object.keys(window.localStorage)) {
          if (!/^sb-.+-auth-token$/.test(k)) continue;
          try {
            const v = JSON.parse(window.localStorage.getItem(k));
            return v?.access_token || v?.currentSession?.access_token || null;
          } catch {
            return null;
          }
        }
        return null;
      })
      .catch(() => null);
    return { context, page, token: stored || (await passwordGrant(ctx, acct)) };
  }
  throw new Error(`sign-in for ${acct.label} through /login did not complete in 4 attempts${stuck ? `; last: ${stuck}` : " (rate-limited)"}`);
};

// ── this check's page drive ───────────────────────────────────────────────────
const h1 = (page) => page.locator("h1").first().innerText({ timeout: 3000 }).then((t) => oneLine(t, 80)).catch(() => "(no h1)");

// The j7 tamper: write the local tier copy, then move inside the app so the
// server hydration of a full page load does not run again.
const forgeConciergeAndOpenSupport = async (page) => {
  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    window.localStorage.setItem("aduatlas.mock.paid", "1");
    window.localStorage.setItem("aduatlas.mock.tier", "concierge");
    window.history.pushState({}, "", "/support");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await settle(page);
  await page.waitForTimeout(1500);
  return page.evaluate(() => window.localStorage.getItem("aduatlas.mock.tier")).catch(() => null);
};

// Type a message into the page's message box and send it the way a person
// does. The database says whether anything landed; this says whether the page
// was ever ASKED, because a refusal is only proven by a page that tried:
//   offered   the page showed a message box at all;
//   disabled  it showed one, but its send control is disabled;
//   writes    the write requests that carried this message body, whatever the
//             endpoint, with their status. None means the drive never sent.
// A send that produced no write is retried once with the box refilled.
const sendFromSupport = async (page, body) => {
  const box = page.getByRole("textbox", { name: /message|question/i }).first();
  const offered = await box.waitFor({ state: "visible", timeout: 12000 }).then(() => true).catch(() => false);
  if (!offered) return { offered: false, disabled: false, writes: [], heading: await h1(page), said: "" };
  const writes = [];
  const onResponse = (res) => {
    const req = res.request();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method())) return;
    if (!(req.postData() || "").includes(body)) return;
    writes.push(`${req.method()} ${new URL(res.url()).pathname} ${res.status()}`);
  };
  page.on("response", onResponse);
  let disabled = false;
  try {
    for (let attempt = 0; attempt < 2 && !writes.length; attempt += 1) {
      await box.fill(body);
      const form = box.locator("xpath=ancestor::form[1]");
      const btn = (await form.count()) ? form.locator("button[type=submit], button:not([type])").first() : null;
      const hasBtn = Boolean(btn) && (await btn.count()) > 0;
      if (hasBtn && (await btn.isDisabled().catch(() => false))) {
        disabled = true;
        break;
      }
      const clicked = hasBtn ? await btn.click({ timeout: 5000 }).then(() => true).catch(() => false) : false;
      if (!clicked) await box.press("Enter").catch(() => {});
      const until = Date.now() + 10000;
      while (!writes.length && Date.now() < until) await page.waitForTimeout(250);
    }
    await settle(page);
    await page.waitForTimeout(1000);
  } finally {
    page.off("response", onResponse);
  }
  const said = await page.locator("[role=alert], [role=status]").allInnerTexts().then((t) => oneLine(t.join(" | "), 160)).catch(() => "");
  return { offered: true, disabled, writes, heading: await h1(page), said };
};
const describeSend = (s) =>
  `page "${s.heading}"; message box ${s.offered ? "offered" : "not offered"}${s.disabled ? ", send control disabled" : ""}` +
  `${s.offered && !s.disabled ? `; write ${s.writes.length ? s.writes.join(", ") : "NEVER SENT by the page drive"}` : ""}${s.said ? `; page said "${s.said}"` : ""}`;

export default guarded(async (ctx) => {
  if (!ctx.serviceKey) {
    return meta.rules.map((rule, i) => ({ name: `support-boundary-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; accounts cannot be created or the database read" }));
  }
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const tag = `${ctx.prefix}-sb`;
  const accounts = [];
  let browser = null;

  // Accounts without a live Concierge entitlement. `ui` also drives the forged
  // /support page; the refunded buyer is proven through PostgREST only.
  const NEGATIVE = [
    { label: "unpaid", ui: true, stamp: (a) => expectUser(ctx, a, { live: false }) },
    { label: "golden", ui: true, stamp: (a) => stampPurchase(ctx, a, "roadmap") },
    { label: "platinum", ui: true, stamp: (a) => stampPurchase(ctx, a, "report") },
    { label: "sponsored", ui: true, stamp: (a) => stampSponsorship(ctx, a) },
    { label: "comped", ui: true, stamp: (a) => stampComp(ctx, a, "roadmap") },
    { label: "refunded-concierge", ui: false, stamp: async (a) => { await stampPurchase(ctx, a, "concierge"); return stampRefund(ctx, a); } },
  ];

  try {
    const fixtures = {};
    for (const n of NEGATIVE) {
      const a = await makeAccount(ctx, tag, n.label);
      accounts.push(a);
      fixtures[n.label] = { acct: a, held: await n.stamp(a) };
    }
    const concierge = await makeAccount(ctx, tag, "concierge");
    accounts.push(concierge);
    const conciergeHeld = await stampPurchase(ctx, concierge, "concierge");
    const compConcierge = await makeAccount(ctx, tag, "comped-concierge");
    accounts.push(compConcierge);
    const compConciergeHeld = await stampComp(ctx, compConcierge, "concierge");

    browser = await ctx.launch();

    // ── 4-6. the positive control first: it proves the page drive can observe a send
    const C = await uiLogin(browser, ctx, concierge);
    const cRestBody = `${tag} rest concierge`;
    const cRest = await insertAs(ctx, C.token, { user_id: concierge.id, author: "homeowner", body: cRestBody });
    const cRead = await readAs(ctx, C.token);
    const cReadOk = cRead.status === 200 && Array.isArray(cRead.body) && cRead.body.some((m) => m.body === cRestBody);
    // The write path works for the RC3 client's row shape: a refusal of the same
    // shape below is about who wrote it.
    const restControl = cRest.status === 201 && cReadOk;
    add(
      "concierge-writes-and-reads-through-postgrest",
      R_OK_REST,
      restControl,
      `${describeUser(conciergeHeld)}; insert ${brief(cRest)}; own read ${cRead.status}, message ${cReadOk ? "returned" : "NOT returned"}`
    );

    const cUiBody = `${tag} ui concierge`;
    await open(C.page, `${ctx.base}/support`);
    const cSend = await sendFromSupport(C.page, cUiBody);
    const cRows = await waitRows(ctx, concierge.id, (rs) => rs.some((m) => m.body === cUiBody), 15000);
    const cShown = cSend.offered && (await C.page.getByText(cUiBody).first().waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false));
    const uiControl = cSend.offered && cSend.writes.length > 0 && cRows.some((m) => m.body === cUiBody);
    add(
      "concierge-sends-from-support-page",
      R_OK_UI,
      uiControl && cShown,
      `${describeSend(cSend)}; stored ${cRows.some((m) => m.body === cUiBody) ? "yes" : "no"}; shown on the page ${cShown ? "yes" : "no"}`
    );
    await C.context.close();

    const kinds = await supportKinds(ctx, concierge.id);
    const cKinds = kinds.ok ? kinds.rows.map((m) => m.kind ?? "null") : [];
    add(
      "concierge-message-kind-is-support",
      R_KIND,
      kinds.ok && cKinds.length >= 1 && cKinds.every((k) => k === "support"),
      kinds.ok ? `kinds recorded: ${cKinds.join(", ") || "(no rows)"}` : kinds.detail
    );

    // A control for the other kind, taken after the kind assertion above: an
    // account that money bought CAN open a refund request through PostgREST, so
    // the unpaid account's refusal of that row shape below is about the account.
    const cRefund = await insertAs(ctx, C.token, { user_id: concierge.id, author: "homeowner", body: `${tag} rest concierge refund control`, kind: "refund_request" });
    const refundControl = cRefund.status === 201;

    // ── 7. level, not origin
    const cc = await apiToken(ctx, compConcierge);
    const ccBody = `${tag} rest comped concierge`;
    const ccIns = await insertAs(ctx, cc, { user_id: compConcierge.id, author: "homeowner", body: ccBody });
    const ccRows = await supportRows(ctx, compConcierge.id);
    add(
      "comped-concierge-can-write-support",
      R_LEVEL,
      ccIns.status === 201 && ccRows.some((m) => m.body === ccBody),
      `${describeUser(compConciergeHeld)}; insert ${brief(ccIns)}; stored ${ccRows.some((m) => m.body === ccBody) ? "yes" : "no"}`
    );

    // ── 1-3. every account without a live Concierge entitlement
    for (const n of NEGATIVE) {
      const { acct, held } = fixtures[n.label];
      const S = n.ui ? await uiLogin(browser, ctx, acct) : { token: await apiToken(ctx, acct) };

      const restBody = `${tag} rest ${n.label}`;
      const live = await sessionLive(ctx, S.token);
      const ins = await insertAs(ctx, S.token, { user_id: acct.id, author: "homeowner", body: restBody });
      const attempts = [`no kind (the RC3 client's row): ${refusal(ins)}`];
      let restOk = live && restControl && refused(ins);
      if (n.label === "unpaid") {
        // Nor may an account with nothing on it open the other kind of thread.
        const asRefund = await insertAs(ctx, S.token, { user_id: acct.id, author: "homeowner", body: `${restBody} as refund`, kind: "refund_request" });
        attempts.push(`kind refund_request: ${refusal(asRefund)}`);
        restOk = restOk && refundControl && refused(asRefund);
        if (!refundControl) attempts.push(`a purchased account could not write kind refund_request either (${refusal(cRefund)}), so that refusal proves nothing`);
      }
      let rows = await supportRows(ctx, acct.id);
      restOk = restOk && !rows.some((m) => m.body.startsWith(restBody));
      add(
        `no-concierge-postgrest-refused-${n.label}`,
        R_REST,
        restOk,
        `${describeUser(held)}; ${attempts.join("; ")}` +
          `${live ? "" : "; the account's session did not answer its own read, so a refusal proves nothing"}` +
          `${restControl ? "" : "; the Concierge control could not write this row shape either, so a refusal proves nothing"}`
      );

      if (n.ui) {
        const uiBody = `${tag} ui ${n.label}`;
        const forged = await forgeConciergeAndOpenSupport(S.page);
        const sent = await sendFromSupport(S.page, uiBody);
        rows = await waitRows(ctx, acct.id, (rs) => rs.some((m) => m.body === uiBody), sent.writes.length ? 8000 : 0);
        const landed = rows.some((m) => m.body === uiBody);
        // Refused = nothing stored AND the page either offered no way to send or
        // really sent and was turned down. A box that never sent proves nothing.
        const exercised = !sent.offered || sent.disabled || sent.writes.length > 0;
        add(
          `no-concierge-forged-support-page-refused-${n.label}`,
          R_UI,
          !landed && exercised && uiControl,
          `local tier after forging: ${forged ?? "none"}; ${describeSend(sent)}; message ${landed ? "STORED" : "not stored"}` +
            `${exercised ? "" : "; the page drive never sent, so nothing was proven"}${uiControl ? "" : "; the Concierge control could not send from /support either, so this refusal proves nothing"}`
        );
        await S.context.close();
      }

      rows = await supportRows(ctx, acct.id);
      add(
        `no-concierge-no-support-thread-${n.label}`,
        R_NONE,
        rows.length === 0,
        rows.length ? `${rows.length} message(s) stored: ${rows.map((m) => `"${oneLine(m.body, 60)}"`).join(", ")}` : "no support message stored"
      );
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await dropAccounts(ctx, accounts);
  }
  return out;
});
