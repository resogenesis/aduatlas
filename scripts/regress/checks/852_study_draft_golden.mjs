// Decision 2q (R3-03): a homeowner at ANY tier, including free and Golden, may
// begin and SAVE the feasibility intake as a draft; only the submit is gated,
// and the database is what gates it (migration 0018). RC3 put a Platinum route
// gate on /study, so a Golden homeowner met "This is part of Platinum." and a
// free one "This is part of the paid system.", and neither could save anything.
//
// Two homeowner fixtures, one Golden (stamped the way api/stripe-webhook.js
// stamps a paid session) and one free (never stamped), each sign in through
// /login, open /study, type into the first intake field and press the save
// button. Proven from both sides, for each:
//   1. the page is the intake, not a paywall;
//   2. the database holds a studies row for the fixture with status 'draft'
//      (never 'submitted') carrying what was typed.
//
// The fixtures are named ${ctx.prefix}-852-*, so they share no name with any
// other check in the same run (run.mjs gives every check the same prefix; 713
// also makes a Golden homeowner). They and their studies are removed at the
// end (studies.user_id cascades). A failed sign-in is reported with the typed values redacted.
export const meta = {
  name: "852 Golden and free homeowners save a feasibility intake draft (2q)",
  rules: ["2q: a Golden or free homeowner can open /study and save a draft; only the submit is gated"],
};

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const redact = (text, secrets) => secrets.filter(Boolean).reduce((s, v) => s.split(v).join("[redacted]"), String(text || ""));

export default async function (ctx) {
  const out = [];
  const add = (name, ok, detail) => out.push({ name, rule: meta.rules[0], status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return [{ name: "study-draft", rule: meta.rules[0], status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixtures cannot be created" }];

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const brief = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`;
  const made = { auth: [], users: [] };
  let browser;
  try {
    browser = await ctx.launch();
    for (const who of [{ tag: "golden", paid: true }, { tag: "free", paid: false }]) {
      const email = `${ctx.prefix}-852-${who.tag}@regress.aduatlas.test`;
      const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
      const marker = `regress 852 draft ${who.tag} ${ctx.prefix}`;
      const c = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
        method: "POST", headers: H, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix } }),
      });
      const authId = c.body?.id || c.body?.user?.id;
      if (!authId) throw new Error(`${who.tag} fixture sign-up failed: HTTP ${c.status}`);
      made.auth.push(authId);
      let rowId = null;
      for (let i = 0; i < 12 && !rowId; i += 1) {
        const r = await svc(`users?auth_user_id=eq.${authId}&select=id`);
        rowId = Array.isArray(r.body) && r.body[0]?.id;
        if (!rowId) await sleep(400);
      }
      if (!rowId) throw new Error(`${who.tag} fixture users row never appeared`);
      made.users.push(rowId);
      if (who.paid) {
        const stamp = await svc(`users?id=eq.${rowId}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ paid_at: new Date().toISOString(), paid_tier: "roadmap", paid_origin: "purchase", refunded_at: null }),
        });
        if (stamp.status >= 300) throw new Error(`paid stamp failed: ${brief(stamp)}`);
      }

      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      try {
        await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
        await page.locator("main input[type=email]").waitFor({ state: "visible" });
        await page.fill("main input[type=email]", email);
        await page.fill("main input[type=password]", password);
        await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click("main button[type=submit]")]);
      } catch (e) {
        throw new Error(`sign-in through /login failed for the ${who.tag} fixture: ${redact(e?.message, [password, email]).slice(0, 240)}`);
      }

      await page.goto(`${ctx.base}/study`, { waitUntil: "networkidle" });
      const field = page.locator("main form input[type=text], main form textarea").first();
      const paywallText = page.getByText(/this is part of (platinum|the paid system)/i);
      // Whichever the page settles on: the intake, or a paywall.
      await Promise.race([
        field.waitFor({ state: "visible", timeout: 15000 }),
        paywallText.first().waitFor({ state: "visible", timeout: 15000 }),
      ]).catch(() => {});
      const paywall = await paywallText.count();
      const hasForm = (await field.count()) > 0;
      let clicked = false;
      if (!paywall && hasForm) {
        await field.fill(marker);
        const save = page.locator("main form").getByRole("button", { name: /save/i }).first();
        if (await save.count()) {
          await save.click();
          clicked = true;
        }
      }
      let study = null;
      for (let i = 0; i < 20 && clicked && !study; i += 1) {
        const r = await svc(`studies?user_id=eq.${rowId}&select=status,submitted_at,intake`);
        study = Array.isArray(r.body) && r.body[0] ? r.body[0] : null;
        if (!study) await sleep(500);
      }
      add(`${who.tag}-sees-the-intake-not-a-paywall`, paywall === 0 && hasForm, `paywall text on /study: ${paywall}; intake field present: ${hasForm}; ended on ${new URL(page.url()).pathname}`);
      add(
        `${who.tag}-draft-is-saved-as-draft`,
        Boolean(study) && study.status === "draft" && study.submitted_at === null && JSON.stringify(study.intake || {}).includes(marker),
        study ? `studies row: status ${study.status}, submitted_at ${study.submitted_at}, carries the typed text ${JSON.stringify(study.intake || {}).includes(marker)}` : `no studies row for the fixture (save pressed: ${clicked})`
      );
      await context.close();
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const id of made.users) await svc(`users?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.auth) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H }).catch(() => {});
  }
  return out;
}
