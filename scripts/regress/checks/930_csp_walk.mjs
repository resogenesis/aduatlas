// 930 — the Content-Security-Policy breaks nothing (WP-3): every page, walked by
// every persona in an isolated headless Chromium, raises no CSP violation and no
// frame or permissions-policy error, and the features that load from other origins
// still work under the policy.
//
// What is watched, per persona:
//   * securitypolicyviolation events in every frame (the event a blocked script,
//     style, image, font, connection, frame or worker raises);
//   * console errors and warnings naming Content Security Policy, X-Frame-Options,
//     frame-ancestors or Permissions Policy;
//   * the headers of every document the target serves: a walk under no policy
//     proves nothing, so a document without an ENFORCING CSP is a failure. That is
//     what makes this check red on RC2, which sends no policy at all.
// Other console errors are counted in the detail, not failed on: they are the app's
// own (a 401 for a signed-out read, a refused write below).
//
// Features that reach another origin are driven, with the data they need injected
// into this browser only, so the check does not depend on what staging happens to
// hold and writes nothing:
//   * the feasibility tool: a property lookup answer with coordinates (the
//     /api/property-lookup response is fulfilled here, so no provider quota is
//     spent), then the 3D model (WebGL, drei), the site plan and the satellite map
//     (MapLibre worker from blob:, Esri World Imagery tiles);
//   * a builder profile with a YouTube and a Vimeo video (videos added to the
//     profile record this browser receives);
//   * a delivered site plan PDF shown in a frame from Supabase Storage (the study
//     row, the signed url and the file are fulfilled here);
//   * the admin content editor, which frames the site's own pages, so frame
//     protection must allow same-origin framing and nothing else.
// Those rows pass on RC2 too (no policy to break them); they are the non-regression
// half of the check.
//
// Read-only, like 601: every non-GET to /api/*, every database write and every
// storage upload from these browsers is refused before it leaves. Signing in and
// the read-only RPCs pass.
//
// REGRESS_CSP_WALK_PERSONAS=anon,admin,... limits the personas (default: anonymous
// plus every persona in REGRESS_PERSONAS). REGRESS_CSP_WALK_CONCURRENCY (default 4).
export const meta = {
  name: "930 CSP walk: every page, every persona, zero violations",
  rules: [
    "WP-3: every document the target serves carries an enforcing Content-Security-Policy",
    "WP-3: a full walk of every page by every persona raises no CSP, frame or permissions-policy violation",
    "WP-3: features that load from other origins (3D, satellite tiles, video embeds, site plan PDF, admin editor frame) still work under the policy",
  ],
};

const PUBLIC = [
  "/", "/about", "/how-to-adu", "/faq", "/adu-types", "/pricing", "/course-outline", "/legal", "/methodology",
  "/unlock", "/signup", "/feasibility-study", "/welcome", "/find-a-builder", "/for-builders", "/rules",
  "/partner", "/login", "/create-account", "/builders/join", "/forgot-password", "/reset-password", "/property",
];
const APP = [
  "/dashboard", "/course", "/course/intro", "/course/m1c1", "/course/m1quiz", "/my-property", "/study", "/site-plan",
  "/costs", "/adu-options", "/support", "/help", "/feasibility", "/utility-estimator", "/report", "/packet",
  "/packet/pre-site-estimate", "/packet/pre-site-verification", "/packet/builder-prep", "/packet/traditional-build",
  "/packet/modular-prefab", "/packet/total-cost", "/packet/ready-score", "/builders", "/settings",
];
const PORTALS = [
  "/builder", "/builder/profile", "/gov", "/gov/claim", "/gov/regulatory", "/gov/partnership",
  "/admin", "/admin/content", "/admin/studies", "/admin/builders", "/admin/regulatory", "/admin/users", "/admin/admins",
];
const CSP_TEXT = /content[ -]security[ -]policy|x-frame-options|frame-ancestors|permissions[ -]policy|permissions policy|refused to (load|connect|execute|apply|frame|display|create|evaluate)/i;
const VIDEOS = ["https://www.youtube.com/watch?v=aqz-KE-bpKQ", "https://vimeo.com/76979871"];
const TINY_PDF = "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

// Refuse every write before it leaves this browser (reads, sign-in and signing a
// storage url pass).
const guardWrites = async (context, ctx) => {
  const blocked = [];
  const sb = new URL(ctx.supabaseUrl).origin;
  const site = new URL(ctx.base).origin;
  await context.route(
    (u) => (u.origin === sb && /^\/(rest|storage)\/v1\//.test(u.pathname)) || (u.origin === site && u.pathname.startsWith("/api/")),
    (route) => {
      const req = route.request();
      const m = req.method();
      const p = new URL(req.url()).pathname;
      const read = m === "GET" || m === "HEAD" || m === "OPTIONS"
        || (m === "POST" && /^\/rest\/v1\/rpc\/(get_|my_|jurisdiction_)/.test(p))
        || (m === "POST" && p.startsWith("/storage/v1/object/sign/"));
      if (read && p !== "/api/send-email") return route.fallback();
      blocked.push(`${m} ${p}`);
      return route.abort("blockedbyclient");
    },
  );
  return blocked;
};

const signIn = async (page, ctx, persona) => {
  const { email, password } = ctx.creds(persona);
  await page.goto(`${ctx.base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("input[type=email]", email);
  await page.fill("input[type=password]", password);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
    page.click("button[type=submit]"),
  ]);
};

const settle = async (page, ms = 6000) => {
  await page.waitForLoadState("networkidle", { timeout: ms }).catch(() => {});
  await page.waitForTimeout(250);
};

// --- features ---------------------------------------------------------------
const driveFeasibility = async (page, ctx, f) => {
  const address = page.locator('input[placeholder^="123 Main St"]');
  if (!(await address.count())) return;
  f.feasibilityReached = true;
  await page.route("**/api/property-lookup**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ latitude: 34.0522, longitude: -118.2437, lotSize: 7200, buildingSize: 1400 }) }));
  await address.fill("100 Example St, Los Angeles, CA 90012");
  await page.getByRole("button", { name: "Look up" }).click();
  for (const [label, value] of [["Front setback", "20"], ["Rear setback", "10"], ["Side setback (each)", "5"], ["Existing home depth", "40"]]) {
    await page.locator(`xpath=//label[normalize-space()="${label}"]/following-sibling::div//input`).first().fill(value);
  }
  const canvas = page.locator("canvas").first();
  f.webgl = await canvas.waitFor({ state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
  await page.getByRole("button", { name: "Site plan" }).click().catch(() => {});
  await page.waitForTimeout(500);
  const tiles = [];
  const onResp = (r) => { if (/server\.arcgisonline\.com/.test(r.url())) tiles.push(r.status()); };
  page.on("response", onResp);
  await page.getByRole("button", { name: "Satellite" }).click().catch(() => {});
  await page.locator(".maplibregl-canvas").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  for (let i = 0; i < 30 && tiles.filter((s) => s === 200).length < 4; i += 1) await page.waitForTimeout(500);
  page.off("response", onResp);
  f.tilesOk = tiles.filter((s) => s === 200).length;
  f.tilesTried = tiles.length;
  await page.unroute("**/api/property-lookup**");
};

const injectVideos = async (page, slug) => {
  const handler = async (route) => {
    const resp = await route.fetch();
    let body;
    try { body = await resp.json(); } catch { return route.fulfill({ response: resp }); }
    const add = (row) => (row && typeof row === "object" && (!slug || row.slug === slug) ? { ...row, videos: VIDEOS } : row);
    body = Array.isArray(body) ? body.map(add) : add(body);
    return route.fulfill({ response: resp, json: body });
  };
  const match = (u) => /\/rest\/v1\/(rpc\/get_public_builder|builders_public|builders)$/.test(u.pathname);
  await page.route(match, handler);
  return () => page.unroute(match, handler);
};

const injectSitePlan = async (page) => {
  const hits = { study: 0, sign: 0, file: 0 };
  const isStudy = (u) => /\/rest\/v1\/studies$/.test(u.pathname);
  const isSigned = (u) => u.pathname.startsWith("/storage/v1/object/sign/");
  const study = { id: "00000000-0000-0000-0000-00000000c5b0", status: "ready", site_plan_path: "wp3-probe/site-plan.pdf", report_path: null, created_at: "2026-09-01T00:00:00Z" };
  await page.route(isStudy, (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    hits.study += 1;
    const wantsObject = /vnd\.pgrst\.object/.test(route.request().headers().accept || "");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(wantsObject ? study : [study]) });
  });
  await page.route(isSigned, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      hits.sign += 1;
      const pathPart = new URL(req.url()).pathname.replace(/^\/storage\/v1/, "");
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ signedURL: `${pathPart}?token=wp3-probe` }) });
    }
    hits.file += 1;
    return route.fulfill({ status: 200, contentType: "application/pdf", body: TINY_PDF });
  });
  hits.undo = async () => { await page.unroute(isStudy); await page.unroute(isSigned); };
  return hits;
};

// --- one persona ------------------------------------------------------------
export const walkPersona = async (browser, ctx, persona, pages, extra = {}) => {
  const r = { persona, walked: 0, violations: [], foreign: [], cspConsole: [], otherConsole: 0, otherTexts: new Set(), pageErrors: 0, docs: 0, docsWithoutPolicy: [], origins: new Set(), embedOrigins: new Set(), f: {}, blocked: [], error: null };
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const site = new URL(ctx.base).origin;
  try {
    r.blocked = await guardWrites(context, ctx);
    await context.exposeBinding("__wp3Violation", ({ frame }, v) => {
      const url = frame?.url?.() || "";
      const ours = url.startsWith(site) || url === "about:blank" || url === "";
      (ours ? r.violations : r.foreign).push({ ...v, frame: url, at: r.at });
    });
    await context.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        try {
          window.__wp3Violation({ directive: e.effectiveDirective || e.violatedDirective, blocked: e.blockedURI, sample: String(e.sample || "").slice(0, 80), disposition: e.disposition, source: e.sourceFile, line: e.lineNumber });
        } catch { /* binding not ready */ }
      }, true);
    });
    // Origins our own documents reach (subresources, fetches, frame navigations) are
    // what the policy governs; what a YouTube or Vimeo frame loads inside itself is
    // governed by that frame's own policy and is listed apart.
    context.on("request", (req) => {
      let origin;
      try { origin = new URL(req.url()).origin; } catch { return; }
      let from = "";
      try { from = req.frame().url(); } catch { /* worker or service worker */ }
      const ours = req.isNavigationRequest() || from.startsWith(site) || from === "about:blank" || from === "";
      (ours ? r.origins : r.embedOrigins).add(origin);
    });
    context.on("response", (res) => {
      if (res.request().resourceType() !== "document" || !res.url().startsWith(site)) return;
      r.docs += 1;
      const h = res.headers();
      if (!h["content-security-policy"]) r.docsWithoutPolicy.push(`${new URL(res.url()).pathname} (${res.status()})${h["content-security-policy-report-only"] ? " report-only" : ""}`);
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("console", (m) => {
      if (m.type() !== "error" && m.type() !== "warning") return;
      const from = m.location()?.url || "";
      // A policy message raised by a third-party frame's own script is that
      // frame's business, not a violation of ours: YouTube's embed player calls
      // the Compute Pressure API (PressureObserver in its base.js), which we do
      // not delegate to it and should not, and Chrome then logs
      // "compute-pressure is not allowed in this document" (RC3 and RC4, only on
      // the builder profile where this walk injects the videos). A message with
      // no location, or one from our own origin, still counts as ours.
      const thirdParty = /^https?:/.test(from) && !from.startsWith(site);
      if (CSP_TEXT.test(m.text()) && thirdParty) r.foreign.push({ at: r.at, frame: from.slice(0, 80), text: m.text().slice(0, 240) });
      else if (CSP_TEXT.test(m.text())) r.cspConsole.push({ at: r.at, from: from.slice(0, 80), text: m.text().slice(0, 240) });
      else if (m.type() === "error") { r.otherConsole += 1; r.otherTexts.add(m.text().replace(/\d{3,}|[0-9a-f]{8}-[0-9a-f-]{27}/gi, "#").slice(0, 160)); }
    });
    page.on("pageerror", (e) => { r.pageErrors += 1; r.otherTexts.add(`pageerror: ${String(e?.message || e).slice(0, 150)}`); });

    if (persona !== "anon") {
      r.at = "/login";
      await signIn(page, ctx, persona);
      await settle(page);
    }
    for (const p of pages) {
      r.at = p;
      let undo = null;
      let planHits = null;
      if (p.startsWith("/builders/") && p !== "/builders/join") undo = await injectVideos(page, extra.builderSlug);
      if (p === "/site-plan") planHits = await injectSitePlan(page);
      await page.goto(`${ctx.base}${p}`, { waitUntil: "domcontentloaded" });
      await settle(page);
      r.walked += 1;
      if (p === "/feasibility") await driveFeasibility(page, ctx, r.f);
      if (undo) {
        const frames = await page.waitForFunction(() => document.querySelectorAll('iframe[src*="youtube.com/embed"], iframe[src*="player.vimeo.com"]').length >= 2, null, { timeout: 15000 }).then(() => true).catch(() => false);
        if (frames) {
          await page.waitForTimeout(2500);
          const loaded = page.frames().filter((fr) => /^https:\/\/(www\.youtube\.com\/embed|player\.vimeo\.com\/video)\//.test(fr.url()));
          r.f.videoFrames = Math.max(r.f.videoFrames || 0, loaded.length);
        }
        r.f.videoTried = true;
        await undo();
      }
      if (planHits) {
        const shown = await page.locator('iframe[title="Visual site plan"]').waitFor({ state: "attached", timeout: 10000 }).then(() => true).catch(() => false);
        await page.waitForTimeout(800);
        // A frame that frame-src refuses never issues its request, so the file being
        // requested is the proof. (Headless Chromium has no PDF viewer, so the frame
        // itself does not keep the url.)
        const { undo: undoPlan, ...counts } = planHits;
        r.f.pdf = { ...counts, shown };
        await undoPlan();
      }
      if (p === "/admin/content") {
        const el = await page.locator("iframe").first().waitFor({ state: "attached", timeout: 15000 }).then(() => true).catch(() => false);
        // Only a persona the editor opens for (admin) has the frame; the others see
        // the admin gate and are not counted here.
        if (el) {
          await page.waitForTimeout(2500);
          const fr = page.frames().find((x) => x !== page.mainFrame() && x.url().startsWith(site));
          const text = fr ? await fr.locator("body").innerText({ timeout: 10000 }).catch(() => "") : "";
          r.f.adminFrame = { url: fr ? new URL(fr.url()).pathname + new URL(fr.url()).search : null, chars: text.trim().length };
        }
      }
    }
  } catch (e) {
    r.error = `${r.at || ""}: ${String(e?.message || e).slice(0, 200)}`;
  } finally {
    await context.close().catch(() => {});
  }
  return r;
};

const pool = async (items, n, fn) => {
  const out = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const i = next; next += 1; out[i] = await fn(items[i]); }
  }));
  return out;
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const R = meta.rules;

  // Real public records to open: a rules state and jurisdiction, and a builder.
  const anonRead = (q) => ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${q}`, { headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}` } });
  const cov = await anonRead("jurisdiction_coverage_public?select=state_code,jurisdiction_path&is_indexable=is.true&order=jurisdiction_id&limit=1");
  const j = Array.isArray(cov.body) && cov.body[0]?.jurisdiction_path ? cov.body[0] : null;
  const all = ["anon"];
  for (const name of ["admin", "homeowner_unpaid", "golden_purchased", "platinum_purchased", "concierge_purchased", "golden_sponsored", "withdrawn_era_homeowner", "builder_unclaimed", "builder_claimed", "builder_verified", "gov_claimed", "gov_verified", "education_partner", "gov_withdrawn"]) {
    try { ctx.creds(name); all.push(name); } catch { /* not in this persona file */ }
  }
  const personas = process.env.REGRESS_CSP_WALK_PERSONAS ? process.env.REGRESS_CSP_WALK_PERSONAS.split(",").map((s) => s.trim()).filter(Boolean) : all;
  let builderSlug = null;
  try { builderSlug = ctx.creds("builder_verified").builder_slug || null; } catch { /* none */ }

  const pages = [...PUBLIC];
  if (j) pages.push(`/rules/${String(j.state_code).toLowerCase()}`, `/rules/${j.jurisdiction_path}`);
  if (builderSlug) pages.push(`/builders/${builderSlug}`);
  pages.push(...APP, ...PORTALS);

  if (!j) out.push({ name: "a rules state page and jurisdiction page are in the walk", rule: R[1], status: "skip", detail: "no indexable jurisdiction on this target to open" });
  if (!builderSlug) out.push({ name: "a public builder profile is in the walk", rule: R[1], status: "skip", detail: "builder_verified persona has no builder_slug" });

  const browser = await ctx.launch();
  let results;
  try {
    results = await pool(personas, Number(process.env.REGRESS_CSP_WALK_CONCURRENCY || 4), (p) => walkPersona(browser, ctx, p, pages, { builderSlug }));
  } finally {
    await browser.close();
  }

  const docs = results.reduce((n, r) => n + r.docs, 0);
  const noPolicy = results.flatMap((r) => r.docsWithoutPolicy.map((d) => `${r.persona} ${d}`));
  add(`every document served during the walk carried an enforcing CSP (${docs} documents)`, R[0], docs > 0 && noPolicy.length === 0,
    noPolicy.length ? `${noPolicy.length} without one, e.g. ${noPolicy.slice(0, 4).join(" | ")}` : "all enforcing");

  for (const r of results) {
    const v = r.violations.map((x) => `${x.at}: ${x.directive} blocked ${x.blocked || "inline"}${x.sample ? ` "${x.sample}"` : ""}`);
    const c = r.cspConsole.map((x) => `${x.at}: ${x.text}`);
    const ok = !r.error && r.walked === pages.length && r.docsWithoutPolicy.length === 0 && v.length === 0 && c.length === 0;
    add(`${r.persona}: ${r.walked}/${pages.length} pages, no CSP, frame or permissions-policy violation`, R[1], ok,
      r.error ? `walk stopped at ${r.error}`
        : r.docsWithoutPolicy.length ? `no enforcing CSP on ${r.docsWithoutPolicy.length} documents, so the walk proves nothing (e.g. ${r.docsWithoutPolicy[0]})`
          : [...v, ...c].slice(0, 4).join(" | ") || `clean; ${r.otherConsole} other console errors, ${r.pageErrors} page errors, ${r.blocked.length} writes refused, ${r.foreign.length} violations of third-party frames' own policies`);
  }

  const withF = (key) => results.filter((r) => r.f[key] !== undefined);
  const feas = results.filter((r) => r.f.feasibilityReached);
  add("feasibility tool: the 3D model renders (WebGL canvas) under the policy", R[2], feas.length > 0 && feas.every((r) => r.f.webgl),
    feas.length ? feas.map((r) => `${r.persona} ${r.f.webgl ? "canvas" : "NO canvas"}`).join(", ") : "no persona reached the tool (needs a Platinum or Concierge persona)");
  add("feasibility tool: satellite tiles load from server.arcgisonline.com under the policy", R[2], feas.length > 0 && feas.every((r) => r.f.tilesOk > 0),
    feas.length ? feas.map((r) => `${r.persona} ${r.f.tilesOk}/${r.f.tilesTried} tiles 200`).join(", ") : "no persona reached the tool");
  const vids = withF("videoTried");
  add("builder profile: YouTube and Vimeo embeds load in their frames under the policy", R[2], vids.length > 0 && vids.every((r) => r.f.videoFrames >= 2),
    vids.length ? vids.map((r) => `${r.persona} ${r.f.videoFrames || 0}/2`).join(", ") : "no builder profile walked (builder_verified persona has no builder_slug)");
  const pdf = withF("pdf").filter((r) => r.f.pdf.study > 0 && r.f.pdf.shown);
  add("site plan: a delivered PDF from Supabase Storage is requested by its frame under the policy", R[2], pdf.length > 0 && pdf.every((r) => r.f.pdf.sign > 0 && r.f.pdf.file > 0),
    pdf.length ? pdf.map((r) => `${r.persona} signed=${r.f.pdf.sign} frame-request=${r.f.pdf.file}`).join(", ") : "no persona reached a delivered site plan");
  const adm = withF("adminFrame");
  add("admin content editor frames the site's own page (frame-ancestors 'self', X-Frame-Options SAMEORIGIN)", R[2], adm.length > 0 && adm.every((r) => r.f.adminFrame.url && r.f.adminFrame.chars > 50),
    adm.length ? adm.map((r) => `${r.persona} ${r.f.adminFrame.url || "no frame"} (${r.f.adminFrame.chars} chars)`).join(", ") : "admin persona not walked");

  const site = new URL(ctx.base).origin;
  const origins = [...new Set(results.flatMap((r) => [...r.origins]))].filter((o) => o !== site && /^https?:/.test(o)).sort();
  const embeds = [...new Set(results.flatMap((r) => [...r.embedOrigins]))].filter((o) => !origins.includes(o) && /^https?:/.test(o)).sort();
  out.push({ name: "origins this walk reached (inventory, informational)", rule: R[1], status: "pass", detail: `site documents: ${origins.join(" ") || "none"}; inside third-party frames: ${embeds.join(" ") || "none"}` });
  return out;
}
