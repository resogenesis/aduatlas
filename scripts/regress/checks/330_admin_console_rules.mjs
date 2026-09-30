// The console half of DEF-12, DEF-04 and DEF-23, driven through Amy's real
// console in an isolated headless browser, then read back through the admin API.
//
//   DEF-12  The resource editor had no source URL field, so a resource made in the
//           console could never be published: the server requires where ADUAtlas
//           found it (evidence: refute-d4 42, refute-d2 24/24b).
//   DEF-04  The rule editor had no verification status control and sent none, so
//           a rule Amy sourced and dated was stored as "Not checked", and so was
//           every re-save (evidence: refute-d4 20-D, 33/34).
//   DEF-23  The entity card offered "Invite a claim" / "Issue a claim code",
//           which always failed with a 501.
//
// Fixtures: one unpublished jurisdiction and one government entity, both named
// with ctx.prefix, made through the admin API. Published records are retired at
// the end.
export const meta = {
  name: "330 admin console: rules, resources and entity controls",
  rules: [
    "DEF-12: a resource made in the console can be published",
    "DEF-04: a rule made in the console from a source is stored as source_checked by default",
    "DEF-04: re-saving that rule from the console keeps source_checked",
    "DEF-23: the console offers no claim-code control for a government entity",
    "a console re-save keeps what the editor shows but does not edit (number, unit, qualifier, citation)",
  ],
};

const today = () => new Date().toISOString().slice(0, 10);

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
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
  const name = `${ctx.prefix} 330 Console Town`;
  const domain = `${ctx.prefix}-330.test`;
  const j = must(
    await api("POST", "jurisdiction-save", {
      jurisdiction: { type: "city", name, slug: `${ctx.prefix}-330-console-town`, parent_id: state.id, is_published: false, notes: `${ctx.prefix} regression fixture (330)` },
    }),
    "jurisdiction-save",
  ).jurisdiction;
  must(
    await api("POST", "entity-save", {
      entity: { name: `${ctx.prefix} City of Console Town`, entity_type: "city", official_website_url: `https://www.${domain}/`, official_domains: [domain], jurisdiction_id: j.id },
    }),
    "entity-save",
  );
  const readBack = async () => must(await api("GET", `jurisdiction?id=${j.id}`), "jurisdiction read-back");

  const { browser, page } = await adminPage(ctx);
  const retire = [];
  const jDrawer = page.locator("div.fixed", { has: page.getByRole("heading", { name, exact: true }) }).last();
  const section = (re) => jDrawer.locator("section", { has: page.getByRole("heading", { name: re }) });
  // Find the fixture jurisdiction and open it. The search is retried because a
  // busy shared staging database can be slow to answer it.
  const openJurisdiction = async () => {
    const search = page.getByPlaceholder("Search every jurisdiction by name");
    await search.waitFor({ timeout: 45000 });
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
    await jDrawer.waitFor({ timeout: 30000 });
  };
  // One sub-check: a crash inside it is reported against it, and the others
  // still run.
  const step = async (label, rule, fn) => {
    try {
      const [ok, detail] = await fn();
      add(label, rule, ok, detail);
    } catch (e) {
      add(label, rule, false, `could not run: ${String(e?.message || e).split("\n")[0].slice(0, 220)}`);
    }
  };
  const closeTopDrawer = async (drawer) => {
    if ((await drawer.count()) > 0) await page.getByRole("button", { name: "Close" }).last().click().catch(() => {});
  };

  try {
    await page.goto(`${ctx.base}/admin/regulatory`, { waitUntil: "domcontentloaded" });
    await openJurisdiction();

    // ── DEF-23: no claim-code control on the entity card ────────────────────
    await step("no dead claim-code control", meta.rules[3], async () => {
      const entitySection = section(/^Government entity$/);
      await entitySection.getByText(`${ctx.prefix} City of Console Town`, { exact: true }).waitFor({ timeout: 30000 });
      const claimControls = entitySection.getByRole("button", { name: /invite a claim|claim code/i });
      const found = await claimControls.count();
      if (found === 0) return [true, "no claim-code control"];
      // Show what it does, which is the defect: it can only fail.
      await claimControls.first().click();
      const issue = entitySection.getByRole("button", { name: /issue a claim code/i });
      if (!(await issue.count())) return [false, "control present"];
      await issue.first().click();
      const alert = entitySection.locator('[role="alert"]').first();
      await alert.waitFor({ timeout: 20000 }).catch(() => {});
      return [false, `control present; clicking it shows: ${((await alert.innerText().catch(() => "")) || "nothing").slice(0, 160)}`];
    });

    // ── DEF-12: publish a resource from the console ─────────────────────────
    const rDrawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: "Add a government resource" }) }).last();
    await step("a console resource publishes", meta.rules[0], async () => {
      await section(/^Resources \(/).getByRole("button", { name: "Add" }).click();
      await rDrawer.waitFor({ timeout: 20000 });
      const rField = (text) => rDrawer.locator("label", { has: page.getByText(text, { exact: true }) });
      const rLabel = `${ctx.prefix} Permit page`;
      await rField("Kind").locator("select").selectOption(kind);
      await rField("Label").locator("input").fill(rLabel);
      await rDrawer.getByRole("button", { name: m.field_state_labels.verified_from_source, exact: true }).click();
      await rField("Official link").locator("input").fill(`https://www.${domain}/permits`);
      const srcUrl = rField("Where ADUAtlas found it").locator("input");
      const hasSrcUrl = (await srcUrl.count()) > 0;
      if (hasSrcUrl) await srcUrl.fill(`https://www.${domain}/adu`);
      await rField("Source type").locator("select").selectOption(m.source_types[0]);
      await rField("Source checked").locator("input").fill(today());
      await rField("Review status").locator("select").selectOption("published");
      await rDrawer.getByRole("button", { name: "Add resource" }).click();
      const rOutcome = await settle(rDrawer);
      const res = ((await readBack()).resources || []).find((x) => x.label === rLabel);
      if (res?.review_status === "published") retire.push(["resource", res.id]);
      return [
        res?.review_status === "published" && res?.source_url === `https://www.${domain}/adu`,
        `source URL field ${hasSrcUrl ? "present" : "MISSING"}; console: ${rOutcome}; stored ${res ? `${res.review_status}, source_url=${res.source_url}` : "nothing"}`,
      ];
    });
    await closeTopDrawer(rDrawer);

    // ── DEF-04: a sourced rule made in the console is source_checked ────────
    const value = `${ctx.prefix} 900 square feet`;
    let rule = null;
    const pDrawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: "Add a provision" }) }).last();
    await step("a console rule is stored as source_checked", meta.rules[1], async () => {
      await section(/^Provisions \(/).getByRole("button", { name: "Add" }).click();
      await pDrawer.waitFor({ timeout: 20000 });
      const pField = (text) => pDrawer.locator("label", { has: page.getByText(text, { exact: true }) });
      await pField("Topic").locator("select").selectOption(topic);
      await pDrawer.getByRole("button", { name: m.field_state_labels.verified_from_source, exact: true }).click();
      await pField("What the source states").locator("textarea").fill(value);
      await pField("Official source URL").locator("input").fill(`https://www.${domain}/code/adu`);
      await pField("Source type").locator("select").selectOption(m.source_types[0]);
      await pField("Source checked").locator("input").fill(today());
      const vs = pField("Checked by ADUAtlas").locator("select");
      const vsShown = (await vs.count()) > 0 ? await vs.inputValue() : "no control";
      await pField("Review status").locator("select").selectOption("published");
      await pDrawer.getByRole("button", { name: "Add provision" }).click();
      const pOutcome = await settle(pDrawer);
      rule = ((await readBack()).provisions || []).find((x) => x.value_text === value) || null;
      if (rule?.review_status === "published") retire.push(["provision", rule.id]);
      return [
        rule?.verification_status === "source_checked",
        `status control shows "${vsShown}"; console: ${pOutcome}; stored ${rule ? `${rule.review_status}, verification_status=${rule.verification_status}` : "nothing"}`,
      ];
    });
    await closeTopDrawer(pDrawer);

    // ── DEF-04: re-save it from the console, touching nothing ───────────────
    // What a government submission can carry and the editor does not edit.
    const extras = { value_numeric: 900, value_unit: "sq ft", value_qualifier: `${ctx.prefix} except in historic districts`, source_citation: `${ctx.prefix} Code 12.4` };
    let keptExtras = null;
    await step("a console re-save keeps source_checked", meta.rules[2], async () => {
      if (!rule) return [false, "no rule was saved to re-save"];
      // Put the record where the check needs it, through the API, so the
      // re-save is tested on its own merits.
      must(
        await api("POST", "provision-save", { provision: { ...rule, topic_key: rule.topic_key, jurisdiction_id: j.id, verification_status: "source_checked", ...extras } }),
        "set source_checked and the extra fields",
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await openJurisdiction();
      await section(/^Provisions \(/).getByRole("button", { name: new RegExp(value) }).click();
      // Anchored on the drawer's heading: the save button renames itself while
      // saving, so it cannot mark the drawer.
      const topicLabel = m.provision_topic_labels[topic] || topic;
      const eDrawer = page.locator("div.fixed", { has: page.getByRole("heading", { name: topicLabel, exact: true }) }).last();
      await eDrawer.waitFor({ timeout: 20000 });
      await eDrawer.getByRole("button", { name: "Save provision" }).click();
      const eOutcome = await settle(eDrawer);
      const again = ((await readBack()).provisions || []).find((x) => x.id === rule.id);
      keptExtras = again
        ? Object.fromEntries(Object.keys(extras).map((k) => [k, again[k] == null ? null : k === "value_numeric" ? Number(again[k]) : again[k]]))
        : null;
      return [again?.verification_status === "source_checked", `console: ${eOutcome}; stored after re-save: ${again?.verification_status}`];
    });
    add(
      "a console re-save keeps the fields it does not edit",
      meta.rules[4],
      Boolean(keptExtras) && Object.keys(extras).every((k) => keptExtras[k] === extras[k]),
      `after the console re-save: ${keptExtras ? JSON.stringify(keptExtras) : "no re-save happened"}`,
    );
  } finally {
    await browser.close();
    for (const [k, id] of retire) {
      if (k === "provision") await api("POST", "provision-retire", { id, superseded_date: today(), note: `${ctx.prefix} regression fixture retired` });
      else await api("POST", "resource-retire", { id, note: `${ctx.prefix} regression fixture retracted` });
    }
  }
  return out;
}

// After a save: "closed" when the drawer went away, the console's words when it
// showed a refusal or a warning, "timeout" otherwise.
async function settle(drawer) {
  const closed = drawer.waitFor({ state: "detached", timeout: 30000 }).then(() => "closed");
  const said = drawer
    .locator('[role="alert"], p.text-amber-700')
    .first()
    .waitFor({ timeout: 30000 })
    .then(async () => `showed "${(await drawer.locator('[role="alert"], p.text-amber-700').first().innerText()).slice(0, 180)}"`);
  return Promise.race([closed, said]).catch(() => "timeout");
}

// Sign Amy in inside an isolated browser by handing supabase-js a session of its
// own (one password sign-in, never shared with the harness's token cache).
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
  return { browser, page };
}
