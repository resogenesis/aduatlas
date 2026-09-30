// I4-05a (homeowner copy): two ADU Ready Score questions (NAPE z-hoa and
// z-historic, src/stores/worksheetStore.js) joined their clauses with an
// em-dash, which homeowner copy never uses: "Have you reviewed HOA or deed
// restrictions [em-dash] and none prohibit an ADU?". They now read "...and
// found that none prohibit an ADU?", which keeps the meaning (Yes is
// favourable: reviewed, and nothing prohibits an ADU).
//
// A regress- Platinum account (${ctx.prefix}-707-*) is created with the service
// role, signs in through the real /login page and opens the Ready Score. The
// page's main text must hold both reworded questions and no em-dash (U+2014)
// or arrow (U+2192, U+2190) anywhere. The account is deleted afterwards.
import { DESKTOP, makeHomeowner, signIn, stampPurchase } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "707 the Ready Score questions read plainly, with no em-dash or arrow",
  rules: ["the Ready Score shows the HOA and historic-district questions without an em-dash, and its page text holds no em-dash or arrow"],
};

const HOA = "Have you reviewed HOA or deed restrictions and found that none prohibit an ADU?";
const HISTORIC = "Have you reviewed historic-district requirements and found that none prohibit an ADU?";

export default async function (ctx) {
  const name = "ready-score-question-copy";
  if (!ctx.serviceKey) return [{ name, rule: meta.rules[0], status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture account cannot be created" }];
  const who = await makeHomeowner(ctx, "707-ready-score-copy");
  let browser;
  try {
    await stampPurchase(ctx, who.rowId, "report");
    browser = await ctx.launch();
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await signIn(page, ctx, who.email, who.password);
    await page.goto(`${ctx.base}/packet/ready-score`, { waitUntil: "domcontentloaded" });
    await page.getByText("Is an ADU permitted by your local zoning?").first().waitFor({ state: "visible" });
    const text = await page.locator("main").innerText();
    await context.close();
    const hoa = text.includes(HOA);
    const historic = text.includes(HISTORIC);
    const marked = text.split("\n").filter((l) => /[\u2014\u2192\u2190]/.test(l));
    return [
      {
        name,
        rule: meta.rules[0],
        status: hoa && historic && marked.length === 0 ? "pass" : "fail",
        detail: `HOA question reworded: ${hoa}; historic-district question reworded: ${historic}; lines with an em-dash or arrow: ${marked.length}${marked.length ? ` ${JSON.stringify(marked.slice(0, 3).map((l) => l.slice(0, 120)))}` : ""}`,
      },
    ];
  } finally {
    if (browser) await browser.close();
    await who.cleanup();
  }
}
