// DEF-01 (second half): every refusal from the address lookup gets an honest
// message. RC1 showed the same red "Lookup failed. Enter your dimensions
// manually." for 401, 403 and 429, so a sign-in, plan or rate refusal read as a
// provider failure.
//
// The server cannot be made to give a 401, 403 or 429 on demand to a Platinum
// page without side effects (a 429 needs the account's quota burned; a 403 needs
// a stale client tier), so this check signs a Platinum persona in through the
// real /login page, opens the real deployed /feasibility, and answers the
// page's own lookup request in the browser with each status. Nothing reaches
// the endpoint, so no metered call is spent. The endpoint's real answers are
// covered by 700_address_lookup_auth.mjs.
//
//   401 -> tells the homeowner to sign in again
//   403 -> says address lookup is part of Platinum
//   429 -> says there were too many lookups and to try again later
//   501 -> the existing amber "isn't enabled yet"
//   404 -> the existing "No public record found"
//   500 -> the existing generic "Lookup failed"
export const meta = {
  name: "701 address lookup refusal messages",
  rules: [
    "a refused lookup tells the homeowner what actually happened, not a generic failure",
  ],
};

const ADDRESS = "123 Main St, Phoenix, AZ 85004";
const PLACEHOLDER = "123 Main St, City, ST 90210";
const DESKTOP = { viewport: { width: 1280, height: 900 } };
const LOOKUP = /\/api\/property-lookup(\?|$)/;

const CASES = [
  { status: 401, body: { error: "authentication required" }, want: /sign in again/i, what: "sign in again" },
  { status: 403, body: { error: "not-entitled" }, want: /part of Platinum/i, what: "part of Platinum" },
  { status: 429, body: { error: "too many requests" }, want: /too many lookups/i, what: "too many lookups" },
  { status: 501, body: { error: "not-configured" }, want: /isn't enabled yet/i, what: "not enabled yet" },
  { status: 404, body: { error: "no-record" }, want: /No public record found/i, what: "no public record" },
  { status: 500, body: { error: "boom" }, want: /Lookup failed/i, what: "generic failure" },
];

// Personas are read-only here. Typing an address makes the page save the lot
// (rpc save_homeowner_worksheets, PATCH users), so every database write from
// this browser is refused before it leaves. Reads, read-only RPCs and sign-in
// pass through.
const guardPersonaWrites = async (context, supabaseUrl) => {
  const blocked = [];
  const origin = new URL(supabaseUrl).origin;
  await context.route((u) => u.origin === origin && u.pathname.startsWith("/rest/v1/"), (route) => {
    const req = route.request();
    const m = req.method();
    const p = new URL(req.url()).pathname;
    const readRpc = /^\/rest\/v1\/rpc\/(get_|my_|jurisdiction_)/.test(p);
    if (m === "GET" || m === "HEAD" || (m === "POST" && readRpc)) return route.fallback();
    blocked.push(`${m} ${p}`);
    return route.abort("blockedbyclient");
  });
  return blocked;
};

export default async function (ctx) {
  const out = [];
  const browser = await ctx.launch();
  try {
    const context = await browser.newContext(DESKTOP);
    const blockedWrites = await guardPersonaWrites(context, ctx.supabaseUrl);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const { email, password } = ctx.creds("platinum_purchased");
    await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
    await page.fill("input[type=email]", email);
    await page.fill("input[type=password]", password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }),
      page.click("button[type=submit]"),
    ]);
    await page.goto(`${ctx.base}/feasibility`, { waitUntil: "networkidle" });
    const box = page.getByPlaceholder(PLACEHOLDER);
    await box.waitFor({ state: "visible" });
    await box.fill(ADDRESS);
    const button = page.getByRole("button", { name: "Look up" });
    const msg = box.locator("xpath=../../p");

    for (const c of CASES) {
      await page.unroute(LOOKUP).catch(() => {});
      await page.route(LOOKUP, (route) =>
        route.fulfill({ status: c.status, contentType: "application/json", body: JSON.stringify(c.body) })
      );
      let text = "";
      let cls = "";
      try {
        await Promise.all([
          page.waitForResponse((r) => LOOKUP.test(r.url()), { timeout: 20000 }),
          button.click(),
        ]);
        await button.waitFor({ state: "visible", timeout: 20000 });
        await msg.waitFor({ state: "visible", timeout: 20000 });
        text = ((await msg.textContent()) || "").trim();
        cls = (await msg.getAttribute("class")) || "";
      } catch (e) {
        text = `(no message: ${String(e?.message || e).slice(0, 80)})`;
      }
      const tone = /text-amber-700/.test(cls) ? "amber" : /text-red-700/.test(cls) ? "red" : "other";
      out.push({
        name: `ui-message-for-${c.status}`,
        rule: meta.rules[0],
        status: c.want.test(text) ? "pass" : "fail",
        detail: `expected "${c.what}"; got tone=${tone} message="${text.slice(0, 160)}"`,
      });
    }
    if (blockedWrites.length) ctx.log(`kept platinum_purchased read-only: refused ${[...new Set(blockedWrites)].join(", ")}`);
    await context.close();
  } finally {
    await browser.close();
  }
  return out;
}
