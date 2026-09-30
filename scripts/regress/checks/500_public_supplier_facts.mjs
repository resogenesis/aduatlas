// 500: the public rules and resources views say who supplied each record and who
// checked it, and a government's withdrawal never turns its rule into ADUAtlas
// research (decisions 2m and 2t; DEF-02, DEF-04; migration 0022).
//
// Read-only. Anonymous reads of the two public views, exactly as the rules page
// makes them, and (when the target's service key is configured) a comparison of
// every published row against the base tables:
//   1. regulatory_provisions_public answers supplied_by to anon;
//   2. government_resources_public answers supplied_by and verification_status;
//   3. every published rule and resource shows the supplier kind it is stored with,
//      a government name only while that government's identity is verified, and
//      the verification status it is stored with;
//   4. a rule or resource a government supplied before its verification was
//      withdrawn reads government_account with no name beside it (the target's
//      own withdrawn fixtures; skipped, never passed, when the target has none).
export const meta = {
  name: "500 public supplier facts",
  rules: ["2t government-supplied is a separate fact from identity verification", "2m provided by", "DEF-02", "DEF-04"],
};

const pass = (name, rule, detail) => ({ name, rule, status: "pass", detail });
const fail = (name, rule, detail) => ({ name, rule, status: "fail", detail });
const skip = (name, rule, detail) => ({ name, rule, status: "skip", detail });

const R_RULE_COL = "the public rules view carries who supplied each rule (2t)";
const R_RES_COL = "the public resources view carries who supplied and who checked each resource (2t, 2m)";
const R_TRUTH = "every public row states the supplier and checker it is stored with, and names a government only while it is verified";
const R_WITHDRAWN = "a withdrawn government's rule never reads as ADUAtlas research (2t)";

const PAGE = 1000;
const headers = (key) => ({ apikey: key, Authorization: `Bearer ${key}` });

// Every row, page by page: PostgREST caps a response at 1000 rows on staging.
const readAll = async (ctx, key, pathAndQuery) => {
  const rows = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      headers: { ...headers(key), Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" },
    });
    if (r.status !== 200 && r.status !== 206) return { ok: false, status: r.status, body: r.body };
    rows.push(...r.body);
    if (r.body.length < PAGE) break;
  }
  return { ok: true, rows };
};

const why = (r) => `HTTP ${r.status}: ${typeof r.body === "object" ? r.body?.message || JSON.stringify(r.body).slice(0, 200) : String(r.body).slice(0, 200)}`;

export default async function (ctx) {
  const out = [];

  const rules = await readAll(ctx, ctx.anonKey,
    "regulatory_provisions_public?select=id,supplied_by,provided_by_entity_name,provided_by_entity_id,verification_status&order=id");
  out.push(rules.ok
    ? pass("rules-view-answers-supplied-by", R_RULE_COL, `${rules.rows.length} published rules`)
    : fail("rules-view-answers-supplied-by", R_RULE_COL, `anon read of supplied_by refused, ${why(rules)}`));

  const res = await readAll(ctx, ctx.anonKey,
    "government_resources_public?select=id,supplied_by,verification_status,provided_by_entity_name&order=id");
  out.push(res.ok
    ? pass("resources-view-answers-supplier-and-checker", R_RES_COL, `${res.rows.length} published resources`)
    : fail("resources-view-answers-supplier-and-checker", R_RES_COL, `anon read of supplied_by, verification_status refused, ${why(res)}`));

  if (!ctx.serviceKey) {
    out.push(skip("public-rows-match-stored-facts", R_TRUTH, "no service key for this target, so the stored facts cannot be compared"));
    out.push(skip("withdrawn-government-rows-read-government-supplied", R_WITHDRAWN, "no service key for this target"));
    return out;
  }
  if (!rules.ok || !res.ok) {
    out.push(fail("public-rows-match-stored-facts", R_TRUTH, "the public views do not answer the columns, so no row can state its supplier"));
    out.push(fail("withdrawn-government-rows-read-government-supplied", R_WITHDRAWN, "the public views do not answer supplied_by, so a withdrawn government's rule reads exactly like ADUAtlas research"));
    return out;
  }

  const [baseRules, baseRes, entities] = await Promise.all([
    readAll(ctx, ctx.serviceKey, "regulatory_provisions?select=id,supplied_by,supplied_by_entity_id,verification_status&is_published=eq.true&order=id"),
    readAll(ctx, ctx.serviceKey, "government_resources?select=id,supplied_by,supplied_by_entity_id,verification_status&is_published=eq.true&order=id"),
    readAll(ctx, ctx.serviceKey, "government_entities?select=id,name,verification_status&order=id"),
  ]);
  if (!baseRules.ok || !baseRes.ok || !entities.ok) {
    out.push(fail("public-rows-match-stored-facts", R_TRUTH, `service read failed: ${[baseRules, baseRes, entities].filter((x) => !x.ok).map(why).join("; ")}`));
    return out;
  }
  const ent = new Map(entities.rows.map((e) => [e.id, e]));
  const problems = [];
  let withdrawnRows = 0;
  const withdrawnProblems = [];

  const judge = (kind, pub, base) => {
    const byId = new Map(base.map((b) => [b.id, b]));
    for (const p of pub) {
      const b = byId.get(p.id);
      if (!b) continue; // published between the two reads; judged next run
      const e = b.supplied_by_entity_id ? ent.get(b.supplied_by_entity_id) : null;
      const verified = e?.verification_status === "verified";
      if (p.supplied_by !== b.supplied_by) problems.push(`${kind} ${p.id} reads supplied_by ${p.supplied_by}, stored ${b.supplied_by}`);
      if (p.verification_status !== b.verification_status) problems.push(`${kind} ${p.id} reads verification_status ${p.verification_status}, stored ${b.verification_status}`);
      const shouldName = b.supplied_by === "government_account" && verified;
      if (shouldName && p.provided_by_entity_name !== e.name) problems.push(`${kind} ${p.id} does not name its verified government`);
      if (!shouldName && p.provided_by_entity_name) problems.push(`${kind} ${p.id} names a government that is not verified or did not supply it`);
      if (kind === "rule" && !shouldName && p.provided_by_entity_id) problems.push(`rule ${p.id} carries provided_by_entity_id without a verified supplier`);
      if (b.supplied_by === "government_account" && !verified) {
        withdrawnRows += 1;
        if (p.supplied_by !== "government_account" || p.provided_by_entity_name) {
          withdrawnProblems.push(`${kind} ${p.id} reads ${p.supplied_by}${p.provided_by_entity_name ? " with a name" : ""}`);
        }
      }
    }
  };
  judge("rule", rules.rows, baseRules.rows);
  judge("resource", res.rows, baseRes.rows);

  out.push(problems.length
    ? fail("public-rows-match-stored-facts", R_TRUTH, `${problems.length} row(s): ${problems.slice(0, 6).join("; ")}`)
    : pass("public-rows-match-stored-facts", R_TRUTH, `${rules.rows.length} rules and ${res.rows.length} resources agree with the stored facts`));

  if (withdrawnRows === 0) {
    out.push(skip("withdrawn-government-rows-read-government-supplied", R_WITHDRAWN,
      "the target publishes no record supplied by a government whose verification is not current, so this is not proved here (suite 260 proves it on a fresh chain)"));
  } else {
    out.push(withdrawnProblems.length
      ? fail("withdrawn-government-rows-read-government-supplied", R_WITHDRAWN, withdrawnProblems.slice(0, 6).join("; "))
      : pass("withdrawn-government-rows-read-government-supplied", R_WITHDRAWN, `${withdrawnRows} record(s) from withdrawn governments read government_account with no name`));
  }
  return out;
}
