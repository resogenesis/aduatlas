// DEF-07: the paid course text must not ship in the anonymously served JS.
//
// Downloads index.html exactly as an anonymous visitor gets it, then every JS
// asset it references and, transitively, every lazy chunk those reference, and
// asserts that distinctive sentences from paid chapter bodies, quiz questions
// and answers, the course introduction and the module intros are ABSENT.
//
// A positive control runs first: chapter TITLES are public outline metadata and
// must still be in the bundle. If the crawl did not reach the app code, the
// control fails, so an empty or wrong download can never pass as "absent".
//
// Minifiers may write non-ASCII characters as \uXXXX escapes, so the text is
// unescaped before searching, and every needle below is plain ASCII.
export const meta = { name: "800 course text not in public bundle", rules: ["DEF-07"] };

// Each needle was confirmed present in the RC1 bundle (main-vwgASNOa.js).
const PAID = [
  ["chapter m1c1 body", "An ADU is designed for independent living and is built in accordance with the regulations established by the municipality where it is located."],
  ["chapter m2c7 heading", "A typical city ADU process"],
  ["chapter m10c9 body", "Verify twice. Build once."],
  ["module 3 quiz answer", "To help homeowners follow a logical process, make informed decisions, and avoid costly mistakes"],
  ["module 7 quiz answer", "To identify potential legal, physical, and financial obstacles before investing significant money"],
  ["module 1 quiz question", "Which three features are required for an ADU to function as an independent living space?"],
  ["module 1 quiz takeaway", "Prepared homeowners have more success building an ADU than those who do not"],
  ["course introduction", "ADUAtlas teaches the process and the terms so you understand the entire project before you begin"],
  ["module 3 intro", "Imagine discovering that your pre-site costs are $30,000 higher than expected"],
];
const PUBLIC_CONTROL = ["What Is an ADU?", "Seven Common ADU Misconceptions"];

const unescape = (s) =>
  s
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

export default async function (ctx) {
  const out = [];
  const home = await fetch(`${ctx.base}/`);
  const html = await home.text();
  const origin = new URL(ctx.base).origin;

  const queue = [];
  for (const m of html.matchAll(/(?:src|href)="([^"]+\.m?js)"/g)) queue.push(new URL(m[1], `${ctx.base}/`).href);
  const seen = new Map();
  while (queue.length) {
    const u = queue.shift();
    if (seen.has(u) || !u.startsWith(`${origin}/`)) continue;
    const r = await fetch(u);
    const t = r.ok ? await r.text() : "";
    seen.set(u, { status: r.status, text: t });
    // Lazy chunks are referenced by file name from the chunks that load them.
    for (const m of t.matchAll(/["'`(/]((?:\.\/|\/)?(?:assets\/)?[\w.-]+-[\w-]{6,}\.js)["'`)]/g)) {
      const rel = m[1];
      const abs = rel.startsWith("/") ? `${origin}${rel}` : rel.startsWith("assets/") ? `${origin}/${rel}` : new URL(rel, u).href;
      if (abs.startsWith(`${origin}/assets/`) && !seen.has(abs)) queue.push(abs);
    }
  }
  const files = [...seen.entries()];
  const text = unescape(files.map(([, v]) => v.text).join("\n"));
  const summary = files.map(([u, v]) => `${u.slice(origin.length)} ${v.status} ${v.text.length}B`).join(", ");
  ctx.log(`crawled ${files.length} JS file(s): ${summary}`);

  out.push({
    name: "bundle crawl reached the app code (positive control: public chapter titles present)",
    rule: "DEF-07 check validity",
    status: files.length > 0 && PUBLIC_CONTROL.every((s) => text.includes(s)) ? "pass" : "fail",
    detail: `files=${files.length}; ${PUBLIC_CONTROL.map((s) => `${JSON.stringify(s)}=${text.includes(s)}`).join(" ")}`,
  });

  for (const [label, needle] of PAID) {
    const found = text.includes(needle);
    const where = found ? files.filter(([, v]) => unescape(v.text).includes(needle)).map(([u]) => u.slice(origin.length)).join(",") : "";
    out.push({
      name: `paid ${label} is absent from the public JS`,
      rule: "DEF-07: paid course text is served only to entitled callers",
      status: found ? "fail" : "pass",
      detail: found ? `found in ${where}: ${JSON.stringify(needle.slice(0, 80))}` : "absent",
    });
  }
  return out;
}
