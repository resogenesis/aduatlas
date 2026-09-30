// R3-01 (security) and shared contract C1, migration 0024: Concierge written
// support is an entitlement the DATABASE enforces, and a refund request is for
// money that was actually paid.
//
// RC3 accepted a support_messages insert from ANY signed-in account (0003's
// policy checked only "own row, written as the homeowner"), so a Golden or an
// unpaid account with a forged browser tier wrote into the $500 Concierge queue
// (journey j7, HTTP 201). Refund requests were filed into the same table with no
// way to tell them apart.
//
// What this proves, through the real PostgREST endpoint with a real signed-in
// session, on ONE regress- account it creates, re-stamps shape by shape the way
// api/stripe-webhook.js and the admin comp writer stamp them, and deletes:
//   1. the call the current /support client makes (no kind) is REFUSED by
//      row-level security for every shape that does not hold a live Concierge
//      entitlement: unpaid, Golden, Platinum, sponsored Golden, comped Golden,
//      refunded Concierge, and the staging admin;
//   2. a live Concierge (bought, or comped: the level is what counts) can still
//      write support, and the row reads back as kind 'support';
//   3. a refund request (kind 'refund_request') is accepted for a live
//      entitlement money bought (Golden, Platinum, Concierge) and refused for a
//      sponsorship, an admin comp (even a comped Concierge), a refund and an
//      account that bought nothing;
//   4. the homeowner reads their own rows of both kinds, including an admin
//      reply written with the thread's kind (the admin API writes as the service
//      role).
// A refusal only counts when it is the POLICY's refusal (42501, row-level
// security). A missing column (RC3: PGRST204) or a missing grant is a different
// defect and fails.
//
// Items 1 to 4 fail on RC3: the refusals because RC3 accepts every write, the
// rest because RC3 has no kind column. The staging admin persona is used only
// for the one refusal it is the subject of, and any row that lands on it is
// deleted by id straight away.
export const meta = {
  name: "511 support kind entitlement (R3-01, C1)",
  rules: [
    "R3-01: Concierge written support (kind support, the default) is written only by a live Concierge entitlement",
    "R3-01: a live Concierge, bought or comped, still writes support and it is recorded as support",
    "C1 and 2r: a refund request is filed only for a live entitlement that money bought",
    "C1: the homeowner reads their own messages of both kinds, including the admin's replies",
  ],
};

const RLS = (r) => (r.status === 401 || r.status === 403) && r.body?.code === "42501" && /row-level security/i.test(String(r.body?.message || ""));

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) {
    return meta.rules.map((rule, i) => ({ name: `support-kind-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixture account cannot be created" }));
  }

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const svc = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const brief = (r) => `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 180)}`;
  const email = `${ctx.prefix}-support-kind@regress.aduatlas.test`;
  const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
  let authId = null;
  let rowId = null;
  const strayIds = []; // rows that landed on a persona, deleted by id

  // The browser's own insert, with the caller's token and the anon key.
  const insertAs = (token, row) =>
    ctx.fetchJson(`${rest}/support_messages`, {
      method: "POST",
      headers: { apikey: ctx.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(row),
    });
  const landed = (r) => (r.status >= 200 && r.status < 300 && Array.isArray(r.body) ? r.body : []);

  try {
    // ── the fixture account ────────────────────────────────────────────────
    const created = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST", headers: svc,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix } }),
    });
    authId = created.body?.id || created.body?.user?.id || null;
    if (!authId) throw new Error(`fixture sign-up failed: ${brief(created)}`);
    for (let i = 0; i < 10 && !rowId; i += 1) {
      const rows = await ctx.fetchJson(`${rest}/users?auth_user_id=eq.${authId}&select=id`, { headers: svc });
      rowId = Array.isArray(rows.body) && rows.body[0]?.id;
      if (!rowId) await new Promise((r) => setTimeout(r, 500));
    }
    if (!rowId) throw new Error("fixture users row never appeared");

    let token = null;
    for (let i = 0; i < 6 && !token; i += 1) {
      const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ctx.anonKey }, body: JSON.stringify({ email, password }),
      });
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 60000)); continue; }
      if (!r.ok) throw new Error(`fixture sign-in failed: HTTP ${r.status}`);
      token = (await r.json()).access_token;
    }
    if (!token) throw new Error("fixture sign-in still rate-limited");

    // Stamp a shape the way its real writer does: the level and origin in one
    // statement, then the origin restated, because 0019's trigger clears a
    // same-value origin when the tier moves (api/stripe-webhook.js and
    // admin_comp_entitlement() both restate it for that reason).
    const stamp = async (patch) => {
      const r = await ctx.fetchJson(`${rest}/users?id=eq.${rowId}`, { method: "PATCH", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify(patch) });
      if (r.status >= 300) throw new Error(`stamp ${JSON.stringify(patch)} failed: ${brief(r)}`);
      if (patch.paid_origin) {
        const again = await ctx.fetchJson(`${rest}/users?id=eq.${rowId}&paid_origin=is.null`, { method: "PATCH", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify({ paid_origin: patch.paid_origin }) });
        if (again.status >= 300) throw new Error(`restatement failed: ${brief(again)}`);
      }
      const back = await ctx.fetchJson(`${rest}/users?id=eq.${rowId}&select=paid_tier,paid_at,refunded_at,paid_origin`, { headers: svc });
      const u = back.body?.[0] || {};
      return `${u.paid_tier ?? "none"} ${u.paid_at && !u.refunded_at ? "live" : "dead"} ${u.paid_origin ?? "not recorded"}`;
    };
    const now = () => new Date().toISOString();
    const clear = { paid_at: null, paid_tier: null, refunded_at: null, paid_origin: null };
    const live = (tier, origin) => ({ paid_at: now(), paid_tier: tier, refunded_at: null, paid_origin: origin });

    // [shape, the writes that make it (after a clear), support allowed?, refund allowed?]
    const SHAPES = [
      ["unpaid", [], false, false],
      ["golden-purchase", [live("roadmap", "purchase")], false, true],
      ["platinum-purchase", [live("report", "purchase")], false, true],
      ["golden-sponsored", [live("roadmap", "sponsorship")], false, false],
      ["golden-comp", [live("roadmap", "admin_comp")], false, false],
      ["concierge-comp", [live("concierge", "admin_comp")], true, false],
      // charge.refunded: paid_at null, refunded_at set, the origin left as it was
      ["concierge-refunded", [live("concierge", "purchase"), { paid_at: null, refunded_at: now() }], false, false],
      ["concierge-purchase", [live("concierge", "purchase")], true, true],
    ];

    for (const [label, writes, supportOk, refundOk] of SHAPES) {
      let shape = await stamp(clear);
      for (const w of writes) shape = await stamp(w);

      // 1 / 2: the call /support makes today (no kind), and the explicit kind.
      const noKind = await insertAs(token, { user_id: rowId, author: "homeowner", body: `${ctx.prefix} ${label} support (no kind)` });
      const asSupport = await insertAs(token, { user_id: rowId, author: "homeowner", body: `${ctx.prefix} ${label} support`, kind: "support" });
      if (supportOk) {
        const ok = landed(noKind)[0]?.kind === "support" && landed(asSupport)[0]?.kind === "support";
        add(`${label}-writes-support`, meta.rules[1], ok, `[${shape}] no kind -> ${brief(noKind)}; kind support -> ${brief(asSupport)}`);
      } else {
        add(`${label}-cannot-write-support`, meta.rules[0], RLS(noKind) && RLS(asSupport), `[${shape}] no kind -> ${brief(noKind)}; kind support -> ${brief(asSupport)}`);
      }

      // 3: the refund request.
      const refund = await insertAs(token, { user_id: rowId, author: "homeowner", body: `${ctx.prefix} ${label} refund`, kind: "refund_request" });
      if (refundOk) {
        add(`${label}-files-a-refund-request`, meta.rules[2], landed(refund)[0]?.kind === "refund_request", `[${shape}] ${brief(refund)}`);
      } else {
        add(`${label}-cannot-file-a-refund-request`, meta.rules[2], RLS(refund), `[${shape}] ${brief(refund)}`);
      }
    }

    // 4: the account now holds a live Concierge purchase and has written both
    // kinds. The admin API answers each thread with its kind, as the service role.
    const reply = await ctx.fetchJson(`${rest}/support_messages`, {
      method: "POST", headers: { ...svc, Prefer: "return=representation" },
      body: JSON.stringify([
        { user_id: rowId, author: "admin", body: `${ctx.prefix} admin support answer`, kind: "support" },
        { user_id: rowId, author: "admin", body: `${ctx.prefix} admin refund answer`, kind: "refund_request" },
      ]),
    });
    const mine = await ctx.fetchJson(`${rest}/support_messages?select=author,kind,body&order=created_at`, { headers: { apikey: ctx.anonKey, Authorization: `Bearer ${token}` } });
    const rows = Array.isArray(mine.body) ? mine.body : [];
    const has = (kind, author) => rows.some((m) => m.kind === kind && m.author === author);
    add(
      "homeowner-reads-both-kinds-and-the-replies",
      meta.rules[3],
      reply.status === 201 && has("support", "homeowner") && has("refund_request", "homeowner") && has("support", "admin") && has("refund_request", "admin") && rows.every((m) => String(m.body).startsWith(ctx.prefix)),
      `admin replies -> ${brief(reply)}; homeowner reads ${rows.length} row(s): ${rows.map((m) => `${m.kind ?? "(no kind)"}/${m.author}`).join(", ") || brief(mine)}`
    );

    // 1 again, for the staging admin: the admin role is not a Concierge plan.
    const adminRow = await ctx.fetchJson(`${rest}/users?email=eq.${encodeURIComponent(ctx.creds("admin").email)}&select=id,role,paid_tier,paid_at,refunded_at`, { headers: svc });
    const a = adminRow.body?.[0];
    if (!a?.id) {
      add("admin-cannot-write-support", meta.rules[0], false, `the staging admin persona has no users row: ${brief(adminRow)}`);
    } else if (a.paid_tier === "concierge" && a.paid_at && !a.refunded_at) {
      out.push({ name: "admin-cannot-write-support", rule: meta.rules[0], status: "skip", detail: "the staging admin persona holds a live Concierge plan, so it is entitled" });
    } else {
      const adm = await insertAs(await ctx.token("admin"), { user_id: a.id, author: "homeowner", body: `${ctx.prefix} admin as homeowner` });
      for (const m of landed(adm)) strayIds.push(m.id);
      add("admin-cannot-write-support", meta.rules[0], RLS(adm), `[role ${a.role}, plan ${a.paid_tier ?? "none"}] ${brief(adm)}`);
    }
  } catch (e) {
    add("support-kind-check-ran", "a check that cannot run proves nothing", false, String(e?.message || e).slice(0, 300));
  } finally {
    for (const id of strayIds) {
      await ctx.fetchJson(`${rest}/support_messages?id=eq.${id}`, { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } }).catch(() => null);
    }
    if (rowId) {
      await ctx.fetchJson(`${rest}/support_messages?user_id=eq.${rowId}`, { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } }).catch(() => null);
      await ctx.fetchJson(`${rest}/users?id=eq.${rowId}`, { method: "DELETE", headers: svc }).catch(() => null);
    }
    if (authId) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: svc }).catch(() => null);
  }
  return out;
}
