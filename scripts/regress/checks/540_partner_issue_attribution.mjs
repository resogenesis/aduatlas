// 540: the database records who issued every resident link and code, and audits
// every issue, whoever made it (decision 2p; DEF-18, DEF-24; migration 0022).
//
// This is the database half of issuance, called exactly as a partner's client
// calls it: a PostgREST insert with the partner's own session, naming only the
// partnership, the jurisdiction and a label. (Check 410 drives the portal UI on
// top of this.) On RC1 such a row had created_by_app_user_id NULL and no
// regulatory_audit_log row; only the unexposed admin RPCs recorded either.
//
// As the education_partner persona, one link and one code labelled with
// ctx.prefix are issued and then switched off again by the partner, so a run
// leaves no live resident access behind. With the target's service key the
// check reads the stored issuer and the audit log. Token and code values are
// compared in memory and never printed.
export const meta = {
  name: "540 partner issue attribution",
  rules: ["2p resident access is attributable and audited", "DEF-18", "DEF-24"],
};

const pass = (name, rule, detail) => ({ name, rule, status: "pass", detail });
const fail = (name, rule, detail) => ({ name, rule, status: "fail", detail });
const skip = (name, rule, detail) => ({ name, rule, status: "skip", detail });

const R_ISSUE = "control: an active partner issues a link and a code through its own insert grant";
const R_WHO = "a partner-issued link or code records the person who issued it";
const R_AUDIT = "every issue writes one audit row naming the issuer, and never the token or code";
const R_FORGE = "a client cannot name the issuer itself";

const why = (r) => `HTTP ${r.status}: ${typeof r.body === "object" ? r.body?.message || JSON.stringify(r.body).slice(0, 160) : String(r.body).slice(0, 160)}`;

export default async function (ctx) {
  const out = [];
  const p = ctx.creds("education_partner");
  const tok = await ctx.token("education_partner");
  const asPartner = (path, opts = {}) => ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: ctx.anonKey, Authorization: `Bearer ${tok}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  const asService = (path, opts = {}) => ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json", ...(opts.headers || {}) },
  });

  const made = {};
  try {
    for (const [kind, table, secretCol] of [["link", "partner_access_links", "token"], ["code", "partner_access_codes", "code"]]) {
      // An explicit select list: the partner's column grant does not include the
      // issuer column, so return=representation of every column is refused.
      const r = await asPartner(`${table}?select=id,${secretCol}`, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ partnership_id: p.partnership_id, jurisdiction_id: p.jurisdiction_id, label: `${ctx.prefix}-540-${kind}` }),
      });
      const row = Array.isArray(r.body) ? r.body[0] : null;
      if (r.status !== 201 || !row?.id) {
        out.push(fail(`control-partner-issues-a-${kind}`, R_ISSUE, why(r)));
        continue;
      }
      made[kind] = { id: row.id, table, secret: row[secretCol] };
      out.push(pass(`control-partner-issues-a-${kind}`, R_ISSUE, `HTTP 201`));
    }

    // A client naming the issuer is refused (the column is not in its grant).
    const forged = await asPartner("partner_access_links?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ partnership_id: p.partnership_id, jurisdiction_id: p.jurisdiction_id, label: `${ctx.prefix}-540-forged`,
                             created_by_app_user_id: ctx.creds("homeowner_unpaid").app_user_id }),
    });
    if (forged.status < 300 && Array.isArray(forged.body) && forged.body[0]?.id) {
      made.forged = { id: forged.body[0].id, table: "partner_access_links" };
      out.push(fail("client-cannot-name-the-issuer", R_FORGE, "the insert naming another account as issuer was accepted"));
    } else {
      out.push(pass("client-cannot-name-the-issuer", R_FORGE, `refused, HTTP ${forged.status}`));
    }

    if (!ctx.serviceKey) {
      out.push(skip("partner-issue-records-issuer", R_WHO, "no service key for this target, so the stored issuer cannot be read"));
      out.push(skip("partner-issue-is-audited", R_AUDIT, "no service key for this target, so the audit log cannot be read"));
      return out;
    }

    const who = [];
    const audit = [];
    for (const kind of ["link", "code"]) {
      const m = made[kind];
      if (!m) { who.push(`${kind} was not issued`); audit.push(`${kind} was not issued`); continue; }
      const r = await asService(`${m.table}?select=created_by_app_user_id&id=eq.${m.id}`);
      const by = r.body?.[0]?.created_by_app_user_id;
      if (by !== p.app_user_id) who.push(`${kind} created_by is ${by == null ? "null" : "another account"}`);

      const a = await asService(`regulatory_audit_log?select=action,actor_app_user_id,actor_api_role,changed_fields,before_value,after_value,note&record_id=eq.${m.id}`);
      const rows = Array.isArray(a.body) ? a.body : [];
      const issued = rows.filter((x) => x.action === `partner_${kind}.issued`);
      if (a.status !== 200) audit.push(`${kind}: audit read ${why(a)}`);
      else if (issued.length !== 1) audit.push(`${kind}: ${issued.length} partner_${kind}.issued row(s), expected 1`);
      else if (issued[0].actor_app_user_id !== p.app_user_id) audit.push(`${kind}: audit actor is ${issued[0].actor_app_user_id == null ? "null" : "another account"}`);
      if (m.secret && rows.some((x) => JSON.stringify([x.before_value, x.after_value, x.note]).includes(m.secret))) {
        audit.push(`${kind}: the ${kind === "code" ? "code" : "token"} itself was written to the audit log`);
      }
    }
    out.push(who.length ? fail("partner-issue-records-issuer", R_WHO, who.join("; ")) : pass("partner-issue-records-issuer", R_WHO, "both rows name the issuing partner"));
    out.push(audit.length ? fail("partner-issue-is-audited", R_AUDIT, audit.join("; ")) : pass("partner-issue-is-audited", R_AUDIT, "one issued row each, naming the partner"));
    return out;
  } finally {
    // Leave no live resident access behind: the partner switches both off, and the
    // service key does it if the partner could not.
    for (const m of Object.values(made)) {
      const off = await asPartner(`${m.table}?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ is_active: false }) });
      if (off.status >= 300 && ctx.serviceKey) {
        await asService(`${m.table}?id=eq.${m.id}`, { method: "PATCH", body: JSON.stringify({ is_active: false }) });
      }
    }
  }
}
