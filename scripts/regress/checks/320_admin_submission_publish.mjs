// DEF-09 and DEF-10. A government submission can be published, and ADUAtlas's
// own facts never come from the government's payload.
//
// On RC1 a portal-shaped submission could never be published (the payload has no
// source_checked_date and submission-publish took nothing from the admin), and a
// payload that DID carry source_checked_date and verification_status had both
// published verbatim, so a government could write "ADUAtlas last checked the
// source on 2020-01-01" and "Source checked" onto a homeowner page (evidence:
// refute-d2 09/09b/26/27/28).
//
// Everything here is made for this run and named with ctx.prefix: a jurisdiction
// (unpublished), its government entity with a .test official domain, and a
// government user created through the GoTrue admin API who claims the entity
// through the product's own RPC. Amy's side (verify identity, grant authority,
// publish, decline) goes through the real admin API. The government's side
// (claim, submit) goes through PostgREST with that user's own token, exactly as
// the portal does. No persona is modified. Published fixtures are retired and
// the unpublished submission declined at the end.
export const meta = {
  name: "320 admin: a government submission publishes with ADUAtlas's own facts",
  rules: [
    "DEF-10: a submission that sets source_checked_date and verification_status publishes with the admin's values instead",
    "DEF-10/2b: publishing without a checked date is refused with a clear 400, even when the payload carries one",
    "DEF-09: a portal-shaped rule submission can be published once the admin gives the checked date",
    "DEF-09: a portal-shaped resource submission can be published once the admin gives the checked date",
    "DEF-09 console: the review drawer asks for the checked date and status, and publishes with them",
  ],
};

const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) {
    return [{ name: "fixture government user", rule: meta.rules[0], status: "fail", detail: "REGRESS_ENV_FILE has no service key, so no government user can be made for this run" }];
  }
  const adminToken = await ctx.token("admin");
  const api = (method, route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/regulatory/${route}`, {
      method,
      headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const must = (r, what) => {
    if (r.status < 200 || r.status > 299) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body;
  };

  // ── Amy sets up a jurisdiction and its government entity ──────────────────
  const m = must(await api("GET", "meta"), "meta");
  const state = (m.states || []).find((s) => s.state_code === "WY") || (m.states || [])[0];
  const [t1, t2, t3, t4] = m.provision_topics;
  const sourceType = m.source_types[0];
  const kind = m.resource_kinds[0];
  const domain = `${ctx.prefix}-320.test`;
  const j = must(
    await api("POST", "jurisdiction-save", {
      jurisdiction: {
        type: "city",
        name: `${ctx.prefix} 320 Submission Town`,
        slug: `${ctx.prefix}-320-submission-town`,
        parent_id: state.id,
        is_published: false,
        notes: `${ctx.prefix} regression fixture (320)`,
      },
    }),
    "jurisdiction-save",
  ).jurisdiction;
  const entity = must(
    await api("POST", "entity-save", {
      entity: {
        name: `${ctx.prefix} City of Submission Town`,
        entity_type: "city",
        official_website_url: `https://www.${domain}/`,
        official_domains: [domain],
        jurisdiction_id: j.id,
      },
    }),
    "entity-save",
  ).entity;

  // ── a government user for this run only ───────────────────────────────────
  const email = `planner@${domain}`;
  const password = `R${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}!9`;
  must(
    await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` },
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: "homeowner" } }),
    }),
    "create government user",
  );
  const signin = must(
    await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ctx.anonKey },
      body: JSON.stringify({ email, password }),
    }),
    "government user sign-in",
  );
  const gov = { apikey: ctx.anonKey, Authorization: `Bearer ${signin.access_token}`, "Content-Type": "application/json" };
  const claim = must(
    await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/rpc/claim_government_entity`, {
      method: "POST",
      headers: gov,
      body: JSON.stringify({ p_entity_id: entity.id, p_full_name: `${ctx.prefix} Planner`, p_job_title: "Planner", p_work_email: email, p_note: `${ctx.prefix} regression claim` }),
    }),
    "claim_government_entity",
  );
  must(
    await api("POST", "gov-identity-verify", { membership_id: claim.membership_id, checked: `${ctx.prefix} regression: the work email is at the recorded official domain ${domain}` }),
    "gov-identity-verify",
  );
  must(
    await api("POST", "gov-authority-grant", { entity_id: entity.id, jurisdiction_id: j.id, grant_basis: `${ctx.prefix} regression: a city speaks for its own record`, may_submit: true }),
    "gov-authority-grant",
  );
  const govUsers = must(await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/government_users?select=id`, { headers: gov }), "own government_users row");
  const govUserId = Array.isArray(govUsers) && govUsers[0]?.id;
  if (!govUserId) throw new Error("the government user cannot read its own government_users row");

  // What the portal inserts, through the government user's own token.
  const submit = async (row) =>
    must(
      await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/regulatory_submissions?select=id,status`, {
        method: "POST",
        headers: { ...gov, Prefer: "return=representation" },
        body: JSON.stringify({ jurisdiction_id: j.id, entity_id: entity.id, submitted_by_government_user_id: govUserId, submitter_note: `${ctx.prefix} regression`, ...row }),
      }),
      `submit ${row.kind}`,
    )[0];
  const portalRule = (topic, value) => ({
    kind: "provision",
    topic_key: topic,
    payload: {
      field_state: "verified_from_source",
      value_text: value,
      value_numeric: null,
      value_unit: null,
      value_boolean: null,
      value_qualifier: null,
      effective_date: null,
      source_url: `https://www.${domain}/code/${topic}`,
      source_document_title: `${ctx.prefix} ADU ordinance`,
      source_citation: null,
      source_type: sourceType,
    },
  });
  // A payload that also claims to speak for ADUAtlas.
  const selfCertified = (topic, value) => {
    const r = portalRule(topic, value);
    r.payload.source_checked_date = "2020-01-01";
    r.payload.verification_status = "source_checked";
    return r;
  };

  const adminDate = day(-1);
  const retire = [];
  let declineId = null;
  try {
    // (c) The government's self-set facts are ignored in favour of the admin's.
    const s1 = await submit(selfCertified(t1, `${ctx.prefix} 1,200 square feet`));
    const p1 = await api("POST", "submission-publish", { id: s1.id, source_checked_date: adminDate, verification_status: "unverified", note: `${ctx.prefix} (c)` });
    const rec1 = p1.body?.record;
    if (rec1?.id) retire.push(["provision", rec1.id]);
    add(
      "self-set ADUAtlas facts are replaced by the admin's",
      meta.rules[0],
      p1.status === 200 && rec1?.source_checked_date === adminDate && rec1?.verification_status === "unverified",
      `HTTP ${p1.status}; published source_checked_date=${rec1?.source_checked_date} verification_status=${rec1?.verification_status} (payload said 2020-01-01/source_checked, admin said ${adminDate}/unverified)${p1.status !== 200 ? ` :: ${JSON.stringify(p1.body).slice(0, 200)}` : ""}`,
    );

    // (d) No checked date from the admin: refused, even though the payload has one.
    const s2 = await submit(selfCertified(t2, `${ctx.prefix} 18 feet`));
    declineId = s2.id;
    const p2 = await api("POST", "submission-publish", { id: s2.id, verification_status: "unverified", note: `${ctx.prefix} (d)` });
    if (p2.body?.record?.id) retire.push(["provision", p2.body.record.id]);
    const after2 = await api("GET", `submission?id=${s2.id}`);
    add(
      "publish without a checked date is refused",
      meta.rules[1],
      p2.status === 400 && /date/i.test(String(p2.body?.error || "")) && after2.body?.submission?.status === "submitted",
      `HTTP ${p2.status} :: ${String(p2.body?.error || p2.body?.note || "").slice(0, 220)}; submission now ${after2.body?.submission?.status}`,
    );
    // Out of the queue before the console step, so the queue holds one row of ours.
    if (after2.body?.submission?.status === "submitted") {
      await api("POST", "submission-decline", { id: s2.id, reason: `${ctx.prefix} regression fixture, not published` });
    }

    // (DEF-09) A rule exactly as the portal sends it can be published.
    const s3 = await submit(portalRule(t3, `${ctx.prefix} 5 feet`));
    const p3 = await api("POST", "submission-publish", { id: s3.id, source_checked_date: adminDate, verification_status: "source_checked", note: `${ctx.prefix} portal rule` });
    if (p3.body?.record?.id) retire.push(["provision", p3.body.record.id]);
    add(
      "a portal-shaped rule submission publishes",
      meta.rules[2],
      p3.status === 200 && p3.body?.record?.review_status === "published" && p3.body?.record?.source_checked_date === adminDate && p3.body?.record?.verification_status === "source_checked",
      `HTTP ${p3.status}; record ${p3.body?.record?.review_status}/${p3.body?.record?.source_checked_date}/${p3.body?.record?.verification_status}${p3.status !== 200 ? ` :: ${String(p3.body?.error).slice(0, 200)}` : ""}`,
    );

    // (DEF-09) A resource exactly as the portal sends it can be published.
    const s4 = await submit({
      kind: "resource",
      resource_type: kind,
      payload: {
        field_state: "verified_from_source",
        label: `${ctx.prefix} Permit portal`,
        url: `https://www.${domain}/permits`,
        phone: null,
        email: null,
        contact_name: null,
        contact_title: null,
        department_name: null,
        notes: null,
        source_url: `https://www.${domain}/permits`,
        source_type: sourceType,
      },
    });
    const p4 = await api("POST", "submission-publish", { id: s4.id, source_checked_date: adminDate, verification_status: "source_checked", note: `${ctx.prefix} portal resource` });
    if (p4.body?.record?.id) retire.push(["resource", p4.body.record.id]);
    add(
      "a portal-shaped resource submission publishes",
      meta.rules[3],
      p4.status === 200 && p4.body?.record?.review_status === "published" && p4.body?.record?.source_checked_date === adminDate,
      `HTTP ${p4.status}; record ${p4.body?.record?.review_status}/${p4.body?.record?.source_checked_date}${p4.status !== 200 ? ` :: ${String(p4.body?.error).slice(0, 200)}` : ""}`,
    );

    // (DEF-09 console) Amy publishes a self-certified submission from the review
    // drawer. The drawer must ask her for the date and the status and send them.
    const s5 = await submit(selfCertified(t4, `${ctx.prefix} 2 per lot`));
    const ui = await publishFromConsole(ctx, s5.id, entity.name, adminDate);
    const sub5 = await api("GET", `submission?id=${s5.id}`);
    const resultId = sub5.body?.submission?.resulting_provision_id;
    let rec5 = null;
    if (resultId) {
      retire.push(["provision", resultId]);
      const jd = await api("GET", `jurisdiction?id=${j.id}`);
      rec5 = (jd.body?.provisions || []).find((p) => p.id === resultId) || null;
    }
    add(
      "the review drawer publishes with the admin's date and status",
      meta.rules[4],
      ui.ok && rec5?.source_checked_date === adminDate && rec5?.verification_status === "unverified",
      `${ui.detail}; submission ${sub5.body?.submission?.status}; record ${rec5 ? `${rec5.source_checked_date}/${rec5.verification_status}` : "none published"}`,
    );
    if (sub5.body?.submission?.status === "submitted") {
      await api("POST", "submission-decline", { id: s5.id, reason: `${ctx.prefix} regression fixture, not published` });
    }
  } finally {
    for (const [k, id] of retire) {
      if (k === "provision") await api("POST", "provision-retire", { id, superseded_date: day(0), note: `${ctx.prefix} regression fixture retired` });
      else await api("POST", "resource-retire", { id, note: `${ctx.prefix} regression fixture retracted` });
    }
    if (declineId) {
      const s = await api("GET", `submission?id=${declineId}`);
      if (s.body?.submission?.status === "submitted") await api("POST", "submission-decline", { id: declineId, reason: `${ctx.prefix} regression fixture, not published` });
    }
  }
  return out;
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

async function publishFromConsole(ctx, submissionId, entityName, adminDate) {
  const { browser, page } = await adminPage(ctx);
  const steps = [];
  try {
    await page.goto(`${ctx.base}/admin/regulatory`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Review queue", exact: true }).click({ timeout: 30000 });
    const row = page.locator("tr", { hasText: entityName }).first();
    await row.waitFor({ timeout: 30000 });
    await row.click();
    const drawer = page.locator("div.fixed", { has: page.getByText("What was submitted, beside what ADUAtlas publishes") }).last();
    await drawer.waitFor({ timeout: 30000 });
    const field = (text) => drawer.locator("label", { has: page.getByText(text, { exact: true }) });
    const dateInput = field("Date you checked the source").locator("input");
    const statusSelect = field("Checked by ADUAtlas").locator("select");
    const hasDate = (await dateInput.count()) > 0;
    const hasStatus = (await statusSelect.count()) > 0;
    steps.push(`date input ${hasDate ? "present" : "MISSING"}, status control ${hasStatus ? "present" : "MISSING"}`);
    if (hasDate) await dateInput.fill(adminDate);
    if (hasStatus) await statusSelect.selectOption("unverified");
    const publish = drawer.getByRole("button", { name: "Publish this" });
    if (await publish.isDisabled()) {
      steps.push("Publish is disabled");
      return { ok: false, detail: steps.join("; ") };
    }
    await publish.click();
    // Either the drawer closes (published) or it shows the server's refusal.
    const alert = drawer.locator('[role="alert"]');
    const closed = drawer.waitFor({ state: "detached", timeout: 30000 }).then(() => "closed");
    const refused = alert.first().waitFor({ timeout: 30000 }).then(() => "refused");
    const how = await Promise.race([closed, refused]).catch(() => "timeout");
    if (how === "refused") steps.push(`console showed: ${(await alert.first().innerText()).slice(0, 200)}`);
    else steps.push(`drawer ${how}`);
    return { ok: hasDate && hasStatus && how === "closed", detail: steps.join("; ") };
  } catch (e) {
    steps.push(`error: ${String(e?.message || e).split("\n")[0].slice(0, 200)}`);
    return { ok: false, detail: steps.join("; ") };
  } finally {
    await browser.close();
  }
}
