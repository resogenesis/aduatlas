// Two government decisions for RC4a (Richard, after the RC4 rehearsal).
//
// T4-06: "Add an in-app government claim path." A government user with no
// membership had no route to /gov/claim inside the product; the jurisdiction
// page offered a mailto. Now the unclaimed jurisdiction page and the rules index
// link into /gov/claim, the jurisdiction page preselects its own record, a
// signed-out visitor comes back to that preselection after signing in, and email
// stays as a secondary fallback. Verification is unchanged (a claim is still
// only a request; the database suite holds that).
//
// R3-23(c): "Open the read path." After a verification withdrawal the portal
// said it could not show the entity's submission history. Since 0026 the
// submitter reads their own submissions (the database side is invariant 310),
// so the withdrawn portal never says the history cannot be shown.
//
//   1. an unclaimed jurisdiction page links "Claim this government profile" to
//      /gov/claim with its state and jurisdiction preselected, and still offers
//      email as a secondary option
//   2. following that link signed out leads to sign-in and, after it, back to
//      /gov/claim with the same preselection, the jurisdiction chosen
//   3. the rules index links "Claim a government profile" to /gov/claim
//   4. the withdrawn portal's rules and resources page lists the submitter's
//      OWN submissions, read from the server (finding 25: the persona had sent
//      nothing, so the page read "You have not sent anything" whether or not
//      the read path worked, and the rule could not fail).
//
// RULE 4'S FIXTURE, AND WHY IT IS NOT DELETED. Two submissions attributed to
// gov_withdrawn's own government user on its own entity, written with the
// service role: one withdrawn, one ADUAtlas answered (not accepted, with a
// review note). Neither is open, so neither enters the admin review queue.
// A submission can never be deleted, by anyone including the service role
// (trigger regulatory_submissions_no_delete, 0012, decision 2m: it is the
// government's half of the record), so these two are found by their fixed
// labels and REUSED on every run rather than made again. The persona's plan,
// membership and tokens are not touched.
// The page must list both under "What you have sent", the withdrawn one as
// Withdrawn and the answered one with ADUAtlas's answer, and show neither the
// "Reading what this entity has sent." placeholder nor "You have not sent
// anything". The rows must come from the server's own answer to the page's
// read (0026 lets the submitter read them; without it RLS returns none). For
// the action restriction to mean something, one OPEN submission is added to
// that answer inside the browser (it never exists on the server): a withdrawn
// entity's page must show it and still offer no "Withdraw this submission".
// The entity has no other member on staging, so the colleague negative control
// (a colleague's row must not be listed) cannot be run without creating a
// member, and is left to invariant 310.
import { makeHomeowner, svcHeaders } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "862 government claiming happens in the product, and a withdrawal keeps the submitter's history",
  rules: [
    "an unclaimed jurisdiction page links to /gov/claim with its record preselected and keeps email as a secondary option",
    "a signed-out visitor who follows the claim link signs in and lands back on /gov/claim with the jurisdiction preselected",
    "the rules index links to /gov/claim",
    "the withdrawn government portal lists the submitter's own submissions read from the server, a withdrawn one as Withdrawn and an answered one with ADUAtlas's answer, and offers no withdraw action",
  ],
};

const DESKTOP = { viewport: { width: 1280, height: 900 } };

const signInPersona = async (page, ctx, persona) => {
  const c = ctx.creds(persona);
  await page.goto(`${ctx.base}/login`, { waitUntil: "domcontentloaded" });
  try {
    await page.locator('main input[type="email"]').fill(c.email, { timeout: 30000 });
    await page.locator('main input[type="password"]').fill(c.password, { timeout: 30000 });
  } catch {
    throw new Error(`the sign-in form could not be filled for ${persona} (details withheld)`);
  }
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }), page.locator('main button[type="submit"]').click()]);
};

// An unclaimed, unverified entity seated in a published jurisdiction, and that
// jurisdiction's public page path.
const findUnclaimed = async (ctx) => {
  const H = svcHeaders(ctx);
  const ents = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/government_entities?claimed_at=is.null&verification_status=eq.unverified&select=id,jurisdiction_id&limit=50`, { headers: H });
  for (const e of Array.isArray(ents.body) ? ents.body : []) {
    const j = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/jurisdictions?id=eq.${e.jurisdiction_id}&published_at=not.is.null&select=id,slug,state_code,jurisdiction_type`, { headers: H });
    const row = Array.isArray(j.body) ? j.body[0] : null;
    if (row?.slug && row.state_code && row.jurisdiction_type !== "state" && row.jurisdiction_type !== "country") {
      return { entityId: e.id, jurisdictionId: row.id, state: row.state_code, path: `/rules/${row.state_code.toLowerCase()}/${row.slug}` };
    }
  }
  return null;
};

// Rule 4's two permanent submissions (see the header), found or made once.
const HISTORY = {
  withdrawn: "regress-862 history fixture: a submission this member withdrew",
  answered: "regress-862 history fixture: a submission ADUAtlas answered",
};
const ANSWER = "regress-862 history fixture: ADUAtlas's answer, kept after the withdrawal";
const OPEN_LABEL = "regress-862 open submission (added in the browser only)";
const historyFixture = async (ctx, persona) => {
  const H = svcHeaders(ctx);
  const gu = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/government_users?user_id=eq.${persona.app_user_id}&select=id`, { headers: H });
  const govUserId = Array.isArray(gu.body) ? gu.body[0]?.id : null;
  if (!govUserId) throw new Error(`gov_withdrawn has no government_users row (HTTP ${gu.status})`);
  const base = `${ctx.supabaseUrl}/rest/v1/regulatory_submissions`;
  const mine = await ctx.fetchJson(`${base}?entity_id=eq.${persona.entity_id}&submitted_by_government_user_id=eq.${govUserId}&kind=eq.resource&select=id,status,withdrawn_at,review_note,payload`, { headers: H });
  const rows = Array.isArray(mine.body) ? mine.body : [];
  const found = (label) => rows.find((r) => r.payload?.label === label) || null;
  const now = new Date().toISOString();
  const make = async (label, extra) => {
    const r = await ctx.fetchJson(`${base}?select=id,status,withdrawn_at,review_note,payload`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({
        kind: "resource",
        jurisdiction_id: persona.jurisdiction_id,
        entity_id: persona.entity_id,
        submitted_by_government_user_id: govUserId,
        resource_type: "official_adu_page",
        payload: { label, url: "https://regress.aduatlas.test/862-history", source_url: "https://regress.aduatlas.test/862-history", source_type: null },
        submitter_note: "regress-862: a permanent behavioural-suite fixture (a submission cannot be deleted); reused by every run",
        ...extra,
      }),
    });
    const row = Array.isArray(r.body) ? r.body[0] : null;
    if (!row?.id) throw new Error(`the history fixture could not be written: HTTP ${r.status}`);
    return row;
  };
  let made = 0;
  let withdrawn = found(HISTORY.withdrawn);
  if (!withdrawn) {
    withdrawn = await make(HISTORY.withdrawn, { status: "withdrawn", withdrawn_at: now });
    made += 1;
  }
  let answered = found(HISTORY.answered);
  if (!answered) {
    answered = await make(HISTORY.answered, { status: "rejected", reviewed_at: now, review_note: ANSWER });
    made += 1;
  }
  return { govUserId, withdrawn, answered, made };
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `gov-claim-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  let fixture = null;
  try {
    // 1 and 2.
    const target = ctx.serviceKey ? await findUnclaimed(ctx) : null;
    if (!target) {
      add(0, false, ctx.serviceKey ? "no unclaimed entity in a published jurisdiction was found on this target" : "no service role key; cannot find an unclaimed entity");
      add(1, false, "depends on rule 1");
    } else {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      await page.goto(`${ctx.base}${target.path}`, { waitUntil: "networkidle" });
      const link = page.getByRole("link", { name: "Claim this government profile" }).first();
      const href = (await link.count()) ? await link.getAttribute("href") : null;
      const url = href ? new URL(href, ctx.base) : null;
      const pre = url && url.pathname === "/gov/claim" && url.searchParams.get("jurisdiction") === target.jurisdictionId && url.searchParams.get("state") === target.state;
      const mail = await page.locator('a[href^="mailto:"]').filter({ hasText: /government account/i }).count();
      add(0, Boolean(pre) && mail > 0, `claim link ${href || "absent"}; email fallback present: ${mail > 0}`);

      if (pre) {
        await link.click();
        await page.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
        const atLogin = new URL(page.url());
        fixture = await makeHomeowner(ctx, "862-claimant");
        try {
          await page.locator('main input[type="email"]').fill(fixture.email, { timeout: 30000 });
          await page.locator('main input[type="password"]').fill(fixture.password, { timeout: 30000 });
        } catch {
          throw new Error("the sign-in form could not be filled for the fixture (details withheld)");
        }
        await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }).catch(() => {}), page.locator('main button[type="submit"]').click()]);
        await page.waitForTimeout(3000);
        const back = new URL(page.url());
        const selected = await page.evaluate(() => [...document.querySelectorAll("select")].map((s) => s.value));
        add(1, atLogin.pathname.startsWith("/login") && back.pathname === "/gov/claim" && back.searchParams.get("jurisdiction") === target.jurisdictionId && selected.includes(target.jurisdictionId),
          `went to ${atLogin.pathname}, came back to ${back.pathname}${back.search}; selects ${selected.length}, jurisdiction chosen: ${selected.includes(target.jurisdictionId)}`);
      } else add(1, false, "the page has no preselecting claim link to follow");
      await context.close();
    }

    // 3.
    {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      await page.goto(`${ctx.base}/rules`, { waitUntil: "networkidle" });
      const link = page.getByRole("link", { name: "Claim a government profile" }).first();
      const href = (await link.count()) ? await link.getAttribute("href") : null;
      add(2, href === "/gov/claim", `link ${href || "absent"}`);
      await context.close();
    }

    // 4. The submitter's own history after a withdrawal (finding 25).
    if (!ctx.serviceKey) add(3, false, "no service role key; the history fixture cannot be found or written");
    else {
      const persona = ctx.creds("gov_withdrawn");
      const fx = await historyFixture(ctx, persona);
      const context = await browser.newContext(DESKTOP);
      try {
        const sb = new URL(ctx.supabaseUrl).origin;
        // What the server answered the page's own read, and one open
        // submission added to that answer here (it never exists on the server).
        const served = { reads: 0, ids: [] };
        await context.route(
          (u) => u.origin === sb && u.pathname === "/rest/v1/regulatory_submissions",
          async (route) => {
            const req = route.request();
            if (req.method() !== "GET" || !req.url().includes(`entity_id=eq.${persona.entity_id}`)) return route.fallback();
            const response = await route.fetch();
            let rows = null;
            try {
              rows = await response.json();
            } catch {
              rows = null;
            }
            if (!Array.isArray(rows)) return route.fulfill({ response });
            served.reads += 1;
            served.ids = rows.map((r) => r.id);
            const open = {
              id: "00000000-0000-4000-8000-000000000862",
              kind: "resource",
              jurisdiction_id: persona.jurisdiction_id,
              entity_id: persona.entity_id,
              topic_key: null,
              resource_type: "official_adu_page",
              payload: { label: OPEN_LABEL },
              submitter_note: null,
              status: "submitted",
              review_note: null,
              reviewed_at: null,
              resulting_provision_id: null,
              resulting_resource_id: null,
              withdrawn_at: null,
              submitted_at: new Date().toISOString(),
            };
            return route.fulfill({ response, json: [open, ...rows] });
          }
        );
        const page = await context.newPage();
        await signInPersona(page, ctx, "gov_withdrawn");
        await page.goto(`${ctx.base}/gov/regulatory`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2500);
        const text = (await page.locator("main").first().innerText()).replace(/\s+/g, " ");
        const history = text.split("What you have sent")[1] || "";
        const item = async (label) => {
          const li = page.locator("main li", { hasText: label }).first();
          return (await li.count()) ? (await li.innerText()).replace(/\s+/g, " ") : "";
        };
        const w = await item(HISTORY.withdrawn);
        const a = await item(HISTORY.answered);
        const o = await item(OPEN_LABEL);
        const fromServer = [fx.withdrawn.id, fx.answered.id].every((id) => served.ids.includes(id));
        const withdrawControls = await page.getByRole("button", { name: /Withdraw this submission/ }).count();
        const reading = /Reading what this entity has sent/.test(history);
        const none = /You have not sent anything/.test(history);
        const old = /cannot show that history/i.test(text);
        add(
          3,
          fromServer && /Withdrawn/.test(w) && a.includes(`ADUAtlas: ${ANSWER}`) && /Not accepted/.test(a) && Boolean(o) && withdrawControls === 0 && !reading && !none && !old,
          `fixture rows ${fx.made ? `written now (${fx.made})` : "reused"}; the page's read answered by the server ${served.reads} time(s), holding both own rows: ${fromServer}; ` +
            `withdrawn row listed: ${Boolean(w)} (as Withdrawn: ${/Withdrawn/.test(w)}); answered row listed: ${Boolean(a)} (answer shown: ${a.includes(ANSWER)}); open row listed: ${Boolean(o)}; ` +
            `"Withdraw this submission" controls: ${withdrawControls}; "Reading..." shown: ${reading}; "You have not sent anything" shown: ${none}; old "cannot show" sentence: ${old}`
        );
      } finally {
        await context.close();
      }
    }
  } catch (e) {
    for (let i = 0; i < meta.rules.length; i += 1) if (!out.some((r) => r.name === `gov-claim-${i + 1}`)) add(i, false, `check stopped: ${e.message}`);
  } finally {
    await browser.close().catch(() => {});
    if (fixture) await fixture.cleanup().catch(() => {});
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
}
