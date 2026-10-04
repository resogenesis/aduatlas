// T4-01 (RC4 rehearsal, launch-blocking): on a shared browser, logging out left
// the previous account's address, brief, budget, timeline and course progress
// in localStorage. The next account to sign in saw them in My Property and
// /study, sign-in hydration merged them into that account's copy, and one
// ordinary "Save brief" wrote them to its row. The fix: src/stores/
// accountScope.js records which account the browser's copy belongs to, empties
// it at log out and on SIGNED_OUT, and removes another account's copy before a
// sign-in reads or merges anything.
//
// Two regress- Platinum accounts, A and B, each seeded ON THE SERVER with its
// own brief, course progress (chapters and a quiz score) and a worksheet and
// lot. A's brief also holds two fields B's row leaves blank (site access and
// HOA notes), so a leftover of A's cannot be hidden by B's own server values
// overwriting it on My Property. Unless a rule says otherwise, everything runs
// in ONE browser context (a shared browser), signing in through the real /login
// page and out through the real Log out button. Before each rule that stands on
// its own, both rows are put back to their seeded state, so a rule reports only
// what its own flow wrote.
//   1. A signs in: A's own brief, progress and worksheet reach this browser
//      (the positive control: without it the rules below would pass on a
//      browser that simply never loaded anything).
//   2. A logs out: no account-scoped key is left in localStorage.
//   3. B signs in on the same browser: none of A's brief, progress, quiz score,
//      worksheet or lot is in this browser, and B's own are.
//   4. B opens My Property and presses Save brief: no field on the page holds
//      anything of A's, and B's row on the server holds nothing of A's: no
//      brief field, no chapter, no quiz score, no worksheet and no lot.
//   5. B logs out and A signs in again: A's data is back from A's row and none
//      of B's is here. A reload keeps A's data and still holds nothing of B's.
//   6. A fresh browser: B signs in and hydrates from B's own row.
//   7. The source: every localStorage key the app writes is either listed in
//      ACCOUNT_SCOPED_KEYS (cleared at log out) or is one of the browser-level
//      keys named here, so a new per-person key cannot be added unguarded.
//   8. A foreign owner at sign-in (a fresh context): A signs in and holds its
//      copy, then B signs in on /login WITHOUT A logging out. None of A's data
//      is in the browser once B's hydration settles, the owner record names B,
//      and after Save brief B's row holds nothing of A's.
//   9. No reload between accounts (the main context, after rule 5): A logs out,
//      the header's Sign In link is followed and B signs in, and My Property is
//      reached through the sidebar, all in ONE document, so in-memory copies
//      (the worksheet store, course timers) are exercised as a person meets
//      them. The same holdings, page and row checks as rules 3 and 4, and the
//      document must still be the one Log out was pressed in.
//  10. A failed sign-out (the /auth/v1/logout request is aborted): Log out
//      still leaves no sb-*-auth-token key and no aduatlas.mock.session, and
//      the app is still signed out after a reload and after the tab is hidden
//      and shown again.
//  11. The same with the sign-out request answered 503.
//  12. A second tab (two pages in one context): page 2 shows A's My Property.
//      In page 1, A logs out and B signs in. Within about 5 s page 2 leaves the
//      stale view (its path becomes "/") and shows nothing of A's; if it still
//      offers Save brief, it is pressed, and B's row must hold nothing of A's.
//  13. Ownerless data an older build left (a fresh context): A's brief and
//      progress are written to localStorage with no aduatlas.owner and no
//      aduatlas.scope.v1 before the app ever loads. The site is loaded signed
//      out, then B signs in and saves its brief: none of A's values is in the
//      browser or on B's row.
// Fixtures are named ${ctx.prefix}-860-*. Both accounts are deleted afterwards,
// also when seeding fails part way.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DESKTOP, loginForm, makeHomeowner, readServerCopy, seedWorksheets, signIn, stampPurchase, svcHeaders } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "860 a shared browser never shows or saves one account's data under another",
  rules: [
    "an account signing in on a browser receives its own brief, course progress and worksheet from its row (positive control)",
    "log out leaves no account-scoped key in the browser",
    "the next account to sign in on the same browser holds none of the previous account's brief, course progress, quiz score, worksheet or lot, and holds its own",
    "My Property shows nothing of the previous account and a Save brief writes none of its brief, chapters, quiz scores, worksheet or lot to the signed-in account's row",
    "switching back to the first account restores its own data from its row and holds none of the second's, and a reload keeps that",
    "a fresh browser hydrates the signing-in account from its own row",
    "every localStorage key the app writes is cleared at log out or is a named browser-level key",
    "a sign-in by another account over the copy this browser holds for the previous one (no log out) removes that copy first, records the new owner, and saves nothing of the previous account to the new row",
    "log out, the header's Sign In link and a sign-in in the same document (no reload) leave none of the previous account's data in the browser, on My Property or on the new account's row",
    "when the sign-out request is aborted, log out still removes the session from the browser, and neither a reload nor the tab becoming visible again signs the account back in",
    "when the sign-out request is answered 503, log out still removes the session from the browser, and neither a reload nor the tab becoming visible again signs the account back in",
    "a second tab showing an account leaves that view (goes to /) within about 5 s once another tab logs that account out and signs a different one in, and nothing of the first account reaches the second account's row",
    "ownerless account data an older build left in this browser does not reach an account that signs in after a signed-out visit, in the browser or on its row",
  ],
};

const HERE = path.dirname(fileURLToPath(import.meta.url));
// REGRESS_SRC points rule 7 at another tree, to prove it fails on a candidate
// without the fix (the frozen RC4 snapshot).
const SRC = process.env.REGRESS_SRC ? path.resolve(process.env.REGRESS_SRC) : path.resolve(HERE, "../../../src");
// Browser-level keys, not a person's data: the anonymous referral id and the
// code the visitor arrived with (attribution belongs to the browser), the owner
// marker itself, the one-time sweep marker for copies older builds left
// ("aduatlas.scope.v1", never cleared by log out), the short-lived record a
// "log out and continue as a resident" leaves so other tabs keep the partner
// entry ("aduatlas.logout.keep", removed at the next sign-in), and the developer
// mock flags authStore manages.
const BROWSER_LEVEL = new Set([
  "aduatlas.sid",
  "aduatlas.ref",
  "aduatlas.ref.seen",
  "aduatlas.owner",
  "aduatlas.scope.v1",
  "aduatlas.logout.keep",
  "aduatlas.mock.users",
  "aduatlas.mock.session",
  "aduatlas.mock.paid",
  "aduatlas.mock.tier",
]);
const OWNER_KEY = "aduatlas.owner";
const MOCK_SESSION = "aduatlas.mock.session";
const AUTH_TOKEN = /^sb-.*-auth-token/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (probe, ms = 20000, step = 500) => {
  const until = Date.now() + ms;
  let last = null;
  while (Date.now() < until) {
    last = await probe();
    if (last?.done) return last;
    await sleep(step);
  }
  return last;
};
const list = (xs) => (xs && xs.length ? xs.join(", ") : "none");

const marker = (ctx, who) => `${ctx.prefix}-860-${who}`;
// A holds two free-text fields B's seeded row leaves blank. My Property lays
// every non-empty SERVER value over the local copy, so only a field the new
// account's row lacks can show whether the previous account's copy survived.
const briefFor = (ctx, who) => ({
  address: `${who === "A" ? "860" : "861"} Regress ${who} Street, Phoenix, AZ 85001`,
  purpose: `${marker(ctx, who)}-purpose`,
  budget: `${marker(ctx, who)}-budget`,
  timeline: `${marker(ctx, who)}-timeline`,
  ...(who === "A" ? { siteAccess: `${marker(ctx, who)}-access`, hoaNotes: `${marker(ctx, who)}-hoa` } : {}),
});
const BRIEF_FIELDS = { address: "address", purpose: "brief", budget: "budget", timeline: "timeline", siteAccess: "site access", hoaNotes: "HOA notes" };
const progressFor = (who) => ({
  v: 1,
  chapters: who === "A" ? ["m1c1", "m1c2"] : ["m3c1"],
  quizzes: who === "A" ? { m1quiz: { score: 4, total: 5, percent: 80, at: "2026-09-01T00:00:00.000Z" } } : { m3quiz: { score: 2, total: 5, percent: 40, at: "2026-09-02T00:00:00.000Z" } },
});
const sheetFor = (ctx, who) => ({ values: { "Water-notes": `${marker(ctx, who)}-sheet` } });
const lotFor = (ctx, who) => ({ input: { lotWidth: who === "A" ? "60" : "75", lotDepth: "120" }, address: `${marker(ctx, who)}-lot`, dimsEstimated: false, coords: null, lookup: null });

// The account's seeded state, written to its row and server copy. Used to seed
// and to put a row back before a rule that stands on its own.
const writeSeed = async (ctx, acct, who) => {
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?id=eq.${acct.rowId}`, {
    method: "PATCH", headers: { ...svcHeaders(ctx), Prefer: "return=minimal" },
    body: JSON.stringify({ builder_packet: briefFor(ctx, who), completed_chapters: progressFor(who) }),
  });
  if (r.status >= 300) throw new Error(`seeding ${who}'s row failed: HTTP ${r.status}`);
  await seedWorksheets(ctx, acct.token, { worksheets: { preSiteEstimate: sheetFor(ctx, who) }, lot: lotFor(ctx, who) });
};

// Finding 28: every step after makeHomeowner can throw, and the account object
// would then never reach the caller's finally. It is removed here instead.
const seedAccount = async (ctx, who) => {
  const acct = await makeHomeowner(ctx, `860-${who.toLowerCase()}`);
  try {
    await stampPurchase(ctx, acct.rowId, "report");
    await writeSeed(ctx, acct, who);
  } catch (e) {
    await acct.cleanup().catch(() => {});
    throw e;
  }
  return acct;
};

// Everything this browser holds, as one string, plus the keys present and the
// parsed course progress.
const readBrowser = (page) =>
  page.evaluate(() => {
    const keys = [];
    const parts = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      keys.push(k);
      if (k.startsWith("aduatlas.")) parts.push(`${k}=${window.localStorage.getItem(k)}`);
    }
    const parse = (k, fallback) => {
      try {
        return JSON.parse(window.localStorage.getItem(k) || "null") ?? fallback;
      } catch {
        return fallback;
      }
    };
    return { keys, text: parts.join("\n"), completed: parse("aduatlas.course.completed", []), quizzes: parse("aduatlas.course.quizzes", {}), owner: window.localStorage.getItem("aduatlas.owner") };
  });

// Does this text hold `who`'s seeded data? Returns the pieces found (every one
// of `who`'s chapters and quizzes must be present to count them, which is what
// the positive controls need).
const holdingsOf = (ctx, text, who) => {
  const found = [];
  const b = briefFor(ctx, who);
  for (const [k, label] of Object.entries(BRIEF_FIELDS)) if (b[k] && text.includes(b[k])) found.push(label);
  if (text.includes(`${marker(ctx, who)}-sheet`)) found.push("worksheet");
  if (text.includes(`${marker(ctx, who)}-lot`)) found.push("lot");
  const p = progressFor(who);
  const completed = (/aduatlas\.course\.completed=(.*)/.exec(text) || [])[1] || "";
  if (p.chapters.every((c) => completed.includes(`"${c}"`))) found.push("chapters");
  const quizzes = (/aduatlas\.course\.quizzes=(.*)/.exec(text) || [])[1] || "";
  if (Object.keys(p.quizzes).every((q) => quizzes.includes(`"${q}"`))) found.push("quiz");
  return found;
};
const fullFor = (who) => [...Object.entries(BRIEF_FIELDS).filter(([k]) => briefFor({ prefix: "" }, who)[k]).map(([, l]) => l), "worksheet", "lot", "chapters", "quiz"];

// Course progress in either shape the row or the browser keeps it.
const progressOf = (value) => {
  if (Array.isArray(value)) return { chapters: value.filter((c) => typeof c === "string"), quizzes: {} };
  if (value && typeof value === "object") {
    return {
      chapters: Array.isArray(value.chapters) ? value.chapters.filter((c) => typeof c === "string") : [],
      quizzes: value.quizzes && typeof value.quizzes === "object" && !Array.isArray(value.quizzes) ? value.quizzes : {},
    };
  }
  return { chapters: [], quizzes: {} };
};
// ANY of `who`'s chapters or quiz scores in this progress: a leak, however small.
const progressLeak = (value, who) => {
  const p = progressOf(value);
  const src = progressFor(who);
  const out = [];
  const ch = src.chapters.filter((c) => p.chapters.includes(c));
  if (ch.length) out.push(`chapters ${ch.join("/")}`);
  const qz = Object.keys(src.quizzes).filter((q) => Object.prototype.hasOwnProperty.call(p.quizzes, q));
  if (qz.length) out.push(`quiz ${qz.join("/")}`);
  return out;
};
// Anything of `who`'s in this browser: seeded values, or any chapter or quiz.
const browserLeak = (ctx, got, who) => {
  const found = holdingsOf(ctx, got.text, who).filter((f) => f !== "chapters" && f !== "quiz");
  return [...found, ...progressLeak({ chapters: Array.isArray(got.completed) ? got.completed : [], quizzes: got.quizzes || {} }, who)];
};

// Wait until the browser holds `who`'s complete seeded copy (brief and progress
// arrive with sign-in hydration, the worksheet and lot with the store's read).
const waitHolding = (page, ctx, who) =>
  waitFor(async () => {
    const got = await readBrowser(page).catch(() => ({ keys: [], text: "", completed: [], quizzes: {} }));
    const found = holdingsOf(ctx, got.text, who);
    return { done: fullFor(who).every((f) => found.includes(f)), found, got };
  });

// Sign in through the real /login page (702's helper), waiting out a rate limit.
const signInAs = async (page, ctx, acct) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await signIn(page, ctx, acct.email, acct.password);
      return;
    } catch (e) {
      const limited = await page.getByText(/too many attempts|rate limit/i).count().catch(() => 0);
      if (!limited || attempt >= 2) throw e;
      await sleep(65000);
    }
  }
};
// Sign in on the /login page this document is already showing (no page.goto).
// Typed values never reach an error: a failure is a fixed sentence.
const signInHere = async (page, acct) => {
  // Inside the sign-in form only (see loginForm in 702): the footer's
  // newsletter field is on this page too, and is there first while the
  // sign-in form is still loading after the header link's navigation.
  const form = loginForm(page);
  try {
    await form.waitFor({ state: "visible", timeout: 30000 });
    await form.locator("input[type=email]").fill(acct.email);
    await form.locator("input[type=password]").fill(acct.password);
  } catch {
    throw new Error("the sign-in form could not be filled in this document (details withheld)");
  }
  // Supabase allows 150 token requests per 5 minutes per IP, and this check
  // signs in many times, so a run straight after another one can meet that
  // limit here. Like signInAs, wait it out and press Sign in again (the form
  // keeps its values), and say so if it never clears.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), form.locator("button[type=submit]").click()]);
      return;
    } catch {
      const limited = await page.getByText(/too many attempts|rate limit/i).count().catch(() => 0);
      if (!limited) throw new Error("sign-in in this document did not leave /login within 30 s, with no rate-limit message on the page (details withheld)");
      if (attempt >= 2) throw new Error("sign-in in this document was rate limited three times (details withheld)");
      await sleep(65000);
    }
  }
};

const logOut = async (page, ctx) => {
  await page.goto(`${ctx.base}/dashboard`, { waitUntil: "networkidle" });
  const button = page.getByRole("button", { name: "Log out" }).first();
  await button.click({ timeout: 15000 });
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
  await sleep(1500); // the sign-out request and its SIGNED_OUT event
};

const readRowPacket = async (ctx, rowId) => {
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?id=eq.${rowId}&select=builder_packet,completed_chapters`, { headers: svcHeaders(ctx) });
  return Array.isArray(r.body) ? r.body[0] || null : null;
};
// Anything of `who`'s on `acct`'s row or server copy: brief fields, chapters,
// quiz scores, worksheet, lot.
const rowLeak = async (ctx, acct, who) => {
  const row = await readRowPacket(ctx, acct.rowId);
  const found = holdingsOf(ctx, JSON.stringify(row?.builder_packet || {}), who).filter((f) => Object.values(BRIEF_FIELDS).includes(f));
  const server = await readServerCopy(ctx, acct.rowId);
  const copy = JSON.stringify(server || {});
  if (copy.includes(`${marker(ctx, who)}-sheet`)) found.push("worksheet");
  if (copy.includes(`${marker(ctx, who)}-lot`)) found.push("lot");
  return [...found, ...progressLeak(row?.completed_chapters, who)];
};

// What My Property's fields hold, and whether any of `who`'s brief is among them.
const fieldValues = (page) => page.evaluate(() => [...document.querySelectorAll("input, textarea")].map((el) => el.value).join("\n")).catch(() => "");
const briefIn = (ctx, text, who) => Object.entries(BRIEF_FIELDS).filter(([k]) => briefFor(ctx, who)[k] && text.includes(briefFor(ctx, who)[k])).map(([, l]) => l);

// My Property as the signed-in account, then Save brief. `open` reaches the page.
const saveBriefOn = async (page, open) => {
  await open();
  await sleep(2500); // the page's own read of the server brief
  const shown = await fieldValues(page);
  await page.getByRole("button", { name: /Save brief/ }).first().click({ timeout: 15000 });
  await sleep(3000);
  return shown;
};

// Rule 7: the keys the source writes, read from the tree this check ships in.
const sourceKeys = () => {
  const keys = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/.test(e.name)) {
        const text = fs.readFileSync(p, "utf8");
        for (const m of text.matchAll(/["'`](aduatlas\.[a-zA-Z0-9._-]+)["'`]/g)) keys.add(m[1]);
      }
    }
  };
  walk(SRC);
  const scopeFile = path.join(SRC, "stores/accountScope.js");
  const scope = fs.existsSync(scopeFile) ? fs.readFileSync(scopeFile, "utf8") : "";
  const listed = new Set([...scope.matchAll(/"(aduatlas\.[a-zA-Z0-9._-]+)"/g)].map((m) => m[1]));
  return { keys: [...keys], listed };
};

// The session as this browser holds it: supabase-js's own key and the mirror.
const sessionKeys = (page) =>
  page
    .evaluate(() => {
      const keys = [];
      for (let i = 0; i < window.localStorage.length; i += 1) keys.push(window.localStorage.key(i));
      return keys;
    })
    .then((keys) => ({ token: keys.filter((k) => AUTH_TOKEN.test(k)), mock: keys.includes(MOCK_SESSION) }))
    .catch(() => ({ token: ["unreadable"], mock: true }));
const signedOut = (s) => s.token.length === 0 && !s.mock;
const showSession = (s) => `sb-*-auth-token ${s.token.length ? "present" : "absent"}, mock session ${s.mock ? "present" : "absent"}`;

// The tab hidden, then shown again: supabase-js re-reads its stored session on
// visibilitychange (listening on window; a document event bubbles there).
const hideAndShow = (page) =>
  page.evaluate(async () => {
    const set = (state) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => state === "hidden" });
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
    };
    set("hidden");
    await new Promise((r) => setTimeout(r, 500));
    set("visible");
  });

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `shared-browser-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  const reported = (i) => out.some((r) => r.name === `shared-browser-${i + 1}`);
  // Each block reports its own rules, so one that cannot run never hides another.
  const guarded = async (rules, body) => {
    try {
      await body();
    } catch (e) {
      for (const i of rules) if (!reported(i)) add(i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
    }
  };

  // Rule 7 needs no fixture, so it always runs.
  try {
    const { keys, listed } = sourceKeys();
    const loose = keys.filter((k) => !listed.has(k) && !BROWSER_LEVEL.has(k));
    add(6, loose.length === 0 && listed.size > 0, loose.length ? `keys neither cleared at log out nor browser-level: ${loose.join(", ")}` : `${keys.length} keys in src; ${listed.size} cleared at log out, the rest browser-level`);
  } catch (e) {
    add(6, false, `could not read the source tree: ${e.message}`);
  }

  const fixtureRules = meta.rules.map((_, i) => i).filter((i) => i !== 6);
  if (!ctx.serviceKey) {
    for (const i of fixtureRules) out.push({ name: `shared-browser-${i + 1}`, rule: meta.rules[i], status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture accounts cannot be created" });
    return out.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
  }

  let A = null;
  let B = null;
  let browser;
  const reseed = async () => {
    await writeSeed(ctx, A, "A");
    await writeSeed(ctx, B, "B");
  };
  try {
    A = await seedAccount(ctx, "A");
    B = await seedAccount(ctx, "B");
    browser = await ctx.launch();
    const sb = new URL(ctx.supabaseUrl).origin;

    // ── 1-5 and 9: one shared browser ─────────────────────────────────────
    await guarded([0, 1, 2, 3, 4, 8], async () => {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      try {
        // 1. A signs in and receives A's own data.
        await signInAs(page, ctx, A);
        const a1 = await waitHolding(page, ctx, "A");
        add(0, a1.done, `A's data in the browser after sign-in: ${list(a1.found)}`);

        // 2. A logs out.
        await logOut(page, ctx);
        const afterOut = await readBrowser(page);
        const left = afterOut.keys.filter((k) => k.startsWith("aduatlas.") && !BROWSER_LEVEL.has(k));
        const aLeft = browserLeak(ctx, afterOut, "A");
        add(1, left.length === 0 && aLeft.length === 0, left.length || aLeft.length ? `left behind: keys ${list(left)}; A's data ${list(aLeft)}` : "no account-scoped key left");

        // 3. B signs in on the same browser.
        await signInAs(page, ctx, B);
        const b1 = await waitHolding(page, ctx, "B");
        const aInB = browserLeak(ctx, await readBrowser(page), "A");
        add(2, b1.done && aInB.length === 0, `B's own: ${list(b1.found)}; A's still here: ${list(aInB)}`);

        // 4. My Property under B, then Save brief (finding 26: A's site access
        // and HOA notes are fields B's row leaves blank, and the row's chapters
        // and quiz scores are read back too).
        const shown = await saveBriefOn(page, () => page.goto(`${ctx.base}/my-property`, { waitUntil: "networkidle" }));
        const shownA = briefIn(ctx, shown, "A");
        const shownB = shown.includes(briefFor(ctx, "B").address);
        const aOnB = await rowLeak(ctx, B, "A");
        add(3, shownB && shownA.length === 0 && aOnB.length === 0, `page shows B's address: ${shownB}; A's fields on the page: ${list(shownA)}; A's data on B's row after Save brief: ${list(aOnB)}`);

        // 5. Back to A, then a reload.
        await logOut(page, ctx);
        await signInAs(page, ctx, A);
        const a2 = await waitHolding(page, ctx, "A");
        const bInA = browserLeak(ctx, await readBrowser(page), "B");
        await page.reload({ waitUntil: "networkidle" });
        const a3 = await waitHolding(page, ctx, "A");
        const bInA2 = browserLeak(ctx, await readBrowser(page), "B");
        add(4, a2.done && bInA.length === 0 && a3.done && bInA2.length === 0, `A's own after switching back: ${list(a2.found)}, after reload: ${list(a3.found)}; B's here: ${list([...new Set([...bInA, ...bInA2])])}`);

        // 9. No reload between accounts (finding 27, part 2). A is signed in
        // and this document has read A's worksheet into memory.
        await reseed();
        await page.goto(`${ctx.base}/dashboard`, { waitUntil: "networkidle" });
        await waitHolding(page, ctx, "A");
        const doc = `${ctx.prefix}-${Date.now()}`;
        await page.evaluate((d) => {
          window.__regress860doc = d;
        }, doc);
        await page.getByRole("button", { name: "Log out" }).first().click({ timeout: 15000 });
        await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
        await sleep(1500);
        await page.locator('header [data-header-account="signed-out"] a[href="/login"]').first().click({ timeout: 15000 });
        await page.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 15000 });
        await signInHere(page, B);
        const b9 = await waitHolding(page, ctx, "B");
        const a9 = browserLeak(ctx, await readBrowser(page), "A");
        const shown9 = await saveBriefOn(page, async () => {
          await page.locator('a[href="/my-property"]:visible').first().click({ timeout: 15000 });
          await page.waitForURL((u) => u.pathname === "/my-property", { timeout: 15000 });
        });
        const shownA9 = briefIn(ctx, shown9, "A");
        const shownB9 = shown9.includes(briefFor(ctx, "B").address);
        const aOnB9 = await rowLeak(ctx, B, "A");
        const sameDoc = await page.evaluate((d) => window.__regress860doc === d, doc).catch(() => false);
        add(
          8,
          sameDoc && b9.done && a9.length === 0 && shownB9 && shownA9.length === 0 && aOnB9.length === 0,
          `one document throughout: ${sameDoc}; B's own: ${list(b9.found)}; A's in the browser: ${list(a9)}; page shows B's address: ${shownB9}; A's fields on the page: ${list(shownA9)}; A's data on B's row after Save brief: ${list(aOnB9)}`
        );
      } finally {
        await context.close();
      }
    });

    // ── 6. A fresh browser, B ─────────────────────────────────────────────
    await guarded([5], async () => {
      const fresh = await browser.newContext(DESKTOP);
      try {
        const fp = await fresh.newPage();
        await signInAs(fp, ctx, B);
        const b2 = await waitHolding(fp, ctx, "B");
        add(5, b2.done, `B's own data in a fresh browser: ${list(b2.found)}`);
      } finally {
        await fresh.close();
      }
    });

    // ── 8. A foreign owner at sign-in (finding 27, part 1) ────────────────
    await guarded([7], async () => {
      await reseed();
      const context = await browser.newContext(DESKTOP);
      try {
        const page = await context.newPage();
        await signInAs(page, ctx, A);
        const a = await waitHolding(page, ctx, "A");
        const ownerBefore = (await readBrowser(page)).owner;
        // No log out: /login does not turn a signed-in visitor away.
        await signInAs(page, ctx, B);
        const b = await waitHolding(page, ctx, "B");
        const got = await readBrowser(page);
        const aHere = browserLeak(ctx, got, "A");
        const shown = await saveBriefOn(page, () => page.goto(`${ctx.base}/my-property`, { waitUntil: "networkidle" }));
        const shownA = briefIn(ctx, shown, "A");
        const aOnB = await rowLeak(ctx, B, "A");
        add(
          7,
          a.done && b.done && aHere.length === 0 && got.owner === B.authId && shownA.length === 0 && aOnB.length === 0,
          `A's copy before B signed in: ${list(a.found)} (owner recorded for A: ${ownerBefore === A.authId}); B's own after: ${list(b.found)}; A's still here: ${list(aHere)}; owner record names B: ${got.owner === B.authId}; A's fields on My Property: ${list(shownA)}; A's data on B's row after Save brief: ${list(aOnB)}`
        );
      } finally {
        await context.close();
      }
    });

    // ── 10 and 11. The sign-out request fails ─────────────────────────────
    const failedSignOut = async (i, how) => {
      await guarded([i], async () => {
        const context = await browser.newContext(DESKTOP);
        let calls = 0;
        try {
          await context.route(
            (u) => u.origin === sb && u.pathname === "/auth/v1/logout",
            (route) => {
              const req = route.request();
              if (how === "abort") {
                if (req.method() !== "OPTIONS") calls += 1;
                return route.abort("failed");
              }
              const origin = req.headers().origin || new URL(ctx.base).origin;
              const cors = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };
              if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors, body: "" });
              calls += 1;
              return route.fulfill({ status: 503, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ code: 503, error_code: "unexpected_failure", msg: "regress 860: service unavailable" }) });
            }
          );
          const page = await context.newPage();
          await signInAs(page, ctx, A);
          const before = await waitFor(async () => {
            const s = await sessionKeys(page);
            return { done: s.token.length > 0 && s.mock, s };
          }, 15000);
          await logOut(page, ctx);
          const afterOut = await sessionKeys(page);
          await page.reload({ waitUntil: "networkidle" });
          await sleep(2500);
          const afterReload = await sessionKeys(page);
          const headerOut = (await page.locator('header [data-header-account="signed-out"]').count()) > 0;
          await hideAndShow(page);
          await sleep(3000);
          const afterShow = await sessionKeys(page);
          add(
            i,
            before.done && signedOut(afterOut) && signedOut(afterReload) && headerOut && signedOut(afterShow),
            `signed in before Log out: ${before.done}; sign-out requests ${how === "abort" ? "aborted" : "answered 503"}: ${calls}; after Log out: ${showSession(afterOut)}; after a reload: ${showSession(afterReload)}, header signed out: ${headerOut}; after hidden then visible: ${showSession(afterShow)}`
          );
        } finally {
          await context.close();
        }
      });
    };
    await failedSignOut(9, "abort");
    await failedSignOut(10, "503");

    // ── 12. A second tab ──────────────────────────────────────────────────
    await guarded([11], async () => {
      await reseed();
      const context = await browser.newContext(DESKTOP);
      try {
        const p1 = await context.newPage();
        await signInAs(p1, ctx, A);
        await waitHolding(p1, ctx, "A");
        const p2 = await context.newPage();
        await p2.goto(`${ctx.base}/my-property`, { waitUntil: "networkidle" });
        const aAddress = briefFor(ctx, "A").address;
        const showing = await waitFor(async () => {
          const v = await fieldValues(p2);
          return { done: v.includes(aAddress) };
        }, 20000);
        await logOut(p1, ctx);
        await signInAs(p1, ctx, B);
        const t0 = Date.now();
        const stale = async () => {
          const text = await p2.evaluate(() => `${document.body?.innerText || ""}\n${[...document.querySelectorAll("input, textarea")].map((el) => el.value).join("\n")}`).catch(() => "");
          return { path: new URL(p2.url()).pathname, aShown: briefIn(ctx, text, "A") };
        };
        const left = await waitFor(async () => {
          const s = await stale();
          return { done: s.path === "/" && s.aShown.length === 0, ...s };
        }, 7000, 250);
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        // A tab still on the old view is one Save away from writing A's brief
        // into B's row: press it, as a person at that tab would.
        let pressed = false;
        const save = p2.getByRole("button", { name: /Save brief/ });
        if (await save.count().catch(() => 0)) {
          pressed = await save.first().click({ timeout: 5000 }).then(() => true, () => false);
          await sleep(3000);
        }
        const aOnB = await rowLeak(ctx, B, "A");
        add(
          11,
          showing.done && left.done && aOnB.length === 0,
          `page 2 showed A's address first: ${showing.done}; ${left.done ? `left for / ${secs} s after B signed in` : `after 7 s page 2 is on ${left.path} showing A's ${list(left.aShown)}`}; stale Save brief pressed: ${pressed}; A's data on B's row: ${list(aOnB)}`
        );
      } finally {
        await context.close();
      }
    });

    // ── 13. Ownerless data an older build left ────────────────────────────
    await guarded([12], async () => {
      await reseed();
      const context = await browser.newContext(DESKTOP);
      try {
        const page = await context.newPage();
        // A same-origin page with none of the app on it, to write the old copy
        // before the app has ever run in this browser.
        const blank = `${ctx.base}/__regress-860-blank`;
        await page.route(blank, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>regress 860</title><p>blank</p>" }));
        await page.goto(blank, { waitUntil: "domcontentloaded" });
        await page.evaluate(
          ({ packet, completed, quizzes }) => {
            window.localStorage.setItem("aduatlas.packet", packet);
            window.localStorage.setItem("aduatlas.course.completed", completed);
            window.localStorage.setItem("aduatlas.course.quizzes", quizzes);
          },
          { packet: JSON.stringify(briefFor(ctx, "A")), completed: JSON.stringify(progressFor("A").chapters), quizzes: JSON.stringify(progressFor("A").quizzes) }
        );
        const seeded = await readBrowser(page);
        const pre = seeded.owner === null && !seeded.keys.includes("aduatlas.scope.v1") && browserLeak(ctx, seeded, "A").length > 0;
        await page.unroute(blank);
        await page.goto(`${ctx.base}/`, { waitUntil: "networkidle" });
        await sleep(1500);
        const booted = await readBrowser(page);
        await signInAs(page, ctx, B);
        const b = await waitHolding(page, ctx, "B");
        const aHere = browserLeak(ctx, await readBrowser(page), "A");
        const shown = await saveBriefOn(page, () => page.goto(`${ctx.base}/my-property`, { waitUntil: "networkidle" }));
        const shownA = briefIn(ctx, shown, "A");
        const aOnB = await rowLeak(ctx, B, "A");
        add(
          12,
          pre && b.done && aHere.length === 0 && shownA.length === 0 && aOnB.length === 0,
          `old copy written with no owner and no scope marker: ${pre}; after the signed-out visit: A's ${list(browserLeak(ctx, booted, "A"))}, scope marker ${booted.keys.includes("aduatlas.scope.v1")}; B's own after sign-in: ${list(b.found)}; A's in the browser: ${list(aHere)}; A's fields on My Property: ${list(shownA)}; A's data on B's row after Save brief: ${list(aOnB)}`
        );
      } finally {
        await context.close();
      }
    });
  } catch (e) {
    for (const i of fixtureRules) if (!reported(i)) add(i, false, `check stopped: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (A) await A.cleanup().catch(() => {});
    if (B) await B.cleanup().catch(() => {});
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
}
