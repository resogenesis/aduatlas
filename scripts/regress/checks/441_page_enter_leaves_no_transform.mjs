// 441 — the page-enter and scroll-reveal animations leave nothing that traps a
// position:fixed dialog (RC3 triage R3-14 / R3-15, the layout half).
//
// RC3: index.css ran `.page-enter { animation: page-enter ... both }`, so the last
// keyframe's transform (translateY(0), an identity matrix) stayed on RootLayout's
// <main> after the animation ended. Any transform makes an element the containing
// block for position:fixed descendants: the builder profile's "Request
// introduction" dialog (fixed inset-0) was sized to the whole page and opened
// off-screen on a phone. [data-reveal="on"] did the same with translateY(0).
//
// The check asks the browser the question the dialog depends on: a fixed,
// inset-0 box placed inside <main> (and inside a revealed section) after the page
// has settled and scrolled must cover exactly the screen. It adds that probe box
// to the page's own DOM in the headless browser only; nothing is sent anywhere.
// The builder profile dialog itself belongs to its page (check 851).
export const meta = {
  name: "441 page-enter leaves no transform that traps fixed dialogs",
  rules: [
    "R3-14: after the page-enter animation, <main> carries no transform",
    "R3-14: a position:fixed inset-0 box inside <main> covers the screen, even after scrolling",
    "R3-14: a revealed section carries no transform, so a fixed box inside it covers the screen",
  ],
};

const probe = (page, selector) =>
  page.evaluate((sel) => {
    const host = document.querySelector(sel);
    if (!host) return null;
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;inset:0;pointer-events:none;";
    host.appendChild(box);
    const r = box.getBoundingClientRect();
    box.remove();
    return {
      transform: getComputedStyle(host).transform,
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
  }, selector);

const coversScreen = (m) => m && m.top === 0 && m.left === 0 && m.width === m.vw && m.height === m.vh;

export default async function (ctx) {
  const out = [];
  const browser = await ctx.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 740 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);

    // A long public page under RootLayout's <main className="page-enter">.
    await page.goto(`${ctx.base}/rules`, { waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor();
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(1500); // the animation is 0.45 s
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    const m = await probe(page, "main.page-enter") || (await probe(page, "main"));
    out.push({
      name: "main-has-no-transform-after-page-enter",
      rule: meta.rules[0],
      status: m && m.transform === "none" ? "pass" : "fail",
      detail: m ? `computed transform on <main>: ${m.transform}` : "no <main> found",
    });
    out.push({
      name: "fixed-box-in-main-covers-the-screen",
      rule: meta.rules[1],
      status: coversScreen(m) ? "pass" : "fail",
      detail: m ? `fixed inset-0 box at top ${m.top}, left ${m.left}, ${m.width}x${m.height}; screen ${m.vw}x${m.vh}` : "no <main> found",
    });

    // The home page's scroll-reveal sections.
    await page.goto(`${ctx.base}/`, { waitUntil: "domcontentloaded" });
    await page.locator("main").first().waitFor();
    await page.waitForTimeout(1200);
    // Scroll through the page so the observer reveals sections, then back.
    for (let y = 0; y < 4000; y += 500) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1200);
    const revealed = await page.evaluate(() => {
      const el = document.querySelector('[data-reveal="on"]');
      if (!el) return null;
      el.scrollIntoView({ block: "center" });
      el.setAttribute("data-regress-probe", "1");
      return true;
    });
    if (!revealed) {
      out.push({ name: "revealed-section-has-no-transform", rule: meta.rules[2], status: "skip", detail: 'no [data-reveal="on"] element on the home page' });
    } else {
      await page.waitForTimeout(900); // the reveal transition is 0.7 s
      const r = await probe(page, '[data-regress-probe="1"]');
      out.push({
        name: "revealed-section-has-no-transform",
        rule: meta.rules[2],
        status: r && r.transform === "none" && coversScreen(r) ? "pass" : "fail",
        detail: r ? `computed transform: ${r.transform}; fixed box at top ${r.top}, ${r.width}x${r.height}; screen ${r.vw}x${r.vh}` : "probe lost",
      });
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
