// 510: "this jurisdiction publishes none" is an answer, not content that makes a
// page indexable (decision 2l; DEF-03; migration 0022).
//
// jurisdiction_coverage_public.is_indexable is the database's one search rule, and
// the sitemap and the rules pages trust it (check 200 repeats no threshold of its
// own, so it cannot see this defect). RC1 counted every published resource toward
// the three-resource threshold, including source_did_not_state findings, so a page
// with nothing verified was indexable.
//
// With the target's service key, this check makes its own published jurisdiction
// under Wyoming, slug and name carrying ctx.prefix, holding three published
// "publishes none" resources and nothing verified, and reads it back AS ANON.
// Afterwards the jurisdiction is unpublished again, so a run leaves nothing public
// behind. Then, read-only and as anon, every indexable row on the target must have
// five verified topics or three resources verified from source.
export const meta = {
  name: "510 indexable counts verified content",
  rules: ["2l no thin pages", "DEF-03"],
};

const pass = (name, rule, detail) => ({ name, rule, status: "pass", detail });
const fail = (name, rule, detail) => ({ name, rule, status: "fail", detail });
const skip = (name, rule, detail) => ({ name, rule, status: "skip", detail });

const R_FIXTURE = "three published 'publishes none' resources and nothing verified do not make a page indexable";
const R_ALL = "every indexable jurisdiction carries five verified topics or three resources verified from source";

const PAGE = 1000;
const hdr = (key, extra = {}) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra });
const why = (r) => `HTTP ${r.status}: ${typeof r.body === "object" ? r.body?.message || JSON.stringify(r.body).slice(0, 200) : String(r.body).slice(0, 200)}`;

const readAll = async (ctx, key, pathAndQuery) => {
  const rows = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      headers: hdr(key, { Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" }),
    });
    if (r.status !== 200 && r.status !== 206) return { ok: false, status: r.status, body: r.body };
    rows.push(...r.body);
    if (r.body.length < PAGE) break;
  }
  return { ok: true, rows };
};

export default async function (ctx) {
  const out = [];
  const rest = (path, opts) => ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${path}`, opts);

  // ── the fixture ────────────────────────────────────────────────────────────
  if (!ctx.serviceKey) {
    out.push(skip("publishes-none-page-not-indexable", R_FIXTURE, "no service key for this target, so the check cannot make its own jurisdiction"));
  } else {
    let jid = null;
    try {
      const st = await rest("jurisdictions?select=id&jurisdiction_type=eq.state&state_code=eq.WY", { headers: hdr(ctx.serviceKey) });
      const parent = st.body?.[0]?.id;
      if (!parent) throw new Error(`no Wyoming state row (${why(st)})`);
      const slug = `${ctx.prefix}-publishes-none`;
      const mk = await rest("jurisdictions?select=id", {
        method: "POST",
        headers: hdr(ctx.serviceKey, { Prefer: "return=representation" }),
        body: JSON.stringify({ jurisdiction_type: "municipality", parent_id: parent, name: `${ctx.prefix} Publishes None`,
                               official_name: `${ctx.prefix} Publishes None`, slug, state_code: "WY", published_at: new Date().toISOString() }),
      });
      jid = mk.body?.[0]?.id;
      if (!jid) throw new Error(`could not create the fixture jurisdiction (${why(mk)})`);
      const today = new Date().toISOString().slice(0, 10);
      const silent = ["adu_handbook", "fee_schedule", "preapproved_plans"].map((t) => ({
        jurisdiction_id: jid, resource_type: t, field_state: "source_did_not_state",
        source_url: `https://www.example.gov/${slug}`, source_type: "city_code", source_checked_date: today,
        review_status: "published", verification_status: "source_checked",
        admin_note: `regression fixture ${ctx.prefix}`,
      }));
      const ins = await rest("government_resources?select=id", {
        method: "POST", headers: hdr(ctx.serviceKey, { Prefer: "return=representation" }), body: JSON.stringify(silent),
      });
      if (!Array.isArray(ins.body) || ins.body.length !== 3) throw new Error(`could not publish the three findings (${why(ins)})`);

      const cov = await rest(`jurisdiction_coverage_public?select=is_indexable,topics_verified,resources_published&jurisdiction_id=eq.${jid}`, { headers: hdr(ctx.anonKey) });
      const row = cov.body?.[0];
      if (!row) {
        out.push(fail("publishes-none-page-not-indexable", R_FIXTURE, `anon read no coverage row for the fixture (${why(cov)})`));
      } else if (row.resources_published !== 3 || row.topics_verified !== 0) {
        out.push(fail("publishes-none-page-not-indexable", R_FIXTURE, `fixture precondition not met: resources_published ${row.resources_published}, topics_verified ${row.topics_verified}`));
      } else {
        out.push(row.is_indexable === false
          ? pass("publishes-none-page-not-indexable", R_FIXTURE, "three findings, nothing verified, is_indexable false")
          : fail("publishes-none-page-not-indexable", R_FIXTURE, "a page holding only three 'publishes none' findings is is_indexable true"));
      }
    } catch (e) {
      out.push(fail("publishes-none-page-not-indexable", R_FIXTURE, String(e?.message || e)));
    } finally {
      if (jid) {
        const un = await rest(`jurisdictions?id=eq.${jid}`, { method: "PATCH", headers: hdr(ctx.serviceKey), body: JSON.stringify({ published_at: null }) });
        if (un.status >= 300) ctx.log(`could not unpublish fixture ${jid}: ${why(un)}`);
      }
    }
  }

  // ── the whole target, read-only, as anon ───────────────────────────────────
  const [cov, res] = await Promise.all([
    readAll(ctx, ctx.anonKey, "jurisdiction_coverage_public?select=jurisdiction_id,jurisdiction_path,topics_verified&is_indexable=eq.true&order=jurisdiction_id"),
    readAll(ctx, ctx.anonKey, "government_resources_public?select=jurisdiction_id&field_state=eq.verified_from_source&order=id"),
  ]);
  if (!cov.ok || !res.ok) {
    out.push(fail("every-indexable-page-has-verified-content", R_ALL, `anon read failed: ${[cov, res].filter((x) => !x.ok).map(why).join("; ")}`));
    return out;
  }
  const verifiedRes = new Map();
  for (const r of res.rows) verifiedRes.set(r.jurisdiction_id, (verifiedRes.get(r.jurisdiction_id) || 0) + 1);
  const thin = cov.rows.filter((c) => c.topics_verified < 5 && (verifiedRes.get(c.jurisdiction_id) || 0) < 3);
  out.push(thin.length
    ? fail("every-indexable-page-has-verified-content", R_ALL, `${thin.length} indexable page(s) without enough verified content: ${thin.slice(0, 5).map((c) => c.jurisdiction_path).join(", ")}`)
    : pass("every-indexable-page-has-verified-content", R_ALL, `${cov.rows.length} indexable page(s), each with enough verified content`));
  return out;
}
