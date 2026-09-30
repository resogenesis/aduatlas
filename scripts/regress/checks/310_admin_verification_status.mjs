// DEF-04 (console and API half). Amy's re-save of a rule or resource must never
// quietly change WHO CHECKED IT. On RC1 every console save sent no
// verification_status and the API defaulted it to "unverified", so re-saving a
// rule ADUAtlas had checked, or one another authority disputes, silently
// downgraded it (evidence: refute-d4 33/34). This drives the real admin API with
// the exact key set the console drawer sends when it carries no status, and
// reads the stored row back.
//
// Fixtures: one unpublished jurisdiction named with ctx.prefix, holding one
// published rule (source checked), one draft rule (disputed) and one published
// resource (source checked). The published records are retired at the end.
export const meta = {
  name: "310 admin: an edit keeps the record's verification status",
  rules: [
    "DEF-04: a console-shaped re-save of a source_checked rule keeps source_checked",
    "DEF-04: a console-shaped re-save of a disputed rule keeps disputed",
    "DEF-04: a re-save of a resource that sends no status keeps source_checked",
    "an explicit status on an edit is still honoured",
  ],
};

const today = () => new Date().toISOString().slice(0, 10);

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const adminToken = await ctx.token("admin");
  const api = async (method, route, body) => {
    const r = await ctx.fetchJson(`${ctx.base}/api/admin/regulatory/${route}`, {
      method,
      headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r;
  };
  const must = (r, what) => {
    if (r.status !== 200) throw new Error(`${what}: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    return r.body;
  };

  const m = must(await api("GET", "meta"), "meta");
  const state = (m.states || []).find((s) => s.state_code === "WY") || (m.states || [])[0];
  if (!state) throw new Error("meta returned no state-level jurisdictions");
  const [t1, t2] = m.provision_topics;
  const sourceType = m.source_types[0];
  const kind = m.resource_kinds[0];
  const checked = today();

  const j = must(
    await api("POST", "jurisdiction-save", {
      jurisdiction: {
        type: "city",
        name: `${ctx.prefix} 310 Verification Town`,
        slug: `${ctx.prefix}-310-verification-town`,
        parent_id: state.id,
        is_published: false,
        notes: `${ctx.prefix} regression fixture (310)`,
      },
    }),
    "jurisdiction-save",
  ).jurisdiction;

  // What the console's ProvisionDrawer sends, key for key, when it carries no
  // verification_status: the RC1 drawer's exact payload.
  const consoleProvision = (row) => ({
    id: row.id,
    jurisdiction_id: j.id,
    topic: row.topic_key,
    field_state: row.field_state,
    value_text: row.value_text ?? "",
    source_url: row.source_url ?? "",
    source_document_title: row.source_document_title ?? "",
    source_type: row.source_type ?? "",
    effective_date: row.effective_date ?? "",
    source_checked_date: row.source_checked_date ?? "",
    superseded_date: row.superseded_or_repealed_date ?? "",
    review_status: row.review_status,
    notes: `${ctx.prefix} re-saved as the console would`,
  });

  const created = [];
  try {
    // A published rule ADUAtlas checked.
    const a = must(
      await api("POST", "provision-save", {
        provision: {
          jurisdiction_id: j.id,
          topic_key: t1,
          field_state: "verified_from_source",
          value_text: `${ctx.prefix} 800 square feet`,
          source_url: `https://www.${ctx.prefix}-310.test/code/adu`,
          source_type: sourceType,
          source_checked_date: checked,
          verification_status: "source_checked",
          review_status: "published",
        },
      }),
      "create source_checked rule",
    ).provision;
    created.push(["provision", a.id, a.review_status]);
    const aAfter = await api("POST", "provision-save", { provision: consoleProvision(a) });
    add(
      "console re-save keeps source_checked",
      meta.rules[0],
      aAfter.status === 200 && aAfter.body?.provision?.verification_status === "source_checked",
      `HTTP ${aAfter.status}; stored verification_status after re-save = ${aAfter.body?.provision?.verification_status ?? JSON.stringify(aAfter.body).slice(0, 200)} (was source_checked)`,
    );

    // A draft rule another authority disputes.
    const b = must(
      await api("POST", "provision-save", {
        provision: {
          jurisdiction_id: j.id,
          topic_key: t2,
          field_state: "verified_from_source",
          value_text: `${ctx.prefix} 16 feet`,
          source_url: `https://www.${ctx.prefix}-310.test/code/height`,
          source_type: sourceType,
          source_checked_date: checked,
          verification_status: "disputed",
          review_status: "draft",
        },
      }),
      "create disputed rule",
    ).provision;
    created.push(["provision", b.id, b.review_status]);
    const bAfter = await api("POST", "provision-save", { provision: consoleProvision(b) });
    add(
      "console re-save keeps disputed",
      meta.rules[1],
      bAfter.status === 200 && bAfter.body?.provision?.verification_status === "disputed",
      `HTTP ${bAfter.status}; stored verification_status after re-save = ${bAfter.body?.provision?.verification_status ?? JSON.stringify(bAfter.body).slice(0, 200)} (was disputed)`,
    );

    // An explicit change is still a change: the fix keeps what was NOT sent, it
    // does not freeze the field.
    const bChanged = await api("POST", "provision-save", { provision: { ...consoleProvision(b), verification_status: "source_checked" } });
    add(
      "an explicit status on an edit is honoured",
      meta.rules[3],
      bChanged.status === 200 && bChanged.body?.provision?.verification_status === "source_checked",
      `HTTP ${bChanged.status}; stored = ${bChanged.body?.provision?.verification_status}`,
    );

    // A published resource ADUAtlas checked, re-saved with the resource editor's
    // fields and no status (an older console, or any caller that omits it).
    const r = must(
      await api("POST", "resource-save", {
        resource: {
          jurisdiction_id: j.id,
          kind,
          title: `${ctx.prefix} 310 permit page`,
          url: `https://www.${ctx.prefix}-310.test/permits`,
          field_state: "verified_from_source",
          source_url: `https://www.${ctx.prefix}-310.test/permits`,
          source_type: sourceType,
          source_checked_date: checked,
          verification_status: "source_checked",
          review_status: "published",
        },
      }),
      "create source_checked resource",
    ).resource;
    created.push(["resource", r.id, r.review_status]);
    const rAfter = await api("POST", "resource-save", {
      resource: {
        id: r.id,
        jurisdiction_id: j.id,
        kind: r.resource_type,
        title: r.label,
        url: r.url,
        contact_name: "",
        contact_phone: "",
        contact_email: "",
        field_state: r.field_state,
        source_url: r.source_url,
        source_type: r.source_type,
        source_checked_date: r.source_checked_date,
        review_status: r.review_status,
        notes: `${ctx.prefix} re-saved without a status`,
      },
    });
    add(
      "resource re-save keeps source_checked",
      meta.rules[2],
      rAfter.status === 200 && rAfter.body?.resource?.verification_status === "source_checked",
      `HTTP ${rAfter.status}; stored verification_status after re-save = ${rAfter.body?.resource?.verification_status ?? JSON.stringify(rAfter.body).slice(0, 200)} (was source_checked)`,
    );
  } finally {
    // Take the fixtures off every public surface. Best effort.
    for (const [k, id, status] of created) {
      if (status !== "published") continue;
      if (k === "provision") await api("POST", "provision-retire", { id, superseded_date: today(), note: `${ctx.prefix} regression fixture retired` });
      else await api("POST", "resource-retire", { id, note: `${ctx.prefix} regression fixture retracted` });
    }
  }
  return out;
}
