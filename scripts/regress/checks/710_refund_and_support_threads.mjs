// R3-01 (homeowner side) and R3-16, found at the RC3 rehearsal (journeys j5 and
// j7). Contract C1 / migration 0024: support_messages.kind says which of two
// conversations a row belongs to, 'support' (Concierge written support) or
// 'refund_request' (a refund request and ADUAtlas's replies).
//
//   1. /support writes a Concierge message as kind 'support'. The persona's
//      thread is never written: the insert is answered inside the browser.
//   2. /settings files a refund request as kind 'refund_request' (a regress-
//      account with a Golden purchase; the two refund emails are answered inside
//      the browser and never sent).
//   3. ADUAtlas's reply to that request, written the way the console writes it
//      (service role, the thread's kind), is shown to the customer on /settings.
//      On RC3 the only page that read the thread was the Concierge-only /support.
//   4. A comped homeowner (a regress- account comped through the real
//      admin_comp_entitlement writer) is never told they paid, is offered no
//      refund, and is told why. RC3 said "Golden · $79", "Paid", "Request refund".
//   5. The same for the sponsored persona (looked at only, every write refused).
// Regress- accounts are deleted afterwards, their messages with them (cascade).
import { DESKTOP, makeHomeowner, signIn, stampPurchase, svcHeaders } from "./702_worksheet_first_open.mjs";

export const meta = {
  name: "710 refund requests and Concierge support are separate threads, and only money is refundable",
  rules: [
    "a Concierge message sent on /support is written as kind 'support'",
    "a refund request filed on /settings is written as kind 'refund_request'",
    "ADUAtlas's reply to a refund request is shown to the customer on /settings",
    "a comped homeowner is never told they paid, is offered no refund, and is told why",
    "a sponsored homeowner is never told they paid, is offered no refund, and is told why",
  ],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DASHES_OR_ARROWS = /[‒-―←-⇿]|->|=>|<-/;

// Answer the two refund emails inside the browser; they never reach the target.
const muteEmail = async (context, ctx) => {
  const site = new URL(ctx.base).origin;
  await context.route((u) => u.origin === site && u.pathname === "/api/send-email", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) })
  );
};

// Every write from the page is refused before it leaves (read-only personas).
const guardWrites = async (context, ctx) => {
  const sb = new URL(ctx.supabaseUrl).origin;
  const site = new URL(ctx.base).origin;
  await context.route(
    (u) => (u.origin === sb && u.pathname.startsWith("/rest/v1/")) || (u.origin === site && u.pathname.startsWith("/api/")),
    (route) => {
      const req = route.request();
      const p = new URL(req.url()).pathname;
      const readRpc = /^\/rest\/v1\/rpc\/(get_|my_|jurisdiction_|has_)/.test(p);
      if (req.method() === "GET" || req.method() === "HEAD" || (req.method() === "POST" && readRpc)) return route.fallback();
      return route.abort("blockedbyclient");
    }
  );
};

const accountPage = async (page, ctx) => {
  await page.goto(`${ctx.base}/settings`, { waitUntil: "domcontentloaded" });
  await page.getByText("Payment status", { exact: true }).waitFor({ state: "visible" });
  // The billing facts are read from the server after first paint.
  for (let i = 0; i < 20; i += 1) {
    const status = await billingText(page);
    if (status && !/^Checking/.test(status.status)) break;
    await sleep(500);
  }
  return billingText(page);
};

const billingText = async (page) => {
  const row = async (label) => {
    const r = page.locator("div", { has: page.locator("p", { hasText: new RegExp(`^${label}$`) }) }).last();
    if (!(await r.count())) return "";
    const ps = r.locator("p");
    return (await ps.count()) > 1 ? ((await ps.nth(1).innerText()) || "").replace(/\s+/g, " ").trim() : "";
  };
  // The whole section card (the innermost rounded card holding the title), not
  // only the title row, so the explanation under it is read too.
  const refundCard = page.locator("div.rounded-2xl", { has: page.getByText("Refund (within 48 hours)", { exact: true }) }).last();
  const refund = (await refundCard.count()) ? ((await refundCard.innerText()) || "").replace(/\s+/g, " ").trim() : "";
  const buttons = await page.locator("button", { hasText: /Request refund/i }).count();
  return { plan: await row("Plan"), status: await row("Payment status"), refund, buttons };
};

const noPaymentClaimed = (b, price) =>
  b && b.buttons === 0 && !/^Paid$/i.test(b.status) && !b.plan.includes(price) && !/you paid|payment status: paid/i.test(b.refund);

export default async function (ctx) {
  const out = [];
  const add = (i, ok, detail, status) => out.push({ name: `refund-support-${i + 1}`, rule: meta.rules[i], status: status || (ok ? "pass" : "fail"), detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `refund-support-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE" }));
  const H = svcHeaders(ctx);
  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const guarded = async (rules, body) => {
    try {
      await body();
    } catch (e) {
      for (const i of rules) if (!out.some((r) => r.rule === meta.rules[i])) add(i, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 240)}`);
    }
  };
  const browser = await ctx.launch();
  const cleanups = [];
  try {
    // 1. /support, as the Concierge persona. The insert is answered in the browser.
    await guarded([0], async () => {
      let creds;
      try {
        creds = ctx.creds("concierge_purchased");
      } catch (e) {
        add(0, false, String(e.message || e), "skip");
        return;
      }
      const tier = await ctx.fetchJson(`${rest}/users?select=paid_tier,paid_at,refunded_at&email=eq.${encodeURIComponent(creds.email)}`, { headers: H });
      const row = Array.isArray(tier.body) ? tier.body[0] : null;
      if (!(row?.paid_at && !row.refunded_at && row.paid_tier === "concierge")) {
        add(0, false, `concierge_purchased holds ${row?.paid_tier ?? "nothing"}, not a live Concierge`, "skip");
        return;
      }
      const context = await browser.newContext(DESKTOP);
      await guardWrites(context, ctx);
      const sb = new URL(ctx.supabaseUrl).origin;
      const sent = [];
      await context.route((u) => u.origin === sb && u.pathname === "/rest/v1/support_messages", (route) => {
        const req = route.request();
        if (req.method() !== "POST") return route.fallback();
        let body = null;
        try {
          body = JSON.parse(req.postData() || "null");
        } catch {
          body = null;
        }
        sent.push(Array.isArray(body) ? body[0] : body);
        const row0 = { id: "00000000-0000-0000-0000-000000000000", author: "homeowner", body: "regress", created_at: new Date().toISOString(), kind: "support" };
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([row0]) });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, creds.email, creds.password);
      await page.goto(`${ctx.base}/support`, { waitUntil: "domcontentloaded" });
      const box = page.locator("input[aria-label=Message]");
      await box.waitFor({ state: "visible" });
      await box.fill(`${ctx.prefix} kind check (never stored)`);
      await page.locator("button[aria-label=Send]").click();
      for (let i = 0; i < 20 && !sent.length; i += 1) await sleep(500);
      const kinds = sent.map((b) => (b && "kind" in b ? b.kind : "(none)"));
      add(0, sent.length > 0 && sent.every((b) => b?.kind === "support"), sent.length ? `insert kind(s): ${kinds.join(", ")}` : "no insert was sent");
      await context.close();
    });

    // 2 and 3. A refund request from a real purchase, and ADUAtlas's reply.
    await guarded([1, 2], async () => {
      const who = await makeHomeowner(ctx, "refund-thread");
      cleanups.push(who.cleanup);
      await stampPurchase(ctx, who.rowId, "roadmap");
      const context = await browser.newContext(DESKTOP);
      await muteEmail(context, ctx);
      const sb = new URL(ctx.supabaseUrl).origin;
      const posts = [];
      context.on("request", (req) => {
        const u = new URL(req.url());
        if (u.origin === sb && u.pathname === "/rest/v1/support_messages" && req.method() === "POST") {
          try {
            const b = JSON.parse(req.postData() || "null");
            posts.push(Array.isArray(b) ? b[0] : b);
          } catch {
            posts.push(null);
          }
        }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      await accountPage(page, ctx);
      const button = page.locator("button", { hasText: /^\s*Request refund\s*$/ });
      await button.waitFor({ state: "visible" });
      await button.click();
      for (let i = 0; i < 30; i += 1) {
        const stored = await ctx.fetchJson(`${rest}/support_messages?user_id=eq.${who.rowId}&author=eq.homeowner&select=id`, { headers: H });
        if (Array.isArray(stored.body) && stored.body.length) break;
        await sleep(500);
      }
      const kinds = posts.map((b) => (b && "kind" in b ? b.kind : "(none)"));
      add(
        1,
        posts.length > 0 && posts[0]?.kind === "refund_request" && !posts.some((b) => b?.kind === "support"),
        posts.length ? `refund insert kind(s), in order: ${kinds.join(", ")}` : "no refund insert was sent"
      );

      // The console's reply: service role, the thread's kind (0024). A database
      // without 0024 has no kind column; the reply is then written the old way.
      const reply = `${ctx.prefix} reply: your refund is on its way`;
      let ins = await ctx.fetchJson(`${rest}/support_messages`, {
        method: "POST", headers: { ...H, Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: who.rowId, author: "admin", body: reply, kind: "refund_request" }),
      });
      if (ins.status >= 300) {
        ins = await ctx.fetchJson(`${rest}/support_messages`, {
          method: "POST", headers: { ...H, Prefer: "return=minimal" },
          body: JSON.stringify({ user_id: who.rowId, author: "admin", body: reply }),
        });
      }
      if (ins.status >= 300) throw new Error(`the reply could not be written: HTTP ${ins.status}`);
      await accountPage(page, ctx);
      let shown = false;
      for (let i = 0; i < 20 && !shown; i += 1) {
        shown = (await page.getByText(reply, { exact: false }).count()) > 0;
        if (!shown) await sleep(500);
      }
      add(2, shown, shown ? "the reply is on /settings" : "the reply is not on /settings");
      await context.close();
    });

    // 4. Comped.
    await guarded([3], async () => {
      const who = await makeHomeowner(ctx, "refund-comped");
      cleanups.push(who.cleanup);
      const comp = await ctx.fetchJson(`${rest}/rpc/admin_comp_entitlement`, {
        method: "POST", headers: H, body: JSON.stringify({ p_user_id: who.rowId, p_tier: "roadmap" }),
      });
      if (comp.status >= 300) throw new Error(`comp failed: HTTP ${comp.status}`);
      const context = await browser.newContext(DESKTOP);
      await guardWrites(context, ctx);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, who.email, who.password);
      const b = await accountPage(page, ctx);
      add(
        3,
        noPaymentClaimed(b, "$79") && /no charge/i.test(b.refund) && /nothing to refund|no payment to refund/i.test(b.refund) && !DASHES_OR_ARROWS.test(b.refund),
        `plan "${b.plan}"; payment status "${b.status}"; refund buttons ${b.buttons}; refund card "${b.refund.slice(0, 200)}"`
      );
      await context.close();
    });

    // 5. Sponsored (shared persona: looked at only).
    await guarded([4], async () => {
      let creds;
      try {
        creds = ctx.creds("golden_sponsored");
      } catch (e) {
        add(4, false, String(e.message || e), "skip");
        return;
      }
      const r = await ctx.fetchJson(`${rest}/homeowner_upgrade_basis?select=paid_tier,paid_at,refunded_at,paid_origin,qualifying_paid_plan&email=eq.${encodeURIComponent(creds.email)}`, { headers: H });
      const row = Array.isArray(r.body) ? r.body[0] : null;
      if (!(row?.paid_at && !row.refunded_at && row.qualifying_paid_plan === null)) {
        add(4, false, `golden_sponsored is not a live entitlement money did not buy (tier ${row?.paid_tier ?? "none"}, basis ${row?.qualifying_paid_plan ?? "null"})`, "skip");
        return;
      }
      const context = await browser.newContext(DESKTOP);
      await guardWrites(context, ctx);
      const page = await context.newPage();
      page.setDefaultTimeout(30000);
      await signIn(page, ctx, creds.email, creds.password);
      const b = await accountPage(page, ctx);
      add(
        4,
        noPaymentClaimed(b, "$79") && /nothing to refund|no payment to refund/i.test(b.refund) && !DASHES_OR_ARROWS.test(b.refund),
        `origin ${row.paid_origin ?? "not recorded"}; plan "${b.plan}"; payment status "${b.status}"; refund buttons ${b.buttons}; refund card "${b.refund.slice(0, 200)}"`
      );
      await context.close();
    });
  } finally {
    await browser.close();
    for (const c of cleanups) await c();
  }
  return out;
}
