// 721 — form fields on a phone are at least 16 px, so focusing one does not zoom
// the page in iOS Safari (RC3 triage R3-26, the iOS half).
//
// RC3: most fields were text-sm (14 px): the /login email and password, the
// footer's "Email for ADU updates", the rules search, the sign-up form, and every
// worksheet and portal form. iOS Safari zooms the page when a field under 16 px
// takes focus. Chromium does not reproduce the zoom itself, so this measures the
// cause: the computed font size of every visible text field, select and textarea
// at phone width. Read only, signed out.
export const meta = {
  name: "721 form fields do not zoom on phones",
  rules: ["R3-26: at phone width every visible text field, select and textarea is at least 16 px"],
};

const PAGES = ["/login", "/create-account", "/forgot-password", "/rules", "/unlock"];

export default async function (ctx) {
  const out = [];
  const browser = await ctx.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    for (const path of PAGES) {
      await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
      await page.locator("main").first().waitFor();
      await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(600);
      const fields = await page.evaluate(() => {
        const skip = new Set(["checkbox", "radio", "range", "color", "file", "button", "submit", "reset", "image", "hidden"]);
        return [...document.querySelectorAll("input, select, textarea")]
          .filter((el) => !(el.tagName === "INPUT" && skip.has((el.type || "").toLowerCase())))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
          })
          .map((el) => ({
            what: `${el.tagName.toLowerCase()}${el.type ? `[${el.type}]` : ""}${el.placeholder ? ` "${el.placeholder.slice(0, 24)}"` : ""}`,
            px: parseFloat(getComputedStyle(el).fontSize),
          }));
      });
      const small = fields.filter((f) => f.px < 16);
      out.push({
        name: `${path} fields are at least 16px`,
        rule: meta.rules[0],
        status: fields.length === 0 ? "skip" : small.length ? "fail" : "pass",
        detail: fields.length === 0 ? "no visible fields" : small.length ? `${small.length} of ${fields.length} under 16px: ${small.slice(0, 4).map((f) => `${f.what} ${f.px}px`).join("; ")}` : `${fields.length} fields, all at least 16px`,
      });
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
