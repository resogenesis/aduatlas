// 520: my_government_context() offers only authority the database will honour
// (decisions 2m and 2s; DEF-22; migration 0022).
//
// The government portal draws "May submit", the submit form and the list of
// records from my_government_context(). On RC1, after ADUAtlas withdrew an
// entity's identity verification, the RPC still listed the entity's granted
// jurisdictions with may_submit true while government_may_read_jurisdiction()
// and the submission policy refused every use of them.
//
// Read-only, calling the RPC exactly as the portal does, with the persona's own
// session:
//   gov_withdrawn  keeps its membership in the answer, lists no jurisdiction, and
//                  says may_submit true for none; and the database agrees
//                  (government_may_read_jurisdiction is false for its grant)
//   gov_verified   control: a verified contributor still sees its grant, with
//                  may_submit true, and the database agrees
export const meta = {
  name: "520 government context after withdrawal",
  rules: ["2s D4 withdrawal stops the future", "2m authority is what the database honours", "DEF-22"],
};

const pass = (name, rule, detail) => ({ name, rule, status: "pass", detail });
const fail = (name, rule, detail) => ({ name, rule, status: "fail", detail });

const R_NONE = "after withdrawal the portal is offered no jurisdiction and no may_submit";
const R_KEEP = "after withdrawal the person still sees their membership";
const R_AGREE = "what the context offers is what the database decides";
const R_CONTROL = "control: a verified contributor still sees its grant with may_submit";

const rpc = (ctx, token, fn, args = {}) =>
  ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

const flatten = (context) =>
  (context?.memberships || []).flatMap((m) => (m.jurisdictions || []).map((j) => ({ ...j, entity_id: m.entity_id })));

export default async function (ctx) {
  const out = [];

  // ── the withdrawn government ───────────────────────────────────────────────
  const w = ctx.creds("gov_withdrawn");
  const wt = await ctx.token("gov_withdrawn");
  const wc = await rpc(ctx, wt, "my_government_context");
  if (wc.status !== 200) {
    out.push(fail("withdrawn-context-answers", R_NONE, `my_government_context refused: HTTP ${wc.status}`));
    return out;
  }
  const wj = flatten(wc.body);
  const submittable = wj.filter((j) => j.may_submit === true);
  out.push(submittable.length
    ? fail("withdrawn-entity-offered-no-may-submit", R_NONE, `${submittable.length} jurisdiction(s) offered with may_submit true: ${submittable.map((j) => j.path).join(", ")}`)
    : pass("withdrawn-entity-offered-no-may-submit", R_NONE, "no jurisdiction says may_submit"));
  out.push(wj.length
    ? fail("withdrawn-entity-lists-no-unusable-grant", R_NONE, `${wj.length} jurisdiction(s) still listed: ${wj.map((j) => j.path).join(", ")}`)
    : pass("withdrawn-entity-lists-no-unusable-grant", R_NONE, "no jurisdiction listed"));

  const mine = (wc.body?.memberships || []).find((m) => m.entity_id === w.entity_id);
  out.push(mine && mine.membership_status === "verified" && mine.entity_state !== "verified"
    ? pass("withdrawn-membership-still-shown", R_KEEP, `membership ${mine.membership_status}, entity ${mine.entity_state}`)
    : fail("withdrawn-membership-still-shown", R_KEEP, mine ? `membership ${mine.membership_status}, entity ${mine.entity_state}` : "the membership is missing from the context"));

  const wr = await rpc(ctx, wt, "government_may_read_jurisdiction", { p_jurisdiction_id: w.jurisdiction_id });
  out.push(wr.status === 200 && wr.body === false
    ? pass("withdrawn-database-refuses", R_AGREE, "government_may_read_jurisdiction is false for the withdrawn grant")
    : fail("withdrawn-database-refuses", R_AGREE, `government_may_read_jurisdiction answered HTTP ${wr.status} ${JSON.stringify(wr.body)}`));

  // ── the control ────────────────────────────────────────────────────────────
  const v = ctx.creds("gov_verified");
  const vt = await ctx.token("gov_verified");
  const vc = await rpc(ctx, vt, "my_government_context");
  const vj = vc.status === 200 ? flatten(vc.body) : [];
  const granted = vj.find((j) => j.jurisdiction_id === v.jurisdiction_id);
  const vs = await rpc(ctx, vt, "government_may_submit_as", { p_entity_id: v.entity_id, p_jurisdiction_id: v.jurisdiction_id });
  out.push(granted && granted.may_submit === true && vs.status === 200 && vs.body === true
    ? pass("control-verified-contributor-may-submit", R_CONTROL, "grant listed with may_submit true, and the predicate agrees")
    : fail("control-verified-contributor-may-submit", R_CONTROL,
        `context HTTP ${vc.status}, grant listed: ${Boolean(granted)}, may_submit: ${granted?.may_submit}, predicate HTTP ${vs.status} ${JSON.stringify(vs.body)}`));
  return out;
}
