// DEF-07, the learner's side: moving the course text to the server must not
// break the course. A Golden buyer logs in through the real /login page in an
// isolated headless Chromium, opens a chapter from the course index, a module
// quiz, and the course introduction, and must see the text of each.
//
// Each text must ARRIVE from /api/course on a request that carries the
// session's Bearer token. On RC1 the text is visible but comes from the bundle
// and no such request exists, so those rows are red there; the "sees the text"
// rows are non-regression guards and are expected green on RC1 and after.
export const meta = { name: "802 course UI for a Golden buyer", rules: ["DEF-07"] };

const PERSONA = "golden_purchased";
const STEPS = [
  { label: "chapter m2c7 opened from the course index", id: "m2c7", fromIndex: "How Cities Guide Homeowners: A California Example", text: "A typical city ADU process" },
  { label: "module 1 quiz", id: "m1quiz", path: "/course/m1quiz", text: "What does ADU stand for?" },
  { label: "course introduction", id: "intro", path: "/course/intro", text: "ADUAtlas teaches the process and the terms so you understand the entire project before you begin" },
];

export default async function (ctx) {
  const out = [];
  const push = (name, ok, detail, rule = "DEF-07: the paid course still works for a buyer") =>
    out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const p = ctx.creds(PERSONA);
  const browser = await ctx.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const courseRequests = [];
    page.on("request", (req) => {
      if (new URL(req.url()).pathname === "/api/course") courseRequests.push(req);
    });

    await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
    await page.fill("input[type=email]", p.email);
    await page.fill("input[type=password]", p.password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
      page.click("button[type=submit]"),
    ]);

    for (const step of STEPS) {
      const before = courseRequests.length;
      if (step.fromIndex) {
        await page.goto(`${ctx.base}/course`, { waitUntil: "networkidle" });
        await page.getByRole("link", { name: step.fromIndex }).first().click();
      } else {
        await page.goto(`${ctx.base}${step.path}`, { waitUntil: "networkidle" });
      }
      let seen = false;
      try {
        await page.getByText(step.text, { exact: false }).first().waitFor({ state: "visible", timeout: 20000 });
        seen = true;
      } catch {
        seen = false;
      }
      const body = seen ? "" : ((await page.locator("main").innerText().catch(() => "")) || "").slice(0, 200).replace(/\s+/g, " ");
      push(`Golden sees the ${step.label}`, seen, seen ? `"${step.text.slice(0, 60)}" visible at ${new URL(page.url()).pathname}` : `not visible at ${page.url()}; page reads: ${body}`);

      const mine = courseRequests.slice(before).filter((r) => new URL(r.url()).searchParams.get("id") === step.id);
      let detail = "no /api/course request for this id";
      let ok = false;
      if (mine.length) {
        const req = mine[mine.length - 1];
        const h = await req.allHeaders();
        const res = await req.response();
        const bearer = /^Bearer \S+/.test(h.authorization || "");
        ok = bearer && res?.status() === 200;
        detail = `authorization=${bearer ? "Bearer" : "absent"} status=${res ? res.status() : "none"}`;
      }
      push(`the ${step.label} text is delivered by /api/course with the session token`, ok, detail);
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
