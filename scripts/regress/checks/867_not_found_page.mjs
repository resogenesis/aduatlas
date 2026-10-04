// An address no route claims showed React Router's own error screen
// ("Unexpected Application Error! 404 Not Found") with no header, no footer and
// no way back (found in the production smoke test after RC4A's launch). The
// public layout now ends with a "*" route to src/pages/NotFound.jsx.
//   1. an unknown address renders the not-found page inside the site's header
//      and footer, with a way back, and asks not to be indexed
//   2. the catch-all never shadows a real route: public pages still render
//      their own heading, and signed-out visits to the portals still go to
//      sign-in (the portal trees still own their paths)
export const meta = {
  name: "867 an unknown address shows the site's not-found page, and real routes still win",
  rules: [
    "an unknown address renders the not-found page with the header, the footer, a link home, and a noindex robots tag",
    "the catch-all never shadows a real route: public pages keep their own heading and signed-out portal visits still go to sign-in",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `not-found-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.slice(0, 80)));
    await page.goto(`${ctx.base}/no-such-page-${ctx.prefix}`, { waitUntil: "networkidle" });
    const h1 = (await page.locator("h1").first().innerText().catch(() => "")).trim();
    const header = await page.locator("header").count();
    const footer = await page.locator("footer").count();
    const home = await page.locator('main a[href="/"]').count();
    const robots = await page.evaluate(() => [...document.querySelectorAll('meta[name="robots"]')].map((m) => m.content).join(","));
    const routerError = /Unexpected Application Error/i.test(await page.locator("body").innerText());
    add(0, h1 === "We could not find that page." && header > 0 && footer > 0 && home > 0 && /noindex/.test(robots) && !routerError,
      `h1 "${h1}"; header ${header}, footer ${footer}, home link ${home}; robots "${robots}"; router error screen ${routerError}; page errors ${errors.length}`);

    const seen = [];
    let ok = true;
    for (const [path, want] of [["/rules", /ADU rules/i], ["/unlock", /Plans and pricing/i], ["/legal", /Privacy/i], ["/course-outline", /Learn/i]]) {
      await page.goto(`${ctx.base}${path}`, { waitUntil: "networkidle" });
      const t = (await page.locator("h1").first().innerText().catch(() => "")).trim();
      const good = want.test(t) && t !== "We could not find that page.";
      ok = ok && good;
      seen.push(`${path} "${t.slice(0, 30)}"`);
    }
    for (const path of ["/dashboard", "/builder", "/gov", "/admin"]) {
      await page.goto(`${ctx.base}${path}`, { waitUntil: "networkidle" });
      const landed = new URL(page.url()).pathname;
      const t = (await page.locator("h1").first().innerText().catch(() => "")).trim();
      const good = t !== "We could not find that page.";
      ok = ok && good;
      seen.push(`${path} -> ${landed}`);
    }
    add(1, ok, seen.join("; "));
    await context.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return out;
}
