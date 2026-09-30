// 431 — the government claim confirmation stays on screen (RC3 triage R3-07).
//
// RC3: after "Send this claim for review" the claim was recorded, but the page
// never showed "Claim recorded". GovClaim called the layout's reload(), GovLayout
// swapped the whole outlet for "Reading your government access from the server."
// while it re-read, and that unmounted GovClaim and threw its confirmation away:
// the claimant saw an empty claim form, which reads as a failure and invites a
// resubmit.
//
// The defect is in the browser (component state across the layout's re-read),
// so the claim RPC itself is answered inside the browser with the exact shape
// claim_government_entity() returns for this persona's existing pending
// membership. Nothing is written: re-claiming for real would still append an
// audit row. In the first run everything after the answer is real: the layout's
// re-read of my_government_context() goes to the target.
//
// The second run answers every my_government_context() read made after the
// claim with a server error, the case of a claim the server recorded and a
// re-read that did not answer. The confirmation must still be on screen, with
// a line saying the access could not be re-read, not the portal's full-page
// "We could not read your access" in its place.
export const meta = {
  name: "431 government claim confirmation survives the portal re-read",
  rules: [
    "R3-07: after a successful claim the claimant sees 'Claim recorded' and its next step, not an empty form",
    "R3-07: the confirmation stays when the portal's re-read after the claim fails",
  ],
};

const PERSONA = "gov_claimed";

// Sign in through the real /login form. Typed values never reach an error or a
// log: a failed fill is replaced by a fixed sentence (a Playwright error once
// echoed a persona password). A rate-limited attempt waits and retries.
const signIn = async (page, ctx, persona, path = "/login") => {
  const c = ctx.creds(persona);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
    try {
      await page.locator('main input[type="email"]').fill(c.email, { timeout: 30000 });
      await page.locator('main input[type="password"]').fill(c.password, { timeout: 30000 });
    } catch {
      throw new Error(`the sign-in form could not be filled for ${persona} (details withheld)`);
    }
    await page.locator('main button[type="submit"]').click();
    const left = page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }).then(() => "in", () => "stuck");
    const limited = page.locator("main").getByText(/rate limit|too many/i).first().waitFor({ timeout: 45000 }).then(() => "limited", () => "stuck");
    const outcome = await Promise.race([left, limited]);
    if (outcome === "in") return new URL(page.url()).pathname;
    if (outcome === "limited") {
      await page.waitForTimeout(65000);
      continue;
    }
    throw new Error(`sign-in for ${persona} did not leave /login`);
  }
  throw new Error(`sign-in for ${persona} was still rate-limited after four tries`);
};

export default async function (ctx) {
  const skip = (detail) => meta.rules.map((rule, i) => ({ name: i === 0 ? "claim-recorded-stays" : "claim-recorded-survives-failed-reread", rule, status: "skip", detail }));
  let c;
  try {
    c = ctx.creds(PERSONA);
  } catch (e) {
    return skip(String(e.message || e));
  }
  if (!c.entity_id || !c.entity_seat_jurisdiction_id) return skip(`${PERSONA} has no entity_id or seat jurisdiction in REGRESS_PERSONAS`);
  if (!ctx.serviceKey) return skip("no service role key in REGRESS_ENV_FILE, so the entity's state cannot be looked up");
  const j = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/jurisdictions?select=state_code&id=eq.${c.entity_seat_jurisdiction_id}`, {
    headers: { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` },
  });
  const stateCode = Array.isArray(j.body) ? j.body[0]?.state_code : null;
  if (!stateCode) return skip(`seat jurisdiction ${c.entity_seat_jurisdiction_id} not found`);

  const browser = await ctx.launch();
  // One claim, answered in-browser. failReread: every my_government_context()
  // read after the click is answered with a PostgREST-shaped 500.
  const run = async (failReread) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sb = new URL(ctx.supabaseUrl).origin;
    let intercepted = 0;
    let armed = false;
    let failedReads = 0;
    await context.route(
      (u) => u.origin === sb && u.pathname === "/rest/v1/rpc/claim_government_entity",
      (route) => {
        intercepted += 1;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            entity_id: c.entity_id,
            entity_name: c.entity_name || "the entity",
            entity_state: "claimed",
            membership_id: c.membership_id || null,
            membership_status: "pending",
            verified: false,
            next_step:
              "ADUAtlas reviews the claim and confirms your authority to represent this entity. A claim is not a verification, and verification is not a publishing right.",
          }),
        });
      }
    );
    if (failReread) {
      await context.route(
        (u) => u.origin === sb && u.pathname === "/rest/v1/rpc/my_government_context",
        (route) => {
          if (!armed) return route.continue();
          failedReads += 1;
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ code: "XX000", message: "answered in the browser by regress 431", details: null, hint: null }),
          });
        }
      );
    }
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      const landed = await signIn(page, ctx, PERSONA, `/login?next=${encodeURIComponent("/gov/claim")}`);
      if (!landed.startsWith("/gov/claim")) await page.goto(`${ctx.base}/gov/claim`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Claim a government entity" }).waitFor();

      const selects = page.locator("form select");
      await page.waitForFunction((code) => [...document.querySelectorAll("form select")][0]?.querySelector(`option[value="${code}"]`), stateCode);
      await selects.nth(0).selectOption(stateCode);
      await page.waitForFunction((id) => [...document.querySelectorAll("form select")][1]?.querySelector(`option[value="${id}"]`), c.entity_seat_jurisdiction_id);
      await selects.nth(1).selectOption(c.entity_seat_jurisdiction_id);
      await page.locator(`input[type="radio"][value="${c.entity_id}"]`).check();
      await page.getByPlaceholder("Jordan Ellis").fill("Regress Claimant");
      // Not the persona's sign-in address: a made-up one at the same domain, so
      // nothing that could be echoed from this field is an account identifier.
      await page.getByPlaceholder("you@city.gov").fill(`${ctx.prefix}@${c.entity_domain || "example.test"}`);

      // Record every h1 the page shows from the click onwards.
      await page.evaluate(() => {
        window.__h1s = [];
        const note = () => {
          const t = (document.querySelector("main h1")?.innerText || "").trim();
          if (window.__h1s[window.__h1s.length - 1] !== t) window.__h1s.push(t);
        };
        new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
      });
      armed = true;
      await page.getByRole("button", { name: "Send this claim for review" }).click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(2500);

      const h1s = await page.evaluate(() => window.__h1s);
      const finalH1 = ((await page.locator("main h1").first().innerText().catch(() => "")) || "").trim();
      const main = await page.locator("main").innerText();
      const confirmed =
        intercepted === 1 &&
        finalH1 === "Claim recorded" &&
        /A claim is not a verification/.test(main) &&
        (await page.getByRole("button", { name: "Send this claim for review" }).count()) === 0;
      const staleLine = await page.locator("[data-gov-reread-failed]").count();
      const fullPageError = /We could not read your access/.test(main);
      return { confirmed, h1s, finalH1, intercepted, failedReads, staleLine, fullPageError };
    } finally {
      await context.close();
    }
  };

  try {
    const a = await run(false);
    const b = await run(true);
    return [
      {
        name: "claim-recorded-stays",
        rule: meta.rules[0],
        status: a.confirmed ? "pass" : "fail",
        detail: `claim answered in-browser ${a.intercepted}x; headings after send: ${JSON.stringify(a.h1s)}; final: "${a.finalH1}"`,
      },
      {
        name: "claim-recorded-survives-failed-reread",
        rule: meta.rules[1],
        status: b.confirmed && b.failedReads > 0 && b.staleLine > 0 && !b.fullPageError ? "pass" : "fail",
        detail: `claim answered in-browser ${b.intercepted}x; re-reads answered with 500: ${b.failedReads}; headings after send: ${JSON.stringify(b.h1s)}; final: "${b.finalH1}"; "could not re-read" line ${b.staleLine > 0 ? "shown" : "absent"}; full-page error ${b.fullPageError ? "shown" : "absent"}`,
      },
    ];
  } finally {
    await browser.close();
  }
}
