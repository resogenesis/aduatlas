#!/usr/bin/env node
// =============================================================================
// scripts/regress/run.mjs — the BEHAVIOURAL regression suite (lanes C and D).
//
// supabase/tests/ proves the database. This proves what a person actually sees and
// what the deployed endpoints actually do, against a DEPLOYED, NON-PRODUCTION site
// (staging). Every check drives the real UI in an isolated headless Chromium or
// calls the real endpoints, and returns pass/fail per business rule.
//
//   REGRESS_BASE=https://aduatlas-staging.vercel.app \
//   REGRESS_ENV_FILE=~/.config/secrets/aduatlas/staging.env \
//   REGRESS_PERSONAS=~/.config/secrets/aduatlas/staging-personas.json \
//   npm run regress [-- --only <check-name-substring>]
//
// REFUSES PRODUCTION: a base URL on aduatlas.com, or a Supabase URL naming the
// production project, stops the run before anything is contacted. Checks may
// create data (prefixed "regress-") on the target, which is why production is
// never a valid target.
//
// Check contract: scripts/regress/checks/<name>.mjs exports
//   export const meta = { name, rules: [...] }
//   export default async function (ctx) { return [{ name, rule, status: 'pass'|'fail'|'skip', detail }] }
// ctx = { base, supabaseUrl, anonKey, serviceKey, token(persona), creds(persona),
//         launch(), fetchJson(url, opts), prefix, log }
// A check that throws is reported as a FAILURE of that check, never skipped.
//
// NO SECRET REACHES THE OUTPUT. Every line that carries text from a check or an
// error (check headings, result lines, ctx.log, crash lines, a fatal error) and
// everything stored in REGRESS_OUT goes through scrub(), which does two things:
//   1. Cuts the text at Playwright's "Call log:". The call log quotes what was
//      typed, so a failed fill() of a password field would carry the password.
//      A stored stack keeps only its "    at file:line:col" frames after the cut.
//   2. Replaces every value the harness knows to be secret with [redacted]:
//      persona passwords, codes and tokens, secret values from REGRESS_ENV_FILE,
//      the service key, the access tokens it signs in for, and anything shaped
//      like a JWT or a Supabase secret key. The values themselves are never
//      printed, not even to say which one matched.
// Cut, then redact, then shorten, so a length cap never leaves half a secret.
// =============================================================================
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import util from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROD_REF = "gexxagmmcwzrvgrhyvvx";
const expand = (p) => (p || "").replace(/^~(?=$|\/)/, os.homedir());
const die = (msg, code = 2) => { console.error(msg); process.exit(code); };

// ── output hygiene (see the header) ──────────────────────────────────────────
const REDACTED = "[redacted]";
const CALL_LOG = /Call log:|={3,} logs ={3,}/; // the second form is older Playwright's
const FRAME = /^\s+at (?:async )?(?:[^\s()]+ \()?(?:file:\/\/|node:|\/)[^()\n]*:\d+:\d+\)?$/;
const SHAPED = [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, /\bsb_secret_[\w-]{8,}/g];
const SECRET_ENV = /SECRET|SERVICE_ROLE|PASSWORD|TOKEN|PRIVATE/i;
const SECRET_FIELD = /(^|_)(password|secret|token|code)$/i;
let secrets = []; // longest first, so a secret that contains another is masked whole
const addSecret = (v) => {
  if (typeof v !== "string" || v.length < 6) return; // 6 = Supabase Auth's default minimum password length
  const forms = [v, JSON.stringify(v).slice(1, -1), encodeURIComponent(v)];
  secrets = [...new Set([...secrets, ...forms])].sort((a, b) => b.length - a.length);
};
const redact = (s) => {
  let out = String(s ?? "");
  for (const v of secrets) out = out.split(v).join(REDACTED);
  for (const re of SHAPED) out = out.replace(re, REDACTED);
  return out;
};
const cutCallLog = (s) => String(s ?? "").split(CALL_LOG)[0].trimEnd();
const scrub = (s, n = Infinity) => redact(cutCallLog(s)).slice(0, n);
// A stack keeps its frames (file:line:col only, no typed text) after the cut.
const scrubStack = (e, n = Infinity) => {
  const [head, ...rest] = String(e?.stack || e).split(CALL_LOG);
  const frames = rest.join("\n").split("\n").filter((l) => FRAME.test(l));
  return redact([head.trimEnd(), ...frames].join("\n")).slice(0, n);
};
// Node's own report of an uncaught error would print it raw; report it scrubbed.
const fatal = (e) => { console.error(`harness stopped: ${scrubStack(e, 1200)}`); process.exit(1); };
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const base = (process.env.REGRESS_BASE || "").replace(/\/+$/, "");
if (!base) die("REGRESS_BASE is required (a deployed NON-production site, e.g. https://aduatlas-staging.vercel.app).");
if (/(^|\/\/|\.)aduatlas\.com(\/|$|:)/i.test(base) || base.includes(PROD_REF)) die(`REFUSED: ${base} is production. Nothing was contacted.`);

const envFile = expand(process.env.REGRESS_ENV_FILE);
const fileEnv = envFile && fs.existsSync(envFile)
  ? Object.fromEntries(fs.readFileSync(envFile, "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]))
  : {};
for (const [k, v] of Object.entries(fileEnv)) {
  if (SECRET_ENV.test(k)) addSecret(v);
  try { const u = new URL(v); if (u.password) { addSecret(v); addSecret(u.password); addSecret(decodeURIComponent(u.password)); } } catch { /* not a URL */ }
}
const supabaseUrl = process.env.REGRESS_SUPABASE_URL || fileEnv.SUPABASE_URL || "";
const anonKey = process.env.REGRESS_SUPABASE_ANON_KEY || fileEnv.SUPABASE_ANON_KEY || "";
const serviceKey = process.env.REGRESS_SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || "";
addSecret(serviceKey);
if (!supabaseUrl || !anonKey) die("Supabase URL and anon key are required (REGRESS_ENV_FILE or REGRESS_SUPABASE_URL / REGRESS_SUPABASE_ANON_KEY).");
if (supabaseUrl.includes(PROD_REF)) die("REFUSED: the Supabase URL names the production project. Nothing was contacted.");

const personaFile = expand(process.env.REGRESS_PERSONAS);
let personas = {};
if (personaFile && fs.existsSync(personaFile)) {
  // A JSON.parse error quotes part of the file, so it is never printed.
  try { personas = JSON.parse(fs.readFileSync(personaFile, "utf8")); } catch { die("REGRESS_PERSONAS is not valid JSON."); }
}
const collectSecrets = (o) => {
  for (const [k, v] of Object.entries(o || {})) {
    if (v && typeof v === "object") collectSecrets(v);
    else if (SECRET_FIELD.test(k) && typeof v === "string") addSecret(v);
  }
};
collectSecrets(personas);
const tokens = new Map();
const creds = (name) => {
  const p = personas[name];
  if (!p) throw new Error(`persona "${name}" is not in REGRESS_PERSONAS`);
  return p;
};
const token = async (name) => {
  if (tokens.has(name)) return tokens.get(name);
  const p = creds(name);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: anonKey },
      body: JSON.stringify({ email: p.email, password: p.password }),
    });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 60000)); continue; }
    if (!r.ok) throw new Error(`sign-in for ${name} failed: HTTP ${r.status}`);
    const t = (await r.json()).access_token;
    addSecret(t);
    tokens.set(name, t);
    return t;
  }
  throw new Error(`sign-in for ${name} still rate-limited`);
};

const chromium = () => {
  const explicit = expand(process.env.REGRESS_CHROMIUM);
  if (explicit) return explicit;
  const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache).filter((x) => x.startsWith("chromium_headless_shell-")).sort().reverse()) {
      const dir = path.join(cache, d);
      for (const sub of fs.readdirSync(dir)) {
        const exe = path.join(dir, sub, "chrome-headless-shell");
        if (fs.existsSync(exe)) return exe;
      }
    }
  }
  return undefined; // playwright-core's own resolution
};
const launch = async () => {
  const { chromium: pw } = require("playwright-core");
  const browser = await pw.launch({ executablePath: chromium(), headless: true });
  const orig = browser.newContext.bind(browser);
  browser.newContext = async (o) => {
    const ctx = await orig(o);
    await ctx.route("**/*", (route) => (/aduatlas\.com|gexxagmmcwzrvgrhyvvx/i.test(route.request().url()) ? route.abort("blockedbyclient") : route.continue()));
    return ctx;
  };
  return browser;
};
const fetchJson = async (url, opts = {}) => {
  const r = await fetch(url, opts);
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body, headers: r.headers };
};

const ctx = {
  base, supabaseUrl, anonKey, serviceKey, token, creds, launch, fetchJson,
  prefix: `regress-${Date.now().toString(36)}`,
  log: (...m) => console.log(scrub(util.format("   ", ...m))),
};

const files = fs.readdirSync(path.join(HERE, "checks")).filter((f) => f.endsWith(".mjs")).sort()
  .filter((f) => !only || f.includes(only));
const results = [];
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(HERE, "checks", f)).href);
  const name = mod.meta?.name || f;
  console.log(scrub(`== ${name}`));
  try {
    const out = (await mod.default(ctx)) || [];
    for (const r of out) {
      results.push({ check: name, ...r });
      console.log(scrub(`   ${r.status === "pass" ? "ok  " : r.status.toUpperCase().padEnd(4)} ${r.name}${r.status !== "pass" && r.detail ? `  :: ${r.detail}` : ""}`));
    }
  } catch (e) {
    results.push({ check: name, name: `${name} crashed`, rule: "a check that cannot run proves nothing", status: "fail", detail: scrubStack(e, 600) });
    console.log(`   FAIL ${scrub(name)} crashed :: ${scrub(e?.message || e, 300)}`);
  }
}
const n = (s) => results.filter((r) => r.status === s).length;
console.log("-------------------------------------------------------------------");
console.log(`target ${base}`);
console.log(`${n("pass")} passed, ${n("fail")} failed, ${n("skip")} skipped, ${results.length} total`);
console.log("Behavioural lanes C/D for THIS target only; says nothing about production.");
// Every string stored is scrubbed too, including anything nested in a result.
if (process.env.REGRESS_OUT) fs.writeFileSync(expand(process.env.REGRESS_OUT), JSON.stringify({ base, results }, (_k, v) => (typeof v === "string" ? scrub(v) : v), 1));
process.exit(n("fail") ? 1 : 0);
