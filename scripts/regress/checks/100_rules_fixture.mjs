// 100 — the fixture behind the homeowner rules page checks (101 to 107), built once
// per run and shared through this module's cache, plus the page reader they use.
//
// Everything is made for this run, named with ctx.prefix, through the product's own
// doors: the admin API for jurisdictions, rules, resources, entities and identity
// decisions (as Amy's console does), and for each government entity a government
// user created through the GoTrue admin API who claims the entity through the
// claim_government_entity RPC, exactly as 320 does. No persona is modified and no
// existing record is edited. 199 unpublishes the fixture jurisdictions at the end,
// which takes every rule and resource under them off the public views.
//
//   Rich Falls (VT)      six rules and three resources covering every field state
//                        and verification status the page must tell apart; one
//                        rule and one resource supplied by a government entity
//                        that stays verified ("Provided by <entity>").
//   Withdrawn Falls (VT) a rule supplied by a government entity whose verification
//                        is then WITHDRAWN, beside an ADUAtlas-research control.
//   Twin (ID, MT, NV)    the same slug in three states, each with its own rule;
//                        the NV record is unpublished again (DEF-06).
//
// Checks import { rulesFixture, openPage, fmtDay } from here. The runner also calls
// this file's default export, which builds the fixture and reports whether it could.
export const meta = {
  name: "100 rules fixture",
  rules: ["a check that cannot build its data proves nothing"],
};

const CHECKED = "2026-09-01";
const EFFECTIVE = "2025-01-01";

// Formats a date exactly as the rules page does (en-US, long month, UTC), so a
// check compares like with like.
export const fmtDay = (raw) => {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
};

let cached = null;
export const rulesFixture = (ctx) => {
  if (!cached) cached = build(ctx);
  return cached;
};

const build = async (ctx) => {
  if (!ctx.serviceKey) throw new Error("REGRESS_ENV_FILE has no service key, so no government user can be made for this run");
  const P = ctx.prefix;
  // The admin API of the target this fixture was built on, fixed at build time.
  const base = ctx.base;
  const adminToken = await ctx.token("admin");
  const api = (method, route, body) =>
    ctx.fetchJson(`${base}/api/admin/regulatory/${route}`, {
      method,
      headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const must = (r, what) => {
    if (r.status < 200 || r.status > 299) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body;
  };
  const anon = (pathAndQuery) =>
    ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${pathAndQuery}`, { headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}` } });

  const m = must(await api("GET", "meta"), "meta");
  const stateRow = (code) => {
    const s = (m.states || []).find((row) => row.state_code === code && ["state", "federal_district"].includes(row.jurisdiction_type || row.type));
    if (!s) throw new Error(`no state row for ${code} in the admin meta`);
    return s;
  };

  const jurisdiction = async (code, name, officialName, extra = {}) =>
    must(
      await api("POST", "jurisdiction-save", {
        jurisdiction: { type: "city", name, official_name: officialName, parent_id: stateRow(code).id, is_published: true, ...extra },
      }),
      `jurisdiction-save ${code} ${name}`,
    ).jurisdiction;

  const provision = async (j, topic, fields, what) =>
    must(
      await api("POST", "provision-save", {
        provision: {
          jurisdiction_id: j.id,
          topic,
          source_url: `https://www.${P}-source.test/code/${topic}`,
          source_document_title: `${P} ADU ordinance`,
          source_type: "city_code",
          source_checked_date: CHECKED,
          review_status: "published",
          supplied_by: "aduatlas_research",
          notes: `${P} regression fixture (100)`,
          ...fields,
        },
      }),
      `provision-save ${what}`,
    ).provision;

  const resource = async (j, kind, fields, what) =>
    must(
      await api("POST", "resource-save", {
        resource: {
          jurisdiction_id: j.id,
          kind,
          field_state: "verified_from_source",
          source_type: "city_code",
          source_checked_date: CHECKED,
          review_status: "published",
          supplied_by: "aduatlas_research",
          notes: `${P} regression fixture (100)`,
          ...fields,
        },
      }),
      `resource-save ${what}`,
    ).resource;

  // A government entity seated in `j`, claimed by a user made for this run and
  // verified by the admin, exactly as the product does it.
  const verifiedEntity = async (j, tag) => {
    const domain = `${P}-${tag}.test`;
    const entity = must(
      await api("POST", "entity-save", {
        entity: {
          name: `${P} City of ${tag === "rich" ? "Rich Falls" : "Withdrawn Falls"}`,
          entity_type: "city",
          official_website_url: `https://www.${domain}/`,
          official_domains: [domain],
          jurisdiction_id: j.id,
        },
      }),
      `entity-save ${tag}`,
    ).entity;
    const email = `planner@${domain}`;
    const password = `R${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}!9`;
    must(
      await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` },
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { role: "homeowner" } }),
      }),
      `create government user ${tag}`,
    );
    const signin = must(
      await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ctx.anonKey },
        body: JSON.stringify({ email, password }),
      }),
      `government user sign-in ${tag}`,
    );
    const claim = must(
      await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/rpc/claim_government_entity`, {
        method: "POST",
        headers: { apikey: ctx.anonKey, Authorization: `Bearer ${signin.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_entity_id: entity.id, p_full_name: `${P} Planner`, p_job_title: "Planner", p_work_email: email, p_note: `${P} regression claim (100)` }),
      }),
      `claim_government_entity ${tag}`,
    );
    must(
      await api("POST", "gov-identity-verify", { membership_id: claim.membership_id, checked: `${P} regression: the work email is at the recorded official domain ${domain}` }),
      `gov-identity-verify ${tag}`,
    );
    return { ...entity, domain, website: `https://www.${domain}/` };
  };

  // ── Rich Falls ─────────────────────────────────────────────────────────────
  const rich = await jurisdiction("VT", `${P} Rich Falls`, `${P} City of Rich Falls`);
  const entityA = await verifiedEntity(rich, "rich");
  const values = {
    checked: `${P} 800 square feet maximum`,
    unchecked: `${P} 16 feet`,
    disputed: `${P} 5 feet from the rear lot line`,
    government: `${P} 4 feet from the side lot line`,
    checked2: `${P} 300 square feet minimum`,
  };
  const P1 = await provision(rich, "max_size", { field_state: "verified_from_source", value_text: values.checked, effective_date: EFFECTIVE, verification_status: "source_checked" }, "P1 checked");
  const P2 = await provision(rich, "height_limit", { field_state: "verified_from_source", value_text: values.unchecked, effective_date: EFFECTIVE, verification_status: "unverified" }, "P2 unchecked");
  const P3 = await provision(rich, "setback_rear", { field_state: "verified_from_source", value_text: values.disputed, effective_date: EFFECTIVE, verification_status: "disputed" }, "P3 disputed");
  const P4 = await provision(rich, "parking_required", { field_state: "source_did_not_state", verification_status: "unverified" }, "P4 silent unchecked");
  const P6 = await provision(rich, "min_size", { field_state: "verified_from_source", value_text: values.checked2, effective_date: EFFECTIVE, verification_status: "source_checked" }, "P6 checked");
  // Supplied by a verified government account. If the admin API ever stops
  // accepting a government attribution outside the submission path, the checks
  // that need it say so instead of failing on the fixture.
  let P5 = null;
  let govSupplyError = null;
  const p5 = await api("POST", "provision-save", {
    provision: {
      jurisdiction_id: rich.id,
      topic: "setback_side",
      field_state: "verified_from_source",
      value_text: values.government,
      source_url: `https://www.${entityA.domain}/code/setback_side`,
      source_document_title: `${P} Rich Falls ADU ordinance`,
      source_type: "city_code",
      effective_date: EFFECTIVE,
      source_checked_date: CHECKED,
      review_status: "published",
      verification_status: "source_checked",
      supplied_by: "government_account",
      supplied_by_entity_id: entityA.id,
      notes: `${P} regression fixture (100)`,
    },
  });
  if (p5.status === 200) P5 = p5.body.provision;
  else govSupplyError = `provision-save with supplied_by=government_account: HTTP ${p5.status} ${JSON.stringify(p5.body).slice(0, 200)}`;

  const labels = { disputed: `${P} Fee schedule`, government: `${P} ADU handbook`, unchecked: `${P} Zoning map` };
  const R1 = await resource(rich, "fee_schedule", { label: labels.disputed, url: `https://www.${P}-source.test/fees`, source_url: `https://www.${P}-source.test/fees`, verification_status: "disputed" }, "R1 disputed");
  const R3 = await resource(rich, "zoning_map", { label: labels.unchecked, url: `https://www.${P}-source.test/map`, source_url: `https://www.${P}-source.test/map`, verification_status: "unverified" }, "R3 unchecked");
  let R2 = null;
  const r2 = await api("POST", "resource-save", {
    resource: {
      jurisdiction_id: rich.id,
      kind: "adu_handbook",
      field_state: "verified_from_source",
      label: labels.government,
      url: `https://www.${entityA.domain}/handbook`,
      source_url: `https://www.${entityA.domain}/handbook`,
      source_type: "city_code",
      source_checked_date: CHECKED,
      review_status: "published",
      verification_status: "source_checked",
      supplied_by: "government_account",
      supplied_by_entity_id: entityA.id,
      notes: `${P} regression fixture (100)`,
    },
  });
  if (r2.status === 200) R2 = r2.body.resource;
  else govSupplyError = govSupplyError || `resource-save with supplied_by=government_account: HTTP ${r2.status} ${JSON.stringify(r2.body).slice(0, 200)}`;

  // ── Withdrawn Falls ───────────────────────────────────────────────────────
  const wd = await jurisdiction("VT", `${P} Withdrawn Falls`, `${P} City of Withdrawn Falls`);
  const entityW = await verifiedEntity(wd, "wd");
  const wValues = { government: `${P} 18 feet, from the city`, research: `${P} 900 square feet maximum` };
  const PR = await provision(wd, "max_size", { field_state: "verified_from_source", value_text: wValues.research, effective_date: EFFECTIVE, verification_status: "source_checked" }, "PR research control");
  let PW = null;
  const pw = await api("POST", "provision-save", {
    provision: {
      jurisdiction_id: wd.id,
      topic: "height_limit",
      field_state: "verified_from_source",
      value_text: wValues.government,
      source_url: `https://www.${entityW.domain}/code/height_limit`,
      source_document_title: `${P} Withdrawn Falls ADU ordinance`,
      source_type: "city_code",
      effective_date: EFFECTIVE,
      source_checked_date: CHECKED,
      review_status: "published",
      verification_status: "source_checked",
      supplied_by: "government_account",
      supplied_by_entity_id: entityW.id,
      notes: `${P} regression fixture (100)`,
    },
  });
  if (pw.status === 200) PW = pw.body.provision;
  else govSupplyError = govSupplyError || `provision-save (withdrawn case): HTTP ${pw.status} ${JSON.stringify(pw.body).slice(0, 200)}`;
  must(
    await api("POST", "gov-identity-withdraw", { entity_id: entityW.id, reason: `${P} regression (100): the fixture government's verification is withdrawn to test the public page` }),
    "gov-identity-withdraw",
  );

  // ── the same slug in three states ─────────────────────────────────────────
  const twinName = `${P} Twin`;
  const twins = {};
  for (const [code, stateName, value] of [
    ["ID", "Idaho", `${P} Twin ID value 800 square feet`],
    ["MT", "Montana", `${P} Twin MT value 1,200 square feet`],
    ["NV", "Nevada", `${P} Twin NV value 700 square feet`],
  ]) {
    const j = await jurisdiction(code, twinName, `${P} Twin, ${stateName}`);
    const rule = await provision(j, "max_size", { field_state: "verified_from_source", value_text: value, effective_date: EFFECTIVE, verification_status: "source_checked" }, `twin ${code}`);
    twins[code] = { ...j, value, rule, stateName };
  }
  const slugs = new Set(Object.values(twins).map((j) => j.slug));
  if (slugs.size !== 1) throw new Error(`the twin records did not derive one shared slug: ${[...slugs].join(", ")}`);
  // The NV record goes back off the public site: its url must not show a sibling.
  must(
    await api("POST", "jurisdiction-save", {
      jurisdiction: { id: twins.NV.id, type: "city", name: twinName, official_name: twins.NV.official_name, parent_id: stateRow("NV").id, is_published: false },
    }),
    "unpublish twin NV",
  );

  // The public rows as an anonymous visitor reads them, for dates and labels.
  const ids = [P1, P2, P3, P4, P5, P6, PR, PW, twins.ID.rule, twins.MT.rule].filter(Boolean).map((p) => p.id);
  const pub = await anon(`regulatory_provisions_public?select=*&id=in.(${ids.join(",")})`);
  if (pub.status !== 200) throw new Error(`anon read of the fixture rules: HTTP ${pub.status}`);
  const publicRow = new Map(pub.body.map((row) => [row.id, row]));
  const resIds = [R1, R2, R3].filter(Boolean).map((r) => r.id);
  const pubRes = await anon(`government_resources_public?select=*&id=in.(${resIds.join(",")})`);
  if (pubRes.status !== 200) throw new Error(`anon read of the fixture resources: HTTP ${pubRes.status}`);
  const publicResource = new Map(pubRes.body.map((row) => [row.id, row]));

  return {
    prefix: P,
    api,
    rich: { ...rich, url: `/rules/vt/${rich.slug}` },
    wd: { ...wd, url: `/rules/vt/${wd.slug}` },
    entityA,
    entityW,
    values,
    wValues,
    labels,
    provisions: { P1, P2, P3, P4, P5, P6, PR, PW },
    resources: { R1, R2, R3 },
    publicRow,
    publicResource,
    govSupplyError,
    twins,
    twinSlug: [...slugs][0],
    stateParent: (code) => stateRow(code).id,
    // For 199: everything this run published.
    published: [
      { id: rich.id, name: rich.name, official_name: rich.official_name, parent: stateRow("VT").id },
      { id: wd.id, name: wd.name, official_name: wd.official_name, parent: stateRow("VT").id },
      { id: twins.ID.id, name: twinName, official_name: twins.ID.official_name, parent: stateRow("ID").id },
      { id: twins.MT.id, name: twinName, official_name: twins.MT.official_name, parent: stateRow("MT").id },
    ],
  };
};

// Opens one path in a fresh, isolated browser context and reads the page once it
// has finished loading its records. Everything a check needs is returned as data:
// the head (title, canonical, every robots directive), the text, the links, and
// each leaf list item (a rule card, a resource card, a legend entry) with its
// chips, its dates and its data attributes. The structure read here exists on RC1
// as well as on the fixed page, so a check can go red on RC1 for the defect itself
// rather than for a missing hook.
export const openPage = async (browser, ctx, path, { settle = /Loading/, ready = null } = {}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    const sep = path.includes("?") ? "&" : "?";
    await page.goto(`${ctx.base}${path}${sep}regress=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForFunction(
      ([pattern, readyPattern]) => {
        const text = document.body?.innerText || "";
        const shown = readyPattern ? new RegExp(readyPattern, "i").test(text) : Boolean(document.querySelector("h1"));
        return shown && !new RegExp(pattern).test(text.slice(0, 4000));
      },
      [settle.source, ready ? ready.source : null],
      { timeout: 45000 },
    );
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    return await page.evaluate(() => {
      const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const leaves = [...document.querySelectorAll("li")].filter((li) => !li.querySelector("li"));
      return {
        url: location.pathname,
        title: document.title,
        h1: norm(document.querySelector("h1")?.textContent),
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || null,
        robots: [...document.querySelectorAll('meta[name="robots"]')].map((m) => m.getAttribute("content") || ""),
        text: norm(document.body.innerText),
        links: [...document.querySelectorAll("a[href]")].map((a) => ({ href: a.getAttribute("href"), text: norm(a.textContent) })),
        cards: leaves.map((li) => ({
          text: norm(li.innerText),
          h4: norm(li.querySelector("h4")?.textContent),
          chips: [...li.querySelectorAll("span.rounded-full")].map((s) => norm(s.textContent)),
          dates: [...li.querySelectorAll("dl > div")].map((d) => ({ label: norm(d.querySelector("dt")?.textContent), value: norm(d.querySelector("dd")?.textContent) })),
          section: li.closest("section")?.getAttribute("aria-label") || "",
          data: { ...li.dataset },
        })),
        sections: [...document.querySelectorAll("section[aria-label]")].map((s) => ({ label: s.getAttribute("aria-label"), level: s.dataset.level || null, text: norm(s.innerText) })),
        // The "How to read this page" legend: its entries are the list items of
        // the box whose own heading says so.
        legend: [...document.querySelectorAll("li")]
          .filter((li) => norm(li.parentElement?.parentElement?.querySelector(":scope > h2")?.textContent) === "How to read this page")
          .map((li) => ({ chips: [...li.querySelectorAll("span.rounded-full")].map((x) => norm(x.textContent)), text: norm(li.innerText) })),
      };
    });
  } finally {
    await context.close();
  }
};

export const noindexed = (snap) => snap.robots.some((c) => /noindex/i.test(c));

// The card for one fixture rule: by its data attribute when the page has one, or
// by its unique value, or (a rule with no value) by its topic heading and its
// jurisdiction's name, which every card prints.
export const cardFor = (snap, row, jurisdictionName) =>
  snap.cards.find((c) => c.data.provisionId === row.id) ||
  (row.value_text ? snap.cards.find((c) => c.h4 && c.text.includes(row.value_text)) : null) ||
  snap.cards.find((c) => c.h4 && c.h4 === row.topic_label && c.text.includes(jurisdictionName)) ||
  null;

// The block for the page's own jurisdiction (not the state above it): by its data
// attribute, or by the aria-label every level block carries on RC1 as well.
export const targetSection = (snap, name) =>
  snap.sections.find((s) => s.level === "target") || snap.sections.find((s) => String(s.label || "").endsWith(`: ${name}`)) || null;

// A resource card has no heading; it is found by its id or its unique label.
export const resourceCardFor = (snap, row) =>
  snap.cards.find((c) => c.data.resourceId === row.id) || snap.cards.find((c) => !c.h4 && row.label && c.text.includes(row.label)) || null;

export default async function (ctx) {
  try {
    const f = await rulesFixture(ctx);
    return [
      {
        name: "rules fixture built",
        rule: meta.rules[0],
        status: "pass",
        detail: `${f.rich.url}, ${f.wd.url}, twin slug ${f.twinSlug} in ID/MT/NV(unpublished)${f.govSupplyError ? `; government attribution refused: ${f.govSupplyError}` : ""}`,
      },
    ];
  } catch (e) {
    return [{ name: "rules fixture built", rule: meta.rules[0], status: "fail", detail: String(e?.message || e).slice(0, 500) }];
  }
}
