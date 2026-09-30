// 920 — a non-production deployment asks not to be indexed (WP-3).
//
// Every target this suite may run against is NOT aduatlas.com (run.mjs refuses
// production), so on every target the whole site must say noindex, nofollow and
// /robots.txt must close the site to every crawler. That production keeps its own
// robots.txt and stays indexable cannot be observed from here; 900 proves it from
// vercel.json.
//
// /robots.txt is fetched the way a crawler fetches it, following redirects (RFC 9309
// 2.3.1.2; Google follows up to five hops). vercel.json answers it with a redirect
// to /robots-staging.txt on these hosts, because a rewrite can never replace a
// static file on Vercel (the filesystem is checked before rewrites).
//
// On RC2 there is no X-Robots-Tag anywhere and /robots.txt is the production file,
// so every row is red there.
import { disallowAllProblem, noindexProblem } from "./900_headers_config.mjs";

export const meta = {
  name: "920 staging and preview hosts are noindex with a disallow-all robots.txt",
  rules: [
    "WP-3: every host that is not aduatlas.com or www.aduatlas.com sends X-Robots-Tag: noindex, nofollow",
    "WP-3: /robots.txt on those hosts disallows everything",
  ],
};

const PATHS = [
  "/", "/about", "/rules", "/rules/az", "/builders/join", "/find-a-builder", "/login", "/partner", "/dashboard", "/admin",
  "/sitemap.xml", "/og-image.png", "/site.webmanifest",
  "/api/sitemap", "/api/course", "/api/partner-redeem", "/api/verify-session",
];

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (/(^|\.)aduatlas\.com$/i.test(new URL(ctx.base).hostname)) {
    return [{ name: "target is not production", rule: meta.rules[0], status: "fail", detail: "920 asserts noindex, which production must never send" }];
  }

  const bad = [];
  for (const p of PATHS) {
    const r = await fetch(`${ctx.base}${p}`, { redirect: "manual" });
    await r.arrayBuffer();
    const prob = noindexProblem(r.headers);
    if (prob) bad.push(`${p} (${r.status}): ${prob}`);
  }
  add(`X-Robots-Tag: noindex, nofollow on ${PATHS.length} pages, static files and API routes`, meta.rules[0], bad.length === 0,
    bad.length ? `${bad.length} without it, e.g. ${bad.slice(0, 3).join(" | ")}` : "present on every one");

  const hops = [];
  let url = `${ctx.base}/robots.txt`;
  let r;
  for (let i = 0; i < 6; i += 1) {
    r = await fetch(url, { redirect: "manual" });
    hops.push(`${new URL(url).pathname} ${r.status}`);
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      url = new URL(r.headers.get("location"), url).href;
      await r.arrayBuffer();
      continue;
    }
    break;
  }
  const body = await r.text();
  const type = r.headers.get("content-type") || "";
  const prob = r.status !== 200 ? `final status ${r.status}` : !/^text\/plain/i.test(type) ? `content-type ${type}` : disallowAllProblem(body);
  add("/robots.txt, followed as a crawler follows it, disallows everything for every agent", meta.rules[1], !prob,
    `${hops.join(" -> ")}; ${prob || "User-agent: * / Disallow: /"}`);
  const finalNoindex = noindexProblem(r.headers);
  add("the robots.txt a crawler ends up reading is itself noindex", meta.rules[0], !finalNoindex, finalNoindex || "noindex, nofollow");
  return out;
}
