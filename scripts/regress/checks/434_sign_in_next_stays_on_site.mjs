// 434 — the `next` the sign-in pages carry is an in-app path and nothing else
// (RC3 triage R3-08 / R3-20: the return path that brings a government user back
// to /gov and a resident back to a sponsored entry).
//
// RC3's sign-in pages ignored `next` altogether, so the positive control below
// fails there: that is the missing return path. The hostile values pass on RC3
// only because RC3 carried no `next` at all. They guard the RC4 helper
// (authStore.safeNextPath), whose first draft let a control character through:
// "/<tab>/host" starts with "/" and not "//", yet URL parsing drops the tab and
// reads it as "//host", a different site. Its second draft tested the sign-in
// pages against the url's text, so "/%6Cogin", which the router opens as
// /login, got through.
//
// Observed without signing in: /login rebuilds its "Create an account" link
// from the same safeNextPath() it uses to choose where to go after signing in,
// so that link shows exactly what the helper kept. Anonymous, nothing written.
export const meta = {
  name: "434 sign-in next stays on the site",
  rules: [
    "R3-08 / R3-20: an in-app `next` is kept through the sign-in pages",
    "a `next` that could leave the site, or loop back into the sign-in pages, is dropped",
  ],
};

const KEPT = ["/gov/regulatory", "/partner/regress-made-up-token"];
const DROPPED = [
  "/\t/evil.example",
  "/\n/evil.example",
  "/\r/evil.example",
  "//evil.example",
  "/\\evil.example",
  "https://evil.example/",
  "javascript:alert(1)",
  "/./login",
  "/Login",
  "/create-account?x=1",
  // Percent-encoded spellings of the sign-in pages. React Router decodes each
  // segment before it matches, so these open /login and /create-account.
  "/%6Cogin",
  "/create%2Daccount",
];

const shown = (s) => JSON.stringify(s);

export default async function (ctx) {
  const browser = await ctx.launch();
  const kept = [];
  const dropped = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const carried = async (value) => {
      await page.goto(`${ctx.base}/login?next=${encodeURIComponent(value)}`, { waitUntil: "domcontentloaded" });
      const link = page.locator("main a[href^='/create-account']").first();
      await link.waitFor();
      const href = (await link.getAttribute("href")) || "";
      return new URL(href, ctx.base).searchParams.get("next");
    };
    for (const value of KEPT) {
      const got = await carried(value);
      kept.push({ value, got, ok: got === value });
    }
    for (const value of DROPPED) {
      const got = await carried(value);
      const leaves = got !== null && new URL(got, ctx.base).origin !== new URL(ctx.base).origin;
      dropped.push({ value, got, leaves, ok: got === null });
    }
    await context.close();
  } finally {
    await browser.close();
  }
  return [
    {
      name: "in-app-next-kept",
      rule: meta.rules[0],
      status: kept.every((k) => k.ok) ? "pass" : "fail",
      detail: kept.map((k) => `${shown(k.value)}: ${k.got === null ? "dropped" : `kept as ${shown(k.got)}`}`).join("; "),
    },
    {
      name: "off-site-next-dropped",
      rule: meta.rules[1],
      status: dropped.every((d) => d.ok) ? "pass" : "fail",
      detail: dropped
        .filter((d) => !d.ok)
        .map((d) => `${shown(d.value)} kept as ${shown(d.got)}${d.leaves ? " (resolves off the site)" : ""}`)
        .join("; ") || `all ${dropped.length} dropped`,
    },
  ];
}
