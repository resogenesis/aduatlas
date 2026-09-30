// 865 — seven minor defects from the RC4 staging rehearsal (RC4 triage, T4 ids),
// one rule each, plus one positive control for the worksheet bar.
//
//   T4-04  After a sponsored redemption the public header kept "Finish sponsored
//          access" until the route changed (PartnerEntry cleared the remembered
//          entry, but nothing re-rendered the header). The header must offer the
//          link before the answer (the rule's own precondition), and not after.
//   T4-05  The admin console labelled a SUSPENDED partnership's resident links and
//          codes "Live" (the row's own is_live ignores the partnership).
//   T4-08  The jurisdiction's "Note shown on the public page" (research_note) was
//          never rendered on the public page.
//   T4-09  The homeowner rule card dropped source_citation; the resource card
//          dropped contact_name and contact_title.
//   T4-14  Content History showed no text preview, and a bare time that is the
//          moment the version was replaced, not the version's own.
//   T4-19  The Golden dashboard offered "Review your site plan: Open", which
//          leads to the Platinum paywall.
//   T4-20  The worksheet bar said "Saved" when the server refused the save.
//
// WHAT IS WRITTEN, AND WHAT IS NOT. No sponsored link or code is redeemed: every
// /api/partner-redeem call is answered inside the browser with a made-up token
// (as 443 does). No shared persona's data is changed: the personas only sign in
// and look. Fixtures carry ctx.prefix and are removed at the end whatever
// happened: one published jurisdiction with a public note (unpublished, then
// deleted), one course chapter key with no site_content row before the check
// (the row is deleted, its versions go with it by cascade), and one Platinum
// homeowner (deleted, its worksheets row goes with it). A refused worksheet write
// is simulated in the browser; the accepted one reaches the fixture account only.
//
// Sign-in: a password grant, and the session placed in the page's storage before
// any script runs (as 362 does), so no typed value exists to be logged. Nothing
// from a grant is ever printed.
import { DESKTOP, makeHomeowner, readServerCopy, stampPurchase, svcHeaders } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "865 homeowner and admin minors (RC4 triage T4-04, 05, 08, 09, 14, 19, 20)",
  rules: [
    "T4-04: once the partner entry reaches its granted state, the header no longer offers 'Finish sponsored access', without a route change",
    "T4-05: the admin console does not label a suspended partnership's resident links and codes 'Live'",
    "T4-08: a jurisdiction's 'Note shown on the public page' appears on its public page in place of the standard sentence",
    "T4-09: the homeowner rule card shows a published source citation, and the resource card shows the contact name and title",
    "T4-14: each Content History row shows a text preview of the version, and never presents the time it was replaced as the version's own time",
    "T4-19: a Golden dashboard does not offer the Platinum site plan ('Review your site plan: Open') as a step to open",
    "T4-20: when the server refuses a worksheet save, the worksheet bar says the work is on this device only, not 'Saved'",
    "T4-20 control: a worksheet save the server accepted is shown as 'Saved'",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const short = (s, n = 200) => norm(s).slice(0, n);

// A password grant, retried when rate limited. Returns the whole session body,
// which is what supabase-js keeps in storage. Never printed.
const grant = async (ctx, email, password) => {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ctx.anonKey },
      body: JSON.stringify({ email, password }),
    });
    if (r.status === 429) {
      await sleep(60000);
      continue;
    }
    if (!r.ok) throw new Error(`sign-in failed: HTTP ${r.status}`);
    return r.json();
  }
  throw new Error("sign-in still rate-limited");
};

// A browser context signed in as `who` (a persona name or { email, password }),
// with optional extra localStorage entries written once, before the app runs.
const signedInContext = async (browser, ctx, who, { viewport = DESKTOP.viewport, seed = null } = {}) => {
  const c = typeof who === "string" ? ctx.creds(who) : who;
  const session = await grant(ctx, c.email, c.password);
  const ref = new URL(ctx.supabaseUrl).hostname.split(".")[0];
  const context = await browser.newContext({ viewport });
  await context.addInitScript(
    ([key, value, extra]) => {
      try {
        if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
        if (extra && !window.sessionStorage.getItem("regress-865-seeded")) {
          for (const [k, v] of Object.entries(extra)) window.localStorage.setItem(k, v);
          window.sessionStorage.setItem("regress-865-seeded", "1");
        }
      } catch {
        /* storage blocked: the page then renders signed out, which the rule reports */
      }
    },
    [`sb-${ref}-auth-token`, JSON.stringify(session), seed],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(90000);
  return { context, page };
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `t4-${["04", "05", "08", "09", "14", "19", "20", "20-control"][i]}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  const skip = (i, detail) => out.push({ name: `t4-${["04", "05", "08", "09", "14", "19", "20", "20-control"][i]}`, rule: meta.rules[i], status: "skip", detail });
  const has = (p) => {
    try {
      ctx.creds(p);
      return true;
    } catch {
      return false;
    }
  };
  // Each block reports its own rules, so one that cannot run never hides another.
  const guarded = async (rules, body) => {
    try {
      await body();
    } catch (e) {
      for (const i of rules) if (!out.some((r) => r.rule === meta.rules[i])) add(i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
    }
  };
  const anonHeaders = { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}` };
  const rest = (pathAndQuery, headers = anonHeaders, opts = {}) => ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${pathAndQuery}`, { headers, ...opts });
  const adminApi = async (area, method, route, body) => {
    const token = await ctx.token("admin");
    return ctx.fetchJson(`${ctx.base}/api/admin/${area}/${route}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  };
  const must = (r, what) => {
    if (r.status !== 200) throw new Error(`${what}: HTTP ${r.status} ${short(JSON.stringify(r.body), 240)}`);
    return r.body;
  };
  const pathOf = async (jurisdictionId) => {
    const j = await rest(`jurisdictions_public?select=state_code,slug&id=eq.${jurisdictionId}`);
    const row = Array.isArray(j.body) ? j.body[0] : null;
    return row?.slug && row?.state_code ? `/rules/${String(row.state_code).toLowerCase()}/${row.slug}` : null;
  };

  // The T4-08 fixture, removed in the outer finally.
  let noteJurisdiction = null;
  const browser = await ctx.launch();
  try {
    // ── T4-04: the header after a redemption ─────────────────────────────────
    await guarded([0], async () => {
      if (!has("homeowner_unpaid")) return skip(0, "homeowner_unpaid not in REGRESS_PERSONAS");
      const entry = JSON.stringify({ kind: "link", token: `${ctx.prefix}-865-not-a-real-link` });
      const { context, page } = await signedInContext(browser, ctx, "homeowner_unpaid", { seed: { "aduatlas.partner.entry": entry } });
      try {
        const seen = { get: 0, post: 0 };
        await context.route(
          (u) => u.pathname === "/api/partner-redeem",
          async (route) => {
            if (route.request().method() === "GET") {
              seen.get += 1;
              return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ context: null }) });
            }
            seen.post += 1;
            // Held back so the header can be read before the answer.
            await sleep(2500);
            return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ granted: true, message: "Your sponsored course access is ready." }) });
          },
        );
        const finishLinks = () => page.locator("header").first().locator('a[href="/partner"]', { hasText: /Finish sponsored access/ }).count();
        await page.goto(`${ctx.base}/partner`, { waitUntil: "domcontentloaded" });
        await page.locator("header").first().waitFor();
        await sleep(1200);
        const before = await finishLinks();
        const pathBefore = new URL(page.url()).pathname;
        const granted = await page
          .locator("main")
          .getByText(/Your sponsored course access is ready/)
          .first()
          .waitFor({ timeout: 30000 })
          .then(() => true, () => false);
        await sleep(2500);
        const after = await finishLinks();
        const pathAfter = new URL(page.url()).pathname;
        const primary = short(await page.locator('header [data-header-account="signed-in"] a').last().textContent().catch(() => ""), 60);
        // Finding 29: the link has to be there BEFORE the answer, or "gone
        // afterwards" proves nothing (a relabelled link, or a persona that holds
        // a portal, would pass with the defect present).
        add(
          0,
          before >= 1 && granted && seen.post > 0 && pathBefore === pathAfter && after === 0,
          `${before >= 1 ? "" : "precondition not met: the header did not offer the link before the answer; "}before the answer: "Finish sponsored access" links in the header ${before}; granted page shown ${granted} (redemptions answered in-browser ${seen.post}); 2.5 s later on the same route (${pathAfter}): "Finish sponsored access" links ${after}; header primary action "${primary}"`,
        );
      } finally {
        await context.close();
      }
    });

    // ── T4-05: links and codes of a suspended partnership ────────────────────
    await guarded([1], async () => {
      if (!has("admin") || !has("gov_withdrawn")) return skip(1, "admin or gov_withdrawn not in REGRESS_PERSONAS");
      if (!ctx.serviceKey) return skip(1, "no service role key: the partnership state cannot be confirmed");
      const gw = ctx.creds("gov_withdrawn");
      const S = svcHeaders(ctx);
      const partnership = (await rest(`government_partnerships?select=status&entity_id=eq.${gw.entity_id}`, S)).body;
      const links = (await rest(`partner_access_links?select=is_active,expires_at&entity_id=eq.${gw.entity_id}`, S)).body;
      const codes = (await rest(`partner_access_codes?select=is_active,expires_at&entity_id=eq.${gw.entity_id}`, S)).body;
      const enabled = [...(Array.isArray(links) ? links : []), ...(Array.isArray(codes) ? codes : [])].filter(
        (r) => r.is_active === true && !(r.expires_at && Date.parse(r.expires_at) < Date.now()),
      ).length;
      const pStatus = Array.isArray(partnership) ? partnership.map((p) => p.status).join(",") : "unknown";
      if (!/suspended/.test(pStatus) || enabled === 0) {
        return skip(1, `precondition not met: partnership status "${pStatus}", enabled unexpired links and codes ${enabled}`);
      }
      const { context, page } = await signedInContext(browser, ctx, "admin", { viewport: { width: 1360, height: 900 } });
      try {
        await page.goto(`${ctx.base}/admin/regulatory`, { waitUntil: "domcontentloaded" });
        await page.getByRole("button", { name: "Claims and partnerships", exact: true }).click({ timeout: 60000 });
        const search = page.getByPlaceholder("Search by name");
        await search.waitFor({ timeout: 60000 });
        await search.fill(gw.entity_name);
        const row = page.locator("li > button", { hasText: gw.entity_name }).first();
        await row.waitFor({ timeout: 30000 });
        await sleep(800);
        const listLine = short(await row.locator("p").last().textContent(), 240);
        const listCounts = listLine.match(/(\d+)\/(\d+) links live · (\d+)\/(\d+) codes live/);
        const listSaysLive = listCounts ? Number(listCounts[1]) + Number(listCounts[3]) : null;
        await row.click();
        const drawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: gw.entity_name, exact: true }) }).last();
        await drawer.getByRole("heading", { name: "Resident access links and codes" }).waitFor({ timeout: 30000 });
        await sleep(500);
        const rows = await drawer.evaluate((root) => {
          const found = [];
          for (const li of root.querySelectorAll("li")) {
            if (!/The link or code itself is not shown here/.test(li.textContent || "")) continue;
            const head = li.querySelector("div");
            const spans = head ? [...head.querySelectorAll("span")].map((s) => (s.textContent || "").trim()) : [];
            found.push({ label: spans[0] || "", pills: spans.slice(1) });
          }
          return found;
        });
        const liveRows = rows.filter((r) => r.pills.includes("Live")).length;
        add(
          1,
          rows.length > 0 && liveRows === 0 && listSaysLive === 0,
          `partnership ${pStatus}, ${enabled} link(s) and code(s) enabled and unexpired; drawer rows ${rows.length}, labelled "Live" ${liveRows} (${rows.map((r) => r.pills.join("/") || "no pill").join(", ")}); entity list says "${listCounts ? listCounts[0] : listLine}"`,
        );
      } finally {
        await context.close();
      }
    });

    // ── T4-08: the jurisdiction's public note ────────────────────────────────
    await guarded([2], async () => {
      if (!has("admin")) return skip(2, "admin not in REGRESS_PERSONAS");
      const m = must(await adminApi("regulatory", "GET", "meta"), "regulatory meta");
      const state = (m.states || []).find((s) => s.state_code === "WY") || (m.states || [])[0];
      const name = `${ctx.prefix} 865 Note Town`;
      const note = `${ctx.prefix} 865 public note: call the town clerk before you apply.`;
      const saved = must(
        await adminApi("regulatory", "POST", "jurisdiction-save", {
          jurisdiction: { type: "municipality", name, slug: `${ctx.prefix}-865-note-town`, parent_id: state.id, is_published: true, research_note: note },
        }),
        "jurisdiction-save",
      ).jurisdiction;
      noteJurisdiction = { ...saved, name, parent_id: state.id, slug: saved?.slug || `${ctx.prefix}-865-note-town` };
      const path = `/rules/${String(state.state_code).toLowerCase()}/${noteJurisdiction.slug}`;
      const context = await browser.newContext(DESKTOP);
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
        await page.locator("main h1").first().waitFor({ timeout: 60000 });
        await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
        await sleep(800);
        const text = norm(await page.locator("main").first().textContent());
        const shown = text.includes(norm(note));
        const standard = text.includes(`We have not verified ADU requirements for ${name} yet.`);
        add(2, shown && !standard, `${path}: the note is shown ${shown}; the standard sentence for ${name} is shown ${standard}`);
      } finally {
        await context.close();
      }
    });

    // ── T4-09: citation on the rule card, contact on the resource card ───────
    await guarded([3], async () => {
      const provisions = (await rest("regulatory_provisions_public?select=id,jurisdiction_id,source_citation,field_state&source_citation=not.is.null&field_state=neq.not_yet_researched&limit=20")).body;
      const resources = (await rest("government_resources_public?select=id,jurisdiction_id,contact_name,contact_title&or=(contact_name.not.is.null,contact_title.not.is.null)&limit=20")).body;
      const pList = Array.isArray(provisions) ? provisions : [];
      const rList = Array.isArray(resources) ? resources : [];
      if (!pList.length || !rList.length) return skip(3, `nothing to look at on this target: published rules with a citation ${pList.length}, resources with a contact ${rList.length}`);
      const context = await browser.newContext(DESKTOP);
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        const cardText = async (path, selector) => {
          await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
          await page.locator("main h1").first().waitFor({ timeout: 60000 });
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
          await sleep(800);
          const card = page.locator(selector).first();
          return (await card.count()) ? norm(await card.textContent()) : null;
        };
        let pSeen = null;
        for (const p of pList.slice(0, 5)) {
          const path = await pathOf(p.jurisdiction_id);
          if (!path) continue;
          const text = await cardText(path, `li[data-record="provision"][data-provision-id="${p.id}"]`);
          if (text === null) continue;
          pSeen = { path, citation: norm(p.source_citation), shown: text.includes(norm(p.source_citation)) };
          break;
        }
        let rSeen = null;
        for (const r of rList.slice(0, 5)) {
          const path = await pathOf(r.jurisdiction_id);
          if (!path) continue;
          const text = await cardText(path, `li[data-record="resource"][data-resource-id="${r.id}"]`);
          if (text === null) continue;
          const parts = [r.contact_name, r.contact_title].map(norm).filter(Boolean);
          rSeen = { path, parts, shown: parts.every((part) => text.includes(part)) };
          break;
        }
        if (!pSeen || !rSeen) return skip(3, `no card found on a public page: rule card ${Boolean(pSeen)}, resource card ${Boolean(rSeen)}`);
        add(
          3,
          pSeen.shown && rSeen.shown,
          `${pSeen.path}: citation "${pSeen.citation}" on the rule card ${pSeen.shown}; ${rSeen.path}: contact "${rSeen.parts.join(", ")}" on the resource card ${rSeen.shown}`,
        );
      } finally {
        await context.close();
      }
    });

    // ── T4-14: Content History rows ──────────────────────────────────────────
    await guarded([4], async () => {
      if (!has("admin")) return skip(4, "admin not in REGRESS_PERSONAS");
      if (!ctx.serviceKey) return skip(4, "no service role key: the fixture row cannot be removed afterwards");
      const S = svcHeaders(ctx);
      let key = null;
      for (const c of ["m6c6", "m6c5", "m5c9", "m5c8"]) {
        const row = await rest(`site_content?key=eq.course.chapter.${c}&select=key`, S);
        if (Array.isArray(row.body) && row.body.length === 0) {
          key = `course.chapter.${c}`;
          break;
        }
      }
      if (!key) return skip(4, "every candidate chapter already has an edited row here; the check does not touch real edits");
      const first = `${ctx.prefix} 865 first version of this chapter`;
      const second = `${ctx.prefix} 865 second version`;
      const label = `${ctx.prefix} 865 history fixture`;
      try {
        const publishText = async (text) => {
          must(await adminApi("content", "POST", "save-draft", { key, type: "blocks", page: "Course", label: key, value: [{ p: text }] }), "save-draft");
          must(await adminApi("content", "POST", "publish", { keys: [key] }), "publish");
        };
        await publishText(first);
        const own = (await rest(`site_content?key=eq.${encodeURIComponent(key)}&select=published_at`, S)).body?.[0]?.published_at || null;
        await sleep(2200);
        await publishText(second);
        const versions = must(await adminApi("content", "GET", `versions?key=${encodeURIComponent(key)}`), "versions").versions || [];
        const v = versions.find((x) => JSON.stringify(x.value || "").includes(first));
        if (!own || !v) throw new Error(`fixture incomplete: first publish time ${Boolean(own)}, archived first version ${Boolean(v)}`);

        const { context, page } = await signedInContext(browser, ctx, "admin", { viewport: { width: 1360, height: 900 } });
        try {
          await page.goto(`${ctx.base}/admin/content`, { waitUntil: "domcontentloaded" });
          await page.locator("main h1", { hasText: "Content" }).first().waitFor({ timeout: 60000 });
          await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
          await sleep(1000);
          // The same message the iframe'd page posts when a section is clicked.
          await page.evaluate(([k, l]) => window.postMessage({ source: "aduatlas-admin-edit", keys: [k], label: l }, window.location.origin), [key, label]);
          const over = page.locator("div.fixed", { has: page.getByRole("heading", { name: label }) }).last();
          await over.waitFor({ timeout: 30000 });
          await over.getByRole("button", { name: /History/ }).first().click();
          const restore = over.getByRole("button", { name: "Restore" }).first();
          await restore.waitFor({ timeout: 30000 });
          const rowText = norm(await restore.locator("xpath=..").textContent());
          const [ownShown, replacedShown] = await page.evaluate(([a, b]) => [new Date(a).toLocaleString(), new Date(b).toLocaleString()], [own, v.published_at]);
          const preview = rowText.includes(first);
          const ownTime = rowText.includes(ownShown);
          const replacedLabelled = rowText.includes(replacedShown) && /Replaced/.test(rowText);
          const bareArchiveTime = rowText.includes(replacedShown) && !/Replaced/.test(rowText);
          add(
            4,
            preview && (ownTime || replacedLabelled) && !bareArchiveTime,
            `row: "${short(rowText, 220)}"; preview of the version ${preview}; its own publish time (${ownShown}) shown ${ownTime}; the replaced time (${replacedShown}) labelled as such ${replacedLabelled}; API preview field ${typeof v.preview === "string" ? "present" : "absent"}`,
          );
        } finally {
          await context.close();
        }
      } finally {
        // Only ever the row this check created: the key had no row when it started.
        await rest(`site_content?key=eq.${encodeURIComponent(key)}`, { ...S, Prefer: "return=minimal" }, { method: "DELETE" }).catch(() => {});
      }
    });

    // ── T4-19: the Golden dashboard's next steps ─────────────────────────────
    await guarded([5], async () => {
      if (!has("golden_purchased")) return skip(5, "golden_purchased not in REGRESS_PERSONAS");
      const { context, page } = await signedInContext(browser, ctx, "golden_purchased");
      try {
        await page.goto(`${ctx.base}/dashboard`, { waitUntil: "domcontentloaded" });
        const heading = page.getByRole("heading", { name: "Next steps" });
        await heading.waitFor({ timeout: 60000 });
        await sleep(1500);
        const steps = await heading.locator("xpath=..").evaluate((card) =>
          [...card.querySelectorAll("li")].map((li) => ({
            label: (li.querySelector("span.flex-1")?.textContent || li.textContent || "").trim(),
            href: li.querySelector("a")?.getAttribute("href") || null,
            cta: (li.querySelector("a")?.textContent || "").trim(),
          })),
        );
        const sitePlan = steps.filter((s) => s.href === "/site-plan");
        const upgrade = steps.some((s) => (s.href || "").startsWith("/unlock"));
        add(
          5,
          steps.length > 0 && sitePlan.length === 0,
          `next steps: ${steps.map((s) => `${s.label}${s.href ? ` [${s.cta} ${s.href}]` : ""}`).join("; ")}; site plan offered to open ${sitePlan.length}; an upgrade step ${upgrade}`,
        );
      } finally {
        await context.close();
      }
    });

    // ── T4-20: the worksheet bar after a refused save, and after an accepted one
    await guarded([6, 7], async () => {
      if (!ctx.serviceKey) {
        skip(6, "no service role key: the fixture account cannot be created");
        return skip(7, "no service role key: the fixture account cannot be created");
      }
      const who = await makeHomeowner(ctx, "865-ws-bar");
      try {
        await stampPurchase(ctx, who.rowId, "report");
        const row = (page, name) => page.locator("table tbody tr", { has: page.locator("td", { hasText: new RegExp(`^${name}$`) }) }).first();
        const barText = (page) => page.getByRole("button", { name: /Print/ }).first().locator("xpath=..").textContent().then(norm, () => "");
        const settle = async (page, want) => {
          const until = Date.now() + 12000;
          let text = "";
          while (Date.now() < until) {
            text = await barText(page);
            if (want(text)) return text;
            await sleep(500);
          }
          return text;
        };

        // Refused: the write is answered 403 42501 in the browser, the way the
        // database refuses an account without the entitlement.
        await guarded([6], async () => {
          const { context, page } = await signedInContext(browser, ctx, { email: who.email, password: who.password });
          try {
            let refused = 0;
            await context.route(
              (u) => u.pathname === "/rest/v1/rpc/save_homeowner_worksheets",
              (route) => {
                refused += 1;
                return route.fulfill({
                  status: 403,
                  contentType: "application/json",
                  body: JSON.stringify({ code: "42501", details: null, hint: null, message: "permission denied for function save_homeowner_worksheets" }),
                });
              },
            );
            await page.goto(`${ctx.base}/packet/pre-site-estimate`, { waitUntil: "domcontentloaded" });
            await row(page, "Sewer").waitFor({ state: "visible", timeout: 60000 });
            await sleep(1500);
            await row(page, "Sewer").locator("input").first().fill("7");
            await sleep(1500);
            const text = await settle(page, (t) => /on this device/i.test(t));
            const copy = await readServerCopy(ctx, who.rowId);
            const reached = copy?.worksheets?.preSiteEstimate?.values?.["Sewer-dist"] === "7";
            add(
              6,
              refused > 0 && /on this device/i.test(text) && !reached,
              `writes refused in the browser ${refused}; the value reached the server ${reached}; the bar reads "${short(text.replace(/Print \/ save PDF/, ""), 120) || "(nothing)"}"`,
            );
          } finally {
            await context.close();
          }
        });

        // Accepted: the same page, the write goes through.
        await guarded([7], async () => {
          const { context, page } = await signedInContext(browser, ctx, { email: who.email, password: who.password });
          try {
            await page.goto(`${ctx.base}/packet/pre-site-estimate`, { waitUntil: "domcontentloaded" });
            await row(page, "Sewer").waitFor({ state: "visible", timeout: 60000 });
            await sleep(1500);
            await row(page, "Sewer").locator("input").first().fill("8");
            let reached = false;
            for (let i = 0; i < 30 && !reached; i += 1) {
              await sleep(500);
              reached = (await readServerCopy(ctx, who.rowId))?.worksheets?.preSiteEstimate?.values?.["Sewer-dist"] === "8";
            }
            const text = await settle(page, (t) => /\bSaved\b/.test(t) && !/device/i.test(t));
            add(
              7,
              reached && /\bSaved\b/.test(text) && !/device/i.test(text),
              `the value reached the server ${reached}; the bar reads "${short(text.replace(/Print \/ save PDF/, ""), 120) || "(nothing)"}"`,
            );
          } finally {
            await context.close();
          }
        });
      } finally {
        await who.cleanup();
      }
    });
  } finally {
    await browser.close().catch(() => {});
    // The T4-08 fixture: unpublished first, so it leaves the public site even if
    // the delete is refused, then deleted.
    if (noteJurisdiction?.id) {
      await adminApi("regulatory", "POST", "jurisdiction-save", {
        jurisdiction: { id: noteJurisdiction.id, type: "municipality", name: noteJurisdiction.name, slug: noteJurisdiction.slug, parent_id: noteJurisdiction.parent_id, is_published: false, research_note: "" },
      }).catch(() => {});
      if (ctx.serviceKey) {
        const del = await rest(`jurisdictions?id=eq.${noteJurisdiction.id}`, { ...svcHeaders(ctx), Prefer: "return=minimal" }, { method: "DELETE" }).catch(() => null);
        if (del && del.status >= 300) ctx.log(`865: the note fixture ${noteJurisdiction.slug} is unpublished but could not be deleted (HTTP ${del.status})`);
      }
    }
  }
  return out;
}
