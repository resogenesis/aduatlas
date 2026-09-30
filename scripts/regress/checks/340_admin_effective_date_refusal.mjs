// 0021 refuses to publish a rule before its effective date. The refusal must
// reach Amy as what it is, and must leave nothing behind.
//
// On RC1 the admin API wrote the new rule as a draft first and only then asked
// the database to publish it. When the new rule replaced a published one, the
// database refused the SUPERSESSION of the old rule, so Amy read "a repeal or
// supersession dated ... has not happened yet" about a rule she had not touched,
// and a stray draft stayed behind that blocked her next attempt ("already has an
// open draft for that topic").
//
// Fixture: one unpublished jurisdiction named with ctx.prefix holding one
// published rule, retired at the end.
export const meta = {
  name: "340 admin: a rule is not published before it takes effect, and says so",
  rules: [
    "0021 kept: publishing a replacement dated in the future is refused, naming its effective date",
    "the refusal leaves no stray draft and does not disturb the rule in force",
  ],
};

const day = (o = 0) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);

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
  const j = must(
    await api("POST", "jurisdiction-save", {
      jurisdiction: { type: "city", name: `${ctx.prefix} 340 Effective Town`, slug: `${ctx.prefix}-340-effective-town`, parent_id: state.id, is_published: false, notes: `${ctx.prefix} regression fixture (340)` },
    }),
    "jurisdiction-save",
  ).jurisdiction;
  const rule = (value, extra) => ({
    jurisdiction_id: j.id,
    topic_key: topic,
    field_state: "verified_from_source",
    value_text: value,
    source_url: `https://www.${ctx.prefix}-340.test/code/adu`,
    source_type: m.source_types[0],
    source_checked_date: day(0),
    verification_status: "source_checked",
    ...extra,
  });

  const current = must(await api("POST", "provision-save", { provision: rule(`${ctx.prefix} 750 square feet`, { review_status: "published" }) }), "publish the rule in force").provision;
  try {
    const effective = day(30);
    const r = await api("POST", "provision-save", { provision: rule(`${ctx.prefix} 1,000 square feet`, { effective_date: effective, review_status: "published" }) });
    const msg = String(r.body?.error || "");
    add(
      "future replacement refused with its effective date",
      meta.rules[0],
      r.status === 400 && msg.includes(effective) && /takes effect/i.test(msg) && !/repeal|supersession/i.test(msg),
      `HTTP ${r.status} :: ${msg.slice(0, 240)}`,
    );
    const after = must(await api("GET", `jurisdiction?id=${j.id}`), "read back").provisions || [];
    const stray = after.filter((p) => p.topic_key === topic && p.id !== current.id && ["draft", "in_review"].includes(p.review_status));
    const still = after.find((p) => p.id === current.id);
    add(
      "nothing left behind",
      meta.rules[1],
      stray.length === 0 && still?.review_status === "published" && still?.value_text === current.value_text,
      `stray drafts: ${stray.length}; rule in force: ${still?.review_status}`,
    );
  } finally {
    await api("POST", "provision-retire", { id: current.id, superseded_date: day(0), note: `${ctx.prefix} regression fixture retired` });
  }
  return out;
}
