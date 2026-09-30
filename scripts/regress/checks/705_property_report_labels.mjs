// R3-18 (found at the RC3 rehearsal, journey j1): the property report labelled
// the address and the lot dimensions the homeowner TYPED as "Verified". Nothing
// had checked them (the address lookup had returned 501), and elsewhere in the
// product "Verified" means checked against a source (decision 2b, the Rules
// pages' "Verified from source").
//
// A regress- Platinum account is created with the service role. Its lot (typed
// dimensions and a typed address, no lookup) is saved on the server through the
// real save_homeowner_worksheets RPC and also placed in the browser, so the
// report renders it on first paint whatever the page's hydration does. /report
// is opened and the status badge beside each row is read:
//   1. no badge on the report says "Verified";
//   2. the typed address and the typed lot width x depth are labelled
//      "As entered by you".
// Nothing is written by the page. The account (and, by cascade, its worksheets
// row) is deleted afterwards.
import { DESKTOP, makeHomeowner, seedWorksheets, signIn, stampPurchase } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "705 the property report never calls homeowner-entered values verified",
  rules: [
    "no status on the property report says Verified for values nobody checked against a source",
    "the address and the lot dimensions the homeowner typed are labelled As entered by you",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOT = {
  input: { lotWidth: "62", lotDepth: "125", front: "20", rear: "10", side: "5", houseDepth: "40" },
  dimsEstimated: false,
  address: "105 Regress Way, Phoenix, AZ 85001",
  coords: null,
  lookup: null,
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `report-labels-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `report-labels-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture account cannot be created" }));

  const who = await makeHomeowner(ctx, "report-labels");
  let browser;
  try {
    await stampPurchase(ctx, who.rowId, "report");
    await seedWorksheets(ctx, who.token, { worksheets: {}, lot: LOT });
    browser = await ctx.launch();
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    try {
      await signIn(page, ctx, who.email, who.password);
      await page.evaluate((lot) => {
        let packet = {};
        try {
          packet = JSON.parse(window.localStorage.getItem("aduatlas.packet") || "{}") || {};
        } catch {
          packet = {};
        }
        window.localStorage.setItem("aduatlas.packet", JSON.stringify({ ...packet, lot }));
      }, LOT);
      await page.goto(`${ctx.base}/report`, { waitUntil: "domcontentloaded" });
      await page.getByText("Property identification", { exact: true }).waitFor({ state: "visible" });

      // The row for a label: its value and its badge (the last span in the row).
      const row = async (label) => {
        const r = page.locator("div", { has: page.locator("p", { hasText: label }) }).filter({ has: page.locator("span.rounded-full") }).last();
        if (!(await r.count())) return null;
        const spans = r.locator("span");
        const n = await spans.count();
        return { value: ((await spans.nth(0).innerText()) || "").trim(), badge: ((await spans.nth(n - 1).innerText()) || "").trim() };
      };
      let addr = null;
      let dims = null;
      for (let i = 0; i < 20; i += 1) {
        addr = await row("Full property address");
        dims = await row(/^Lot width/);
        if (addr?.value?.includes("105 Regress Way") && dims?.value?.includes("62")) break;
        await sleep(500);
      }
      const badges = (await page.locator("span.rounded-full").allInnerTexts()).map((t) => t.trim());
      const verified = badges.filter((t) => /^verified$/i.test(t));
      add(0, badges.length > 0 && verified.length === 0, `${badges.length} status badges; ${verified.length} say "Verified"; distinct: ${JSON.stringify([...new Set(badges)])}`);
      add(
        1,
        Boolean(addr?.value?.includes("105 Regress Way") && addr.badge === "As entered by you" && dims?.value?.includes("62") && dims.badge === "As entered by you"),
        `address ${JSON.stringify(addr)}; lot width x depth ${JSON.stringify(dims)}`
      );
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
