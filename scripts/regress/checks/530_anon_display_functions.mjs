// 530: two display functions are not an anonymous surface (DEF-17; migration 0022).
//
// jurisdiction_rule_stack() and jurisdiction_ancestors() were executable by anon
// on RC1 and failed for anon every time, part way through, reading a base table
// anon cannot read. No page uses them. After 0022 anon is refused AT the function,
// and a signed-in person still reads the rule stack.
//
// Read-only: two anonymous RPC calls and one signed-in RPC call (homeowner_unpaid),
// against the first published jurisdiction the public view lists.
export const meta = {
  name: "530 anon display functions",
  rules: ["2l every anonymous surface answers or is refused at the door", "DEF-17"],
};

const pass = (name, rule, detail) => ({ name, rule, status: "pass", detail });
const fail = (name, rule, detail) => ({ name, rule, status: "fail", detail });

const R_ANON = "anon is refused at the display function, not part way through it";
const R_SIGNED = "control: a signed-in person still reads the rule stack";

const rpc = (ctx, bearer, fn, args) =>
  ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });

const msg = (r) => (typeof r.body === "object" && r.body ? `${r.body.code || ""} ${r.body.message || ""}`.trim() : String(r.body).slice(0, 160));

export default async function (ctx) {
  const out = [];
  const j = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/jurisdictions_public?select=id&jurisdiction_type=eq.state&limit=1`, {
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${ctx.anonKey}` },
  });
  const jid = j.body?.[0]?.id;
  if (!jid) return [fail("anon-display-functions", R_ANON, `no published jurisdiction to call with (HTTP ${j.status})`)];

  for (const fn of ["jurisdiction_rule_stack", "jurisdiction_ancestors"]) {
    const r = await rpc(ctx, ctx.anonKey, fn, { p_jurisdiction_id: jid });
    const m = msg(r);
    // Refused at the door: no EXECUTE (42501 naming this function), or not exposed
    // to anon at all (PGRST202). Anything that started running, or answered, fails.
    const atDoor = r.status >= 400 && (new RegExp(`permission denied for function ${fn}\\b`).test(m) || /PGRST202/.test(m));
    out.push(atDoor
      ? pass(`anon-refused-at-${fn}`, R_ANON, `HTTP ${r.status} ${m}`)
      : fail(`anon-refused-at-${fn}`, R_ANON, `HTTP ${r.status} ${m}`));
  }

  const t = await ctx.token("homeowner_unpaid");
  const s = await rpc(ctx, t, "jurisdiction_rule_stack", { p_jurisdiction_id: jid });
  out.push(s.status === 200 && Array.isArray(s.body)
    ? pass("control-signed-in-rule-stack", R_SIGNED, `HTTP 200, ${s.body.length} row(s)`)
    : fail("control-signed-in-rule-stack", R_SIGNED, `HTTP ${s.status} ${msg(s)}`));
  return out;
}
