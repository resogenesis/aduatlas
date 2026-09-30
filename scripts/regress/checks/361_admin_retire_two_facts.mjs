// R3-12 and part of R3-25: retiring a rule or a resource records one of two
// DIFFERENT facts (2m), and a refused retirement leaves nothing behind.
//
//   SUPERSEDED  the government replaced or repealed it, with the date.
//   RETRACTED   ADUAtlas's own record was wrong, with the reason.
//
// On RC3 a rule could only be superseded (provision-retire required a date), so a
// rule ADUAtlas got wrong could only be recorded as a government repeal; a
// resource's single Retire always retracted, with retraction_reason null; and a
// refused retirement (a future repeal date, refused by 0021) had already written
// a "State before being superseded" history version (j5).
//
// Fixture, named with ctx.prefix: one UNPUBLISHED jurisdiction holding two
// published rules and two published resources, made through the admin API.
// Everything still published at the end is retired.
export const meta = {
  name: "361 admin: a rule or resource is retracted with a reason or superseded with a date, and a refused retirement writes nothing",
  rules: [
    "R3-12: a rule can be RETRACTED with a reason, and the reason is stored",
    "R3-12: a resource can be SUPERSEDED with the date the jurisdiction replaced it",
    "R3-12: a resource retraction without a reason is refused and changes nothing",
    "R3-12: a resource retraction stores its reason",
    "R3-25: a refused retirement adds no version to the record's history",
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
  const brief = (r) => `HTTP ${r.status} ${JSON.stringify(r.body?.error || r.body?.note || "").slice(0, 160)}`;

  const m = must(await api("GET", "meta"), "meta");
  const state = (m.states || []).find((s) => s.state_code === "WY") || (m.states || [])[0];
  const [topicA, topicB] = m.provision_topics;
  const kinds = m.resource_kinds;
  const domain = `${ctx.prefix}-361.test`;
  const j = must(
    await api("POST", "jurisdiction-save", {
      jurisdiction: { type: "municipality", name: `${ctx.prefix} 361 Retire Town`, slug: `${ctx.prefix}-361-retire-town`, parent_id: state.id, is_published: false },
    }),
    "jurisdiction-save",
  ).jurisdiction;
  const rule = async (topic, value) =>
    must(
      await api("POST", "provision-save", {
        provision: {
          jurisdiction_id: j.id, topic_key: topic, field_state: "verified_from_source", value_text: value,
          source_url: `https://www.${domain}/code/adu`, source_type: m.source_types[0], source_checked_date: day(0),
          verification_status: "source_checked", review_status: "published",
        },
      }),
      `publish ${topic}`,
    );
  const resource = async (kind, n) =>
    must(
      await api("POST", "resource-save", {
        resource: {
          jurisdiction_id: j.id, kind, title: `${ctx.prefix} resource ${n}`, field_state: "verified_from_source",
          url: `https://www.${domain}/r${n}`, source_url: `https://www.${domain}/adu`, source_type: m.source_types[0],
          source_checked_date: day(0), verification_status: "source_checked", review_status: "published",
        },
      }),
      `publish resource ${n}`,
    ).resource;
  const read = async () => must(await api("GET", `jurisdiction?id=${j.id}`), "read back");

  const p1 = (await rule(topicA, `${ctx.prefix} 800 square feet`)).provision;
  const p2 = (await rule(topicB, `${ctx.prefix} 16 feet`)).provision;
  const r1 = await resource(kinds[0], 1);
  const r2 = await resource(kinds[1] || kinds[0], 2);
  const retireAtEnd = [];
  try {
    // 1. Retract a rule, with the reason.
    const reason = `${ctx.prefix} ADUAtlas misread the ordinance (361)`;
    const rp = await api("POST", "provision-retire", { id: p1.id, action: "retract", reason });
    const p1After = ((await read()).provisions || []).find((x) => x.id === p1.id);
    if (p1After?.review_status === "published") retireAtEnd.push(["provision", p1.id]);
    add(
      "rule retracted with its reason",
      meta.rules[0],
      rp.status === 200 && p1After?.review_status === "retracted" && Boolean(p1After?.retracted_at) && p1After?.retraction_reason === reason,
      `${brief(rp)}; stored review_status=${p1After?.review_status} retraction_reason=${p1After?.retraction_reason ?? "null"}`,
    );

    // 2. Supersede a resource, with the date.
    const rs = await api("POST", "resource-retire", { id: r1.id, action: "supersede", superseded_date: day(0) });
    const r1After = ((await read()).resources || []).find((x) => x.id === r1.id);
    if (r1After?.review_status === "published") retireAtEnd.push(["resource", r1.id]);
    add(
      "resource superseded with its date",
      meta.rules[1],
      rs.status === 200 && r1After?.review_status === "superseded" && String(r1After?.superseded_or_repealed_date || "").slice(0, 10) === day(0) && !r1After?.retracted_at,
      `${brief(rs)}; stored review_status=${r1After?.review_status} superseded=${r1After?.superseded_or_repealed_date ?? "null"}`,
    );

    // 3. A resource retraction with no reason is refused.
    const noReason = await api("POST", "resource-retire", { id: r2.id, action: "retract" });
    const r2Mid = ((await read()).resources || []).find((x) => x.id === r2.id);
    add(
      "reasonless retraction refused",
      meta.rules[2],
      noReason.status >= 400 && r2Mid?.review_status === "published",
      `${brief(noReason)}; resource now ${r2Mid?.review_status}`,
    );

    // 4. ... and with the reason it is stored.
    const r2Reason = `${ctx.prefix} wrong link recorded by ADUAtlas (361)`;
    const rr = r2Mid?.review_status === "published" ? await api("POST", "resource-retire", { id: r2.id, action: "retract", reason: r2Reason }) : { status: 0, body: { error: "already retired by the step above" } };
    const r2After = ((await read()).resources || []).find((x) => x.id === r2.id);
    if (r2After?.review_status === "published") retireAtEnd.push(["resource", r2.id]);
    add(
      "resource retraction stores its reason",
      meta.rules[3],
      rr.status === 200 && r2After?.review_status === "retracted" && r2After?.retraction_reason === r2Reason,
      `${brief(rr)}; stored review_status=${r2After?.review_status} retraction_reason=${r2After?.retraction_reason ?? "null"}`,
    );

    // 5. A refused retirement writes no history.
    const versions = async () => (must(await api("GET", `versions?target_kind=provision&target_id=${p2.id}`), "versions").items || []).length;
    const before = await versions();
    const future = await api("POST", "provision-retire", { id: p2.id, action: "supersede", superseded_date: day(10), note: `${ctx.prefix} not yet` });
    const after = await versions();
    const p2After = ((await read()).provisions || []).find((x) => x.id === p2.id);
    if (p2After?.review_status === "published") retireAtEnd.push(["provision", p2.id]);
    add(
      "refused retirement leaves no version",
      meta.rules[4],
      future.status >= 400 && after === before && p2After?.review_status === "published",
      `${brief(future)}; history versions ${before} -> ${after}; rule now ${p2After?.review_status}`,
    );
  } finally {
    for (const [k, id] of retireAtEnd) {
      await api("POST", k === "provision" ? "provision-retire" : "resource-retire", { id, superseded_date: day(0), note: `${ctx.prefix} regression fixture retired` }).catch(() => {});
    }
  }
  return out;
}
