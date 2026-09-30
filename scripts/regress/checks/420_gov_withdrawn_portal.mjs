// 420 — a government whose verification was withdrawn, and a verified government
// with no partnership, see the truth in the portal and no action they cannot
// perform (decisions 2p and 2s; DEF-22 display, DEF-18 gating).
//
//   gov_withdrawn   ADUAtlas verified it, then withdrew the verification; the
//                   partnership was suspended with it and the membership is still
//                   verified. The portal must say it was withdrawn (not "Not
//                   claimed"), must not claim it "May submit" or "Can submit",
//                   must offer no route to submit, and must offer no link or code
//                   issuance, saying plainly that issuance is unavailable. The
//                   database must refuse an issuance attempt too, because
//                   authorization is never UI gating alone.
//   gov_verified    verified, no partnership: no issuance control, and a plain
//                   sentence that links and codes cannot be issued.
// Read-only except one refused insert attempt; if the database ever accepted it,
// the row is switched off with the service key at once.
export const meta = {
  name: "420 gov withdrawn portal",
  rules: ["2s withdrawal stops the future", "2p no tooling without an active partnership", "DEF-22", "DEF-18"],
};

const pass = (name, rule, detail) => ({ name, rule, status: "pass", detail });
const fail = (name, rule, detail) => ({ name, rule, status: "fail", detail });

const R_IDENTITY = "a withdrawn government is shown as withdrawn, never as unclaimed";
const R_SUBMIT = "a withdrawn government is not told it may submit and is offered no submit action";
const R_ISSUE = "no resident access issuance control without an active partnership of a verified entity";
const R_SAYS = "the portal says plainly when resident access cannot be issued";
const R_DB = "the database refuses resident access issued by a withdrawn government";

const uiLogin = async (page, base, email, password) => {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
};

const settle = async (page) => {
  await page
    .waitForFunction(
      () => !/Reading your government access from the server|Reading your partnership|Reading this entity's partnership|Reading your (links|codes)/.test(document.body.innerText),
      null,
      { timeout: 30000 }
    )
    .catch(() => {});
  await page.waitForTimeout(1500);
};

const ISSUANCE_CONTROLS = ["Create a link", "Create a code", "Switch this link off", "Switch this code off"];
const UNAVAILABLE = /cannot be issued/i;

const issuanceControls = async (page) => {
  const found = [];
  for (const name of ISSUANCE_CONTROLS) {
    if ((await page.getByRole("button", { name }).count()) > 0) found.push(name);
  }
  return found;
};

export default async function (ctx) {
  const out = [];
  const withdrawn = ctx.creds("gov_withdrawn");
  const verified = ctx.creds("gov_verified");
  const browser = await ctx.launch();
  try {
    // ── gov_withdrawn: /gov ───────────────────────────────────────────────
    const wctx = await browser.newContext();
    const page = await wctx.newPage();
    await uiLogin(page, ctx.base, withdrawn.email, withdrawn.password);
    await page.goto(`${ctx.base}/gov`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: withdrawn.entity_name }).first().waitFor({ timeout: 30000 });
    await settle(page);
    const main = await page.locator("main").innerText();

    {
      const problems = [];
      if (/\bNot claimed\b/.test(main)) problems.push('identity card says "Not claimed"');
      if (/compiled this record from public government sources/i.test(main)) problems.push("describes the entity as never having taken part");
      if (!/withdrawn/i.test(main)) problems.push('the word "withdrawn" appears nowhere on the portal home');
      out.push(problems.length ? fail("withdrawn-identity-truthful", R_IDENTITY, problems.join("; ")) : pass("withdrawn-identity-truthful", R_IDENTITY, "shown as verification withdrawn"));
    }
    {
      const problems = [];
      if (/\bMay submit\b/.test(main)) problems.push('a granted jurisdiction is labelled "May submit"');
      if (/\bCan submit\b/.test(main)) problems.push('the account is described as "Can submit"');
      const open = await page.getByRole("link", { name: /Open rules and resources/i }).count();
      if (open) problems.push('an "Open rules and resources" submit action is offered');
      out.push(problems.length ? fail("withdrawn-no-submit-claim", R_SUBMIT, problems.join("; ")) : pass("withdrawn-no-submit-claim", R_SUBMIT, "no submit claim and no submit action"));
    }

    // ── gov_withdrawn: /gov/partnership, opened directly ─────────────────
    await page.goto(`${ctx.base}/gov/partnership`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Resident access" }).first().waitFor({ timeout: 30000 });
    await settle(page);
    {
      const controls = await issuanceControls(page);
      const nav = await page.getByRole("link", { name: "Resident access" }).count();
      out.push(
        controls.length || nav
          ? fail("withdrawn-no-issuance-control", R_ISSUE, `offered: ${[...controls, ...(nav ? ["Resident access nav"] : [])].join(", ")}`)
          : pass("withdrawn-no-issuance-control", R_ISSUE, "no issuance control and no Resident access nav item")
      );
      const text = await page.locator("main").innerText();
      out.push(
        UNAVAILABLE.test(text) && /withdrawn/i.test(text)
          ? pass("withdrawn-says-issuance-unavailable", R_SAYS, "says links and codes cannot be issued because the verification is withdrawn")
          : fail("withdrawn-says-issuance-unavailable", R_SAYS, "does not say that issuance is unavailable because the verification was withdrawn")
      );
    }
    await wctx.close();

    // ── gov_withdrawn: the database, directly ────────────────────────────
    {
      const bearer = await ctx.token("gov_withdrawn");
      const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/partner_access_codes?select=id`, {
        method: "POST",
        headers: {
          apikey: ctx.anonKey,
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ partnership_id: withdrawn.partnership_id, jurisdiction_id: withdrawn.jurisdiction_id, label: `${ctx.prefix} refused` }),
      });
      if (r.status < 300) {
        const id = Array.isArray(r.body) ? r.body[0]?.id : null;
        if (id) {
          await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/partner_access_codes?id=eq.${id}`, {
            method: "PATCH",
            headers: { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
            body: JSON.stringify({ is_active: false }),
          });
        }
        out.push(fail("withdrawn-db-refuses-issuance", R_DB, `insert accepted (HTTP ${r.status}); the row was switched off`));
      } else {
        out.push(pass("withdrawn-db-refuses-issuance", R_DB, `refused with HTTP ${r.status}`));
      }
    }

    // ── gov_verified, no partnership: /gov/partnership ───────────────────
    {
      const vctx = await browser.newContext();
      const vp = await vctx.newPage();
      await uiLogin(vp, ctx.base, verified.email, verified.password);
      await vp.goto(`${ctx.base}/gov/partnership`, { waitUntil: "domcontentloaded" });
      await vp.getByRole("heading", { name: "Resident access" }).first().waitFor({ timeout: 30000 });
      await settle(vp);
      const controls = await issuanceControls(vp);
      out.push(
        controls.length
          ? fail("non-partner-no-issuance-control", R_ISSUE, `offered: ${controls.join(", ")}`)
          : pass("non-partner-no-issuance-control", R_ISSUE, "a verified non-partner sees no issuance control")
      );
      const text = await vp.locator("main").innerText();
      out.push(
        UNAVAILABLE.test(text)
          ? pass("non-partner-says-issuance-unavailable", R_SAYS, "says links and codes cannot be issued")
          : fail("non-partner-says-issuance-unavailable", R_SAYS, "does not say plainly that links and codes cannot be issued")
      );
      await vctx.close();
    }
  } finally {
    await browser.close();
  }
  return out;
}
