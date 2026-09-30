// R3-01, the refund half: a refund request is its own thread, the admin answers
// it in the console, and the customer reads the answer on /settings.
//
// THE DEFECT (RC3, journey j5). /settings filed a refund request as an ordinary
// support_messages row, the same Concierge thread 730 guards. So (a) filing it
// needed the ungated insert 730 closes, (b) Amy's answer was stored but reached
// no one who is not Concierge, because the only homeowner page that reads the
// thread is /support, and (c) a sponsored or comped homeowner, who paid nothing,
// was offered "Request refund" all the same (j5's comp saw "$79 (one time)",
// "Paid" and the button).
//
// THE LOCKED FIX (contract C1). support_messages.kind 'refund_request' may be
// written only with a live entitlement that MONEY bought: paid_origin neither
// 'sponsorship' nor 'admin_comp'. An admin reply carries the kind of the thread
// it answers. The homeowner reads their own messages of both kinds, and the
// refund thread and its replies are shown on /settings.
//
// What this proves, on regress- accounts it creates and deletes:
//   1. a purchased Golden (stamped exactly as api/stripe-webhook.js stamps a
//      paid checkout session) files a refund request from /settings, and it is
//      stored once, as kind 'refund_request';
//   2. an admin finds it in the console, answers it there, and the answer is
//      stored in the refund thread (kind 'refund_request');
//   3. the customer sees that answer on /settings;
//   4. the customer reads both sides of the refund thread through PostgREST;
//   5. positive control: the purchased Golden can add to its refund thread
//      through PostgREST as kind 'refund_request', so a refusal in 7 is about
//      the account and not a broken write path;
//   6. a sponsored Golden and a comped Golden are offered no refund on /settings;
//   7. neither can file one through PostgREST, with kind 'refund_request' or in
//      the RC3 client's shape (no kind), and no thread exists for either. A
//      refusal counts only from a session that answered its own read.
//
// The admin is a regress- account made an admin for this run the way
// api/admin/_create_admin.js promotes one (service role role = 'admin'), and is
// deleted with the rest; no shared persona is used. The comp goes through the
// real admin API (/api/admin/update-user), which records 'admin_comp'; the
// sponsorship is the row a granted partner redemption leaves (see 730).
// /api/send-email is answered inside every browser, so no page sends mail.
import {
  apiToken,
  describeUser,
  dropAccounts,
  guarded,
  insertAs,
  makeAccount,
  oneLine,
  open,
  readAs,
  readUser,
  refusal,
  refused,
  sessionLive,
  settle,
  stampComp,
  stampPurchase,
  stampSponsorship,
  supportKinds,
  supportRows,
  uiLogin,
  waitRows,
} from "./730_support_boundary.mjs";

export const meta = {
  name: "731 refund request thread, answered on /settings (R3-01)",
  rules: [
    "a purchased Golden files a refund request from /settings, stored once as kind 'refund_request'",
    "the admin finds the refund request in the console and answers it there, and the answer is stored in the refund thread (kind 'refund_request')",
    "the customer sees the admin's answer on /settings",
    "the customer can read both sides of their refund thread through PostgREST",
    "a purchased Golden can write to its refund thread through PostgREST as kind 'refund_request' (the write path the refusals below are measured against)",
    "a sponsored Golden and a comped Golden are not offered a refund on /settings",
    "a sponsored Golden and a comped Golden cannot file a refund request",
  ],
};
const [R_FILE, R_ANSWER, R_SEE, R_READ, R_WRITE, R_NO_OFFER, R_NO_FILE] = meta.rules;

const said = (page) => page.locator("[role=alert], [role=status]").allInnerTexts().then((t) => oneLine(t.join(" | "), 200)).catch(() => "");

// The signed-in account page, and proof it is the signed-in one: the account's
// own email on screen (the signed-out variant of /settings has the same heading).
// One reload is allowed: a page that came up blank says nothing about refunds.
const openSettings = async (page, base, email) => {
  let signedIn = false;
  for (let attempt = 0; attempt < 2 && !signedIn; attempt += 1) {
    await open(page, `${base}/settings`);
    signedIn = await page.getByText(email).first().waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);
  }
  const path = new URL(page.url()).pathname;
  const heading = await page.locator("h1").first().innerText({ timeout: 3000 }).then((t) => oneLine(t, 60)).catch(() => "(no h1)");
  const text = signedIn ? "" : oneLine(await page.locator("body").innerText({ timeout: 3000 }).catch(() => ""), 140);
  return { ok: signedIn && path === "/settings", path, heading, text };
};
const notSettings = (w) => `NOT the signed-in account page (${w?.path}, "${w?.heading}"${w?.text ? `, page text "${w.text}"` : ""})`;

// Visible controls that offer a refund. A mailto address or a link to the
// refund POLICY is information, not an offer.
const refundOffers = async (page) => {
  const found = [];
  for (const [kind, loc] of [["button", page.getByRole("button", { name: /refund/i })], ["link", page.getByRole("link", { name: /refund/i })]]) {
    const n = await loc.count();
    for (let i = 0; i < n; i += 1) {
      const el = loc.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;
      const name = oneLine(await el.innerText().catch(() => ""), 60);
      const href = kind === "link" ? await el.getAttribute("href").catch(() => null) : null;
      if (href && /^mailto:/i.test(href)) continue;
      if (kind === "link" && /policy|terms|legal/i.test(name)) continue;
      // A disabled "Request refund" still tells the customer a refund is theirs to ask for.
      const disabled = kind === "button" && (await el.isDisabled().catch(() => false));
      found.push(`${kind} "${name || "(unnamed)"}"${disabled ? " (disabled)" : ""}`);
    }
  }
  return found;
};

// Press the refund control the way a customer does. If the page asks for a few
// words before it files, give them.
const fileRefund = async (ctx, page, acct, tag) => {
  const btn = page.getByRole("button", { name: /refund/i }).first();
  const offered = await btn.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
  if (!offered) return { offered: false, label: "", rows: await supportRows(ctx, acct.id), said: await said(page) };
  const label = oneLine(await btn.innerText().catch(() => ""), 40);
  await btn.click();
  const filed = (rs) => rs.some((m) => m.author === "homeowner");
  let rows = await waitRows(ctx, acct.id, filed, 10000);
  if (!filed(rows)) {
    const reason = page.locator("textarea:visible").first();
    if (await reason.count()) {
      await reason.fill(`${tag} refund reason`);
      const form = reason.locator("xpath=ancestor::form[1]");
      const send = (await form.count())
        ? form.locator("button[type=submit], button:not([type])").last()
        : page.getByRole("button", { name: /send|submit|request|confirm/i }).last();
      await send.click({ timeout: 5000 }).catch(() => {});
      rows = await waitRows(ctx, acct.id, filed, 15000);
    }
  }
  await page.waitForTimeout(1500);
  return { offered: true, label, rows, said: await said(page) };
};

// Find the customer's thread in the admin console and answer it. The console's
// support queue lives on /admin/studies behind a tab today; the search also
// tries every tab and every console page whose name says support or refund, so
// the check follows the thread rather than one layout.
const answerInConsole = async (page, base, email, body) => {
  const tried = [];
  const visibleThread = () => page.getByText(email).first().waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false);
  const searchHere = async () => {
    if (await visibleThread()) return true;
    const tabs = page.getByRole("button", { name: /support|refund/i });
    const n = await tabs.count();
    for (let i = 0; i < n; i += 1) {
      const t = tabs.nth(i);
      tried.push(`${new URL(page.url()).pathname} tab "${oneLine(await t.innerText().catch(() => "?"), 30)}"`);
      await t.click({ timeout: 5000 }).catch(() => {});
      await settle(page);
      if (await visibleThread()) return true;
    }
    return false;
  };
  await open(page, `${base}/admin/studies`);
  let found = await searchHere();
  if (!found) {
    await open(page, `${base}/admin`);
    const hrefs = await page
      .getByRole("link", { name: /support|refund|message/i })
      .evaluateAll((as) => as.map((a) => a.getAttribute("href")).filter((h) => h && h.startsWith("/admin")))
      .catch(() => []);
    for (const h of [...new Set(hrefs)]) {
      await open(page, `${base}${h}`);
      tried.push(h);
      if ((found = await searchHere())) break;
    }
  }
  if (!found) return { found: false, replied: false, tried, said: "" };
  await page.getByText(email).first().click();
  const box = page.getByRole("textbox", { name: /reply|answer|respond/i }).first();
  const boxShown = await box.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
  if (!boxShown) return { found: true, replied: false, tried, said: await said(page) };
  await box.fill(body);
  const form = box.locator("xpath=ancestor::form[1]");
  let clicked = false;
  if (await form.count()) {
    const btn = form.locator("button[type=submit], button:not([type])").first();
    if (await btn.count()) clicked = await btn.click({ timeout: 5000 }).then(() => true).catch(() => false);
  }
  if (!clicked) await box.press("Enter").catch(() => {});
  await settle(page);
  return { found: true, replied: true, tried, said: await said(page) };
};

// The answer on /settings, on load or behind a control that shows the thread.
const seesAnswer = async (page, base, email, body) => {
  const where = await openSettings(page, base, email);
  const visible = () => page.getByText(body).first().waitFor({ state: "visible", timeout: 8000 }).then(() => true).catch(() => false);
  if (await visible()) return { seen: true, how: "on load", where };
  const toggles = page.getByRole("button", { name: /(show|view|open|see|read).*(repl|message|conversation|request|thread|answer)|repl|messages/i });
  const n = await toggles.count();
  for (let i = 0; i < n; i += 1) {
    const t = toggles.nth(i);
    const name = oneLine(await t.innerText().catch(() => ""), 40);
    if (/^\s*request\b.*refund/i.test(name)) continue; // never file a second request
    await t.click({ timeout: 5000 }).catch(() => {});
    if (await visible()) return { seen: true, how: `after "${name}"`, where };
  }
  return { seen: false, how: "", where };
};

export default guarded(async (ctx) => {
  if (!ctx.serviceKey) {
    return meta.rules.map((rule, i) => ({ name: `refund-thread-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; accounts cannot be created or the database read" }));
  }
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const tag = `${ctx.prefix}-rf`;
  const accounts = [];
  let browser = null;

  try {
    const admin = await makeAccount(ctx, tag, "admin", { role: "admin" });
    accounts.push(admin);
    const golden = await makeAccount(ctx, tag, "golden");
    accounts.push(golden);
    const goldenHeld = await stampPurchase(ctx, golden, "roadmap");
    const sponsored = await makeAccount(ctx, tag, "sponsored");
    accounts.push(sponsored);
    const sponsoredHeld = await stampSponsorship(ctx, sponsored);
    const comped = await makeAccount(ctx, tag, "comped");
    accounts.push(comped);

    browser = await ctx.launch();
    const A = await uiLogin(browser, ctx, admin);

    // The comp, through the console's own API as this run's admin.
    const comp = await ctx.fetchJson(`${ctx.base}/api/admin/update-user`, {
      method: "POST",
      headers: { Authorization: `Bearer ${A.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: comped.id, paid: true, paid_tier: "roadmap" }),
    });
    let compedHeld = await readUser(ctx, comped.id);
    let compHow = `comped through /api/admin/update-user (HTTP ${comp.status})`;
    if (!(compedHeld?.paid_at && !compedHeld.refunded_at && compedHeld.paid_tier === "roadmap" && compedHeld.paid_origin === "admin_comp")) {
      compedHeld = await stampComp(ctx, comped, "roadmap");
      compHow = `the admin API did not record a comp (HTTP ${comp.status}), so the row admin_comp_entitlement() leaves was stamped`;
    }

    // ── 1. the purchased Golden files from /settings
    const G = await uiLogin(browser, ctx, golden);
    G.page.on("dialog", (d) => d.accept().catch(() => {}));
    const gSettings = await openSettings(G.page, ctx.base, golden.email);
    const filed = await fileRefund(ctx, G.page, golden, tag);
    const requests = filed.rows.filter((m) => m.author === "homeowner");
    let kinds = await supportKinds(ctx, golden.id);
    const requestKinds = kinds.ok ? kinds.rows.filter((m) => m.author === "homeowner").map((m) => m.kind ?? "null") : [];
    add(
      "purchased-golden-files-refund-request",
      R_FILE,
      gSettings.ok && filed.offered && requests.length === 1 && kinds.ok && requestKinds.length === 1 && requestKinds[0] === "refund_request",
      `${describeUser(goldenHeld)}; /settings ${gSettings.ok ? "signed in" : notSettings(gSettings)}; ` +
        `refund control ${filed.offered ? `"${filed.label}"` : "NOT offered"}; requests stored ${requests.length}; ` +
        `${kinds.ok ? `kind ${requestKinds.join(", ") || "(none)"}` : kinds.detail}${filed.said ? `; page said "${filed.said}"` : ""}`
    );

    // ── 2. the admin answers it in the console
    const replyBody = `${tag} answer: your refund is approved`;
    let answered = { found: false, replied: false, tried: [], said: "" };
    if (requests.length) answered = await answerInConsole(A.page, ctx.base, golden.email, replyBody);
    const rows = await waitRows(ctx, golden.id, (rs) => rs.some((m) => m.author === "admin" && m.body === replyBody), answered.replied ? 15000 : 0);
    const replyStored = rows.some((m) => m.author === "admin" && m.body === replyBody);
    kinds = await supportKinds(ctx, golden.id);
    const replyKind = kinds.ok ? kinds.rows.find((m) => m.author === "admin" && m.body === replyBody)?.kind ?? "null" : null;
    add(
      "admin-answers-refund-request-in-console",
      R_ANSWER,
      answered.found && replyStored && replyKind === "refund_request",
      !requests.length
        ? "no refund request was filed, so there was nothing to answer"
        : `thread ${answered.found ? "found" : "NOT found"} in the console${answered.tried.length ? ` (looked in: ${answered.tried.join(", ")})` : ""}; ` +
            `answer ${replyStored ? "stored" : "NOT stored"}; ${kinds.ok ? `answer kind ${replyStored ? replyKind : "(none)"}` : kinds.detail}${answered.said ? `; console said "${answered.said}"` : ""}`
    );
    await A.context.close();

    // ── 3. the customer sees it on /settings
    const seen = replyStored ? await seesAnswer(G.page, ctx.base, golden.email, replyBody) : { seen: false, how: "", where: null };
    add(
      "customer-sees-answer-on-settings",
      R_SEE,
      seen.seen,
      !replyStored
        ? "no answer was stored, so there was nothing to see"
        : seen.seen
          ? `answer shown on /settings ${seen.how}`
          : `answer NOT shown on /settings (${seen.where?.ok ? "signed-in account page" : notSettings(seen.where)})`
    );
    await G.context.close();

    // ── 4. and reads both sides through PostgREST
    const read = await readAs(ctx, G.token);
    const mine = Array.isArray(read.body) ? read.body : [];
    const hasRequest = mine.some((m) => m.author === "homeowner");
    const hasAnswer = mine.some((m) => m.author === "admin" && m.body === replyBody);
    add(
      "customer-reads-refund-thread",
      R_READ,
      read.status === 200 && hasRequest && hasAnswer,
      `own read HTTP ${read.status}: request ${hasRequest ? "returned" : "NOT returned"}, answer ${hasAnswer ? "returned" : replyStored ? "NOT returned" : "never stored"}`
    );

    // ── 5. the positive control for the refusals below: the same row shape is
    // accepted from an account that money bought.
    const noteBody = `${tag} rest refund note golden`;
    const note = await insertAs(ctx, G.token, { user_id: golden.id, author: "homeowner", body: noteBody, kind: "refund_request" });
    const noteKinds = await supportKinds(ctx, golden.id);
    const noteKind = noteKinds.ok ? noteKinds.rows.find((m) => m.body === noteBody)?.kind ?? "null" : null;
    const writeControl = note.status === 201 && noteKind === "refund_request";
    add(
      "purchased-golden-writes-refund-thread-through-postgrest",
      R_WRITE,
      writeControl,
      `${describeUser(goldenHeld)}; insert kind refund_request: ${refusal(note)}${noteKinds.ok ? `; stored kind ${noteKind ?? "(not stored)"}` : `; ${noteKinds.detail}`}`
    );

    // ── 6-7. money that was never paid is never refunded
    for (const [acct, held, how] of [
      [sponsored, sponsoredHeld, "sponsorship row as a granted partner redemption leaves it"],
      [comped, compedHeld, compHow],
    ]) {
      const S = await uiLogin(browser, ctx, acct);
      const where = await openSettings(S.page, ctx.base, acct.email);
      // Counted twice, a few seconds apart: a page that decides eligibility with
      // a read of its own may draw the control after first paint.
      let offers = [];
      if (where.ok) {
        const first = await refundOffers(S.page);
        await S.page.waitForTimeout(3000);
        offers = [...new Set([...first, ...(await refundOffers(S.page))])];
      }
      add(
        `${acct.label}-not-offered-refund`,
        R_NO_OFFER,
        where.ok && offers.length === 0,
        `${describeUser(held)} (${how}); ${where.ok ? (offers.length ? `offered: ${offers.join(", ")}` : "no refund control on /settings") : notSettings(where)}`
      );
      await S.context.close();

      const token = S.token || (await apiToken(ctx, acct));
      const live = await sessionLive(ctx, token);
      const asRefund = await insertAs(ctx, token, { user_id: acct.id, author: "homeowner", body: `${tag} rest refund ${acct.label}`, kind: "refund_request" });
      const oldShape = await insertAs(ctx, token, { user_id: acct.id, author: "homeowner", body: `${tag} rest refund-no-kind ${acct.label}` });
      const theirs = await supportRows(ctx, acct.id);
      add(
        `${acct.label}-cannot-file-refund`,
        R_NO_FILE,
        live && writeControl && refused(asRefund) && refused(oldShape) && theirs.length === 0,
        `kind refund_request: ${refusal(asRefund)}; RC3 client's shape (no kind): ${refusal(oldShape)}; messages stored ${theirs.length}` +
          `${live ? "" : "; the account's session did not answer its own read, so a refusal proves nothing"}` +
          `${writeControl ? "" : "; the purchased Golden could not write kind refund_request either, so a refusal proves nothing"}`
      );
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    await dropAccounts(ctx, accounts);
  }
  return out;
});
