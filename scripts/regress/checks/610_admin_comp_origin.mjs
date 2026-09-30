// Admin-comped access is its own origin (Richard's decision of 2026-09-27,
// migration 0023), guarded through the REAL admin API.
//
// RC2a's admin "grant a paid tier" control (/admin/users -> POST
// /api/admin/update-user) wrote paid_tier and paid_at and recorded no origin, so
// 0019's qualifying_paid_plan() rule 5 inferred a PURCHASE: a comped Golden
// earned a real $79 Stripe coupon toward Platinum and was $79 of Amy's revenue.
//
// What this proves, as the staging admin, on regress- accounts it creates and
// deletes:
//   1. comping an account through the admin API records paid_origin 'admin_comp'
//      and grants the live level;
//   2. its upgrade basis (homeowner_upgrade_basis.qualifying_paid_plan, what
//      api/create-checkout.js reads) is NO-CREDIT;
//   3. the admin users list reads it as COMPED and it adds $0 of revenue;
//   4. the overview counts comps as their own figure, never as sponsored, and its
//      revenue is exactly the list price of plans qualifying money bought
//      (oracle read with the service role in the same moment), so the comp adds
//      nothing;
//   5. moving a comp to another plan keeps it a comp (0019's trigger clears a
//      same-value origin on a tier move, so a one-statement write fails here);
//   6. a comp is refused over a recorded purchase and writes nothing, so a real
//      payment is never erased from the credit or the revenue;
//   7. taking access away ends it without rewriting what it was: the record
//      still says 'admin_comp', no refund is claimed, and no credit remains;
//   8. a level change that does not say it is a comp is refused;
//   9. only an admin can comp.
// Items 1-8 fail on RC2a (staging before RC3) because RC2a records no origin.
// Item 9 is a standing guard and passes on both.
export const meta = {
  name: "610 admin comp is its own origin (admin API)",
  rules: [
    "an admin comp grants the level and records paid_origin 'admin_comp'",
    "a comped account's upgrade basis is NO-CREDIT (no purchase credit at checkout)",
    "the admin users list reads a comped account as Comped and it adds $0 of revenue",
    "the overview counts comps separately (never as sponsored) and its revenue excludes them",
    "moving a comp to another plan keeps it a comp with no credit",
    "a comp is refused over a recorded purchase and leaves the purchase untouched",
    "an admin revoke ends a comp without rewriting it into a purchase or a refund",
    "a level change that does not say it is a comp is refused",
    "only an admin can comp an account",
  ],
};

const PRICE = { roadmap: 79, report: 279, concierge: 500 }; // src/lib/plans.js, dollars

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) {
    return meta.rules.map((rule, i) => ({ name: `admin-comp-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; accounts cannot be created or the oracle read" }));
  }

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const admin = { Authorization: `Bearer ${await ctx.token("admin")}`, "Content-Type": "application/json" };
  const tag = `${ctx.prefix}-comp`;
  const mail = (s) => `${tag}-${s}@rehearsal.aduatlas.test`;
  const created = [];

  const mkAccount = async (email, extra = {}) => {
    created.push(email);
    const r = await ctx.fetchJson(`${rest}/users`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ email, ...extra }) });
    if (r.status >= 300 || !Array.isArray(r.body) || !r.body[0]?.id) throw new Error(`fixture insert failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    return r.body[0].id;
  };
  const update = (id, body, headers = admin) =>
    ctx.fetchJson(`${ctx.base}/api/admin/update-user`, { method: "POST", headers, body: JSON.stringify({ id, ...body }) });
  const basis = async (id) => {
    const r = await ctx.fetchJson(`${rest}/homeowner_upgrade_basis?select=paid_tier,paid_at,refunded_at,paid_origin,qualifying_paid_plan&user_id=eq.${id}`, { headers: H });
    if (r.status >= 300) throw new Error(`homeowner_upgrade_basis read failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
    return r.body[0] || null;
  };
  const live = (b) => Boolean(b?.paid_at) && !b?.refunded_at;
  const fmt = (b) => (b ? `tier=${b.paid_tier} live=${live(b)} origin=${b.paid_origin ?? "not recorded"} refunded=${Boolean(b.refunded_at)} basis=${b.qualifying_paid_plan ?? "NO-CREDIT"}` : "no row");
  const listRow = async (email) => {
    const r = await ctx.fetchJson(`${ctx.base}/api/admin/users`, { headers: admin });
    if (r.status !== 200) return { status: r.status, row: null };
    return { status: 200, row: (r.body?.users || []).find((u) => u.email === email) || null };
  };

  // The database's own answer for every live entitlement, read with the service
  // role: revenue = list price of plans qualifying money bought; comps and
  // sponsorships by their recorded origin.
  const oracle = async () => {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const r = await ctx.fetchJson(
        `${rest}/homeowner_upgrade_basis?select=user_id,paid_tier,paid_origin,qualifying_paid_plan&paid_at=not.is.null&refunded_at=is.null&order=user_id`,
        { headers: { ...H, Range: `${from}-${from + 999}` } }
      );
      if (r.status >= 300 || !Array.isArray(r.body)) throw new Error(`oracle read failed: ${r.status}`);
      rows.push(...r.body);
      if (r.body.length < 1000) break;
    }
    return {
      revenue: rows.reduce((s, x) => s + (PRICE[x.qualifying_paid_plan] || 0), 0),
      comped: rows.filter((x) => x.paid_origin === "admin_comp" && PRICE[x.paid_tier]).length,
    };
  };

  try {
    // ── 1-4. comp a fresh account Golden ──────────────────────────────────────
    const aEmail = mail("a");
    const a = await mkAccount(aEmail);
    let r = await update(a, { paid: true, paid_tier: "roadmap" });
    let b = await basis(a);
    add("comp-records-admin-comp", meta.rules[0], r.status === 200 && live(b) && b?.paid_tier === "roadmap" && b?.paid_origin === "admin_comp", `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}; ${fmt(b)}`);
    add("comp-upgrade-basis-is-no-credit", meta.rules[1], live(b) && b?.qualifying_paid_plan === null, `${fmt(b)} (api/create-checkout.js hands this basis to the credit ladder)`);

    const listed = await listRow(aEmail);
    const u = listed.row;
    add(
      "users-list-reads-comped-and-adds-no-revenue",
      meta.rules[2],
      u?.paid === true && u?.access === "comped" && u?.revenue === 0,
      u ? `paid=${u.paid} tier=${u.paid_tier} access=${u.access ?? "(none)"} revenue=${u.revenue}` : `not in the users list (HTTP ${listed.status})`
    );

    let ov, want;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await oracle();
      ov = await ctx.fetchJson(`${ctx.base}/api/admin/overview`, { headers: admin });
      want = await oracle();
      if (before.revenue === want.revenue && before.comped === want.comped) break;
    }
    const comped = ov.body?.comped?.total;
    add(
      "overview-counts-comps-apart-and-not-as-revenue",
      meta.rules[3],
      ov.status === 200 && Number.isInteger(comped) && comped >= 1 && comped === want.comped && ov.body.revenue === want.revenue && b?.qualifying_paid_plan === null,
      `overview comped=${JSON.stringify(ov.body?.comped)} sponsored=${JSON.stringify(ov.body?.sponsored)} revenue=${ov.body?.revenue}; database: live comps=${want.comped}, list price of plans money bought=${want.revenue}; this comp's basis=${b?.qualifying_paid_plan ?? "NO-CREDIT"}`
    );

    // ── 5. move the comp to Platinum ──────────────────────────────────────────
    r = await update(a, { paid: true, paid_tier: "report" });
    b = await basis(a);
    add("comp-over-comp-stays-a-comp", meta.rules[4], r.status === 200 && live(b) && b?.paid_tier === "report" && b?.paid_origin === "admin_comp" && b?.qualifying_paid_plan === null, `HTTP ${r.status}; ${fmt(b)}`);

    // ── 7. revoke ─────────────────────────────────────────────────────────────
    r = await update(a, { paid: false });
    b = await basis(a);
    const after = (await listRow(aEmail)).row;
    add(
      "revoke-ends-the-comp-honestly",
      meta.rules[6],
      r.status === 200 && !b?.paid_at && !b?.refunded_at && b?.paid_origin === "admin_comp" && b?.qualifying_paid_plan === null && after?.paid === false && after?.revenue === 0,
      `HTTP ${r.status}; ${fmt(b)}; users list paid=${after?.paid} revenue=${after?.revenue}`
    );

    // ── 6. a comp over a recorded purchase ────────────────────────────────────
    const buyer = await mkAccount(mail("buyer"), { paid_tier: "roadmap", paid_at: new Date().toISOString(), paid_origin: "purchase" });
    const pre = await basis(buyer);
    r = await update(buyer, { paid: true, paid_tier: "report" });
    b = await basis(buyer);
    add(
      "comp-over-a-purchase-is-refused",
      meta.rules[5],
      pre?.qualifying_paid_plan === "roadmap" && r.status === 409 && b?.paid_tier === "roadmap" && b?.paid_origin === "purchase" && b?.qualifying_paid_plan === "roadmap",
      `before: ${fmt(pre)}; HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 160)}; after: ${fmt(b)}`
    );

    // ── 8. a bare tier move ───────────────────────────────────────────────────
    const bare = await mkAccount(mail("bare"));
    await update(bare, { paid: true, paid_tier: "roadmap" });
    r = await update(bare, { paid_tier: "concierge" });
    b = await basis(bare);
    add(
      "tier-move-without-saying-comp-is-refused",
      meta.rules[7],
      r.status === 400 && b?.paid_tier === "roadmap" && b?.qualifying_paid_plan === null,
      `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 120)}; ${fmt(b)}`
    );

    // ── 9. only an admin ──────────────────────────────────────────────────────
    const outsider = await mkAccount(mail("outsider"));
    const homeowner = { Authorization: `Bearer ${await ctx.token("golden_purchased")}`, "Content-Type": "application/json" };
    const r1 = await update(outsider, { paid: true, paid_tier: "concierge" }, homeowner);
    const r2 = await update(outsider, { paid: true, paid_tier: "concierge" }, { "Content-Type": "application/json" });
    b = await basis(outsider);
    add("only-an-admin-can-comp", meta.rules[8], r1.status === 403 && r2.status === 403 && !b?.paid_at, `homeowner -> ${r1.status}, anonymous -> ${r2.status}; ${fmt(b)}`);
  } finally {
    for (const e of created) {
      await ctx.fetchJson(`${rest}/users?email=eq.${encodeURIComponent(e)}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
    }
  }
  return out;
}
