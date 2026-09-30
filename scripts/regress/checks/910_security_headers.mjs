// 910 — every page, static file and API function on the target answers with the
// security headers (WP-3). The rules each header is held to live in 900
// (headerProblems): an ENFORCING Content-Security-Policy with no 'unsafe-inline' or
// 'unsafe-eval' for scripts, object-src 'none', base-uri and frame-ancestors;
// HSTS of at least a year; nosniff; a Referrer-Policy that never sends a path
// cross-origin; a Permissions-Policy that turns off camera, microphone, geolocation
// and payment; and X-Frame-Options that agrees with frame-ancestors (SAMEORIGIN for
// pages, because the admin content editor frames the site's own pages; DENY and
// frame-ancestors 'none' for /api).
//
// Only GETs, with no credentials. Every function answers a bare GET without side
// effects (405 for the POST-only ones, 400/401/403 for the rest).
//
// RC2 sends none of this, so every row but HSTS is red there. HSTS is green on RC2
// because Vercel adds it to every *.vercel.app response by itself; the row is kept
// so a production-grade value is still required after RC3.
import { SECURITY_HEADERS, headerProblems } from "./900_headers_config.mjs";

export const meta = {
  name: "910 security headers on every page, static file and API response",
  rules: ["WP-3: every page and every /api response carries CSP (enforcing), HSTS, nosniff, Referrer-Policy, Permissions-Policy and frame protection"],
};

const PAGES = [
  "/", "/about", "/pricing", "/unlock", "/rules", "/rules/az", "/find-a-builder", "/builders/join", "/partner",
  "/login", "/create-account", "/reset-password", "/welcome", "/course-outline", "/legal",
  "/dashboard", "/course/intro", "/feasibility", "/site-plan", "/settings", "/builders",
  "/builder", "/builder/profile", "/gov", "/gov/partnership", "/admin", "/admin/content",
];
const FUNCTIONS = [
  "/api/admin/overview", "/api/admin/content/list", "/api/course", "/api/create-checkout", "/api/partner-redeem",
  "/api/property-lookup", "/api/referral-click", "/api/send-email", "/api/sitemap", "/api/stripe-webhook", "/api/verify-session",
];

export default async function (ctx) {
  const out = [];
  const R = meta.rules[0];
  const home = await fetch(`${ctx.base}/`, { redirect: "manual" });
  const html = await home.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  const statics = ["/og-image.png", "/favicon.ico", "/site.webmanifest", "/icon.svg", "/sitemap.xml", ...assets.slice(0, 2)];
  const targets = [
    ...PAGES.map((p) => ["page", p]),
    ...[`/${ctx.prefix}-no-such-page`].map((p) => ["page", p]),
    ...statics.map((p) => ["page", p]),
    ...FUNCTIONS.map((p) => ["api", p]),
  ];

  const byHeader = Object.fromEntries(SECURITY_HEADERS.map((k) => [k, []]));
  const seen = [];
  for (const [kind, p] of targets) {
    let r;
    try {
      r = await fetch(`${ctx.base}${p}`, { redirect: "manual" });
      await r.arrayBuffer();
    } catch (e) {
      for (const k of SECURITY_HEADERS) byHeader[k].push(`${p}: request failed (${e.message})`);
      continue;
    }
    seen.push(`${p}=${r.status}`);
    const probs = headerProblems(kind, r.headers);
    for (const k of SECURITY_HEADERS) if (probs[k].length) byHeader[k].push(`${p} (${r.status}): ${probs[k].join(", ")}`);
  }
  for (const k of SECURITY_HEADERS) {
    const bad = byHeader[k];
    out.push({
      name: `${k} on all ${targets.length} responses (${PAGES.length + 1} pages, ${statics.length} static files, ${FUNCTIONS.length} API routes)`,
      rule: R,
      status: bad.length ? "fail" : "pass",
      detail: bad.length ? `${bad.length} failing, e.g. ${bad.slice(0, 3).join(" | ")}` : `ok on ${seen.length}`,
    });
  }
  return out;
}
