// 440 — portal, admin, government and builder pages fit a phone (RC3 triage R3-14).
//
// RC3: on a 390 px phone the course index laid out at 547 px, five of six
// worksheets at 431 to 1020 px, the utility estimator at 521 px and the admin
// overview, studies, builders, users and regulatory pages at 416 to 1136 px.
// html/body overflow-x:hidden then cut the extra width off with no way to scroll
// to it: cost columns, totals, "Print / save PDF", the Users role selects. The
// layouts' <main> is a flex item with the default min-width:auto, so its
// min-content width (a nowrap title, a wide table) set the page width and the
// tables' own overflow-x-auto wrappers never got the chance to scroll.
//
// For every page, at 390 and 360 px, this measures <main> and every element in
// <main> and the header: nothing may reach past the right edge of the screen
// unless it sits inside its own horizontal scroll container that itself fits.
// Read only: each persona signs in once and only opens pages.
export const meta = {
  name: "440 portal and admin pages fit the phone",
  rules: ["R3-14: at 390 and 360 px no portal, admin, government or builder page is wider than the screen"],
};

const PLAN = {
  platinum_purchased: [
    "/dashboard", "/course", "/course/intro", "/my-property", "/study", "/site-plan", "/costs", "/adu-options", "/help",
    "/feasibility", "/utility-estimator", "/report", "/packet", "/packet/pre-site-estimate", "/packet/pre-site-verification",
    "/packet/builder-prep", "/packet/traditional-build", "/packet/modular-prefab", "/packet/total-cost", "/packet/ready-score",
    "/builders", "/settings",
  ],
  concierge_purchased: ["/support"],
  admin: ["/admin", "/admin/content", "/admin/studies", "/admin/builders", "/admin/regulatory", "/admin/users", "/admin/admins"],
  education_partner: ["/gov", "/gov/claim", "/gov/regulatory", "/gov/partnership"],
  builder_verified: ["/builder", "/builder/profile"],
};
const WIDTHS = [390, 360];

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

// Everything that reaches past the screen's right edge and is not inside a
// horizontal scroller that itself fits on the screen.
const measure = (page) =>
  page.evaluate(() => {
    const vw = window.innerWidth;
    const main = document.querySelector("main");
    const inScroller = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if ((ox === "auto" || ox === "scroll") && p.getBoundingClientRect().right <= vw + 1) return true;
      }
      return false;
    };
    const offenders = [];
    for (const el of document.querySelectorAll("main *, header *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" || cs.visibility === "hidden") continue;
      if (r.right > vw + 1 && !inScroller(el)) {
        offenders.push(`${el.tagName.toLowerCase()} "${(el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 30)}" to ${Math.round(r.right)}px`);
      }
    }
    return { vw, mainWidth: main ? main.scrollWidth : null, offenders };
  });

export default async function (ctx) {
  const out = [];
  const browser = await ctx.launch();
  try {
    for (const [persona, routes] of Object.entries(PLAN)) {
      try {
        ctx.creds(persona);
      } catch (e) {
        for (const route of routes) out.push({ name: `${route} fits`, rule: meta.rules[0], status: "skip", detail: String(e.message || e) });
        continue;
      }
      const context = await browser.newContext({ viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      try {
        await signIn(page, ctx, persona);
        const perRoute = new Map(routes.map((r) => [r, []]));
        for (const w of WIDTHS) {
          await page.setViewportSize({ width: w, height: 780 });
          for (const route of routes) {
            await page.goto(`${ctx.base}${route}`, { waitUntil: "domcontentloaded" });
            await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
            await page.waitForTimeout(700);
            const landed = new URL(page.url()).pathname;
            const m = await measure(page);
            if (landed !== route) perRoute.get(route).push(`${w}px: landed on ${landed}`);
            if ((m.mainWidth || 0) > w + 1 || m.offenders.length) {
              perRoute.get(route).push(`${w}px: main ${m.mainWidth}px; ${m.offenders.length} element(s) past the edge, e.g. ${m.offenders.slice(0, 2).join("; ")}`);
            }
          }
        }
        for (const [route, problems] of perRoute) {
          const overflow = problems.filter((p) => !/landed on/.test(p));
          out.push({
            name: `${route} fits at ${WIDTHS.join(" and ")} px (${persona})`,
            rule: meta.rules[0],
            status: overflow.length ? "fail" : "pass",
            detail: problems.length ? problems.join(" | ") : "fits",
          });
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  return out;
}
