// 410 — an ACTIVE Education Partner issues and manages resident access through the
// real portal (decision 2p; DEF-18, DEF-19).
//
// As the education_partner persona, through the UI a partner actually uses:
//   1. the portal lists the link the partnership already holds
//   2. "Create a link" and "Create a code" produce rows the database accepted,
//      attributed to the partner who issued them
//   3. the link the portal DISPLAYS opens the resident entry page in a fresh,
//      signed-out browser, naming the sponsor (the route and the url agree)
//   4. a brand-new homeowner (created here with ctx.prefix) redeems the new code
//      through /partner and holds EXACTLY sponsored Golden: tier roadmap, origin
//      sponsorship, no upgrade credit, attributed to this partner
//   5. the partner switches both off in the portal, and the switched-off link no
//      longer resolves
// Fixture data: one link and one code labelled with ctx.prefix (left switched off),
// and one homeowner account whose email starts with ctx.prefix. That account is
// kept (the append-only redemption ledger references it) and its sign-in is banned. Code values and
// link tokens are never printed.
export const meta = {
  name: "410 partner issuance",
  rules: ["2p resident links and codes", "DEF-18", "DEF-19"],
};

const pass = (name, rule, detail) => ({ name, rule, status: "pass", detail });
const fail = (name, rule, detail) => ({ name, rule, status: "fail", detail });

const R_LIST = "an active partner's portal lists the resident access it already holds";
const R_LINK = "an active Education Partner can create a resident access link in the portal (2p)";
const R_CODE = "an active Education Partner can create a resident access code in the portal (2p)";
const R_ATTR = "a partner-issued link or code records who issued it";
const R_OPEN = "the link the portal displays opens the resident entry page (DEF-19)";
const R_REDEEM = "a code created in the portal gives a new homeowner exactly sponsored Golden";
const R_OFF = "a partner can switch a link and a code off, and a switched-off link grants nothing";

const CODE_RE = /\b[A-HJ-NP-Z2-9]{8}\b/;
const shape = (url) => {
  try {
    const u = new URL(url);
    return `${u.pathname.split("/").slice(0, 2).join("/")}/<token>`;
  } catch {
    return "(not a url)";
  }
};

const uiLogin = async (page, base, email, password) => {
  await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
};

// The portal's own "Reading your ..." lines are gone once its reads have landed.
const waitForReads = (page) =>
  page
    .waitForFunction(() => !/Reading your (links|codes|usage|partnership)/.test(document.body.innerText), null, { timeout: 30000 })
    .catch(() => {});

const rest = (ctx, pathAndQuery, { key, bearer, method = "GET", body, prefer } = {}) =>
  ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: key || ctx.anonKey,
      Authorization: `Bearer ${bearer || key || ctx.anonKey}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

export default async function (ctx) {
  const out = [];
  const partner = ctx.creds("education_partner");
  const label = { link: `${ctx.prefix} link`, code: `${ctx.prefix} code` };
  const made = { link: null, code: null };
  let residentAuthId = null;
  const browser = await ctx.launch();
  try {
    // ── the partner's portal ──────────────────────────────────────────────
    const pctx = await browser.newContext();
    const page = await pctx.newPage();
    await uiLogin(page, ctx.base, partner.email, partner.password);
    await page.goto(`${ctx.base}/gov/partnership`, { waitUntil: "domcontentloaded" });
    // The active-partner view, not the moment before the partnership read lands.
    await page.getByRole("heading", { name: "A link for your own website" }).first().waitFor({ timeout: 30000 });
    await waitForReads(page);

    // 1. the existing link is listed
    {
      const body = await page.locator("main").innerText();
      // Matched on the token inside the displayed url, which is never printed.
      const listed = Boolean(partner.sponsored_link_token) && body.includes(partner.sponsored_link_token);
      out.push(
        listed
          ? pass("portal-lists-existing-link", R_LIST, "the persona's live link is listed")
          : fail(
              "portal-lists-existing-link",
              R_LIST,
              /No resident access link exists yet/.test(body)
                ? 'the portal says "No resident access link exists yet" although the partnership holds a live link'
                : "the persona's live link is not in the portal list"
            )
      );
    }

    // 2. create a link, then a code, through the controls
    for (const kind of ["link", "code"]) {
      const rule = kind === "link" ? R_LINK : R_CODE;
      const button = page.getByRole("button", { name: kind === "link" ? "Create a link" : "Create a code" });
      if ((await button.count()) === 0) {
        out.push(fail(`partner-creates-${kind}`, rule, `no "Create a ${kind}" control in the active partner's portal`));
        continue;
      }
      await page.getByLabel("Label").fill(label[kind]);
      await button.click();
      const row = page.locator(`[data-partner-${kind}]`, { hasText: label[kind] });
      const appeared = await row.first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
      if (!appeared) {
        const notice = await page.locator('[role="status"]').innerText().catch(() => "");
        out.push(fail(`partner-creates-${kind}`, rule, `the new ${kind} never appeared in the list. ${notice}`.trim()));
        continue;
      }
      const id = await row.first().getAttribute(`data-partner-${kind}`);
      const text = await row.first().innerText();
      made[kind] = { id };
      if (kind === "link") {
        made.link.url = (await row.first().locator("code").first().innerText()).trim();
      } else {
        made.code.value = (text.match(CODE_RE) || [])[0] || null;
      }
      const ok = kind === "link" ? /^https?:\/\//.test(made.link.url || "") : Boolean(made.code.value);
      out.push(
        ok
          ? pass(`partner-creates-${kind}`, rule, `created and listed as Active`)
          : fail(`partner-creates-${kind}`, rule, `the new ${kind} is listed without a usable ${kind === "link" ? "url" : "code"}`)
      );
    }

    // Attribution, read with the service key: the database stamps the issuer.
    if (made.link?.id || made.code?.id) {
      const problems = [];
      for (const [kind, table] of [["link", "partner_access_links"], ["code", "partner_access_codes"]]) {
        if (!made[kind]?.id) continue;
        const r = await rest(ctx, `${table}?select=created_by_app_user_id,entity_id,jurisdiction_id&id=eq.${made[kind].id}`, { key: ctx.serviceKey });
        const row = Array.isArray(r.body) ? r.body[0] : null;
        if (!row) problems.push(`${kind} row not readable (HTTP ${r.status})`);
        else {
          if (row.created_by_app_user_id !== partner.app_user_id) problems.push(`${kind} created_by is ${row.created_by_app_user_id === null ? "null" : "another account"}`);
          if (row.entity_id !== partner.entity_id) problems.push(`${kind} filed under another entity`);
        }
      }
      out.push(problems.length ? fail("issuer-recorded", R_ATTR, problems.join("; ")) : pass("issuer-recorded", R_ATTR, "created_by is the issuing partner"));
    } else {
      out.push(fail("issuer-recorded", R_ATTR, "nothing was created through the portal, so there is no attribution to read"));
    }

    // 3. the displayed link, opened signed out in a fresh context
    if (made.link?.url) {
      const fresh = await browser.newContext();
      const rp = await fresh.newPage();
      await rp.goto(made.link.url, { waitUntil: "domcontentloaded" });
      const reached = await rp
        .getByText(partner.entity_name, { exact: false })
        .first()
        .waitFor({ timeout: 30000 })
        .then(() => true)
        .catch(() => false);
      const text = await rp.locator("body").innerText();
      const broken = /Unexpected Application Error|404 Not Found/i.test(text);
      const signIn = /Create your account first/.test(text);
      out.push(
        reached && signIn && !broken
          ? pass("displayed-link-opens-entry", R_OPEN, `${shape(made.link.url)} renders the entry page naming the sponsor`)
          : fail(
              "displayed-link-opens-entry",
              R_OPEN,
              `${shape(made.link.url)}: ${broken ? "router error page" : reached ? "sponsor named but no entry step" : "entry page with the sponsor never rendered"}`
            )
      );
      await fresh.close();
    } else {
      out.push(fail("displayed-link-opens-entry", R_OPEN, "the portal displayed no link to open"));
    }

    // 4. a new homeowner redeems the code through /partner
    if (made.code?.value) {
      const email = `${ctx.prefix}-resident@rehearsal.aduatlas.test`;
      const password = `${ctx.prefix}-Pw-${Math.random().toString(36).slice(2, 10)}`;
      const created = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: "homeowner" } }),
      });
      if (created.body?.id) residentAuthId = created.body.id;
      if (created.status >= 300) {
        out.push(fail("code-gives-exactly-sponsored-golden", R_REDEEM, `could not create the homeowner fixture: HTTP ${created.status}`));
      } else {
        const hctx = await browser.newContext();
        const hp = await hctx.newPage();
        await uiLogin(hp, ctx.base, email, password);
        await hp.goto(`${ctx.base}/partner`, { waitUntil: "domcontentloaded" });
        await hp.getByPlaceholder("ABCD2345").fill(made.code.value);
        await hp.getByRole("button", { name: "Claim the access" }).click();
        const granted = await hp
          .getByText("Your sponsored course access is ready")
          .first()
          .waitFor({ timeout: 30000 })
          .then(() => true)
          .catch(() => false);
        await hctx.close();

        const problems = [];
        if (!granted) problems.push("the entry page never confirmed the grant");
        const u = await rest(ctx, `users?select=role,paid_tier,paid_at,refunded_at,paid_origin&email=eq.${encodeURIComponent(email)}`, { key: ctx.serviceKey });
        const row = Array.isArray(u.body) ? u.body[0] : null;
        if (!row) problems.push(`users row not readable (HTTP ${u.status})`);
        else {
          if (row.role !== "homeowner") problems.push(`role ${row.role}`);
          if (row.paid_tier !== "roadmap") problems.push(`paid_tier ${row.paid_tier ?? "null"}, expected roadmap (Golden)`);
          if (!row.paid_at) problems.push("paid_at not set");
          if (row.refunded_at) problems.push("refunded_at set");
          if (row.paid_origin !== "sponsorship") problems.push(`paid_origin ${row.paid_origin ?? "null"}, expected sponsorship`);
        }
        const tok = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: ctx.anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const bearer = tok.body?.access_token;
        if (!bearer) problems.push(`homeowner sign-in for the RPC reads failed: HTTP ${tok.status}`);
        else {
          const sp = await rest(ctx, "rpc/my_sponsored_access", { bearer, method: "POST", body: {} });
          if (sp.body?.entity_name !== partner.entity_name) problems.push("my_sponsored_access does not name this partner");
          if (sp.body?.plan && sp.body.plan !== "roadmap") problems.push(`sponsored plan ${sp.body.plan}`);
          const qp = await rest(ctx, "rpc/my_qualifying_paid_plan", { bearer, method: "POST", body: {} });
          if (qp.status !== 200 || (qp.body !== null && qp.body !== "")) problems.push("my_qualifying_paid_plan is not null (a sponsorship earned upgrade credit)");
        }
        out.push(
          problems.length
            ? fail("code-gives-exactly-sponsored-golden", R_REDEEM, problems.join("; "))
            : pass("code-gives-exactly-sponsored-golden", R_REDEEM, "tier roadmap, origin sponsorship, attributed to the partner, no upgrade credit")
        );
      }
    } else {
      out.push(fail("code-gives-exactly-sponsored-golden", R_REDEEM, "the portal produced no code to redeem"));
    }

    // 5. switch both off in the portal
    if (made.link?.id && made.code?.id) {
      await page.goto(`${ctx.base}/gov/partnership`, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "A link for your own website" }).first().waitFor({ timeout: 30000 }).catch(() => {});
      await waitForReads(page);
      const problems = [];
      for (const kind of ["link", "code"]) {
        const row = page.locator(`[data-partner-${kind}="${made[kind].id}"]`);
        await row.waitFor({ timeout: 30000 }).catch(() => {});
        const ask = row.getByRole("button", { name: `Switch this ${kind} off` });
        if ((await ask.count()) === 0) {
          problems.push(`no switch-off control on the new ${kind}`);
          continue;
        }
        await ask.click();
        await row.getByRole("button", { name: `Yes, switch this ${kind} off` }).click();
        const off = await row.getByText("Switched off").waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
        if (!off) problems.push(`the ${kind} never showed as switched off`);
      }
      const table = { link: "partner_access_links", code: "partner_access_codes" };
      for (const kind of ["link", "code"]) {
        const r = await rest(ctx, `${table[kind]}?select=is_active,deactivated_at&id=eq.${made[kind].id}`, { key: ctx.serviceKey });
        const row = Array.isArray(r.body) ? r.body[0] : null;
        if (!row || row.is_active !== false || !row.deactivated_at) problems.push(`the ${kind} is still active in the database`);
      }
      const token = made.link.url ? new URL(made.link.url).pathname.split("/").pop() : "";
      const c = await ctx.fetchJson(`${ctx.base}/api/partner-redeem?token=${encodeURIComponent(token)}`);
      if (c.body?.context) problems.push("the switched-off link still resolves a sponsor context");
      out.push(problems.length ? fail("partner-switches-off", R_OFF, problems.join("; ")) : pass("partner-switches-off", R_OFF, "both switched off; the link no longer resolves"));
    } else {
      out.push(fail("partner-switches-off", R_OFF, "nothing was created through the portal to switch off"));
    }
    await pctx.close();
  } finally {
    // Leave nothing live: anything this run created and did not switch off is
    // switched off with the service key.
    for (const [kind, table] of [["link", "partner_access_links"], ["code", "partner_access_codes"]]) {
      if (!made[kind]?.id) continue;
      await rest(ctx, `${table}?id=eq.${made[kind].id}&is_active=eq.true`, {
        key: ctx.serviceKey,
        method: "PATCH",
        body: { is_active: false },
        prefer: "return=minimal",
      }).catch(() => {});
    }
    // The resident homeowner this run created CANNOT be deleted: its redemption
    // is a row in public.partner_redemptions, which is append-only for every
    // role (0014) and is the evidence the sponsorship origin rests on (0019), and
    // that row references the account. So the account is kept and its sign-in
    // is banned for good. Its password was random and never stored, so the ban
    // is belt and braces. A ban that fails is reported, never passed over.
    if (residentAuthId) {
      const ban = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${residentAuthId}`, {
        method: "PUT",
        headers: { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ban_duration: "876000h" }),
      }).catch(() => null);
      if (!ban || ban.status >= 300) {
        out.push(fail("resident-fixture-banned", "the resident fixture this run created is left with its sign-in banned", `could not ban the resident fixture: HTTP ${ban?.status ?? "no response"}`));
      }
    }
    await browser.close().catch(() => {});
  }
  return out;
}
