// R3-13 and the console half of R3-12, as Amy SEES them.
//
// R3-13. On RC3 "Add a jurisdiction" showed Type "Country" for a new city (the
// form held "city", which is not an option, so the select fell back to its first
// option while the server saved a municipality), and it offered County, Official
// website and Research state inputs that the schema has no column for: what Amy
// typed was discarded, and on create the drawer closed before the server's
// warning could be read (j2, j4, j5).
//
// R3-12. On RC3 the rule drawer's Retire needed a "superseded or repealed" date,
// so a rule ADUAtlas got wrong could only be recorded as a government repeal, and
// the resource drawer had one Retire button that always retracted with no reason
// (j5).
//
// Fixture, named with ctx.prefix: one UNPUBLISHED jurisdiction with one published
// rule and one published resource, made through the admin API and retired at the
// end. In the console nothing is saved: the new-jurisdiction form is inspected
// and closed, and the two drawers are only opened.
export const meta = {
  name: "362 admin console: the jurisdiction form offers what is stored, and retiring offers both facts",
  rules: [
    "R3-13: a new jurisdiction's Type shows a real option, the one that will be saved",
    "R3-13: the jurisdiction form offers no County, Official website or Research state input",
    "R3-12: the rule drawer offers both superseded (the government changed it) and retracted (ADUAtlas was wrong)",
    "R3-12: the resource drawer offers both superseded and retracted",
  ],
};

const day = (o = 0) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);

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
  const adminToken = await ctx.token("admin");
  const api = (method, route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/regulatory/${route}`, {
      method,
      headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const must = (r, what) => {
    if (r.status !== 200) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body;
  };

  const m = must(await api("GET", "meta"), "meta");
  const state = (m.states || []).find((s) => s.state_code === "WY") || (m.states || [])[0];
  const topic = m.provision_topics[0];
  const kind = m.resource_kinds[0];
  const domain = `${ctx.prefix}-362.test`;
  const name = `${ctx.prefix} 362 Form Town`;
  const value = `${ctx.prefix} 900 square feet`;
  const j = must(
    await api("POST", "jurisdiction-save", { jurisdiction: { type: "municipality", name, slug: `${ctx.prefix}-362-form-town`, parent_id: state.id, is_published: false } }),
    "jurisdiction-save",
  ).jurisdiction;
  const p = must(
    await api("POST", "provision-save", {
      provision: {
        jurisdiction_id: j.id, topic_key: topic, field_state: "verified_from_source", value_text: value, source_url: `https://www.${domain}/code`,
        source_type: m.source_types[0], source_checked_date: day(0), verification_status: "source_checked", review_status: "published",
      },
    }),
    "publish the rule",
  ).provision;
  const r = must(
    await api("POST", "resource-save", {
      resource: {
        jurisdiction_id: j.id, kind, title: `${ctx.prefix} Permit page`, field_state: "verified_from_source", url: `https://www.${domain}/permits`,
        source_url: `https://www.${domain}/adu`, source_type: m.source_types[0], source_checked_date: day(0), verification_status: "source_checked", review_status: "published",
      },
    }),
    "publish the resource",
  ).resource;

  let browser = null;
  try {
    const { browser: b, page } = await adminPage(ctx);
    browser = b;
    await page.goto(`${ctx.base}/admin/regulatory`, { waitUntil: "domcontentloaded" });
    const search = page.getByPlaceholder("Search every jurisdiction by name");
    await search.waitFor({ timeout: 60000 });

    // ── the new-jurisdiction form, inspected and closed ─────────────────────
    const newDrawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: "Add a jurisdiction", exact: true }) }).last();
    // A field is the <label> whose CAPTION (a span) reads exactly `text`. Matching
    // any descendant text would also match an <option> of that name, and the Type
    // select offers "County" as a type.
    const exactly = (text) => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
    const field = (drawer, text) => drawer.locator("label").filter({ has: page.locator("span", { hasText: exactly(text) }) });
    let opened = false;
    const openNew = async () => {
      if (opened) return;
      await page.locator("select", { has: page.locator("option", { hasText: /^States$/ }) }).first().selectOption("WY");
      await page.getByRole("button", { name: /Add a jurisdiction/ }).click();
      await newDrawer.waitFor({ timeout: 30000 });
      opened = true;
    };
    await step("type default is a real option", meta.rules[0], async () => {
      await openNew();
      const typeSelect = field(newDrawer, "Type").locator("select");
      const shown = await typeSelect.evaluate((el) => ({ value: el.value, text: el.options[el.selectedIndex]?.text || "" }));
      const want = m.jurisdiction_type_labels.municipality;
      return [shown.value === "municipality" && shown.text === want, `Type shows "${shown.text}" (value "${shown.value}"); a new city is saved as ${want}`];
    });
    await step("no inputs the schema cannot store", meta.rules[1], async () => {
      await openNew();
      const found = [];
      for (const label of ["County", "Official website", "Research state"]) {
        const f = field(newDrawer, label);
        if ((await f.count()) && (await f.locator("input, select, textarea").count())) found.push(label);
      }
      return [found.length === 0, found.length ? `the form still offers: ${found.join(", ")}` : "no County, Official website or Research state input"];
    });
    if (opened) await newDrawer.getByRole("button", { name: "Close" }).first().click().catch(() => {});

    // ── the fixture's rule and resource drawers ─────────────────────────────
    for (let attempt = 0; ; attempt += 1) {
      await search.fill("");
      await search.fill(name);
      const row = page.locator("tr", { hasText: name }).first();
      try {
        await row.waitFor({ timeout: 25000 });
        await row.click();
        break;
      } catch (e) {
        if (attempt >= 2) throw e;
      }
    }
    const jDrawer = page.locator("div.fixed", { has: page.getByRole("heading", { name, exact: true }) }).last();
    await jDrawer.waitFor({ timeout: 30000 });
    const section = (re) => jDrawer.locator("section", { has: page.getByRole("heading", { name: re }) });
    const bothFacts = async (drawer) => {
      const gov = await drawer.getByText(/The government changed it/).count();
      const ours = await drawer.getByText(/ADUAtlas's record was wrong/).count();
      const retireButtons = await drawer.getByRole("button", { name: /^Retire$/ }).count();
      return [gov > 0 && ours > 0, `government-changed option ${gov ? "present" : "ABSENT"}; ADUAtlas-was-wrong option ${ours ? "present" : "ABSENT"}${retireButtons ? `; a bare Retire button is shown` : ""}`];
    };
    await step("rule drawer offers both facts", meta.rules[2], async () => {
      await section(/^Provisions \(/).getByRole("button", { name: new RegExp(value) }).click();
      const pDrawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: m.provision_topic_labels[topic] || topic, exact: true }) }).last();
      await pDrawer.waitFor({ timeout: 20000 });
      const res = await bothFacts(pDrawer);
      await page.getByRole("button", { name: "Close" }).last().click().catch(() => {});
      return res;
    });
    await step("resource drawer offers both facts", meta.rules[3], async () => {
      await section(/^Resources \(/).getByRole("button", { name: new RegExp(`${ctx.prefix} Permit page`) }).click();
      const rDrawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: m.resource_kind_labels[kind] || kind, exact: true }) }).last();
      await rDrawer.waitFor({ timeout: 20000 });
      const res = await bothFacts(rDrawer);
      await page.getByRole("button", { name: "Close" }).last().click().catch(() => {});
      return res;
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    await api("POST", "provision-retire", { id: p.id, superseded_date: day(0), note: `${ctx.prefix} regression fixture retired` }).catch(() => {});
    await api("POST", "resource-retire", { id: r.id, superseded_date: day(0), note: `${ctx.prefix} regression fixture retired` }).catch(() => {});
  }
  return out;
}

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
