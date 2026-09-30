// R3-26, the quiz header (found at the RC3 rehearsal, journey j1): the Module 1
// Quiz header read "~5 min · 0 · Completed". The position printed there counts
// lessons only, so a quiz came out as 0.
//
// A regress- Golden account (a purchase stamped the way api/stripe-webhook.js
// stamps one) signs in through /login and opens the Module 1 quiz and the first
// lesson. The line under each title is read. Nothing is written.
//   1. the quiz header shows no position number and names the module quiz;
//   2. a lesson header says which lesson it is ("Lesson 1 of 7"), where RC3
//      printed a bare number.
// The account is deleted afterwards.
import { DESKTOP, makeHomeowner, signIn, stampPurchase } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "712 the course header never shows a stray position number",
  rules: [
    "the module quiz header shows no position number and says it is the module quiz",
    "a lesson header says which lesson of the module it is",
  ],
};

const headerLine = async (page) => {
  const h1 = page.locator("h1").first();
  await h1.waitFor({ state: "visible" });
  const line = h1.locator("xpath=following-sibling::div[1]");
  return ((await line.innerText()) || "").replace(/\s+/g, " ").trim();
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `course-header-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `course-header-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture account cannot be created" }));

  const who = await makeHomeowner(ctx, "quiz-header");
  let browser;
  try {
    await stampPurchase(ctx, who.rowId, "roadmap");
    browser = await ctx.launch();
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      await signIn(page, ctx, who.email, who.password);

      await page.goto(`${ctx.base}/course/m1quiz`, { waitUntil: "domcontentloaded" });
      const quiz = await headerLine(page);
      const tokens = quiz.split(/\s*·\s*/);
      add(0, !tokens.some((t) => /^\d+$/.test(t)) && /module quiz/i.test(quiz), `quiz header: "${quiz}"`);

      await page.goto(`${ctx.base}/course/m1c1`, { waitUntil: "domcontentloaded" });
      const lesson = await headerLine(page);
      add(1, /Lesson 1 of \d+/.test(lesson) && !lesson.split(/\s*·\s*/).some((t) => /^\d+$/.test(t)), `lesson header: "${lesson}"`);
    } catch (e) {
      for (let i = 0; i < meta.rules.length; i += 1) {
        if (!out.some((r) => r.rule === meta.rules[i])) add(i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
      }
    }
    await context.close();
  } finally {
    if (browser) await browser.close();
    await who.cleanup();
  }
  return out;
}
