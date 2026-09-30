// R3-06 and shared contract C2, migration 0024: intro_requests.forwarded_at
// means ADUAtlas actually forwarded the homeowner's message to the builder.
//
// RC3's 0016 trigger stamped forwarded_at on ANY move to status 'sent'. With
// Resend down, the admin used the console's status select ("Introduction sent")
// as the fallback (journeys j3 and j5): the row gained forwarded_at, the console
// showed "Forwarded <date>" and hid the Forward button, the real forward answered
// 409 "already forwarded", and the builder had received nothing.
//
// What this proves, on a regress- builder listing (inactive, draft, and with NO
// contact email, so nothing can ever be mailed from it) and two regress-
// homeowners, all created with the service role and deleted at the end:
//   1. the manual status write (the PATCH api/admin/_builders.js intro-update
//      sends: status only) records no delivery and does not leave the row
//      reading 'sent' either: 0024 refuses a status-only move into 'sent', so
//      forwarded_at stays null and 'sent' still always means forwarded;
//   2. the real forward's own write (status 'sent' and forwarded_at, filtered on
//      forwarded_at is null, exactly as introForward sends it) still lands on
//      that row afterwards, so a manual status can never block the forward;
//   3. through the real admin API: after POST builders/intro-update
//      {status: 'sent'}, GET builders/intros reports forwarded_at null, so the
//      console keeps offering the forward and never shows "Forwarded";
//   4. the first recorded delivery date stays: a later write cannot move it.
// Items 1 to 3 fail on RC3 (the trigger stamps on the status change). Item 4 is
// a standing guard and passes on both. The forward endpoint itself is never
// called, so no mail can leave, whatever Resend's configuration.
export const meta = {
  name: "512 manual intro status is not a forward (R3-06, C2)",
  rules: [
    "C2: a manual status change to sent never records a delivery, and never leaves the row reading sent without one",
    "C2: a manual status change never blocks the real forward from recording its delivery",
    "C2: after the console's manual 'Introduction sent' the admin API still reports the introduction as not forwarded",
    "2h: the first recorded delivery date is never moved or cleared",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) {
    return meta.rules.map((rule, i) => ({ name: `intro-forward-truth-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; the fixtures cannot be created" }));
  }

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const svc = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const brief = (r) => `HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 180)}`;
  const tag = `${ctx.prefix}-intro`;
  const users = [];
  let builderId = null;

  const mkUser = async (s) => {
    const r = await ctx.fetchJson(`${rest}/users`, { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ email: `${tag}-${s}@regress.aduatlas.test` }) });
    const id = Array.isArray(r.body) && r.body[0]?.id;
    if (!id) throw new Error(`fixture homeowner insert failed: ${brief(r)}`);
    users.push(id);
    return id;
  };
  const mkIntro = async (userId) => {
    const r = await ctx.fetchJson(`${rest}/intro_requests`, { method: "POST", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ user_id: userId, builder_id: builderId, message: `${tag}: please introduce us` }) });
    const row = Array.isArray(r.body) && r.body[0];
    if (!row?.id) throw new Error(`fixture introduction insert failed: ${brief(r)}`);
    return row.id;
  };
  const read = async (id) => {
    const r = await ctx.fetchJson(`${rest}/intro_requests?id=eq.${id}&select=status,forwarded_at`, { headers: svc });
    return r.body?.[0] || null;
  };
  const fmt = (row) => (row ? `status=${row.status} forwarded_at=${row.forwarded_at ?? "null"}` : "no row");

  try {
    const b = await ctx.fetchJson(`${rest}/builders`, {
      method: "POST", headers: { ...svc, Prefer: "return=representation" },
      body: JSON.stringify({ slug: `${tag}-builder`, name: `${tag} builder (regression fixture)`, state: "AZ", active: false, profile_status: "draft" }),
    });
    builderId = Array.isArray(b.body) && b.body[0]?.id;
    if (!builderId) throw new Error(`fixture builder insert failed: ${brief(b)}`);

    // ── 1. the manual status write ─────────────────────────────────────────
    const intro1 = await mkIntro(await mkUser("a"));
    const manual = await ctx.fetchJson(`${rest}/intro_requests?id=eq.${intro1}`, { method: "PATCH", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify({ status: "sent" }) });
    const afterManual = await read(intro1);
    add("manual-status-sent-records-no-delivery", meta.rules[0],
      afterManual?.forwarded_at === null && afterManual?.status === "requested",
      `PATCH {status: sent} -> ${brief(manual)}; row now ${fmt(afterManual)}`);

    // ── 2. the real forward's write still lands ────────────────────────────
    const fwd = await ctx.fetchJson(`${rest}/intro_requests?id=eq.${intro1}&forwarded_at=is.null`, {
      method: "PATCH", headers: { ...svc, Prefer: "return=representation" }, body: JSON.stringify({ status: "sent", forwarded_at: new Date().toISOString() }),
    });
    const stamped = Array.isArray(fwd.body) ? fwd.body : [];
    const afterFwd = await read(intro1);
    add("real-forward-still-lands-after-a-manual-status", meta.rules[1],
      fwd.status === 200 && stamped.length === 1 && Boolean(afterFwd?.forwarded_at),
      `the forward path's filtered write matched ${stamped.length} row(s) (${brief(fwd)}); row now ${fmt(afterFwd)}. RC3 answered this with 409 already forwarded`);

    // ── 4. the first delivery date stays ───────────────────────────────────
    const first = afterFwd?.forwarded_at || afterManual?.forwarded_at || null;
    await ctx.fetchJson(`${rest}/intro_requests?id=eq.${intro1}`, { method: "PATCH", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify({ forwarded_at: new Date(Date.now() + 3 * 864e5).toISOString() }) });
    await ctx.fetchJson(`${rest}/intro_requests?id=eq.${intro1}`, { method: "PATCH", headers: { ...svc, Prefer: "return=minimal" }, body: JSON.stringify({ forwarded_at: null }) });
    const later = await read(intro1);
    add("the-first-delivery-date-stays", meta.rules[3],
      Boolean(first) && later?.forwarded_at === first,
      `first ${first ?? "never recorded"}; after a later date and a clear: ${fmt(later)}`);

    // ── 3. the console's manual status, through the real admin API ─────────
    const intro2 = await mkIntro(await mkUser("b"));
    const admin = { Authorization: `Bearer ${await ctx.token("admin")}`, "Content-Type": "application/json" };
    const upd = await ctx.fetchJson(`${ctx.base}/api/admin/builders/intro-update`, { method: "POST", headers: admin, body: JSON.stringify({ id: intro2, status: "sent" }) });
    const list = await ctx.fetchJson(`${ctx.base}/api/admin/builders/intros`, { headers: admin });
    const item = (list.body?.items || []).find((i) => i.id === intro2);
    const direct = await read(intro2);
    add("console-manual-sent-is-not-reported-as-forwarded", meta.rules[2],
      list.status === 200 && Boolean(item) && item.forwarded_at === null && direct?.forwarded_at === null,
      `intro-update -> ${brief(upd)}; intros list -> HTTP ${list.status}, row ${item ? `status=${item.status} forwarded_at=${item.forwarded_at ?? "null"}` : "missing"}; database ${fmt(direct)}`);
  } catch (e) {
    add("intro-forward-truth-check-ran", "a check that cannot run proves nothing", false, String(e?.message || e).slice(0, 300));
  } finally {
    if (builderId) await ctx.fetchJson(`${rest}/builders?id=eq.${builderId}`, { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } }).catch(() => null);
    for (const id of users) await ctx.fetchJson(`${rest}/users?id=eq.${id}`, { method: "DELETE", headers: { ...svc, Prefer: "return=minimal" } }).catch(() => null);
  }
  return out;
}
