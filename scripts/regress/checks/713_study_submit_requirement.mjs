// Study, the homeowner half of R3-03 (2q; found at the RC3 rehearsal, journey
// j1 step 5.11). Any signed-in homeowner may save a feasibility intake draft;
// only the submit needs Platinum or Concierge, and the database gates it (0018).
// The route gate is WP-E's, and so is the proof that the draft is written:
// 852 types into the intake, presses save, and finds a studies row in status
// 'draft' for a Golden and a free account. This check does not save anything;
// it proves the page itself offers the save control and tells a lower tier,
// next to the submit control, why it cannot submit yet and what it can do now,
// and never tells a homeowner with no plan that they hold one. RC3 showed a
// whole-page paywall instead.
//
// Two regress- accounts, a Golden purchase (stamped the way
// api/stripe-webhook.js stamps one) and one with no plan, sign in through /login
// and open /study. Nothing is saved or submitted. Both are deleted afterwards.
//   1. Golden: the intake and its save control are there, and the submit area
//      says submitting is part of Platinum and Concierge and that Golden can
//      save now and submit after upgrading;
//   2. no plan: the same, and it says there is no plan yet.
import { DESKTOP, makeHomeowner, signIn, stampPurchase } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "713 /study explains the Platinum requirement for submitting to lower tiers",
  rules: [
    "a Golden homeowner on /study is offered the save control and is told next to the submit control that submitting needs Platinum or Concierge",
    "a homeowner with no plan on /study is offered the save control and is told the same, and is never told they hold a plan",
  ],
  // The draft write itself (a studies row in status 'draft') is proven by 852.
  proves_draft_write: "852_study_draft_golden.mjs",
};

const DASHES_OR_ARROWS = /[‒-―←-⇿]|->|=>|<-/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const look = async (page) => {
  const req = page.locator("[data-testid=study-submit-requirement]");
  for (let i = 0; i < 20 && !(await req.count()); i += 1) await sleep(500);
  const text = (await req.count()) ? ((await req.first().innerText()) || "").replace(/\s+/g, " ").trim() : "";
  const saveButtons = await page.locator("button", { hasText: /save/i }).count();
  const paywall = await page.getByText(/This is part of (Platinum|the paid system)/i).count();
  const upgrade = (await page.locator("a", { hasText: /Platinum to submit/ }).allInnerTexts()).map((t) => t.trim());
  return { text, saveButtons, paywall, upgrade };
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `study-requirement-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `study-requirement-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture accounts cannot be created" }));

  const browser = await ctx.launch();
  const cleanups = [];
  try {
    const shapes = [
      { i: 0, label: "study-golden", tier: "roadmap" },
      { i: 1, label: "study-noplan", tier: null },
    ];
    for (const s of shapes) {
      try {
        const who = await makeHomeowner(ctx, s.label);
        cleanups.push(who.cleanup);
        if (s.tier) await stampPurchase(ctx, who.rowId, s.tier);
        const context = await browser.newContext(DESKTOP);
        const page = await context.newPage();
        page.setDefaultTimeout(30000);
        await signIn(page, ctx, who.email, who.password);
        await page.goto(`${ctx.base}/study`, { waitUntil: "domcontentloaded" });
        await page.locator("h1").first().waitFor({ state: "visible" });
        const r = await look(page);
        const common = r.paywall === 0 && r.saveButtons > 0 && /part of Platinum and Concierge/i.test(r.text) && /save your details now/i.test(r.text) && !DASHES_OR_ARROWS.test(r.text);
        const specific = s.tier
          ? /Your plan is Golden/i.test(r.text) && /after you upgrade/i.test(r.text)
          : /do not have a plan yet/i.test(r.text) && !/Your plan is/i.test(r.text);
        add(s.i, common && specific, `requirement: "${r.text.slice(0, 260)}"; save buttons ${r.saveButtons}; tier paywall ${r.paywall}; upgrade link ${JSON.stringify(r.upgrade)}`);
        await context.close();
      } catch (e) {
        add(s.i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
      }
    }
  } finally {
    await browser.close();
    for (const c of cleanups) await c();
  }
  return out;
}
