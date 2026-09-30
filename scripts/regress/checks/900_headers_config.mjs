// 900 — security headers and staging noindex, proven from vercel.json itself.
//
// The suite can never point at production (run.mjs refuses aduatlas.com), so the
// one promise this package makes about production, that aduatlas.com and
// www.aduatlas.com keep their robots.txt and stay indexable, cannot be observed on
// any target. It is proven here instead, from the config the deployment is built
// from: every header rule and redirect in vercel.json is evaluated for production
// hosts and for staging and preview hosts, the way Vercel evaluates them.
//
// How Vercel applies vercel.json (docs, "vercel.json", and @vercel/routing-utils,
// the package that compiles it): redirects, then headers, then the filesystem, then
// rewrites. So headers match the ORIGINAL path, a redirect ends the request, and a
// rewrite whose source is a static file never fires, which is why a non-production
// /robots.txt is a host-conditional REDIRECT to /robots-staging.txt and not a
// rewrite: public/robots.txt exists and would always win. A route applies when
// every "has" condition holds and none of its "missing" conditions does (Build
// Output API: missing is "conditions of the HTTP request that must NOT exist"), so
// a rule with missing [aduatlas.com, www.aduatlas.com] applies on every other host.
// Route sources match case-insensitively unless caseSensitive is set. A has/missing
// string "value" is a regex anchored at both ends; this check evaluates every
// condition both as that regex and as an exact string and requires the same
// answer, so a hostname written in a way that depends on the reading (an escaped
// dot, say) fails here.
//
// Two header rules that set the same key for the same request are refused: which
// one wins is Vercel's override behaviour, and this config is written so that it
// never has to rely on it (production and non-production CSP rules are mutually
// exclusive by host, page and API rules by path).
//
// It reads vercel.json, index.html and public/ from the tree this file sits in, not
// from the target. REGRESS_VERCEL_JSON=<tree>/vercel.json points it at another
// tree (that tree's index.html and public/ are read beside it); RC2's config fails
// every row except the production ones, which were already right and must stay so.
//
// Also exports the header rules 910, 920 and 930 hold a live response to.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const meta = {
  name: "900 headers config: production stays indexable, everything else is noindex, every response is protected",
  rules: [
    "production hosts (aduatlas.com, www.aduatlas.com) get no X-Robots-Tag and keep public/robots.txt",
    "every other host gets X-Robots-Tag noindex, nofollow and a disallow-all robots.txt",
    "every page and /api response carries CSP (enforcing), HSTS, nosniff, Referrer-Policy, Permissions-Policy and frame protection",
    "the production CSP names only the production Supabase project",
    "every inline script in index.html is allowed by hash, nothing by 'unsafe-inline'",
  ],
};

export const PROD_HOSTS = ["aduatlas.com", "www.aduatlas.com"];
export const PROD_REF = "gexxagmmcwzrvgrhyvvx";
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, "../../..");

// ---------------------------------------------------------------------------
// Header rules for one response. kind is "page" (anything the SPA or a static file
// answers) or "api" (a function under /api). Returns a list of problems; empty is
// a pass. Header names are matched case-insensitively.
// ---------------------------------------------------------------------------
export const parseCsp = (value) => {
  const map = new Map();
  for (const part of String(value || "").split(";")) {
    const [name, ...sources] = part.trim().split(/\s+/).filter(Boolean);
    if (name && !map.has(name.toLowerCase())) map.set(name.toLowerCase(), sources);
  }
  return map;
};

const lower = (headers) => {
  const out = {};
  if (typeof headers?.forEach === "function" && !(headers instanceof Map) && typeof headers.get === "function") {
    headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
  } else {
    for (const [k, v] of Object.entries(headers || {})) out[k.toLowerCase()] = v;
  }
  return out;
};

export const SECURITY_HEADERS = [
  "content-security-policy",
  "strict-transport-security",
  "x-content-type-options",
  "referrer-policy",
  "permissions-policy",
  "x-frame-options",
];

// One problem list per header, so a check can report each header on its own row.
export const headerProblems = (kind, rawHeaders) => {
  const h = lower(rawHeaders);
  const p = Object.fromEntries(SECURITY_HEADERS.map((k) => [k, []]));

  const cspRaw = h["content-security-policy"];
  if (!cspRaw) {
    p["content-security-policy"].push(h["content-security-policy-report-only"] ? "only Report-Only, not enforcing" : "absent");
  } else {
    const csp = parseCsp(cspRaw);
    const src = (d) => csp.get(d) || csp.get("default-src") || null;
    if (!csp.has("default-src")) p["content-security-policy"].push("no default-src");
    const script = src("script-src") || [];
    if (script.includes("'unsafe-inline'")) p["content-security-policy"].push("script-src allows 'unsafe-inline'");
    if (script.includes("'unsafe-eval'")) p["content-security-policy"].push("script-src allows 'unsafe-eval'");
    if (script.some((s) => s === "*" || s === "https:" || s === "http:" || s === "data:")) p["content-security-policy"].push(`script-src too broad (${script.join(" ")})`);
    const obj = src("object-src") || [];
    if (!(obj.length === 1 && obj[0] === "'none'")) p["content-security-policy"].push("object-src is not 'none'");
    if (!csp.has("base-uri")) p["content-security-policy"].push("no base-uri");
    const fa = csp.get("frame-ancestors");
    if (!fa) p["content-security-policy"].push("no frame-ancestors");
    else if (fa.some((s) => s !== "'self'" && s !== "'none'")) p["content-security-policy"].push(`frame-ancestors lets another site frame this (${fa.join(" ")})`);
    if (kind === "api") {
      if ((csp.get("default-src") || []).join(" ") !== "'none'") p["content-security-policy"].push("an API response should have default-src 'none'");
      if ((fa || []).join(" ") !== "'none'") p["content-security-policy"].push("an API response should have frame-ancestors 'none'");
    }
  }

  const hsts = h["strict-transport-security"];
  const maxAge = Number((/max-age=(\d+)/i.exec(hsts || "") || [])[1]);
  if (!hsts) p["strict-transport-security"].push("absent");
  else if (!(maxAge >= 31536000)) p["strict-transport-security"].push(`max-age under one year (${hsts})`);

  if ((h["x-content-type-options"] || "").trim().toLowerCase() !== "nosniff") p["x-content-type-options"].push(h["x-content-type-options"] ? `not nosniff (${h["x-content-type-options"]})` : "absent");

  const rp = (h["referrer-policy"] || "").split(",").pop().trim().toLowerCase();
  if (!rp) p["referrer-policy"].push("absent");
  else if (!["no-referrer", "same-origin", "strict-origin", "strict-origin-when-cross-origin"].includes(rp)) p["referrer-policy"].push(`leaks the path cross-origin (${rp})`);

  const pp = h["permissions-policy"];
  if (!pp) p["permissions-policy"].push("absent");
  else for (const f of ["camera", "microphone", "geolocation", "payment"]) {
    if (!new RegExp(`(^|,)\\s*${f}=\\(\\)`).test(pp)) p["permissions-policy"].push(`${f} not disabled`);
  }

  const xfo = (h["x-frame-options"] || "").trim().toUpperCase();
  const fa = parseCsp(cspRaw).get("frame-ancestors") || [];
  if (!xfo) p["x-frame-options"].push("absent");
  else if (!["DENY", "SAMEORIGIN"].includes(xfo)) p["x-frame-options"].push(`unrecognised (${xfo})`);
  else if (kind === "api" && xfo !== "DENY") p["x-frame-options"].push("an API response should be DENY");
  else if (fa.length && ((fa[0] === "'none'" && xfo !== "DENY") || (fa[0] === "'self'" && xfo !== "SAMEORIGIN"))) p["x-frame-options"].push(`disagrees with frame-ancestors ${fa.join(" ")}`);
  return p;
};

export const noindexProblem = (rawHeaders) => {
  const v = (lower(rawHeaders)["x-robots-tag"] || "").toLowerCase();
  if (!v) return "no X-Robots-Tag";
  if (!/\bnoindex\b/.test(v) || !/\bnofollow\b/.test(v)) return `X-Robots-Tag is "${v}", not noindex, nofollow`;
  return null;
};

// A robots.txt that closes the whole site to every crawler: a "User-agent: *" group
// whose only rule is "Disallow: /".
export const disallowAllProblem = (text) => {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  if (/^\s*<!doctype html|<html/i.test(text || "")) return "served the SPA (HTML), not a robots.txt";
  let inStar = false; const rules = [];
  for (const l of lines) {
    const [k, ...rest] = l.split(":"); const v = rest.join(":").trim(); const key = k.trim().toLowerCase();
    if (key === "user-agent") inStar = v === "*";
    else if (inStar && (key === "allow" || key === "disallow")) rules.push(`${key}:${v}`);
  }
  if (!rules.length) return "no rules for User-agent: *";
  if (rules.length !== 1 || rules[0] !== "disallow:/") return `User-agent: * has ${rules.length} rules (${rules.slice(0, 3).join(", ")}${rules.length > 3 ? ", ..." : ""}), not just Disallow: /`;
  return null;
};

// ---------------------------------------------------------------------------
// vercel.json evaluation.
// ---------------------------------------------------------------------------
// path-to-regexp subset: literal text, balanced (regex) groups, and :name. Anything
// else in a header or redirect source is refused rather than guessed.
export const sourceToRegex = (source) => {
  let out = ""; let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === "(") {
      let depth = 0; let j = i;
      for (; j < source.length; j += 1) {
        if (source[j] === "\\") { j += 1; continue; }
        if (source[j] === "(") depth += 1;
        if (source[j] === ")") { depth -= 1; if (depth === 0) break; }
      }
      if (depth !== 0) throw new Error(`unbalanced group in ${source}`);
      out += source.slice(i, j + 1); i = j + 1;
    } else if (c === ":") {
      const m = /^:([A-Za-z_]\w*)/.exec(source.slice(i));
      if (!m) throw new Error(`bad parameter in ${source}`);
      i += m[0].length;
      if (/[*+?]/.test(source[i] || "")) throw new Error(`modifier after :${m[1]} not evaluated here (${source})`);
      out += "([^/]+?)";
    } else if (/[*+?{}]/.test(c)) {
      throw new Error(`"${c}" outside a group not evaluated here (${source})`);
    } else {
      out += c.replace(/[.\\^$|[\]]/g, "\\$&"); i += 1;
    }
  }
  return new RegExp(`^${out}$`, "i");
};

const condHolds = (cond, host, mode) => {
  if (cond.type !== "host") throw new Error(`condition type "${cond.type}" not evaluated here`);
  if (cond.value === undefined) return true;
  if (typeof cond.value !== "string") throw new Error("object-valued host condition not evaluated here");
  return mode === "exact" ? host === cond.value : new RegExp(`^${cond.value}$`).test(host);
};
const ruleApplies = (rule, pathname, host, mode) =>
  sourceToRegex(rule.source).test(pathname) &&
  (rule.has || []).every((c) => condHolds(c, host, mode)) &&
  !(rule.missing || []).some((c) => condHolds(c, host, mode));

// What the config does for one request: a redirect, or the headers it adds, plus
// any key two rules both set.
export const evaluate = (config, host, pathname, mode = "regex") => {
  for (const r of config.redirects || []) {
    if (ruleApplies(r, pathname, host, mode)) return { redirect: { to: r.destination, status: r.statusCode || (r.permanent === false ? 307 : 308) }, headers: {}, clashes: [] };
  }
  const headers = {}; const setBy = {}; const clashes = [];
  (config.headers || []).forEach((r, idx) => {
    if (!ruleApplies(r, pathname, host, mode)) return;
    for (const { key, value } of r.headers) {
      const k = key.toLowerCase();
      if (k in headers) clashes.push(`${key} set by header rules #${setBy[k]} and #${idx}`);
      headers[k] = value; setBy[k] = idx;
    }
  });
  return { redirect: null, headers, clashes };
};

export const NONPROD_HOSTS = [
  "aduatlas-staging.vercel.app",
  "aduatlas.vercel.app",
  "aduatlas-git-some-branch-team.vercel.app",
  "aduatlas-k3j2h1g0f-team.vercel.app",
  "staging.aduatlas.com",
  "aduatlas.com.evil.example",
  "localhost",
];
export const PAGE_PATHS = ["/", "/about", "/rules/ca/los-angeles", "/builders/some-builder", "/partner/phoenix-az-k7m2xq", "/admin/content", "/assets/main-abc123.js", "/og-image.png", "/sitemap.xml", "/robots-staging.txt", "/api", "/apix"];
export const API_PATHS = ["/api/course", "/api/admin/users", "/api/admin/content/publish", "/api/sitemap", "/api/stripe-webhook", "/API/course"];

export const loadConfig = (file = process.env.REGRESS_VERCEL_JSON || path.join(REPO, "vercel.json")) => ({ file, config: JSON.parse(fs.readFileSync(file, "utf8")) });

export default async function () {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const { file, config } = loadConfig();
  const publicDir = path.join(path.dirname(file), "public");
  const R = meta.rules;

  // Each (host, path) evaluated both ways; the two readings must agree.
  const read = (host, p) => {
    const a = evaluate(config, host, p, "regex");
    const b = evaluate(config, host, p, "exact");
    const same = JSON.stringify(a) === JSON.stringify(b);
    return { ...a, same };
  };
  const hosts = [...PROD_HOSTS, ...NONPROD_HOSTS];
  const all = [...PAGE_PATHS, ...API_PATHS, "/robots.txt"];

  let ambiguous = [];
  for (const host of hosts) for (const p of all) {
    const r = read(host, p);
    if (!r.same) ambiguous.push(`${host}${p}`);
    if (r.clashes.length) ambiguous.push(`${host}${p}: ${r.clashes.join("; ")}`);
  }
  add("every rule means the same whether a host value is read as a regex or exactly, and no two rules set one header", R[0], ambiguous.length === 0, ambiguous.slice(0, 6).join(" | ") || `${hosts.length} hosts x ${all.length} paths`);

  // Production: nothing asks a crawler to stay away, robots.txt is the file.
  for (const host of PROD_HOSTS) {
    const tagged = all.filter((p) => read(host, p).headers["x-robots-tag"]);
    add(`${host}: no response carries X-Robots-Tag`, R[0], tagged.length === 0, tagged.length ? `X-Robots-Tag on ${tagged.join(", ")}` : `${all.length} paths clean`);
    const rb = read(host, "/robots.txt");
    add(`${host}: /robots.txt is served from public/robots.txt, not redirected`, R[0], !rb.redirect, rb.redirect ? `redirects to ${rb.redirect.to}` : "no redirect; the static file answers");
  }
  const prodRobots = fs.existsSync(path.join(publicDir, "robots.txt")) ? fs.readFileSync(path.join(publicDir, "robots.txt"), "utf8") : "";
  add("public/robots.txt (production) still opens the public site and names the sitemap", R[0],
    !!prodRobots && disallowAllProblem(prodRobots) !== null && /^Allow:\s*\/\s*$/m.test(prodRobots) && /^Sitemap:\s*https:\/\/aduatlas\.com\/sitemap\.xml/m.test(prodRobots),
    prodRobots ? "Allow: / and the Sitemap line present, not disallow-all" : "public/robots.txt missing");

  // Everything else: noindex everywhere, robots.txt closed.
  for (const host of NONPROD_HOSTS) {
    const untagged = all.filter((p) => { const r = read(host, p); return !r.redirect && noindexProblem(r.headers); });
    const rb = read(host, "/robots.txt");
    const target = rb.redirect ? path.join(publicDir, rb.redirect.to.replace(/^\/+/, "")) : null;
    const body = target && fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    const robotsProblem = !rb.redirect ? "robots.txt is not redirected, so public/robots.txt (open) answers" : body === null ? `redirect target ${rb.redirect.to} is not a file in public/` : disallowAllProblem(body);
    add(`${host}: every response is noindex, nofollow and /robots.txt disallows everything`, R[1], untagged.length === 0 && !robotsProblem,
      [untagged.length ? `no noindex on ${untagged.length} paths (${untagged.slice(0, 3).join(", ")})` : `noindex on ${all.length - 1} paths`, robotsProblem || `robots.txt -> ${rb.redirect.status} ${rb.redirect.to} (disallow-all)`].join("; "));
  }

  // Security headers on every page and API path, on every host.
  const failures = [];
  for (const host of hosts) {
    for (const [kind, paths] of [["page", PAGE_PATHS], ["api", API_PATHS]]) for (const p of paths) {
      const probs = Object.entries(headerProblems(kind, read(host, p).headers)).filter(([, v]) => v.length);
      if (probs.length) failures.push(`${host}${p} [${kind}]: ${probs.map(([k, v]) => `${k} ${v.join(", ")}`).join("; ")}`);
    }
  }
  add("every page and API path on every host gets all six security headers with sound values", R[2], failures.length === 0, failures.slice(0, 4).join(" | ") || `${hosts.length} hosts x ${PAGE_PATHS.length + API_PATHS.length} paths`);

  // Production CSP: the production project and nothing else; identical otherwise.
  const prodCsp = read("aduatlas.com", "/").headers["content-security-policy"] || "";
  const wwwCsp = read("www.aduatlas.com", "/").headers["content-security-policy"] || "";
  const stagingCsp = read("aduatlas-staging.vercel.app", "/").headers["content-security-policy"] || "";
  const supabaseOrigins = (csp) => [...new Set((csp.match(/https:\/\/[a-z0-9]+\.supabase\.co/g) || []))];
  const foreign = supabaseOrigins(prodCsp).filter((o) => !o.includes(PROD_REF));
  // Restated at integration (RC3): non-production hosts must NOT be allowed to reach
  // the production project (R0: nothing non-production points at production), so
  // the two policies are compared with every Supabase origin set aside.
  const noSupabase = (csp) => csp.replace(/\s+https:\/\/[a-z0-9]+\.supabase\.co/g, "");
  const stagingNamesProd = stagingCsp.includes(`${PROD_REF}.supabase.co`);
  add("the production CSP names the production Supabase project and no other; the non-production CSP never names production; otherwise identical", R[3],
    !!prodCsp && prodCsp === wwwCsp && prodCsp.includes(`${PROD_REF}.supabase.co`) && foreign.length === 0 && !stagingNamesProd && noSupabase(stagingCsp) === noSupabase(prodCsp),
    !prodCsp ? "no CSP for aduatlas.com" : foreign.length ? `also names ${foreign.join(", ")}` : stagingNamesProd ? "the non-production policy allows the production Supabase project" : noSupabase(stagingCsp) !== noSupabase(prodCsp) ? "differs from the staging policy beyond the Supabase origins" : prodCsp !== wwwCsp ? "aduatlas.com and www differ" : `supabase: ${supabaseOrigins(prodCsp).join(" ")}`);

  // Inline scripts in index.html are allowed by exact hash.
  const indexHtml = fs.readFileSync(path.join(path.dirname(file), "index.html"), "utf8");
  const hashes = [...indexHtml.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .filter((m) => !/\bsrc\s*=/.test(m[1] || ""))
    .map((m) => `'sha256-${crypto.createHash("sha256").update(m[2], "utf8").digest("base64")}'`);
  const missingHash = [];
  for (const host of hosts) {
    const script = parseCsp(read(host, "/").headers["content-security-policy"]).get("script-src") || [];
    for (const hsh of hashes) if (!script.includes(hsh)) missingHash.push(`${host} lacks ${hsh}`);
  }
  add("every inline <script> in index.html is allowed by its sha256 on every host", R[4], missingHash.length === 0, missingHash.slice(0, 3).join(" | ") || `${hashes.length} inline script(s): ${hashes.join(" ")}`);
  return out;
}
