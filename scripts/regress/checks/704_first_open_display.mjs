// R3-02, the display half (found at the RC3 rehearsal, journey j1 step 6.4):
// "/feasibility as the first page on a new device likewise shows empty lot
// dimensions and no model". The Ready Score and the Feasibility tool read the
// saved copy ONCE, when they mount, and on a new device they mount before the
// server copy has been read, so they open blank. (702 proves an edit there no
// longer destroys the server copy; this proves the page SHOWS it.)
//
// A regress- Platinum account is created with the service role and its server
// copy (public.homeowner_worksheets) is written as that account through the
// real save_homeowner_worksheets RPC. Each rule then opens the page in a FRESH
// browser context (a new device): sign in through the real /login page, drop the
// worksheet copy the sign-in itself may have pulled, and load the page by URL,
// as a bookmark or a link would. No edit is made, so nothing is written.
//   1. the Ready Score shows the answers saved on the server;
//   2. the Feasibility tool shows the lot saved on the server.
// The account (and, by cascade, its worksheets row) is deleted afterwards.
import { DESKTOP, makeHomeowner, seedWorksheets, signIn, stampPurchase } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "704 the Ready Score and the Feasibility tool opened first on a new device show the saved copy",
  rules: [
    "the Ready Score opened first on a new device shows the answers saved on the server",
    "the Feasibility tool opened first on a new device shows the lot saved on the server",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const forgetLocalWorksheets = (page) =>
  page.evaluate(() => {
    try {
      window.localStorage.removeItem("aduatlas.packet");
      window.localStorage.removeItem("aduatlas.worksheets.sync");
    } catch {
      // nothing to forget
    }
  });

const SHEETS = {
  readyScore: { answers: { "z-permitted": true, "z-lot-size": true, "s-slope": false }, points: 0, grade: null, completedAt: null },
};
const LOT = {
  input: { lotWidth: "64", lotDepth: "128", front: "20", rear: "10", side: "5", houseDepth: "40" },
  dimsEstimated: false,
  address: "104 Regress Way, Phoenix, AZ 85001",
  coords: null,
  lookup: null,
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `first-open-display-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `first-open-display-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture account cannot be created" }));

  const who = await makeHomeowner(ctx, "ws-display");
  let browser;
  try {
    await stampPurchase(ctx, who.rowId, "report");
    await seedWorksheets(ctx, who.token, { worksheets: SHEETS, lot: LOT });
    browser = await ctx.launch();

    const freshDevice = async (path) => {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await forgetLocalWorksheets(page);
      await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
      return { context, page };
    };
    const guarded = async (rules, body) => {
      try {
        await body();
      } catch (e) {
        for (const i of rules) if (!out.some((r) => r.rule === meta.rules[i])) add(i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
      }
    };

    // 1. The Ready Score: a saved "Yes" shows as the selected answer.
    await guarded([0], async () => {
      const { context, page } = await freshDevice("/packet/ready-score");
      const question = (text) => page.locator("div", { has: page.locator("p", { hasText: text }) }).last();
      const yesOn = async (text) => /bg-accent/.test((await question(text).locator("button", { hasText: /^Yes$/ }).getAttribute("class")) || "");
      const noOn = async (text) => /bg-red-500/.test((await question(text).locator("button", { hasText: /^No$/ }).getAttribute("class")) || "");
      await question("Is an ADU permitted by your local zoning?").waitFor({ state: "visible" });
      let seen = null;
      for (let i = 0; i < 20; i += 1) {
        seen = {
          permitted: await yesOn("Is an ADU permitted by your local zoning?"),
          lotSize: await yesOn("Does your lot meet the minimum lot size requirement?"),
          slopeNo: await noOn("Is the site free of significant slope or challenging topography?"),
        };
        if (seen.permitted && seen.lotSize && seen.slopeNo) break;
        await sleep(500);
      }
      add(0, seen.permitted && seen.lotSize && seen.slopeNo, `answers shown after up to 10 s (saved: permitted Yes, lot size Yes, slope No): ${JSON.stringify(seen)}`);
      await context.close();
    });

    // 2. The Feasibility tool: the saved lot width is in its field.
    await guarded([1], async () => {
      const { context, page } = await freshDevice("/feasibility");
      const width = page.locator("label", { hasText: /^Lot width$/ }).locator("xpath=following-sibling::div[1]//input").first();
      await width.waitFor({ state: "visible" });
      let v = "";
      for (let i = 0; i < 20; i += 1) {
        v = await width.inputValue();
        if (v === "64") break;
        await sleep(500);
      }
      add(1, v === "64", `lot width shown after up to 10 s: "${v}" (saved on the server: "64")`);
      await context.close();
    });
  } finally {
    if (browser) await browser.close();
    await who.cleanup();
  }
  return out;
}
