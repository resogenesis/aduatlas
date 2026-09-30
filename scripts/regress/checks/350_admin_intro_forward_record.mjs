// R3-06, contract C2: intro_requests.forwarded_at means ADUAtlas actually
// forwarded the homeowner's message to the builder, and only the real forward
// path writes it.
//
// On RC3 the Introductions tab offered "Introduction sent" as a free status. The
// admin route wrote it, the 0016 trigger stamped forwarded_at on the transition,
// the row read "Forwarded" with no Forward button, and the real forward was then
// refused with 409 "already forwarded" for a builder who had received nothing
// (j3, j5).
//
// Fixture, all named with ctx.prefix and removed at the end: one INACTIVE builder
// listing (so no homeowner surface lists it) with NO contact email, one homeowner
// account row, and one introduction request between them. The introduction is
// driven through the admin API exactly as the console drives it.
//
// NO MAIL CAN LEAVE. intro-forward checks "already forwarded" before it checks
// for a contact email, and refuses a listing without one before it calls the
// email endpoint. So the forward in step 3 answers 409 "already forwarded" where
// the defect is present (the fact under test) and 409 "no contact email" where it
// is fixed, whether or not the target has email configured.
export const meta = {
  name: "350 admin: a status change never records a forward that did not happen (C2)",
  rules: [
    "C2: choosing Introduction sent by hand is refused and stamps no forwarded_at",
    "C2: after a hand status change the introduction still offers Forward (forwarded_at is null)",
    "C2: the real forward is not refused as already forwarded after a hand status change",
    "a hand status change that is allowed (Declined) still works",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `intro-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const adminToken = await ctx.token("admin");
  const api = (method, route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/builders/${route}`, {
      method,
      headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const readIntro = async (id) => (await ctx.fetchJson(`${rest}/intro_requests?id=eq.${id}&select=id,status,forwarded_at`, { headers: H })).body?.[0] || null;

  const email = `${ctx.prefix}-350-home@regress.aduatlas.test`;
  let builderId = null;
  let userId = null;
  try {
    const b = await api("POST", "save", {
      builder: { name: `${ctx.prefix} 350 Intro Builder`, state: "WY", active: false },
    });
    builderId = b.body?.builder?.id || null;
    if (!builderId) throw new Error(`fixture builder: HTTP ${b.status} ${JSON.stringify(b.body).slice(0, 200)}`);
    const u = await ctx.fetchJson(`${rest}/users`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ email }) });
    userId = u.body?.[0]?.id || null;
    if (!userId) throw new Error(`fixture homeowner: HTTP ${u.status} ${JSON.stringify(u.body).slice(0, 200)}`);
    const i = await ctx.fetchJson(`${rest}/intro_requests`, {
      method: "POST",
      headers: { ...H, Prefer: "return=representation" },
      body: JSON.stringify({ user_id: userId, builder_id: builderId, message: `${ctx.prefix} regression fixture introduction (350)` }),
    });
    const introId = i.body?.[0]?.id || null;
    if (!introId) throw new Error(`fixture introduction: HTTP ${i.status} ${JSON.stringify(i.body).slice(0, 200)}`);

    // 1. The hand status change that used to claim a forward.
    const manual = await api("POST", "intro-update", { id: introId, status: "sent" });
    const afterManual = await readIntro(introId);
    add(
      "hand 'sent' refused, nothing stamped",
      meta.rules[0],
      manual.status >= 400 && afterManual?.forwarded_at == null && afterManual?.status === "requested",
      `intro-update status=sent -> HTTP ${manual.status} ${JSON.stringify(manual.body).slice(0, 160)}; row now status=${afterManual?.status} forwarded_at=${afterManual?.forwarded_at ?? "null"}`,
    );

    // 2. What the Introductions tab reads to decide whether Forward is offered.
    const list = await api("GET", "intros");
    const row = (list.body?.items || []).find((x) => x.id === introId);
    add(
      "Forward still offered",
      meta.rules[1],
      Boolean(row) && row.forwarded_at == null,
      row ? `the tab reads forwarded_at=${row.forwarded_at ?? "null"} status=${row.status}` : `introduction not in builders/intros (HTTP ${list.status})`,
    );

    // 3. The real forward. The fixture has no contact email, so a refusal to SEND
    // is expected; a refusal because it was "already forwarded" is the defect.
    const fwd = await api("POST", "intro-forward", { id: introId });
    const afterFwd = await readIntro(introId);
    const alreadyRefusal = fwd.status === 409 && (fwd.body?.already_forwarded || /already forwarded/i.test(String(fwd.body?.error || "")));
    const sentOk = fwd.status === 200 && fwd.body?.sent === true && Boolean(afterFwd?.forwarded_at);
    const notSent = fwd.status !== 200 && !alreadyRefusal && afterFwd?.forwarded_at == null;
    add(
      "real forward not blocked",
      meta.rules[2],
      !alreadyRefusal && (sentOk || notSent),
      `intro-forward -> HTTP ${fwd.status} ${JSON.stringify(fwd.body).slice(0, 180)}; row forwarded_at=${afterFwd?.forwarded_at ?? "null"}`,
    );

    // 4. Positive control: a hand change that claims nothing still works.
    const decline = await api("POST", "intro-update", { id: introId, status: "declined" });
    const afterDecline = await readIntro(introId);
    add(
      "Declined by hand works",
      meta.rules[3],
      decline.status === 200 && afterDecline?.status === "declined",
      `intro-update status=declined -> HTTP ${decline.status}; row status=${afterDecline?.status}`,
    );
  } finally {
    if (builderId) await api("POST", "delete", { id: builderId }).catch(() => {});
    if (userId) await ctx.fetchJson(`${rest}/users?id=eq.${userId}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  }
  return out;
}
