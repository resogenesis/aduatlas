// I4-04a: the customer's "Refund request received" email must say where the
// reply appears and link to it. After a refund is processed the customer holds
// no plan, signs in to /unlock, and has no other way back to the refund thread,
// which /settings shows whatever the account holds now (contract C1). /settings
// is SignedInOnly, and ?next= returns a signed-out reader there after sign-in.
//
// WHY THIS CHECK RUNS THE HANDLER HERE. Staging has no Resend key, so no mail
// can be observed from the deployed function. This check imports the
// CANDIDATE's api/send-email.js (REGRESS_SENDEMAIL_MODULE overrides the path,
// which is how a copy of RC3's file is shown red) with a placeholder
// RESEND_API_KEY and RESEND_BASE_URL pointed at a sink on 127.0.0.1 inside this
// process, and reads what would have been sent. Nothing reaches Resend. One
// fixture account, ${ctx.prefix}-856-*, is created and deleted.
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

export const meta = {
  name: "856 refund-requested email says the reply appears on the account page and links /settings",
  rules: [
    "I4-04a: the customer's refund-requested email says the reply will appear on their account page and links <base>/settings",
    "the refund-requested email goes only to the signed-in caller's own address (never the request's to) and carries no em-dash or arrow",
  ],
};

const ENV_KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "RESEND_BASE_URL", "RESEND_FROM", "APP_BASE_URL", "OPS_EMAIL"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `refund-email-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const base = ctx.base.replace(/\/+$/, "");

  const mails = [];
  const sink = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        mails.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        mails.push(null);
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: `regress-856-${mails.length}` }));
    });
  });
  await new Promise((r) => sink.listen(0, "127.0.0.1", r));

  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  process.env.SUPABASE_URL = ctx.supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = ctx.serviceKey;
  process.env.APP_BASE_URL = base;
  process.env.RESEND_FROM = "regress-856@rehearsal.aduatlas.test";
  process.env.RESEND_API_KEY = "re_regress_placeholder_not_a_key";
  process.env.RESEND_BASE_URL = `http://127.0.0.1:${sink.address().port}`;
  delete process.env.OPS_EMAIL;

  let authId = null;
  let rowId = null;
  try {
    const email = `${ctx.prefix}-856-home@regress.aduatlas.test`;
    const password = `R${crypto.randomBytes(12).toString("base64url")}!${Date.now().toString(36)}`;
    const c = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix } }),
    });
    authId = c.body?.id || c.body?.user?.id || null;
    if (!authId) throw new Error(`fixture sign-up failed: HTTP ${c.status}`);
    for (let i = 0; i < 12 && !rowId; i += 1) {
      const r = await svc(`users?auth_user_id=eq.${authId}&select=id`);
      rowId = (Array.isArray(r.body) && r.body[0]?.id) || null;
      if (!rowId) await sleep(400);
    }
    let token = null;
    for (let i = 0; i < 6 && !token; i += 1) {
      const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ctx.anonKey }, body: JSON.stringify({ email, password }),
      });
      if (r.status === 429) { await sleep(60000); continue; }
      if (!r.ok) throw new Error(`fixture sign-in failed: HTTP ${r.status}`);
      token = (await r.json()).access_token;
    }
    if (!token) throw new Error("fixture sign-in still rate-limited");

    const modulePath = process.env.REGRESS_SENDEMAIL_MODULE || fileURLToPath(new URL("../../../api/send-email.js", import.meta.url));
    const handler = (await import(`${pathToFileURL(modulePath).href}?regress856=${ctx.prefix}`)).default;
    const attacker = `${ctx.prefix}-856-attacker@regress.aduatlas.test`;
    const req = { method: "POST", headers: { host: "127.0.0.1", authorization: `Bearer ${token}` }, body: { template: "refund-requested", to: attacker, data: {} }, socket: { remoteAddress: "127.0.0.1" } };
    const res = { statusCode: 200, payload: undefined, status(x) { this.statusCode = x; return this; }, json(b) { this.payload = b; return this; }, setHeader() {}, end() {} };
    await handler(req, res);

    const mail = mails[0] || null;
    const html = mail?.html || "";
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const link = `href="${base}/settings"`;
    add(
      "refund-email-links-settings",
      meta.rules[0],
      res.statusCode === 200 && html.includes(link) && /reply will appear on your account page/i.test(text),
      `HTTP ${res.statusCode}; mails ${mails.length}; links ${base}/settings ${html.includes(link)}; says where the reply appears ${/reply will appear on your account page/i.test(text)}; text: "${text.slice(0, 260)}"`,
    );
    const to = [].concat(mail?.to || []).map((x) => String(x).toLowerCase());
    add(
      "refund-email-to-caller-only",
      meta.rules[1],
      mails.length === 1 && to.join() === email.toLowerCase() && !/[—→←]/.test(`${mail?.subject || ""}${html}`),
      `mails ${mails.length}; recipient ${to.join() === email.toLowerCase() ? "the caller's own address" : to.includes(attacker) ? "the request's to (WRONG)" : to.length ? "someone else (WRONG)" : "none"}; em-dash or arrow ${/[—→←]/.test(`${mail?.subject || ""}${html}`)}`,
    );
  } finally {
    sink.close();
    if (rowId) await svc(`users?id=eq.${rowId}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    if (authId) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: H }).catch(() => {});
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  return out;
}
