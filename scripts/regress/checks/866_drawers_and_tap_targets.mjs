// T4-21 and T4-22 (RC4 rehearsal, the second carried from R3-30), on a phone
// with a touch screen.
//
// T4-21: in the homeowner, builder, government and admin drawers the sticky top
// bar (z-40) covered the drawer's own logo row (the drawer sat at z-30). The
// drawers now sit above the bar.
// T4-22: several controls were under 24 px in one dimension: "Show password",
// "Forgot password?", the rules breadcrumbs, "Report a correction", "Back to
// course", "All messages", the builder "Dashboard" back link, "Back to dashboard"
// and "Change" on /settings. A touch-only utility (.tap-target, src/index.css)
// now gives each at least 44 px of hit area.
//
//   1-4. each portal's open drawer: the element at the centre of the drawer's
//        first link is inside the drawer, not the top bar
//   5.   every listed control measures at least 24 px in each dimension
//        (the rehearsal's floor; 44 is the aim): Show password, Forgot
//        password?, Back to course, Back to dashboard, Change, All messages
//        (homeowner and builder), the builder Dashboard back link, the first
//        rules breadcrumb and Report a correction. A control not found fails.
export const meta = {
  name: "866 portal drawers are fully visible and small controls are big enough to tap",
  rules: [
    "the homeowner drawer's first link is not covered by the top bar",
    "the builder drawer's first link is not covered by the top bar",
    "the government drawer's first link is not covered by the top bar",
    "the admin drawer's first link is not covered by the top bar",
    "the listed small controls measure at least 24 px in each dimension on a touch screen",
  ],
};

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const signIn = async (page, ctx, persona) => {
  const c = ctx.creds(persona);
  await page.goto(`${ctx.base}/login`, { waitUntil: "domcontentloaded" });
  try {
    await page.locator('main input[type="email"]').fill(c.email, { timeout: 30000 });
    await page.locator('main input[type="password"]').fill(c.password, { timeout: 30000 });
  } catch {
    throw new Error(`the sign-in form could not be filled for ${persona} (details withheld)`);
  }
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 }), page.locator('main button[type="submit"]').click()]);
};

// Open the drawer and ask what is drawn at the centre of its first link.
const drawerFirstLinkCovered = async (page) => {
  await page.getByRole("button", { name: /toggle menu|open menu|menu/i }).first().click({ timeout: 15000 });
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const asides = [...document.querySelectorAll("aside")].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(a).display !== "none";
    });
    const drawer = asides[asides.length - 1];
    const link = drawer?.querySelector("a");
    if (!drawer || !link) return { ok: false, detail: "no open drawer with a link" };
    const r = link.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const inside = Boolean(hit && drawer.contains(hit));
    return { ok: inside, detail: inside ? "first link visible" : `covered by <${hit?.tagName?.toLowerCase()} class="${String(hit?.className || "").slice(0, 60)}">` };
  });
};

// Measured once the control is laid out: a read taken while the page is still
// rendering or re-rendering gives 0 x 0 (seen on the rules breadcrumb), which is
// not its size. A control that never appears is null ("not found"); one that
// stays 0 x 0 for 10 s is reported as 0 x 0.
const measure = async (page, locator) => {
  await locator.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
  let m = null;
  for (let i = 0; i < 20; i += 1) {
    m = await locator.first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height) };
    }).catch(() => null);
    if (!m || (m.w > 0 && m.h > 0)) return m;
    await page.waitForTimeout(500);
  }
  return m;
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `drawers-taps-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  const browser = await ctx.launch();
  try {
    const portals = [
      [0, "golden_purchased", "/dashboard"],
      [1, "builder_claimed", "/builder"],
      [2, "gov_verified", "/gov"],
      [3, "admin", "/admin"],
    ];
    for (const [i, persona, path] of portals) {
      const context = await browser.newContext(PHONE);
      const page = await context.newPage();
      try {
        await signIn(page, ctx, persona);
        await page.goto(`${ctx.base}${path}`, { waitUntil: "networkidle" });
        const r = await drawerFirstLinkCovered(page);
        add(i, r.ok, `${persona} ${path}: ${r.detail}`);
      } catch (e) {
        add(i, false, `${persona}: ${e.message}`);
      } finally {
        await context.close();
      }
    }

    // 5. The small controls.
    const small = [];
    const note = (label, m) => { if (!m) small.push(`${label}: not found`); else if (m.w < 24 || m.h < 24) small.push(`${label}: ${m.w}x${m.h}`); };
    {
      const context = await browser.newContext(PHONE);
      const page = await context.newPage();
      await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
      note("Show password", await measure(page, page.getByRole("button", { name: /show password/i })));
      note("Forgot password?", await measure(page, page.getByRole("link", { name: "Forgot password?" })));
      await context.close();
    }
    {
      const context = await browser.newContext(PHONE);
      const page = await context.newPage();
      await signIn(page, ctx, "golden_purchased");
      await page.goto(`${ctx.base}/course`, { waitUntil: "networkidle" });
      const first = page.locator('a[href^="/course/"]').first();
      if (await first.count()) {
        await first.click();
        await page.waitForLoadState("networkidle");
        note("Back to course", await measure(page, page.getByRole("link", { name: /Back to course/ })));
      } else small.push("Back to course: no lesson link to open");
      await page.goto(`${ctx.base}/my-property`, { waitUntil: "networkidle" });
      note("Back to dashboard", await measure(page, page.getByRole("link", { name: "Back to dashboard" })));
      await page.goto(`${ctx.base}/settings`, { waitUntil: "networkidle" });
      note("Change (settings)", await measure(page, page.getByRole("button", { name: "Change" })));
      // Finding 30. "All messages" shows whenever a conversation id is in the
      // path, so any id opens it; no thread is needed.
      await page.goto(`${ctx.base}/messages/00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle" });
      note("All messages", await measure(page, page.locator("main").getByRole("link", { name: /All messages/ })));
      await context.close();
    }
    {
      // Finding 30: the builder portal's "Dashboard" back link (the message
      // list) and its "All messages" link (any conversation id).
      const context = await browser.newContext(PHONE);
      const page = await context.newPage();
      await signIn(page, ctx, "builder_claimed");
      await page.goto(`${ctx.base}/builder/messages`, { waitUntil: "networkidle" });
      note("Dashboard (builder messages)", await measure(page, page.locator("main").getByRole("link", { name: /^Dashboard$/ })));
      await page.goto(`${ctx.base}/builder/messages/00000000-0000-0000-0000-000000000000`, { waitUntil: "networkidle" });
      note("All messages (builder)", await measure(page, page.locator("main").getByRole("link", { name: /All messages/ })));
      await context.close();
    }
    {
      // A rules page with breadcrumbs and "Report a correction".
      const context = await browser.newContext(PHONE);
      const page = await context.newPage();
      await page.goto(`${ctx.base}/rules/az`, { waitUntil: "networkidle" });
      const jur = page.locator('a[href^="/rules/az/"]').first();
      if (await jur.count()) {
        await jur.click();
        await page.waitForLoadState("networkidle");
        note("breadcrumb ADU rules", await measure(page, page.locator('nav[aria-label="Where this is"] a').first()));
        note("Report a correction", await measure(page, page.getByRole("link", { name: "Report a correction" })));
      } else small.push("rules: no Arizona jurisdiction page to open");
      await context.close();
    }
    add(4, small.length === 0, small.length ? `too small or missing: ${small.join("; ")}` : "every listed control is at least 24 x 24");
  } finally {
    await browser.close().catch(() => {});
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
}
