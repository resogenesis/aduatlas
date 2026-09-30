// R3-04 (found at the RC3 rehearsal, journey j1 step 6.9): with its default
// setting (Shadows on) the paid 3D site model drew no buildings. drei's
// <SoftShadows> patched three's shadow shader with a routine that no longer
// compiles against three 0.185 ('unpackRGBAToDepth': no matching overloaded
// function), every lit material failed, and only the outlines and labels were
// left. Turning Shadows off made the house, the ADU and the trees appear.
//
// A regress- Platinum account is created with the service role, and its lot is
// saved on the server (through the real save_homeowner_worksheets RPC) and in
// the browser, so the model renders whatever the page's hydration does. Then
// /feasibility is opened with its defaults and the canvas is photographed with
// Shadows on (the default) and with Shadows off. The pictures are compared
// inside the browser, pixel by pixel:
//   1. no WebGL shader error is logged with the default settings;
//   2. with Shadows on, the model draws the lit surfaces (house, ADU, trees) it
//      draws with Shadows off: at least 80% as many bright pixels;
//   3. Shadows is on by default and actually casts shadows: the chip starts on,
//      and some pixels are darker with it on than off, while rule 2 holds.
// RC3's failure is a race: in this headless Chromium (SwiftShader) about half
// of fresh page loads fail to compile and the rest draw normally. So the page
// is loaded up to LOADS times (a full navigation each, which is a new WebGL
// context and a new module instance) and every load must be clean; the first
// bad load ends the run. Five loads make a false green on RC3 about 1 in 30.
// The account (and, by cascade, its worksheets row) is deleted afterwards.
import { DESKTOP, makeHomeowner, seedWorksheets, signIn, stampPurchase } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "703 the 3D site model draws its buildings with the default Shadows setting",
  rules: [
    "the 3D site model logs no WebGL shader error with its default settings",
    "with Shadows on (the default) the 3D model draws the house, the ADU and the trees it draws with Shadows off",
    "Shadows is on by default and casts shadows on the model",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LOADS = 5;
const SHADER_TROUBLE = /Shader Error|not compiled|unpackRGBAToDepth|program not valid|INVALID_OPERATION/i;

const LOT = {
  input: { lotWidth: "60", lotDepth: "120", front: "20", rear: "10", side: "5", houseDepth: "40" },
  dimsEstimated: false,
  address: "100 Regress Way, Phoenix, AZ 85001",
  coords: null,
  lookup: null,
};

// Pixel statistics of two PNG screenshots of the same view, computed in a blank
// page so nothing is installed for it.
const compare = async (page, on, off) =>
  page.evaluate(
    async ({ a64, b64 }) => {
      const load = (b) =>
        new Promise((res, rej) => {
          const i = new Image();
          i.onload = () => res(i);
          i.onerror = () => rej(new Error("screenshot did not decode"));
          i.src = `data:image/png;base64,${b}`;
        });
      const [a, b] = await Promise.all([load(a64), load(b64)]);
      const w = Math.min(a.width, b.width);
      const h = Math.min(a.height, b.height);
      const pixels = (img) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, w, h).data;
      };
      const A = pixels(a);
      const B = pixels(b);
      const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      let brightOn = 0;
      let brightOff = 0;
      let darkerOn = 0;
      for (let i = 0; i < A.length; i += 4) {
        const la = lum(A, i);
        const lb = lum(B, i);
        if (la > 70) brightOn += 1;
        if (lb > 70) brightOff += 1;
        if (lb - la > 6) darkerOn += 1;
      }
      return { w, h, brightOn, brightOff, darkerOn };
    },
    { a64: on.toString("base64"), b64: off.toString("base64") }
  );

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail) => out.push({ name: `site-model-shadows-${i + 1}`, rule: meta.rules[i], status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `site-model-shadows-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture account cannot be created" }));

  const who = await makeHomeowner(ctx, "site-model");
  let browser;
  try {
    await stampPurchase(ctx, who.rowId, "report");
    await seedWorksheets(ctx, who.token, { worksheets: {}, lot: LOT });
    browser = await ctx.launch();
    const context = await browser.newContext(DESKTOP);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const trouble = [];
    page.on("console", (m) => {
      if (["error", "warning"].includes(m.type()) && SHADER_TROUBLE.test(m.text())) trouble.push(m.text().split("\n")[0].slice(0, 160));
    });

    try {
      await signIn(page, ctx, who.email, who.password);
      // This browser already holds the lot, so the model renders on first paint.
      await page.evaluate((lot) => {
        let packet = {};
        try {
          packet = JSON.parse(window.localStorage.getItem("aduatlas.packet") || "{}") || {};
        } catch {
          packet = {};
        }
        window.localStorage.setItem("aduatlas.packet", JSON.stringify({ ...packet, lot }));
      }, LOT);

      const open = async () => {
        await page.goto(`${ctx.base}/feasibility`, { waitUntil: "domcontentloaded" });
        const canvas = page.locator("canvas").first();
        await canvas.waitFor({ state: "visible", timeout: 45000 });
        await sleep(5000);
        return canvas;
      };
      const chip = page.locator("button", { hasText: /^Shadows$/ }).first();
      const dir = process.env.REGRESS_SHOT_DIR;
      const save = async (name, buf) => {
        if (!dir) return;
        const fs = await import("node:fs");
        const path = await import("node:path");
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, name), buf);
      };

      // The first load also takes the Shadows-off reference picture.
      let canvas = await open();
      await chip.waitFor({ state: "visible" });
      const chipOnByDefault = /bg-accent/.test((await chip.getAttribute("class")) || "");
      const loads = [];
      let shotOn = await canvas.screenshot();
      loads.push({ errors: trouble.length, shot: shotOn });
      await chip.click();
      await sleep(3000);
      const shotOff = await canvas.screenshot();
      await chip.click();
      await sleep(3000);
      await save("703-shadows-on.png", shotOn);
      await save("703-shadows-off.png", shotOff);

      const blank = await context.newPage();
      await blank.goto("about:blank");
      const judge = async (shot) => {
        const s = await compare(blank, shot, shotOff);
        const ratio = s.brightOff ? s.brightOn / s.brightOff : 0;
        return { ...s, ratio, drawn: s.brightOff > 2000 && ratio >= 0.8 };
      };
      loads[0].stats = await judge(shotOn);

      // More fresh loads, until one is bad or LOADS are clean.
      while (loads.length < LOADS && loads.every((l) => l.errors === 0 && l.stats.drawn)) {
        const before = trouble.length;
        canvas = await open();
        shotOn = await canvas.screenshot();
        const l = { errors: trouble.length - before, shot: shotOn };
        l.stats = await judge(shotOn);
        loads.push(l);
      }
      await blank.close();
      const bad = loads.findIndex((l) => l.errors > 0 || !l.stats.drawn);
      if (bad >= 0) await save(`703-shadows-on-bad-load-${bad + 1}.png`, loads[bad].shot);

      const errored = loads.filter((l) => l.errors > 0).length;
      add(
        0,
        trouble.length === 0,
        trouble.length
          ? `${errored} of ${loads.length} loads logged shader errors (${trouble.length} messages), first: ${trouble[0]}`
          : `no shader error in ${loads.length} fresh loads with the default settings`
      );
      const undrawn = loads.filter((l) => !l.stats.drawn);
      const worst = loads.reduce((w, l) => (l.stats.ratio < w.stats.ratio ? l : w), loads[0]);
      add(
        1,
        undrawn.length === 0,
        `${loads.length - undrawn.length} of ${loads.length} loads drew the model with Shadows on; worst load: bright pixels on ${worst.stats.brightOn}, off ${worst.stats.brightOff} (ratio ${worst.stats.ratio.toFixed(2)}; canvas ${worst.stats.w}x${worst.stats.h})`
      );
      const first = loads[0].stats;
      add(
        2,
        chipOnByDefault && undrawn.length === 0 && first.darkerOn > 50,
        `Shadows chip on by default: ${chipOnByDefault}; pixels darker with Shadows on than off (first load): ${first.darkerOn}; every load drew the model: ${undrawn.length === 0}`
      );
    } catch (e) {
      for (let i = 0; i < meta.rules.length; i += 1) {
        if (!out.some((r) => r.rule === meta.rules[i])) add(i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
      }
    }
    await context.close();
  } finally {
    if (browser) await browser.close();
    await who.cleanup();
  }
  return out;
}
