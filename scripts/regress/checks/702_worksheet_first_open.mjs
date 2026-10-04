// R3-02 (DATA LOSS, found at the RC3 rehearsal, journey j1 step 6.4): a
// worksheet opened first on a new device rendered blank, and the next autosave
// replaced the saved server copy with that blank sheet plus one figure.
//
// A regress- Platinum account is created with the service role, its server copy
// (public.homeowner_worksheets) is written AS THAT ACCOUNT through the real
// save_homeowner_worksheets RPC, and then each rule opens a page in a FRESH
// browser context (a new device): sign in through the real /login page, drop the
// worksheet copy the sign-in itself may have pulled, and load the page as the
// first worksheet page of that device. Then one field is edited through the UI
// and the server copy is read back with the service role.
//   1. the pre-site estimate shows the saved values on first open;
//   2. editing one field keeps every other saved field on the server;
//   3. the Ready Score, edited once on first open, keeps every saved answer;
//   4. the Feasibility tool, edited once on first open, keeps the saved lot;
//   5. an edit typed BEFORE the server copy has arrived (the read is held back
//      in the browser for five seconds) is merged onto the server copy, and no
//      write leaves the browser before that read has landed;
//   6. a copy an older build left in this browser (the sheet in the packet and
//      no owner record) never overrides a newer value saved on the server: the
//      page shows the server's value, the server keeps it, and a field only
//      that copy held is kept too.
//   7. a RETURNING device that holds an older copy of this account's own sheet
//      (owner recorded, nothing unsent), whose read of the server copy fails,
//      and where one field is edited: nothing is written while the read is
//      failing, and after the next read (a reload) every field that was not
//      edited keeps the newer value saved on the server from another device;
//   8. the same for the Ready Score, which reads its answers once when it
//      mounts: it mounts on the older copy while the read is held back, the
//      read lands, one question is answered, and every other answer keeps the
//      newer value saved on the server.
//   9. the entitlement LAPSES and comes back (a refund, then a rebuy): a device
//      holding an older copy of its own sheet, with nothing unsent, visits a
//      page while the row is hidden by RLS (refunded_at set), the purchase is
//      stamped again, and the worksheet is opened and one field edited. Nothing
//      is written while the entitlement is lapsed, the page shows the newer
//      server value, and every field that was not edited keeps it.
// The account (and, by cascade, its worksheets row) is deleted afterwards.
//
// This file also exports the fixture helpers the other 70x/71x checks use.
export const meta = {
  name: "702 worksheets opened first on a new device keep the server copy",
  rules: [
    "a worksheet opened first on a new device shows the values saved on the server",
    "an edit on that first-opened worksheet keeps every other saved field on the server",
    "the Ready Score opened first on a new device and edited once keeps every saved answer on the server",
    "the Feasibility tool opened first on a new device and edited once keeps the saved lot on the server",
    "an edit typed on a new device before the server copy has arrived is merged onto it, and nothing is written before it arrives",
    "a worksheet copy an older build left in this browser never overrides a newer value saved on the server",
    "a returning device holding an older copy of its own worksheet, whose read fails, keeps every newer server value it did not edit",
    "the Ready Score opened on a returning device with older answers before the read lands keeps every newer server answer it did not change",
    "a device holding an older copy of its own worksheet that visits the site while the entitlement is lapsed never writes it over the newer server copy once the entitlement returns",
  ],
};

export const DESKTOP = { viewport: { width: 1280, height: 900 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const brief = (r) => `HTTP ${r.status} ${typeof r.body === "string" ? r.body.slice(0, 160) : JSON.stringify(r.body).slice(0, 160)}`;

export const svcHeaders = (ctx) => ({ apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" });

// A throwaway homeowner: an auth user (email confirmed), its public.users row
// (created by handle_new_auth_user), an access token, and a cleanup.
export const makeHomeowner = async (ctx, label) => {
  const H = svcHeaders(ctx);
  const email = `${ctx.prefix}-${label}@regress.aduatlas.test`;
  const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
  const created = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
    method: "POST", headers: H,
    body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix } }),
  });
  const authId = created.body?.id || created.body?.user?.id || null;
  if (!authId) throw new Error(`fixture sign-up failed: ${brief(created)}`);
  let rowId = null;
  for (let i = 0; i < 20 && !rowId; i += 1) {
    const rows = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?auth_user_id=eq.${authId}&select=id`, { headers: H });
    rowId = Array.isArray(rows.body) && rows.body[0]?.id;
    if (!rowId) await sleep(500);
  }
  const cleanup = async () => {
    if (rowId) await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?id=eq.${rowId}`, { method: "DELETE", headers: H }).catch(() => null);
    await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: H }).catch(() => null);
  };
  if (!rowId) {
    await cleanup();
    throw new Error("fixture users row never appeared");
  }
  let token = null;
  for (let i = 0; i < 6 && !token; i += 1) {
    const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: ctx.anonKey }, body: JSON.stringify({ email, password }),
    });
    if (r.status === 429) { await sleep(60000); continue; }
    token = r.ok ? (await r.json()).access_token : null;
    if (!token) { await cleanup(); throw new Error(`fixture sign-in failed: HTTP ${r.status}`); }
  }
  return { email, password, authId, rowId, token, cleanup };
};

// A purchase, stamped the way api/stripe-webhook.js records a paid session.
export const stampPurchase = async (ctx, rowId, tier) => {
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?id=eq.${rowId}`, {
    method: "PATCH", headers: { ...svcHeaders(ctx), Prefer: "return=minimal" },
    body: JSON.stringify({ paid_at: new Date().toISOString(), paid_tier: tier, refunded_at: null, paid_origin: "purchase" }),
  });
  if (r.status >= 300) throw new Error(`purchase stamp failed: ${brief(r)}`);
};

// Sign in through the real /login page in a fresh context. Shared by 703, 704,
// 705, 706, 707, 710, 712 and 713. Typed values never reach an error or a
// log: a Playwright fill() error quotes the value it was typing in its call
// log, and run.mjs prints and stores e.message and e.stack, so any failure
// here is replaced by a fixed sentence (as 430 and 853 do).
//
// Every field is found INSIDE the sign-in form (the form holding the password
// field). The footer's newsletter form is on /login too, and is in the page
// before the lazily loaded sign-in form: a bare "input[type=email]" filled the
// footer's field whenever it was the first one there, the sign-in form's email
// stayed empty, the browser's required check silently refused the submit, and
// the check failed as "did not leave /login" (860 rule 9, RC4B and RC4C).
export const loginForm = (page) => page.locator("form").filter({ has: page.locator("input[type=password]") }).first();

export const signIn = async (page, ctx, email, password) => {
  await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
  const form = loginForm(page);
  try {
    await form.waitFor({ state: "visible", timeout: 30000 });
    await form.locator("input[type=email]").fill(email);
    await form.locator("input[type=password]").fill(password);
  } catch {
    throw new Error("the sign-in form on /login could not be filled (details withheld)");
  }
  try {
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), form.locator("button[type=submit]").click()]);
  } catch {
    throw new Error("sign-in through /login did not leave the page within 30 s (details withheld)");
  }
};

// A new device: this browser holds a session and nothing else of the packet.
const forgetLocalWorksheets = (page) =>
  page.evaluate(() => {
    try {
      window.localStorage.removeItem("aduatlas.packet");
      window.localStorage.removeItem("aduatlas.worksheets.sync");
    } catch {
      // nothing to forget
    }
  });

const SEED_SHEETS = {
  preSiteEstimate: { values: { "Water-dist": "101", "Water-notes": "regress-saved-note", "Gas-permit": "250" } },
  readyScore: { answers: { "z-permitted": true, "z-lot-size": true, "s-slope": false }, points: 0, grade: null, completedAt: null },
};
const SEED_LOT = {
  input: { lotWidth: "60", lotDepth: "120", front: "20", rear: "10", side: "5", houseDepth: "40" },
  dimsEstimated: false,
  address: "100 Regress Way, Phoenix, AZ 85001",
  coords: null,
  lookup: null,
};

export const seedWorksheets = async (ctx, token, { worksheets = SEED_SHEETS, lot = SEED_LOT } = {}) => {
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/rpc/save_homeowner_worksheets`, {
    method: "POST",
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_worksheets: worksheets, p_lot: lot }),
  });
  if (r.status >= 300) throw new Error(`seeding the server copy failed: ${brief(r)}`);
};

// A refund, recorded the way the refund path stamps it: the entitlement lapses
// and RLS hides the account's homeowner_worksheets row.
const stampRefund = async (ctx, rowId) => {
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?id=eq.${rowId}`, {
    method: "PATCH", headers: { ...svcHeaders(ctx), Prefer: "return=minimal" },
    body: JSON.stringify({ refunded_at: new Date().toISOString() }),
  });
  if (r.status >= 300) throw new Error(`refund stamp failed: ${brief(r)}`);
};

export const readServerCopy = async (ctx, rowId) => {
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/homeowner_worksheets?user_id=eq.${rowId}&select=worksheets,lot`, { headers: svcHeaders(ctx) });
  return Array.isArray(r.body) ? r.body[0] || null : null;
};

// A returning device: this browser's copy of `key` is an OLDER copy of this
// account's own sheet, recorded as last reconciled with the server (owner set,
// nothing unsent), which is what the store leaves after a normal visit.
const holdOlderOwnCopy = (page, authId, key, sheet) =>
  page.evaluate(
    ({ authId, key, sheet }) => {
      let packet = {};
      try {
        packet = JSON.parse(window.localStorage.getItem("aduatlas.packet") || "{}") || {};
      } catch {
        packet = {};
      }
      packet.worksheets = { ...(packet.worksheets || {}), [key]: sheet };
      window.localStorage.setItem("aduatlas.packet", JSON.stringify(packet));
      window.localStorage.setItem("aduatlas.worksheets.sync", JSON.stringify({ owner: authId, pending: {}, bases: {} }));
    },
    { authId, key, sheet }
  );

const waitFor = async (probe, ms = 15000, step = 500) => {
  const until = Date.now() + ms;
  let last = null;
  while (Date.now() < until) {
    last = await probe();
    if (last?.done) return last;
    await sleep(step);
  }
  return last;
};

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `worksheet-first-open-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `worksheet-first-open-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture account cannot be created" }));

  const who = await makeHomeowner(ctx, "ws-first-open");
  let browser;
  try {
    await stampPurchase(ctx, who.rowId, "report");
    await seedWorksheets(ctx, who.token);
    browser = await ctx.launch();

    const freshDevice = async (path) => {
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await forgetLocalWorksheets(page);
      await page.goto(`${ctx.base}${path}`, { waitUntil: "domcontentloaded" });
      return { context, page };
    };

    // Each block reports its own rules, so a failure in one never hides another.
    const guarded = async (rules, body) => {
      try {
        await body();
      } catch (e) {
        for (const i of rules) if (!out.some((r) => r.rule === meta.rules[i])) add(i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
      }
    };

    // 1 and 2: the pre-site estimate.
    await guarded([0, 1], async () => {
      const { context, page } = await freshDevice("/packet/pre-site-estimate");
      const row = (name) => page.locator("table tbody tr", { has: page.locator("td", { hasText: new RegExp(`^${name}$`) }) }).first();
      await row("Water").waitFor({ state: "visible" });
      const water = row("Water").locator("input").first();
      const shown = await waitFor(async () => {
        const v = await water.inputValue();
        return { done: v === "101", v };
      }, 10000);
      add(0, shown?.v === "101", `Water distance on first open: "${shown?.v ?? ""}" (saved on the server: "101")`);

      await row("Sewer").locator("input").first().fill("7");
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const v = copy?.worksheets?.preSiteEstimate?.values || {};
        return { done: v["Sewer-dist"] === "7", v };
      }, 20000);
      const v = saved?.v || {};
      add(
        1,
        v["Sewer-dist"] === "7" && v["Water-dist"] === "101" && v["Water-notes"] === "regress-saved-note" && v["Gas-permit"] === "250",
        `server copy after typing Sewer distance 7: ${JSON.stringify(v)}`
      );
      await context.close();
    });

    // 3: the Ready Score.
    await guarded([2], async () => {
      const { context, page } = await freshDevice("/packet/ready-score");
      const q = page.locator("div", { has: page.locator("p", { hasText: "Is the site free of protected trees or habitat conflicts?" }) }).last();
      await q.waitFor({ state: "visible" });
      await sleep(1500);
      await q.locator("button", { hasText: /^Yes$/ }).click();
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const a = copy?.worksheets?.readyScore?.answers || {};
        return { done: a["s-trees"] === true, a };
      }, 20000);
      const a = saved?.a || {};
      add(
        2,
        a["s-trees"] === true && a["z-permitted"] === true && a["z-lot-size"] === true && a["s-slope"] === false,
        `server answers after one click: ${JSON.stringify(a)}`
      );
      await context.close();
    });

    // 4: the Feasibility tool's lot.
    await guarded([3], async () => {
      const { context, page } = await freshDevice("/feasibility");
      const side = page.locator("label", { hasText: /^Side setback \(each\)$/ }).locator("xpath=following-sibling::div[1]//input").first();
      await side.waitFor({ state: "visible" });
      await sleep(1500);
      await side.fill("7");
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const input = copy?.lot?.input || {};
        return { done: input.side === "7", lot: copy?.lot || null };
      }, 20000);
      const input = saved?.lot?.input || {};
      add(
        3,
        input.side === "7" && input.lotWidth === "60" && input.lotDepth === "120" && input.front === "20" && input.houseDepth === "40",
        `server lot input after typing side setback 7: ${JSON.stringify(input)}`
      );
      await context.close();
    });

    // 5. An edit typed before the server copy has arrived.
    await guarded([4], async () => {
      await seedWorksheets(ctx, who.token, { worksheets: { preSiteEstimate: SEED_SHEETS.preSiteEstimate }, lot: null });
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await forgetLocalWorksheets(page);
      const sb = new URL(ctx.supabaseUrl).origin;
      const events = [];
      await context.route(
        (u) => u.origin === sb && u.pathname === "/rest/v1/homeowner_worksheets",
        async (route) => {
          if (route.request().method() !== "GET") return route.fallback();
          await sleep(5000);
          events.push("read");
          return route.fallback();
        }
      );
      context.on("request", (req) => {
        if (new URL(req.url()).pathname === "/rest/v1/rpc/save_homeowner_worksheets") events.push("write");
      });
      await page.goto(`${ctx.base}/packet/pre-site-estimate`, { waitUntil: "domcontentloaded" });
      const row = (name) => page.locator("table tbody tr", { has: page.locator("td", { hasText: new RegExp(`^${name}$`) }) }).first();
      await row("Sewer").waitFor({ state: "visible" });
      await row("Sewer").locator("input").first().fill("8");
      const typedBeforeRead = !events.includes("read");
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const v = copy?.worksheets?.preSiteEstimate?.values || {};
        return { done: v["Sewer-dist"] === "8", v };
      }, 30000);
      const v = saved?.v || {};
      const firstWrite = events.indexOf("write");
      const firstRead = events.indexOf("read");
      const writeWaited = firstWrite === -1 || (firstRead !== -1 && firstRead < firstWrite);
      add(
        4,
        typedBeforeRead && writeWaited && v["Sewer-dist"] === "8" && v["Water-dist"] === "101" && v["Water-notes"] === "regress-saved-note" && v["Gas-permit"] === "250",
        `typed before the read landed: ${typedBeforeRead}; order of reads and writes: ${events.join(", ") || "none"}; server copy: ${JSON.stringify(v)}`
      );
      await context.close();
    });

    // 6. A copy an older build left in this browser.
    await guarded([5], async () => {
      await seedWorksheets(ctx, who.token, { worksheets: { preSiteEstimate: { values: { "Water-dist": "150", "Gas-permit": "250" } } }, lot: null });
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await sleep(3000);
      await page.evaluate(() => {
        window.localStorage.removeItem("aduatlas.worksheets.sync");
        let packet = {};
        try {
          packet = JSON.parse(window.localStorage.getItem("aduatlas.packet") || "{}") || {};
        } catch {
          packet = {};
        }
        packet.worksheets = { ...(packet.worksheets || {}), preSiteEstimate: { values: { "Water-dist": "101", "Water-notes": "regress-older-build-note" } } };
        window.localStorage.setItem("aduatlas.packet", JSON.stringify(packet));
      });
      await page.goto(`${ctx.base}/packet/pre-site-estimate`, { waitUntil: "domcontentloaded" });
      const row = (name) => page.locator("table tbody tr", { has: page.locator("td", { hasText: new RegExp(`^${name}$`) }) }).first();
      await row("Water").waitFor({ state: "visible" });
      const shown = await waitFor(async () => {
        const v = await row("Water").locator("input").first().inputValue();
        return { done: v === "150", v };
      }, 10000);
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const v = copy?.worksheets?.preSiteEstimate?.values || {};
        return { done: v["Water-notes"] === "regress-older-build-note", v };
      }, 15000);
      const v = saved?.v || {};
      add(
        5,
        shown?.v === "150" && v["Water-dist"] === "150" && v["Gas-permit"] === "250" && v["Water-notes"] === "regress-older-build-note",
        `Water distance shown: "${shown?.v ?? ""}" (server "150", older copy "101"); server copy after: ${JSON.stringify(v)}`
      );
      await context.close();
    });

    const sb = new URL(ctx.supabaseUrl).origin;
    const isWorksheetsRead = (u) => u.origin === sb && u.pathname === "/rest/v1/homeowner_worksheets";
    const isWorksheetsWrite = (url) => new URL(url).pathname === "/rest/v1/rpc/save_homeowner_worksheets";

    // 7. A returning device with an older copy of its own sheet, whose read fails.
    await guarded([6], async () => {
      const newer = { "Water-dist": "150", "Water-notes": "regress-newer-from-phone", "Gas-permit": "250" };
      await seedWorksheets(ctx, who.token, { worksheets: { preSiteEstimate: { values: newer } }, lot: null });
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await sleep(3000);
      await holdOlderOwnCopy(page, who.authId, "preSiteEstimate", {
        values: { "Water-dist": "101", "Water-notes": "regress-older-desktop", "Gas-permit": "250" },
      });
      let failReads = true;
      let failedReads = 0;
      let writesWhileFailing = 0;
      await context.route(isWorksheetsRead, async (route) => {
        if (route.request().method() === "GET" && failReads) {
          failedReads += 1;
          return route.abort("failed");
        }
        return route.fallback();
      });
      context.on("request", (req) => {
        if (failReads && isWorksheetsWrite(req.url())) writesWhileFailing += 1;
      });
      await page.goto(`${ctx.base}/packet/pre-site-estimate`, { waitUntil: "domcontentloaded" });
      const row = (name) => page.locator("table tbody tr", { has: page.locator("td", { hasText: new RegExp(`^${name}$`) }) }).first();
      await row("Sewer").waitFor({ state: "visible" });
      // Let the read fail for good first: supabase-js tries a failed GET four
      // times (again after 1, 2 and 4 s) before it reports the failure.
      await waitFor(async () => ({ done: failedReads >= 4 }), 20000, 250);
      await sleep(1000);
      await row("Sewer").locator("input").first().fill("7");
      await sleep(3000); // past the autosave's debounce, while the read still fails
      failReads = false;
      await page.reload({ waitUntil: "domcontentloaded" });
      await row("Water").waitFor({ state: "visible" });
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const v = copy?.worksheets?.preSiteEstimate?.values || {};
        return { done: v["Sewer-dist"] === "7", v };
      }, 30000);
      const v = saved?.v || {};
      const shown = await waitFor(async () => {
        const s = await row("Water").locator("input").first().inputValue();
        return { done: s === "150", s };
      }, 10000);
      add(
        6,
        failedReads > 0 &&
          writesWhileFailing === 0 &&
          v["Sewer-dist"] === "7" &&
          v["Water-dist"] === newer["Water-dist"] &&
          v["Water-notes"] === newer["Water-notes"] &&
          v["Gas-permit"] === newer["Gas-permit"],
        `reads refused: ${failedReads}; writes while the read failed: ${writesWhileFailing}; server copy after the reload: ${JSON.stringify(v)} (newer on the server: 150 / regress-newer-from-phone; older in this browser: 101 / regress-older-desktop); Water shown after the reload: "${shown?.s ?? ""}"`
      );
      await context.close();
    });

    // 8. The Ready Score on a returning device, mounted before the read lands.
    await guarded([7], async () => {
      const newer = { "z-permitted": false, "z-lot-size": true, "s-slope": false, "a-crane": true };
      await seedWorksheets(ctx, who.token, {
        worksheets: { readyScore: { answers: newer, points: 0, grade: null, completedAt: null } },
        lot: null,
      });
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await sleep(3000);
      await holdOlderOwnCopy(page, who.authId, "readyScore", {
        answers: { "z-permitted": true, "z-lot-size": true, "s-slope": true },
        points: 0,
        grade: null,
        completedAt: null,
      });
      const events = [];
      await context.route(isWorksheetsRead, async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        await sleep(5000);
        events.push("read");
        return route.fallback();
      });
      await page.goto(`${ctx.base}/packet/ready-score`, { waitUntil: "domcontentloaded" });
      const q = page.locator("div", { has: page.locator("p", { hasText: "Is the site free of protected trees or habitat conflicts?" }) }).last();
      await q.waitFor({ state: "visible" });
      const mountedBeforeRead = !events.includes("read");
      await waitFor(async () => ({ done: events.includes("read") }), 15000, 250);
      await sleep(2000); // the read has landed and been applied
      await q.locator("button", { hasText: /^Yes$/ }).click();
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const a = copy?.worksheets?.readyScore?.answers || {};
        return { done: a["s-trees"] === true, a };
      }, 20000);
      const a = saved?.a || {};
      add(
        7,
        a["s-trees"] === true &&
          a["z-permitted"] === false &&
          a["s-slope"] === false &&
          a["a-crane"] === true &&
          a["z-lot-size"] === true,
        `page mounted before the read landed: ${mountedBeforeRead}; server answers after one click: ${JSON.stringify(a)} (newer on the server: z-permitted false, s-slope false, a-crane true; older in this browser: z-permitted true, s-slope true)`
      );
      await context.close();
    });

    // 9. The entitlement lapses (a refund) and comes back (a rebuy).
    await guarded([8], async () => {
      const newer = { "Water-dist": "150", "Water-notes": "regress-newer-from-phone", "Gas-permit": "250" };
      await seedWorksheets(ctx, who.token, { worksheets: { preSiteEstimate: { values: newer } }, lot: null });
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await sleep(3000);
      await holdOlderOwnCopy(page, who.authId, "preSiteEstimate", {
        values: { "Water-dist": "101", "Water-notes": "regress-older-desktop", "Gas-permit": "250" },
      });
      await stampRefund(ctx, who.rowId);
      let lapsed = true;
      let writesWhileLapsed = 0;
      const lapsedReads = [];
      context.on("request", (req) => {
        if (lapsed && isWorksheetsWrite(req.url())) writesWhileLapsed += 1;
      });
      context.on("response", async (res) => {
        if (!lapsed || res.request().method() !== "GET" || !isWorksheetsRead(new URL(res.url()))) return;
        let body = "";
        try {
          body = (await res.text()).slice(0, 80);
        } catch {
          body = "(unread)";
        }
        lapsedReads.push(`${res.status()} ${body}`);
      });
      // Any page: the worksheet store reads the server copy on every page load.
      await page.goto(`${ctx.base}/settings`, { waitUntil: "domcontentloaded" });
      await waitFor(async () => ({ done: lapsedReads.length >= 1 }), 20000, 250);
      await sleep(4000); // time for any write that read would set off
      lapsed = false;
      await stampPurchase(ctx, who.rowId, "report");
      await page.goto(`${ctx.base}/packet/pre-site-estimate`, { waitUntil: "domcontentloaded" });
      const row = (name) => page.locator("table tbody tr", { has: page.locator("td", { hasText: new RegExp(`^${name}$`) }) }).first();
      await row("Water").waitFor({ state: "visible" });
      const shown = await waitFor(async () => {
        const s = await row("Water").locator("input").first().inputValue();
        return { done: s === "150", s };
      }, 15000);
      await sleep(1000);
      await row("Sewer").locator("input").first().fill("7");
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const v = copy?.worksheets?.preSiteEstimate?.values || {};
        return { done: v["Sewer-dist"] === "7", v };
      }, 30000);
      const v = saved?.v || {};
      add(
        8,
        lapsedReads.length > 0 &&
          writesWhileLapsed === 0 &&
          shown?.s === "150" &&
          v["Sewer-dist"] === "7" &&
          v["Water-dist"] === newer["Water-dist"] &&
          v["Water-notes"] === newer["Water-notes"] &&
          v["Gas-permit"] === newer["Gas-permit"],
        `reads while lapsed: ${lapsedReads.length} (first: ${lapsedReads[0] || "none"}); writes attempted while lapsed: ${writesWhileLapsed}; Water shown after the rebuy: "${shown?.s ?? ""}"; server copy after one edit: ${JSON.stringify(v)} (newer on the server: 150 / regress-newer-from-phone; older in this browser: 101 / regress-older-desktop)`
      );
      await context.close();
    });
  } finally {
    if (browser) await browser.close();
    await who.cleanup();
  }
  return out;
}
