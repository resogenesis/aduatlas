// DEF-21 (Amy's revenue counted sponsored access), guarded through the admin API.
//
// A Golden granted by a government Education Partner is written on paid_at and
// paid_tier exactly as a $79 purchase is. RC1's /api/admin/overview totalled
// paid_tier at list price, so every sponsored resident was $79 of "revenue",
// and /api/admin/users showed a sponsored account exactly as a buyer. Decision
// 2r: sponsored access carries no monetary value, and the product records what
// a homeowner PAID separately from what tier they HOLD.
//
// What this proves, as the staging admin (Amy's equivalent):
//   1. golden_sponsored is listed as SPONSORED and adds $0 of revenue;
//   2. the purchased personas are listed as BOUGHT and add their list price;
//   3. the overview's revenue equals the list price of the plans qualifying
//      money bought, computed independently from the database's own authority
//      (public.homeowner_upgrade_basis.qualifying_paid_plan, migration 0019,
//      read here with the service role), so no sponsored Golden is in it;
//   4. the overview shows sponsored access as its own count, and that count
//      matches the same authority;
//   5. the two admin screens agree (sum of per-account revenue == headline);
//   6. both endpoints stay closed to a signed-in homeowner and to no token.
// The database facts for the two personas are asserted first as positive
// controls: if golden_sponsored were not really sponsored, "adds $0" would
// prove nothing.
//
// Read-only. Personas are only signed in and read. Other checks may create
// regress- accounts concurrently, so counts are compared to an oracle read in
// the same moment (retried on a race) and never to fixed numbers.
export const meta = {
  name: "600 admin revenue counts only bought access",
  rules: [
    "positive control: golden_sponsored holds live sponsored Golden and golden_purchased a live bought Golden (database authority)",
    "the admin users list shows a sponsored account as sponsored, never as bought",
    "a sponsored account contributes $0 of revenue",
    "the admin users list shows a purchased account as bought, at the list price of what was bought",
    "the overview's revenue is the list price of plans qualifying money bought (2r), so sponsored access adds nothing",
    "the overview shows sponsored access as its own count",
    "the users list and the overview agree on revenue",
    "the admin revenue endpoints refuse a signed-in homeowner and an anonymous caller",
  ],
};

const PRICE = { roadmap: 79, report: 279, concierge: 500 }; // src/lib/plans.js, dollars
const SPONSORED = ["golden_sponsored"];
const PURCHASED = ["golden_purchased", "platinum_purchased", "concierge_purchased"];

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const skip = (name, rule, detail) => out.push({ name, rule, status: "skip", detail });
  const admin = { Authorization: `Bearer ${await ctx.token("admin")}` };
  const svc = ctx.serviceKey ? { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}` } : null;

  // The database's own answer, read with the service role: every live
  // entitlement with the plan qualifying money bought (null = no money did).
  const oracle = async () => {
    if (!svc) return null;
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const r = await ctx.fetchJson(
        `${ctx.supabaseUrl}/rest/v1/homeowner_upgrade_basis?select=user_id,email,paid_tier,paid_origin,qualifying_paid_plan&paid_at=not.is.null&refunded_at=is.null&order=user_id`,
        { headers: { ...svc, Range: `${from}-${from + 999}` } }
      );
      if (r.status >= 300 || !Array.isArray(r.body)) throw new Error(`homeowner_upgrade_basis read failed: ${r.status} ${JSON.stringify(r.body).slice(0, 160)}`);
      rows.push(...r.body);
      if (r.body.length < 1000) break;
    }
    const bought = rows.filter((x) => PRICE[x.qualifying_paid_plan]);
    // Comps (0023, paid_origin 'admin_comp') earn no credit either, but they are not sponsorship.
    const sponsored = rows.filter((x) => !x.qualifying_paid_plan && PRICE[x.paid_tier] && x.paid_origin !== "admin_comp");
    return { rows, revenue: bought.reduce((s, x) => s + PRICE[x.qualifying_paid_plan], 0), sponsored: sponsored.length, byEmail: new Map(rows.map((x) => [x.email, x])) };
  };

  // Read the two endpoints and the oracle together; retry if a concurrent
  // check changed the data between the reads.
  let ov, us, want;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await oracle();
    ov = await ctx.fetchJson(`${ctx.base}/api/admin/overview`, { headers: admin });
    us = await ctx.fetchJson(`${ctx.base}/api/admin/users`, { headers: admin });
    want = await oracle();
    if (!want || (before.revenue === want.revenue && before.sponsored === want.sponsored)) break;
  }
  if (ov.status !== 200 || us.status !== 200) {
    add("admin-endpoints-answer", meta.rules[4], false, `overview ${ov.status}, users ${us.status}: ${JSON.stringify(ov.body).slice(0, 160)}`);
    return out;
  }
  const users = Array.isArray(us.body?.users) ? us.body.users : [];
  const row = (persona) => users.find((u) => u.email === ctx.creds(persona).email);

  // 0. Positive controls from the database itself.
  if (want) {
    const s = want.byEmail.get(ctx.creds("golden_sponsored").email);
    const p = want.byEmail.get(ctx.creds("golden_purchased").email);
    add(
      "control-personas-are-what-they-claim",
      meta.rules[0],
      Boolean(s) && s.paid_tier === "roadmap" && s.qualifying_paid_plan === null && Boolean(p) && p.paid_tier === "roadmap" && p.qualifying_paid_plan === "roadmap",
      `golden_sponsored: ${s ? `${s.paid_tier}/${s.paid_origin ?? "not recorded"}/qualifying ${s.qualifying_paid_plan ?? "none"}` : "no live entitlement"}; golden_purchased: ${p ? `${p.paid_tier}/${p.paid_origin ?? "not recorded"}/qualifying ${p.qualifying_paid_plan ?? "none"}` : "no live entitlement"}`
    );
  } else {
    skip("control-personas-are-what-they-claim", meta.rules[0], "no service role key in REGRESS_ENV_FILE; the oracle cannot be read");
  }

  // 1-2. Sponsored persona.
  for (const persona of SPONSORED) {
    const u = row(persona);
    add(`${persona}-listed-as-sponsored`, meta.rules[1], u?.access === "sponsored", u ? `paid=${u.paid} tier=${u.paid_tier} access=${u.access ?? "(no access field)"}` : "not in the users list");
    add(`${persona}-adds-no-revenue`, meta.rules[2], u?.revenue === 0, u ? `revenue=${u.revenue === undefined ? "(no revenue field)" : u.revenue}` : "not in the users list");
  }

  // 3. Purchased personas.
  for (const persona of PURCHASED) {
    const u = row(persona);
    const price = u ? PRICE[u.paid_tier] : undefined;
    add(
      `${persona}-listed-as-bought`,
      meta.rules[3],
      u?.access === "bought" && u?.revenue === price,
      u ? `paid=${u.paid} tier=${u.paid_tier} access=${u.access ?? "(no access field)"} revenue=${u.revenue === undefined ? "(no revenue field)" : u.revenue} (list ${price})` : "not in the users list"
    );
  }

  // 4. Headline revenue against the database authority.
  if (want) {
    add(
      "overview-revenue-is-bought-plans-only",
      meta.rules[4],
      ov.body.revenue === want.revenue,
      `overview revenue=${ov.body.revenue}; list price of plans qualifying money bought=${want.revenue}; live sponsored accounts=${want.sponsored}`
    );
  } else {
    skip("overview-revenue-is-bought-plans-only", meta.rules[4], "no service role key; the oracle cannot be read");
  }

  // 5. Sponsored access has its own count.
  const count = ov.body?.sponsored?.total;
  add(
    "overview-counts-sponsored-access-separately",
    meta.rules[5],
    Number.isInteger(count) && count >= SPONSORED.length && (!want || count === want.sponsored),
    `overview sponsored=${JSON.stringify(ov.body?.sponsored)}${want ? `; database says ${want.sponsored}` : ""}`
  );

  // 6. The two screens agree (the list is capped at 500 rows).
  const total = ov.body?.users?.total;
  if (Number.isInteger(total) && total <= users.length) {
    const listed = users.reduce((s, u) => s + (typeof u.revenue === "number" ? u.revenue : 0), 0);
    add("users-list-and-overview-agree", meta.rules[6], users.every((u) => "revenue" in u) && listed === ov.body.revenue, `sum of users[].revenue=${listed}; overview revenue=${ov.body.revenue}`);
  } else {
    skip("users-list-and-overview-agree", meta.rules[6], `the users list shows ${users.length} of ${total} accounts, so the sums are not comparable`);
  }

  // 7. Authorization is the server's.
  const homeowner = { Authorization: `Bearer ${await ctx.token("golden_purchased")}` };
  const codes = [];
  for (const path of ["overview", "users"]) {
    codes.push((await ctx.fetchJson(`${ctx.base}/api/admin/${path}`, { headers: homeowner })).status);
    codes.push((await ctx.fetchJson(`${ctx.base}/api/admin/${path}`)).status);
  }
  add("revenue-endpoints-closed-to-non-admins", meta.rules[7], codes.every((c) => c === 403), `homeowner/anonymous -> ${codes.join(", ")}`);

  return out;
}
