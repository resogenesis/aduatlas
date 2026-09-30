// R3-01 (admin side, contract C1) as Amy SEES it in the studies console.
//
// C1: support_messages.kind is 'support' (Concierge written support) or
// 'refund_request'. The Support tab has to tell the two apart, because they have
// different readers: a support reply appears on /support, which only a live
// Concierge plan opens, and a refund reply appears with the refund request on the
// customer's settings page, whatever their plan.
//
// On RC3 (j5) a refund request was filed as Concierge support and listed as one
// undifferentiated thread per customer, Amy's reply to a Golden customer's refund
// request was stored where that customer could never read it, and the study
// drawer's Messages box offered to write to a Platinum customer who has no page
// that shows written support.
//
// Fixture, named with ctx.prefix and removed at the end: a Platinum purchase with
// one submitted study, and a Concierge purchase with one Concierge support
// message and one refund request, all stamped with the service role. In the
// console nothing is saved or sent: the study drawer and one thread are opened
// and read, and closed.
export const meta = {
  name: "373 admin studies console: refund requests and Concierge support are separate threads, and no reply box reaches nobody",
  rules: [
    "R3-01 (j5): the study drawer offers no reply box for a Platinum customer, and says why",
    "C1: the Support tab lists the customer's refund request and Concierge support as two labelled threads",
    "C1: the refund thread says the reply appears on the customer's settings page",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const step = async (label, rule, fn) => {
    try {
      const [ok, detail] = await fn();
      add(label, rule, ok, detail);
    } catch (e) {
      add(label, rule, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 220)}`);
    }
  };
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `console-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const insert = (table, row) => ctx.fetchJson(`${rest}/${table}`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
  const bought = (email, tier) => ({ email, paid_tier: tier, paid_at: new Date().toISOString(), paid_origin: "purchase" });

  const platEmail = `${ctx.prefix}-373-plat@regress.aduatlas.test`;
  const concEmail = `${ctx.prefix}-373-conc@regress.aduatlas.test`;
  const address = `${ctx.prefix} 373 Platinum Lane`;
  const ids = [];
  let browser = null;
  try {
    const p = await insert("users", bought(platEmail, "report"));
    const platId = p.body?.[0]?.id;
    if (!platId) throw new Error(`fixture Platinum account: HTTP ${p.status} ${JSON.stringify(p.body).slice(0, 200)}`);
    ids.push(platId);
    const s = await insert("studies", { user_id: platId, status: "submitted", intake: { address } });
    if (!s.body?.[0]?.id) throw new Error(`fixture study: HTTP ${s.status} ${JSON.stringify(s.body).slice(0, 200)}`);

    const c = await insert("users", bought(concEmail, "concierge"));
    const concId = c.body?.[0]?.id;
    if (!concId) throw new Error(`fixture Concierge account: HTTP ${c.status} ${JSON.stringify(c.body).slice(0, 200)}`);
    ids.push(concId);
    const q = await insert("support_messages", { user_id: concId, author: "homeowner", body: `${ctx.prefix} 373 Concierge question` });
    if (!q.body?.[0]?.id) throw new Error(`fixture support message: HTTP ${q.status} ${JSON.stringify(q.body).slice(0, 200)}`);
    const rq = await insert("support_messages", { user_id: concId, author: "homeowner", body: `${ctx.prefix} 373 refund request`, kind: "refund_request" });
    const refundFiled = Boolean(rq.body?.[0]?.id);
    const noKind = `support_messages has no kind here, so a refund request cannot be filed apart from Concierge support (insert with kind -> HTTP ${rq.status} ${String(rq.body?.message || "").slice(0, 100)})`;

    const { browser: b, page } = await adminPage(ctx);
    browser = b;
    await page.goto(`${ctx.base}/admin/studies`, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Feasibility studies" }).waitFor({ timeout: 60000 });

    // 1. The study drawer of a Platinum customer.
    await step("study drawer: no reply box for Platinum", meta.rules[0], async () => {
      const row = page.locator("tr", { hasText: platEmail }).first();
      await row.waitFor({ timeout: 45000 });
      await row.click();
      const drawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: address, exact: true }) }).last();
      await drawer.waitFor({ timeout: 20000 });
      await drawer.getByRole("heading", { name: "Messages", exact: true }).waitFor({ timeout: 20000 });
      const boxes = await drawer.getByPlaceholder("Reply to the homeowner").count();
      const text = (await drawer.innerText()).replace(/\s+/g, " ");
      const says = /Written support is part of Concierge/.test(text);
      await drawer.getByRole("button", { name: "Close" }).first().click().catch(() => {});
      return [boxes === 0 && says, `${boxes ? "the drawer offers a reply box to this Platinum customer" : "no reply box"}; ${says ? "it says written support is part of Concierge" : "it does not say why"}`];
    });

    // 2 and 3. The Support tab.
    await page.getByRole("button", { name: "Support", exact: true }).click();
    await page.getByRole("heading", { name: "Support" }).waitFor({ timeout: 20000 });
    await step("two labelled threads", meta.rules[1], async () => {
      if (!refundFiled) return [false, noKind];
      const rows = page.locator("tr", { hasText: concEmail });
      await rows.first().waitFor({ timeout: 45000 });
      const texts = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
      const refund = texts.filter((t) => /Refund request/.test(t)).length;
      const support = texts.filter((t) => /Concierge support/.test(t)).length;
      return [texts.length === 2 && refund === 1 && support === 1, `${texts.length} row(s) for the customer; labelled refund request: ${refund}, labelled Concierge support: ${support}`];
    });
    await step("refund reply goes to settings", meta.rules[2], async () => {
      if (!refundFiled) return [false, noKind];
      const row = page.locator("tr", { hasText: concEmail }).filter({ hasText: /Refund request/ }).first();
      await row.waitFor({ timeout: 20000 });
      await row.click();
      const drawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: concEmail, exact: true }) }).last();
      await drawer.waitFor({ timeout: 20000 });
      const said = drawer.getByText(/appears with the refund request on the customer's settings page/);
      const shown = await said.first().waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
      const text = (await drawer.innerText()).replace(/\s+/g, " ");
      return [shown && /Refund request/.test(text), shown ? "the refund thread says the reply appears on the customer's settings page" : "the refund thread does not say where the reply appears"];
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    for (const id of ids) await ctx.fetchJson(`${rest}/users?id=eq.${id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  }
  return out;
}

// Sign the staging admin in inside an isolated browser by handing supabase-js a
// session of its own (one password sign-in, never typed into a page).
async function adminPage(ctx) {
  const c = ctx.creds("admin");
  const r = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ctx.anonKey },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (r.status !== 200) throw new Error(`admin browser sign-in failed: HTTP ${r.status}`);
  const ref = new URL(ctx.supabaseUrl).hostname.split(".")[0];
  const browser = await ctx.launch();
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(
    ([key, session]) => {
      try {
        window.localStorage.setItem(key, session);
      } catch {
        /* storage blocked: the page then shows the sign-in wall, which the check reports */
      }
    },
    [`sb-${ref}-auth-token`, JSON.stringify(r.body)],
  );
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(120000);
  return { browser, page };
}
