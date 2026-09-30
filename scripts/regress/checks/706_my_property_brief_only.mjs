// I4-01 (the R3-02 data-loss class, left open on My Property after round 4):
// My Property kept the WHOLE packet it loaded when it mounted, worksheets and
// lot included, and its "Save brief" button sent every sheet and the lot to
// the server (saveBuilderPacket) next to the brief. So a device whose copy was
// older than the server's wrote that older copy over newer data saved from
// another device, around the worksheet store's three-way merge and its
// pending, base and unowned marks. The fix: My Property reads, keeps and sends
// only the brief (briefOnly), and src/stores/worksheetStore.js is the only
// writer of the worksheets and the lot.
//
// A regress- Platinum account is created with the service role. "Another
// device" is the account's own session calling the real
// save_homeowner_worksheets RPC. Each rule opens /my-property in a FRESH
// browser context, signs in through the real /login page, types one brief
// field (Purpose of the ADU), presses "Save brief", waits for the brief to
// reach users.builder_packet, and reads the server copy back with the service
// role.
//   1. A NEW device: the page loads and its read lands, then another device
//      saves a newer worksheet and lot, then the brief is saved here. The newer
//      worksheet and lot stay on the server.
//   2. A RETURNING device holding an older copy of its own worksheet and lot
//      (owner recorded, nothing unsent), whose read of the server copy fails:
//      saving the brief writes no worksheet or lot, and the newer server copy
//      stands.
//   3. The same device with an UNSENT edit on that worksheet (pending mark and
//      base recorded by the store): saving the brief while the read fails sends
//      nothing of the sheet, and once the read works again (a reload) the edit
//      lands on the newer server copy and every field it did not change keeps
//      the newer value.
// Fixtures are named ${ctx.prefix}-706-*. The account (and, by cascade, its
// worksheets row) is deleted afterwards.
import { DESKTOP, makeHomeowner, readServerCopy, seedWorksheets, signIn, stampPurchase, svcHeaders } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "706 saving the brief on My Property never writes the worksheets or the lot",
  rules: [
    "a new device that saves the brief on My Property after another device saved newer worksheets keeps the newer worksheet and lot on the server",
    "a returning device holding an older worksheet and lot, whose read fails, writes no worksheet or lot when the brief is saved, and the newer server copy stands",
    "an unsent worksheet edit on a returning device whose read fails survives a brief save on My Property and lands on the newer server copy once the read works, keeping every newer field it did not change",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const PURPOSE = "Rental income / aging parent / office / etc."; // the Purpose field's placeholder
const OLDER_NOTE = "regress-706-older-on-this-device";
const OLDER_SHEET = { values: { "Water-dist": "101", "Water-notes": OLDER_NOTE, "Gas-permit": "250" } };
const OLDER_LOT = {
  input: { lotWidth: "60", lotDepth: "120", front: "20", rear: "10", side: "5", houseDepth: "40" },
  dimsEstimated: false,
  address: "706 Regress Way, Phoenix, AZ 85001",
  coords: null,
  lookup: null,
};
const newerSheet = (tag) => ({ values: { "Water-dist": "150", "Water-notes": `regress-706-newer-${tag}`, "Gas-permit": "300" } });
const newerLot = (width) => ({ ...OLDER_LOT, input: { ...OLDER_LOT.input, lotWidth: width, front: "25" } });

const readBrief = async (ctx, rowId) => {
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?id=eq.${rowId}&select=builder_packet`, { headers: svcHeaders(ctx) });
  return Array.isArray(r.body) ? r.body[0]?.builder_packet || null : null;
};

// This browser's copy: the packet the app keeps in localStorage and the
// worksheet store's sync record.
const readLocal = (page) =>
  page.evaluate(() => {
    const parse = (k) => {
      try {
        return JSON.parse(window.localStorage.getItem(k) || "null");
      } catch {
        return null;
      }
    };
    return { packet: parse("aduatlas.packet"), sync: parse("aduatlas.worksheets.sync") };
  });

// A returning device: lay `packetPatch` over this browser's packet and set the
// worksheet store's sync record to `sync` (owner, pending, bases, unowned).
const holdLocal = (page, packetPatch, sync) =>
  page.evaluate(
    ({ patch, record }) => {
      let packet = {};
      try {
        packet = JSON.parse(window.localStorage.getItem("aduatlas.packet") || "{}") || {};
      } catch {
        packet = {};
      }
      window.localStorage.setItem("aduatlas.packet", JSON.stringify({ ...packet, ...patch }));
      window.localStorage.setItem("aduatlas.worksheets.sync", JSON.stringify(record));
    },
    { patch: packetPatch, record: sync }
  );

// A new device: this browser holds a session and nothing else of the packet.
const forgetLocal = (page) =>
  page.evaluate(() => {
    try {
      window.localStorage.removeItem("aduatlas.packet");
      window.localStorage.removeItem("aduatlas.worksheets.sync");
    } catch {
      // nothing to forget
    }
  });

// Resolves when My Property's own mount read of the brief has answered (its
// select is builder_packet alone; the sign-in's read selects more columns).
// Its read of the worksheets follows and, when refused, is tried four times
// over about 7 s, after which the page merges the brief it got. Typing before
// then could be overwritten by that merge.
const myPropertyReadDone = (context, supabaseOrigin) =>
  new Promise((resolve) => {
    const onResponse = (res) => {
      const u = new URL(res.url());
      if (u.origin !== supabaseOrigin || u.pathname !== "/rest/v1/users" || res.request().method() !== "GET") return;
      if (u.searchParams.get("select") !== "builder_packet") return;
      context.off("response", onResponse);
      resolve(Date.now());
    };
    context.on("response", onResponse);
  });

// jsonb does not keep key order, so compare the fields as sorted pairs.
const sorted = (o) => JSON.stringify(Object.entries(o || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const sheetMatches = (got, want) => sorted(got?.values) === sorted(want.values);
const lotSummary = (lot) => (lot ? `lot ${lot.input?.lotWidth ?? "?"}x${lot.input?.lotDepth ?? "?"} front ${lot.input?.front ?? "?"}` : "no lot");

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `my-property-brief-only-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `my-property-brief-only-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture account cannot be created" }));

  const who = await makeHomeowner(ctx, "706-brief-only");
  const sb = new URL(ctx.supabaseUrl).origin;
  const isWorksheetsRead = (u) => u.origin === sb && u.pathname === "/rest/v1/homeowner_worksheets";
  const isWorksheetsWrite = (url) => {
    const u = new URL(url);
    return u.origin === sb && u.pathname === "/rest/v1/rpc/save_homeowner_worksheets";
  };
  let browser;
  try {
    await stampPurchase(ctx, who.rowId, "report");
    browser = await ctx.launch();

    // Each block reports its own rule, so a failure in one never hides another.
    const guarded = async (i, body) => {
      try {
        await body();
      } catch (e) {
        if (!out.some((r) => r.rule === meta.rules[i])) add(i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
      }
    };

    // Watch every worksheet write this context sends. `older` says whether it
    // carried this device's older copy (the note only that copy holds).
    const watchWrites = (context) => {
      const writes = [];
      context.on("request", (req) => {
        if (!isWorksheetsWrite(req.url())) return;
        const body = req.postData() || "";
        writes.push({ at: Date.now(), older: body.includes(OLDER_NOTE), lot: /"p_lot"\s*:\s*\{/.test(body) });
      });
      return writes;
    };

    // Type one brief field and press "Save brief"; resolve once the brief is
    // on the server. Returns the time the button was pressed.
    const saveBrief = async (page, marker) => {
      const field = page.getByPlaceholder(PURPOSE);
      await field.waitFor({ state: "visible" });
      await field.fill(marker);
      const pressed = Date.now();
      await page.getByRole("button", { name: /Save brief/ }).click();
      const landed = await waitFor(async () => {
        const b = await readBrief(ctx, who.rowId);
        return { done: b?.purpose === marker, b };
      }, 20000);
      if (!landed?.done) throw new Error(`the brief never reached the server (purpose there: ${JSON.stringify(landed?.b?.purpose ?? null)})`);
      // Wait long enough to catch any worksheet write the same press might set
      // off. There should be none: My Property writes the brief only.
      await sleep(5000);
      return pressed;
    };

    // 1. A new device, and a newer copy saved elsewhere while the page is open.
    await guarded(0, async () => {
      await seedWorksheets(ctx, who.token, { worksheets: { preSiteEstimate: OLDER_SHEET }, lot: OLDER_LOT });
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await forgetLocal(page);
      const writes = watchWrites(context);
      await page.goto(`${ctx.base}/my-property`, { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder(PURPOSE).waitFor({ state: "visible" });
      // The page's reads have landed once this browser holds the server copy.
      const loaded = await waitFor(async () => {
        const l = await readLocal(page);
        return { done: l.packet?.worksheets?.preSiteEstimate?.values?.["Water-notes"] === OLDER_NOTE, l };
      }, 20000);
      await page.waitForLoadState("networkidle").catch(() => {});
      await sleep(1500);
      const newer = newerSheet("phone-1");
      const lot = newerLot("66");
      await seedWorksheets(ctx, who.token, { worksheets: { preSiteEstimate: newer }, lot }); // another device
      const pressed = await saveBrief(page, "regress-706-purpose-1");
      const copy = await readServerCopy(ctx, who.rowId);
      const after = writes.filter((w) => w.at >= pressed);
      add(
        0,
        sheetMatches(copy?.worksheets?.preSiteEstimate, newer) && copy?.lot?.input?.lotWidth === "66" && copy?.lot?.input?.front === "25" && !after.some((w) => w.older),
        `read landed before the other device saved: ${Boolean(loaded?.done)}; worksheet writes after Save brief: ${after.length} (carrying the older copy: ${after.filter((w) => w.older).length}; with a lot: ${after.filter((w) => w.lot).length}); server after: ${JSON.stringify(copy?.worksheets?.preSiteEstimate?.values || null)}, ${lotSummary(copy?.lot)} (newer: 150 / regress-706-newer-phone-1 / 300, lot 66 front 25; older: 101 / ${OLDER_NOTE} / 250, lot 60 front 20)`
      );
      await context.close();
    });

    // 2. A returning device with an older copy, whose read fails.
    await guarded(1, async () => {
      const newer = newerSheet("phone-2");
      const lot = newerLot("68");
      await seedWorksheets(ctx, who.token, { worksheets: { preSiteEstimate: newer }, lot });
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await sleep(3000);
      await holdLocal(page, { worksheets: { preSiteEstimate: OLDER_SHEET }, lot: OLDER_LOT }, { owner: who.authId, pending: {}, bases: {}, unowned: {} });
      let failedReads = 0;
      await context.route(isWorksheetsRead, async (route) => {
        if (route.request().method() === "GET") {
          failedReads += 1;
          return route.abort("failed");
        }
        return route.fallback();
      });
      const writes = watchWrites(context);
      const briefRead = myPropertyReadDone(context, sb);
      await page.goto(`${ctx.base}/my-property`, { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder(PURPOSE).waitFor({ state: "visible" });
      // supabase-js tries a failed GET four times (again after 1, 2 and 4 s).
      await waitFor(async () => ({ done: failedReads >= 4 }), 20000, 250);
      const readAt = await Promise.race([briefRead, sleep(20000).then(() => Date.now())]);
      await sleep(Math.max(0, readAt + 9000 - Date.now()));
      await saveBrief(page, "regress-706-purpose-2");
      const copy = await readServerCopy(ctx, who.rowId);
      add(
        1,
        failedReads > 0 && writes.length === 0 && sheetMatches(copy?.worksheets?.preSiteEstimate, newer) && copy?.lot?.input?.lotWidth === "68" && copy?.lot?.input?.front === "25",
        `reads refused: ${failedReads}; worksheet writes while the read failed: ${writes.length} (carrying the older copy: ${writes.filter((w) => w.older).length}; with a lot: ${writes.filter((w) => w.lot).length}); server after: ${JSON.stringify(copy?.worksheets?.preSiteEstimate?.values || null)}, ${lotSummary(copy?.lot)} (newer: 150 / regress-706-newer-phone-2 / 300, lot 68 front 25; older in this browser: 101 / ${OLDER_NOTE} / 250, lot 60 front 20)`
      );
      await context.close();
    });

    // 3. The same device with an unsent edit, then the read works again.
    await guarded(2, async () => {
      const newer = newerSheet("phone-3");
      await seedWorksheets(ctx, who.token, { worksheets: { preSiteEstimate: newer }, lot: null });
      const context = await browser.newContext(DESKTOP);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await sleep(3000);
      // Sewer distance 9 was typed here earlier and never reached the server;
      // the store recorded the copy it was typed on as its base.
      const edited = { values: { ...OLDER_SHEET.values, "Sewer-dist": "9" } };
      await holdLocal(page, { worksheets: { preSiteEstimate: edited } }, {
        owner: who.authId,
        pending: { preSiteEstimate: true },
        bases: { preSiteEstimate: OLDER_SHEET },
        unowned: {},
      });
      let failReads = true;
      let failedReads = 0;
      await context.route(isWorksheetsRead, async (route) => {
        if (route.request().method() === "GET" && failReads) {
          failedReads += 1;
          return route.abort("failed");
        }
        return route.fallback();
      });
      const writes = watchWrites(context);
      const briefRead = myPropertyReadDone(context, sb);
      await page.goto(`${ctx.base}/my-property`, { waitUntil: "domcontentloaded" });
      await page.getByPlaceholder(PURPOSE).waitFor({ state: "visible" });
      await waitFor(async () => ({ done: failedReads >= 4 }), 20000, 250);
      const readAt = await Promise.race([briefRead, sleep(20000).then(() => Date.now())]);
      await sleep(Math.max(0, readAt + 9000 - Date.now()));
      await saveBrief(page, "regress-706-purpose-3");
      const whileFailing = writes.length;
      const olderWhileFailing = writes.filter((w) => w.older).length;
      const between = await readServerCopy(ctx, who.rowId);
      const local = await readLocal(page);
      const marksKept = Boolean(local.sync?.pending?.preSiteEstimate) && local.packet?.worksheets?.preSiteEstimate?.values?.["Sewer-dist"] === "9";
      failReads = false;
      await page.reload({ waitUntil: "domcontentloaded" });
      const saved = await waitFor(async () => {
        const copy = await readServerCopy(ctx, who.rowId);
        const v = copy?.worksheets?.preSiteEstimate?.values || {};
        return { done: v["Sewer-dist"] === "9", v };
      }, 30000);
      const v = saved?.v || {};
      add(
        2,
        whileFailing === 0 &&
          sheetMatches(between?.worksheets?.preSiteEstimate, newer) &&
          marksKept &&
          v["Sewer-dist"] === "9" &&
          v["Water-dist"] === newer.values["Water-dist"] &&
          v["Water-notes"] === newer.values["Water-notes"] &&
          v["Gas-permit"] === newer.values["Gas-permit"],
        `reads refused: ${failedReads}; worksheet writes while the read failed: ${whileFailing} (carrying the older copy: ${olderWhileFailing}); server right after Save brief: ${JSON.stringify(between?.worksheets?.preSiteEstimate?.values || null)}; unsent edit and its pending mark still in this browser: ${marksKept}; server after the read worked again: ${JSON.stringify(v)} (newer: 150 / regress-706-newer-phone-3 / 300; older in this browser: 101 / ${OLDER_NOTE} / 250, plus Sewer 9 unsent)`
      );
      await context.close();
    });
  } finally {
    if (browser) await browser.close();
    await who.cleanup();
  }
  return out;
}
