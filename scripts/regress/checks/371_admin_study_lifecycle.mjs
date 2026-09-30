// R3-25 (study lifecycle part): a delivered study does not move backwards
// silently, and redelivery does not move the date it was delivered.
//
// On RC3 studies/update accepted any status and set ready_at whenever the status
// was 'ready': Delivered, then Ready for Review, then Delivered again was accepted
// without a word, the customer's portal changed, and ready_at was restamped from
// 07:44 to 08:18 (j5).
//
// Fixture, named with ctx.prefix and removed at the end: one homeowner account
// row with a Platinum purchase stamped by the service role, and one submitted
// study for it. The study is moved through the admin API exactly as the console
// moves it.
export const meta = {
  name: "371 admin studies: a delivered study is not moved back silently, and redelivery keeps the delivery date",
  rules: [
    "R3-25: moving a delivered study back without confirming is refused and changes nothing",
    "R3-25: a confirmed reopen is allowed",
    "R3-25: delivering it again keeps the date it was first delivered",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `study-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const adminToken = await ctx.token("admin");
  const update = (body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/studies/update`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  const readStudy = async (id) => (await ctx.fetchJson(`${rest}/studies?id=eq.${id}&select=id,status,ready_at`, { headers: H })).body?.[0] || null;

  const email = `${ctx.prefix}-371-study@regress.aduatlas.test`;
  let userId = null;
  try {
    const u = await ctx.fetchJson(`${rest}/users`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ email, paid_tier: "report", paid_at: new Date().toISOString(), paid_origin: "purchase" }),
    });
    userId = u.body?.[0]?.id || null;
    if (!userId) throw new Error(`fixture account: HTTP ${u.status} ${JSON.stringify(u.body).slice(0, 200)}`);
    const s = await ctx.fetchJson(`${rest}/studies`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, status: "submitted", intake: { address: `${ctx.prefix} 371 fixture` } }),
    });
    const studyId = s.body?.[0]?.id || null;
    if (!studyId) throw new Error(`fixture study: HTTP ${s.status} ${JSON.stringify(s.body).slice(0, 200)}`);

    const delivered = await update({ id: studyId, status: "ready" });
    const first = await readStudy(studyId);
    if (delivered.status !== 200 || first?.status !== "ready" || !first?.ready_at) throw new Error(`could not deliver the fixture: HTTP ${delivered.status} ${JSON.stringify(first)}`);

    const silent = await update({ id: studyId, status: "in_review" });
    const afterSilent = await readStudy(studyId);
    add(
      "silent move back refused",
      meta.rules[0],
      silent.status === 409 && afterSilent?.status === "ready",
      `update to in_review without confirming -> HTTP ${silent.status} ${JSON.stringify(silent.body?.error || "").slice(0, 140)}; study now ${afterSilent?.status}`,
    );

    const reopened = await update({ id: studyId, status: "in_review", reopen: true });
    const afterReopen = await readStudy(studyId);
    add("confirmed reopen allowed", meta.rules[1], reopened.status === 200 && afterReopen?.status === "in_review", `update with reopen -> HTTP ${reopened.status}; study now ${afterReopen?.status}`);

    await new Promise((r) => setTimeout(r, 2000));
    const again = await update({ id: studyId, status: "ready" });
    const last = await readStudy(studyId);
    add(
      "delivery date kept",
      meta.rules[2],
      again.status === 200 && last?.status === "ready" && last?.ready_at === first.ready_at,
      `first delivered ${first.ready_at}; after redelivery ready_at=${last?.ready_at}`,
    );
  } finally {
    if (userId) await ctx.fetchJson(`${rest}/users?id=eq.${userId}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  }
  return out;
}
