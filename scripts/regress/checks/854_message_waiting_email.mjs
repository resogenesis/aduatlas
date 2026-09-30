// I4-03, decision 2h: "email notifies a participant that a new message is
// waiting and is not the channel itself". RC3 had no such mail at all, and
// builder_messages.notified_at (0011) was never stamped.
//
// WHY THIS CHECK RUNS THE HANDLER HERE. Staging runs RC3 and has no Resend key,
// so its deployed /api/send-email can neither answer this template nor send
// anything. This check imports the CANDIDATE's api/send-email.js
// (REGRESS_SENDEMAIL_MODULE overrides the path, which is how a copy of RC3's
// file is shown red) and calls its handler with a Vercel-shaped request. Where
// the check needs mail to be "configured", RESEND_API_KEY is a placeholder and
// RESEND_BASE_URL points the Resend SDK at a sink on 127.0.0.1 inside this
// process, which records what would have been sent and answers accept or
// reject. Nothing reaches Resend and no mail leaves this machine. The handler
// reads and writes the TARGET's database (the runner refuses production) and
// touches only the ${ctx.prefix}-854-* fixtures it creates and deletes.
//
// THE FLOOD TEST. Each import with a new query string is a separate module
// instance, which is what a separate serverless instance is to this file: its
// own Resend client and its own in-memory limiter. Six such instances answer the
// same homeowner message at the same moment while the sink holds every send
// open, so a fence that lives in one instance's memory, or a read-then-send-
// then-stamp sequence on notified_at, lets several mails through. The sink
// dedupes on Idempotency-Key exactly as Resend documents it, so the candidate
// is judged on what Resend itself would deliver.
//
// The last rule asks the DEPLOYED endpoint at ctx.base the same questions, in a
// way that can never send mail on any target (a stranger, and a participant on
// a listing that has no owner). It fails on RC3 staging and passes once the
// candidate is deployed; a base that serves no /api reports skip.
//
// Fixtures: a homeowner, a builder account (role pro) that owns an approved
// listing, a second homeowner who is in no conversation, one conversation
// between the first two, and its messages, all written with the service role.
// Passwords are random per run and the accounts are deleted at the end.
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export const meta = {
  name: "854 message-waiting email (2h): participants only, no message text, notified_at only after a send",
  rules: [
    "2h: only a participant of the conversation may ask for a message-waiting email; a stranger, a signed-out caller and an unknown thread are refused",
    "2h: with mail not configured, a participant is answered sent false, reason not-configured, and nothing is stamped",
    "2h: every answer is { sent, reason } only and never carries an email address",
    "2h: the mail goes to the OTHER participant resolved from the record (never the request's to), carries no message text and no homeowner contact detail, and links the recipient's messages page",
    "2h: notified_at is stamped only after Resend accepts: not when mail is unconfigured, not when the send is rejected, and then only on the caller's messages",
    "2h: a thread notified inside the quiet window is not mailed again",
    "2h: concurrent requests for the same waiting message, on separate serverless instances, deliver at most one mail, and that one is stamped",
    "2h: once the recipient has read the earlier notified message, the caller's next message is announced and stamped, also on an instance that already sent one",
    "2h: a send that failed does not use up the retry: once Resend accepts again, the next request on the same instance is sent and stamped",
    "2h: a listing with no owner (released) sends nothing, and the released account is no longer a participant",
    "2h: the deployed /api/send-email answers message-waiting the same way (stranger refused; a participant gets a reason code and no address)",
  ],
};

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_BASE_URL", "RESEND_FROM", "APP_BASE_URL", "OPS_EMAIL"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `message-waiting-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; fixtures cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const brief = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`;
  const base = ctx.base.replace(/\/+$/, "");

  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.SUPABASE_URL = ctx.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ctx.serviceKey;
  process.env.APP_BASE_URL = base;
  process.env.RESEND_FROM = "regress-854@rehearsal.aduatlas.test";
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_BASE_URL;
  delete process.env.OPS_EMAIL;

  // ── The Resend sink ─────────────────────────────────────────────────────────
  // It honours Idempotency-Key the way Resend documents it: a repeat of a key
  // with the same payload gets the first answer and sends nothing; a repeat
  // while the first is still in flight gets 409 concurrent_idempotent_requests;
  // the same key with another payload gets 409 invalid_idempotent_request. A
  // REJECTED request is not stored against its key (Resend's documentation does
  // not say either way). sink.mails holds only requests the sink actually
  // processed, so its length is the number of mails that would have gone out
  // (plus rejected attempts, which carry mode "reject").
  const sink = { mode: "accept", latency: 0, mails: [], deduped: [], keys: new Map() };
  const sinkServer = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      const reply = (code, obj) => {
        res.statusCode = code;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(obj));
      };
      const key = req.headers["idempotency-key"] || null;
      if (key) {
        const prev = sink.keys.get(key);
        if (prev) {
          if (prev.raw !== raw) {
            sink.deduped.push("invalid");
            return reply(409, { statusCode: 409, name: "invalid_idempotent_request", message: "regress sink: key reused with another payload" });
          }
          if (!prev.done) {
            sink.deduped.push("concurrent");
            return reply(409, { statusCode: 409, name: "concurrent_idempotent_requests", message: "regress sink: same key in flight" });
          }
          sink.deduped.push("replayed");
          return reply(200, prev.response);
        }
        sink.keys.set(key, { raw, done: false, response: null });
      }
      const mode = sink.mode;
      sink.mails.push({ path: req.url, mode, key, body });
      const n = sink.mails.length;
      setTimeout(() => {
        if (mode === "reject") {
          if (key) sink.keys.delete(key);
          return reply(422, { statusCode: 422, name: "validation_error", message: "rejected by the regress sink" });
        }
        const response = { id: `regress-854-${n}` };
        if (key) Object.assign(sink.keys.get(key), { done: true, response });
        return reply(200, response);
      }, sink.latency);
    });
  });
  await new Promise((r) => sinkServer.listen(0, "127.0.0.1", r));
  const sinkUrl = `http://127.0.0.1:${sinkServer.address().port}`;

  const modulePath = process.env.REGRESS_SENDEMAIL_MODULE || fileURLToPath(new URL("../../../api/send-email.js", import.meta.url));
  // A fresh module instance per phase: the Resend client and the in-memory
  // limiter are built at module load, so each phase gets its own.
  const load = async (phase) => (await import(`${pathToFileURL(modulePath).href}?regress854=${phase}-${ctx.prefix}`)).default;
  const configure = (on) => {
    if (on) {
      process.env.RESEND_API_KEY = "re_regress_placeholder_not_a_key";
      process.env.RESEND_BASE_URL = sinkUrl;
    } else {
      delete process.env.RESEND_API_KEY;
      delete process.env.RESEND_BASE_URL;
    }
  };

  const answers = [];
  const call = async (handler, { token, body }) => {
    const req = {
      method: "POST",
      headers: { host: "127.0.0.1", "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body,
      socket: { remoteAddress: "127.0.0.1" },
      query: {},
    };
    const res = {
      statusCode: 200,
      payload: undefined,
      headersSent: false,
      status(c) { this.statusCode = c; return this; },
      json(b) { this.payload = b; this.headersSent = true; return this; },
      setHeader() {},
      end() { this.headersSent = true; },
    };
    try {
      await handler(req, res);
    } catch (e) {
      const r = { status: "threw", body: { thrown: String(e?.message || e).slice(0, 120) } };
      answers.push(r);
      return r;
    }
    const r = { status: res.statusCode, body: res.payload };
    answers.push(r);
    return r;
  };
  const say = (r) => `${r.status} ${JSON.stringify(r.body)}`;
  const is = (r, status, sent, reason) => r.status === status && r.body?.sent === sent && r.body?.reason === reason;

  // ── Fixtures ────────────────────────────────────────────────────────────────
  const made = { auth: [], users: [], builders: [] };
  const mkAccount = async (tag, role) => {
    const email = `${ctx.prefix}-854-${tag}@regress.aduatlas.test`;
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
    let token = null;
    for (let i = 0; i < 6 && !token; i += 1) {
      const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ctx.anonKey }, body: JSON.stringify({ email, password }),
      });
      if (r.status === 429) { await sleep(60000); continue; }
      if (!r.ok) throw new Error(`fixture ${tag} sign-in failed: HTTP ${r.status}`);
      token = (await r.json()).access_token;
    }
    if (!token) throw new Error(`fixture ${tag} sign-in still rate-limited`);
    return { tag, email, rowId, token };
  };
  const mkMessage = async (conversationId, author, body) => {
    const r = await svc("builder_messages", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ conversation_id: conversationId, author, body }) });
    const row = Array.isArray(r.body) ? r.body[0] : null;
    if (!row?.id) throw new Error(`fixture message failed: ${brief(r)}`);
    return row.id;
  };
  const stamps = async (conversationId) => {
    const r = await svc(`builder_messages?conversation_id=eq.${conversationId}&select=id,author,notified_at&order=created_at.asc`);
    if (r.status >= 300) throw new Error(`message read failed: ${brief(r)}`);
    return Object.fromEntries(r.body.map((m) => [m.id, m.notified_at]));
  };
  const markRead = async (id) => {
    const r = await svc(`builder_messages?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ read_at: new Date().toISOString() }) });
    if (r.status >= 300) throw new Error(`mark read failed: ${brief(r)}`);
  };

  try {
    const home = await mkAccount("home");
    const pro = await mkAccount("pro", "pro");
    const stranger = await mkAccount("stranger");
    const emails = [home.email, pro.email, stranger.email];
    const lr = await svc("builders", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ slug: `${ctx.prefix}-854-listing`, name: `Regress 854 ${ctx.prefix}`, state: "AZ", profile_status: "approved", active: true, owner_user_id: pro.rowId, claimed_at: new Date().toISOString() }),
    });
    const listing = Array.isArray(lr.body) ? lr.body[0] : null;
    if (!listing?.id) throw new Error(`fixture listing failed: ${brief(lr)}`);
    made.builders.push(listing.id);
    const cr = await svc("builder_conversations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ builder_id: listing.id, homeowner_user_id: home.rowId }) });
    const conv = Array.isArray(cr.body) ? cr.body[0] : null;
    if (!conv?.id) throw new Error(`fixture conversation failed: ${brief(cr)}`);

    // Distinctive words and a phone-shaped number, so a leak cannot hide.
    const homeText = `${ctx.prefix}-854 homeowner private words, call me on 602 555 0142`;
    const builderText = `${ctx.prefix}-854 builder private reply about the quote`;
    const m1 = await mkMessage(conv.id, "homeowner", homeText);
    // The builder's reply exists before the homeowner's notification is sent,
    // so "only the caller's messages are stamped" is actually tested.
    const m2 = await mkMessage(conv.id, "builder", builderText);
    const attacker = `${ctx.prefix}-854-attacker@regress.aduatlas.test`;
    const MW = (extra = {}) => ({ template: "message-waiting", conversationId: conv.id, ...extra });
    // The shape src/lib/email.js actually sends: template, to, data.
    const MWdata = () => ({ template: "message-waiting", data: { conversationId: conv.id } });

    // ── Phase 1: mail NOT configured (staging today) ─────────────────────────
    configure(false);
    const off = await load("off");
    const strangerOff = await call(off, { token: stranger.token, body: MW() });
    const anonOff = await call(off, { token: null, body: MW() });
    const unknownOff = await call(off, { token: home.token, body: { template: "message-waiting", conversationId: crypto.randomUUID() } });
    const homeOff = await call(off, { token: home.token, body: MW() });
    const proOff = await call(off, { token: pro.token, body: MWdata() });
    const afterOff = await stamps(conv.id);

    // ── Phase 2: configured, Resend rejects ─────────────────────────────────
    configure(true);
    sink.mode = "reject";
    const rej = await load("reject");
    const strangerOn = await call(rej, { token: stranger.token, body: MW() });
    const mailsAfterStranger = sink.mails.length;
    const homeRej = await call(rej, { token: home.token, body: MW({ to: attacker }) });
    const afterRej = await stamps(conv.id);
    const rejectAttempts = sink.mails.length;

    // ── Phase 3: configured, Resend accepts. The homeowner's ONE message is
    // announced by BURST requests fired together, each on a fresh module
    // instance (a serverless instance of its own, with an empty in-memory
    // limiter), while the sink holds every send open long enough to overlap.
    // Only a fence that holds across instances can keep this to one mail.
    sink.mode = "accept";
    const BURST = 6;
    const burstHandlers = [];
    for (let i = 0; i < BURST; i += 1) burstHandlers.push(await load(`burst${i}`));
    sink.latency = 800;
    const before3 = sink.mails.length;
    const dedupedBefore3 = sink.deduped.length;
    const burst = await Promise.all(burstHandlers.map((h) => call(h, { token: home.token, body: MW({ to: attacker, data: { message: homeText, to: attacker } }) })));
    sink.latency = 0;
    const burstMails = sink.mails.slice(before3).filter((m) => m.mode === "accept");
    const burstDeduped = sink.deduped.slice(dedupedBefore3);
    const toBuilderMail = burstMails[0] || null;
    const homeAcc = burst.find((r) => r.body?.sent === true) || burst[0];
    const afterHome = await stamps(conv.id);
    const acc = await load("accept");
    const before4 = sink.mails.length;
    const proAcc = await call(acc, { token: pro.token, body: MWdata() });
    const toHomeMail = sink.mails[before4] || null;
    const afterPro = await stamps(conv.id);

    // ── Phase 4: quiet window, on a FRESH instance (empty in-memory limiter),
    // so only the durable notified_at fence can refuse it.
    const m3 = await mkMessage(conv.id, "homeowner", `${ctx.prefix}-854 a second homeowner message`);
    const again = await load("again");
    const before5 = sink.mails.length;
    const homeAgain = await call(again, { token: home.token, body: MW() });
    const mailsAfterAgain = sink.mails.length - before5;
    const afterAgain = await stamps(conv.id);

    // ── Phase 4b: the builder READS the homeowner's first message (read_at is
    // written by the other side only, 0011 builder_messages_mark_read; the
    // service role stands in for the builder here). m3 is still waiting, and
    // is now announced at once, on an instance that already handled m1.
    await markRead(m1);
    const before6b = sink.mails.length;
    const homeAfterRead = await call(burstHandlers[0], { token: home.token, body: MW() });
    const afterReadMails = sink.mails.slice(before6b).filter((m) => m.mode === "accept");
    const afterRead = await stamps(conv.id);

    // ── Phase 4c: a send that fails, then the retry on the SAME instance.
    await markRead(m3);
    const m4 = await mkMessage(conv.id, "homeowner", `${ctx.prefix}-854 a third homeowner message`);
    const retry = await load("retry");
    sink.mode = "reject";
    const retryFailed = await call(retry, { token: home.token, body: MW() });
    const afterRetryFailed = await stamps(conv.id);
    sink.mode = "accept";
    const before6c = sink.mails.length;
    const retryOk = await call(retry, { token: home.token, body: MW() });
    const retryMails = sink.mails.slice(before6c).filter((m) => m.mode === "accept");
    const afterRetry = await stamps(conv.id);

    // ── Phase 5: the listing is released (owner_user_id null), as
    // builders/unlink-owner does.
    const rel = await svc(`builders?id=eq.${listing.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ owner_user_id: null }) });
    if (rel.status >= 300) throw new Error(`release failed: ${brief(rel)}`);
    const released = await load("released");
    const before6 = sink.mails.length;
    const homeReleased = await call(released, { token: home.token, body: MW() });
    const proReleased = await call(released, { token: pro.token, body: MWdata() });
    const mailsAfterRelease = sink.mails.length - before6;
    configure(false);

    // ── Rules ───────────────────────────────────────────────────────────────
    add(
      "non-participant-refused",
      meta.rules[0],
      is(strangerOff, 403, false, "forbidden") && is(anonOff, 401, false, "authentication-required") && is(unknownOff, 403, false, "forbidden")
        && is(strangerOn, 403, false, "forbidden") && mailsAfterStranger === 0,
      `unconfigured: stranger ${say(strangerOff)}; signed out ${say(anonOff)}; unknown thread ${say(unknownOff)}. configured: stranger ${say(strangerOn)}, mails attempted ${mailsAfterStranger}`,
    );
    add(
      "participant-not-configured",
      meta.rules[1],
      is(homeOff, 200, false, "not-configured") && is(proOff, 200, false, "not-configured") && afterOff[m1] === null && afterOff[m2] === null,
      `homeowner ${say(homeOff)}; builder ${say(proOff)}; notified_at after: homeowner message ${afterOff[m1] ?? "null"}, builder message ${afterOff[m2] ?? "null"}`,
    );
    const shapeBad = answers.filter((a) => {
      const b = a.body;
      if (!b || typeof b !== "object") return true;
      const keys = Object.keys(b).sort().join(",");
      const text = JSON.stringify(b);
      return keys !== "reason,sent" || typeof b.sent !== "boolean" || typeof b.reason !== "string" || text.includes("@") || emails.some((e) => text.includes(e));
    });
    add(
      "answer-carries-no-address",
      meta.rules[2],
      answers.length > 0 && shapeBad.length === 0,
      shapeBad.length ? `${shapeBad.length} of ${answers.length} answers break the shape, e.g. ${say(shapeBad[0])}` : `${answers.length} answers, each exactly { sent, reason } with no address`,
    );

    const mailText = (m) => (m?.body ? `${m.body.subject || ""}\n${m.body.html || ""}\n${m.body.text || ""}` : "");
    const toOf = (m) => [].concat(m?.body?.to || []).map((x) => String(x).toLowerCase());
    const noDash = (s) => !/[—→←]/.test(s);
    const tb = mailText(toBuilderMail);
    const th = mailText(toHomeMail);
    const builderLink = `${base}/builder/messages`;
    const homeLink = `${base}/messages`;
    const toBuilderOk = is(homeAcc, 200, true, "sent") && toOf(toBuilderMail).join() === pro.email.toLowerCase()
      && !tb.includes(homeText) && !tb.includes("602 555 0142") && !tb.includes(builderText) && !tb.includes(home.email) && !tb.includes(attacker)
      && tb.includes(`href="${builderLink}"`) && noDash(tb);
    const toHomeOk = is(proAcc, 200, true, "sent") && toOf(toHomeMail).join() === home.email.toLowerCase()
      && !th.includes(builderText) && !th.includes(homeText) && !th.includes(pro.email)
      && th.includes(`href="${homeLink}"`) && !th.includes(builderLink) && noDash(th);
    add(
      "mail-to-other-participant-without-message-text",
      meta.rules[3],
      toBuilderOk && toHomeOk,
      `homeowner writes: ${say(homeAcc)}, mail to ${toBuilderMail ? (toOf(toBuilderMail).join() === pro.email.toLowerCase() ? "the listing owner's account" : toOf(toBuilderMail).includes(attacker) ? "the request's to (WRONG)" : "someone else (WRONG)") : "nobody"}, message text in mail ${tb.includes(homeText) || tb.includes("602 555 0142")}, homeowner email in mail ${tb.includes(home.email)}, links /builder/messages ${tb.includes(`href="${builderLink}"`)}; `
        + `builder writes: ${say(proAcc)}, mail to ${toHomeMail ? (toOf(toHomeMail).join() === home.email.toLowerCase() ? "the homeowner's account" : "someone else (WRONG)") : "nobody"}, reply text in mail ${th.includes(builderText)}, links /messages ${th.includes(`href="${homeLink}"`)}`,
    );
    add(
      "stamped-only-after-accept",
      meta.rules[4],
      afterOff[m1] === null && is(homeRej, 502, false, "send-failed") && rejectAttempts === 1 && afterRej[m1] === null && afterRej[m2] === null
        && Boolean(afterHome[m1]) && afterHome[m2] === null && Boolean(afterPro[m2]) && afterPro[m1] === afterHome[m1],
      `unconfigured: m1 ${afterOff[m1] ?? "null"}; rejected send ${say(homeRej)} (attempts ${rejectAttempts}): m1 ${afterRej[m1] ?? "null"}; accepted homeowner send: m1 ${afterHome[m1] ? "stamped" : "null"}, builder's m2 ${afterHome[m2] ? "stamped (WRONG)" : "null"}; accepted builder send: m2 ${afterPro[m2] ? "stamped" : "null"}`,
    );
    add(
      "quiet-window",
      meta.rules[5],
      is(homeAgain, 200, false, "rate-limited") && mailsAfterAgain === 0 && afterAgain[m3] === null,
      `second homeowner message inside the window: ${say(homeAgain)}, mails ${mailsAfterAgain}, its notified_at ${afterAgain[m3] ?? "null"}`,
    );
    // Every racing request answers sent, rate-limited, or nothing-to-notify (it
    // arrived after the winner stamped notified_at, so nothing was waiting any
    // more). All three are correct; the rule is the one mail and its stamp.
    const burstShapeOk = burst.every((r) => is(r, 200, true, "sent") || is(r, 200, false, "rate-limited") || is(r, 200, false, "nothing-to-notify"));
    add(
      "burst-across-instances-one-mail",
      meta.rules[6],
      burstMails.length === 1 && burst.some((r) => is(r, 200, true, "sent")) && burstShapeOk && Boolean(afterHome[m1]),
      `${BURST} concurrent homeowner requests on ${BURST} fresh instances for one message: mails delivered ${burstMails.length}; answers ${JSON.stringify(burst.reduce((m, r) => ((m[say(r)] = (m[say(r)] || 0) + 1), m), {}))}; held at the sink ${JSON.stringify(burstDeduped.reduce((m, d) => ((m[d] = (m[d] || 0) + 1), m), {}))}; m1 notified_at ${afterHome[m1] ? "stamped" : "null"}`,
    );
    add(
      "read-then-next-message-announced",
      meta.rules[7],
      is(homeAfterRead, 200, true, "sent") && afterReadMails.length === 1 && toOf(afterReadMails[0]).join() === pro.email.toLowerCase() && Boolean(afterRead[m3]),
      `after the builder read m1: ${say(homeAfterRead)}, mails ${afterReadMails.length}${afterReadMails.length ? ` to ${toOf(afterReadMails[0]).join() === pro.email.toLowerCase() ? "the listing owner's account" : "someone else (WRONG)"}` : ""}, m3 notified_at ${afterRead[m3] ? "stamped" : "null"}`,
    );
    add(
      "failed-send-does-not-block-retry",
      meta.rules[8],
      is(retryFailed, 502, false, "send-failed") && afterRetryFailed[m4] === null && is(retryOk, 200, true, "sent") && retryMails.length === 1 && Boolean(afterRetry[m4]),
      `rejected send ${say(retryFailed)}, m4 ${afterRetryFailed[m4] ?? "null"}; retry on the same instance ${say(retryOk)}, mails ${retryMails.length}, m4 ${afterRetry[m4] ? "stamped" : "null"}`,
    );
    add(
      "released-listing-sends-nothing",
      meta.rules[9],
      is(homeReleased, 200, false, "no-recipient") && is(proReleased, 403, false, "forbidden") && mailsAfterRelease === 0,
      `after release: homeowner ${say(homeReleased)}; released account ${say(proReleased)}; mails ${mailsAfterRelease}`,
    );

    // ── Rule 8: the deployed endpoint. The listing now has no owner, so a
    // participant's request cannot send mail on any target.
    const post = (token, body) =>
      ctx.fetchJson(`${base}/api/send-email`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const dStranger = await post(stranger.token, MWdata());
    const dHome = await post(home.token, MWdata());
    const servesApi = [dStranger, dHome].every((r) => r.body && typeof r.body === "object") && ![dStranger.status, dHome.status].some((s) => s === 404 || s === 405);
    if (!servesApi) {
      out.push({ name: "deployed-endpoint", rule: meta.rules[10], status: "skip", detail: `the target does not serve /api/send-email: stranger HTTP ${dStranger.status}, participant HTTP ${dHome.status}` });
    } else {
      const clean = (r) => !JSON.stringify(r.body).includes("@");
      add(
        "deployed-endpoint",
        meta.rules[10],
        is(dStranger, 403, false, "forbidden") && dHome.status === 200 && dHome.body?.sent === false && ["not-configured", "no-recipient"].includes(dHome.body?.reason) && clean(dStranger) && clean(dHome),
        `${base}/api/send-email: stranger ${say(dStranger)}; participant ${say(dHome)}`,
      );
    }
  } finally {
    configure(false);
    sinkServer.close();
    for (const id of made.builders) await svc(`builders?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.users) await svc(`users?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.auth) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H }).catch(() => {});
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return out;
}
