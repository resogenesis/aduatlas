// DEF-07: /api/course serves the paid course text to exactly the course
// entitlement the product sells, and to no one else.
//
//   anonymous, garbage token, anon key as bearer   -> 401
//   homeowner_unpaid                               -> 403
//   golden_purchased, golden_sponsored             -> 200 with the real text
//   a regress- account stamped as a Golden purchase -> 200 (positive control),
//   then stamped the way api/stripe-webhook.js's charge.refunded path does
//   (paid_at null, refunded_at set)                -> 403,
//   and with paid_at and refunded_at both set      -> 403
//
// The fixture account is created with the service role, named with ctx.prefix,
// and removed at the end. Nothing else is written.
export const meta = { name: "801 course endpoint entitlement", rules: ["DEF-07"] };

const CHAPTER = "m1c1";
const CHAPTER_SENTENCE = "An ADU is designed for independent living";
const QUIZ = "m1quiz";

export default async function (ctx) {
  const out = [];
  const url = (id) => `${ctx.base}/api/course?id=${encodeURIComponent(id)}`;
  const get = (id, token) => ctx.fetchJson(url(id), token ? { headers: { Authorization: `Bearer ${token}` } } : {});
  const push = (name, ok, detail, rule = "DEF-07: course text only for a live course purchase or an admin") =>
    out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  const brief = (r) => `status=${r.status} body=${JSON.stringify(r.body).slice(0, 120)}`;
  const hasText = (r) => r.status === 200 && JSON.stringify(r.body?.sections || []).includes(CHAPTER_SENTENCE);

  // ── Refused callers ────────────────────────────────────────────────────────
  const anon = await get(CHAPTER);
  push("anonymous caller refused 401", anon.status === 401, brief(anon));
  const garbage = await get(CHAPTER, "not-a-real-token");
  push("garbage token refused 401", garbage.status === 401, brief(garbage));
  const anonKey = await get(CHAPTER, ctx.anonKey);
  push("public anon key as bearer refused 401", anonKey.status === 401, brief(anonKey));

  // The server-only text file must never be reachable as a static file or a
  // function of its own (guard; the underscore keeps Vercel from routing it).
  const raw = await ctx.fetchJson(`${ctx.base}/api/_course/content.js`);
  push("server-only course file is not served", !String(typeof raw.body === "string" ? raw.body : JSON.stringify(raw.body)).includes(CHAPTER_SENTENCE), `status=${raw.status}`);

  const unpaid = await get(CHAPTER, await ctx.token("homeowner_unpaid"));
  push("homeowner_unpaid refused 403", unpaid.status === 403, brief(unpaid));

  // ── Entitled callers ───────────────────────────────────────────────────────
  const golden = await get(CHAPTER, await ctx.token("golden_purchased"));
  push("golden_purchased gets the chapter text 200", hasText(golden), brief(golden));
  const cc = golden.headers?.get?.("cache-control") || "";
  push("course text is marked private, no-store", golden.status === 200 && /no-store/.test(cc) && /private/.test(cc), `cache-control=${cc}`, "DEF-07: per-caller answer is never cached by a shared cache");

  const quiz = await get(QUIZ, await ctx.token("golden_purchased"));
  const q0 = quiz.body?.quiz?.questions?.[0];
  push("golden_purchased gets the module quiz 200", quiz.status === 200 && Boolean(q0?.q) && Number.isInteger(q0?.answer), brief(quiz));

  const sponsored = await get(CHAPTER, await ctx.token("golden_sponsored"));
  push("golden_sponsored gets the chapter text 200", hasText(sponsored), brief(sponsored));

  // ── A refunded account, stamped the way the webhook stamps one ──────────────
  if (!ctx.serviceKey) {
    push("refunded account refused 403", false, "no service key: cannot create the fixture account");
    return out;
  }
  const svcHeaders = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const email = `${ctx.prefix}-course-refund@regress.aduatlas.test`;
  const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
  let authId = null;
  let rowId = null;
  try {
    const created = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST", headers: svcHeaders,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix } }),
    });
    authId = created.body?.id || created.body?.user?.id || null;
    if (!authId) throw new Error(`fixture sign-up failed: ${brief(created)}`);

    // handle_new_auth_user() creates the public.users row.
    for (let i = 0; i < 10 && !rowId; i += 1) {
      const rows = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?auth_user_id=eq.${authId}&select=id`, { headers: svcHeaders });
      rowId = Array.isArray(rows.body) && rows.body[0]?.id;
      if (!rowId) await new Promise((r) => setTimeout(r, 500));
    }
    if (!rowId) throw new Error("fixture users row never appeared");

    const stamp = async (patch) => {
      const r = await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?id=eq.${rowId}`, {
        method: "PATCH", headers: { ...svcHeaders, Prefer: "return=minimal" }, body: JSON.stringify(patch),
      });
      if (r.status >= 300) throw new Error(`stamp ${JSON.stringify(patch)} failed: ${brief(r)}`);
    };

    let token = null;
    for (let i = 0; i < 6 && !token; i += 1) {
      const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ctx.anonKey }, body: JSON.stringify({ email, password }),
      });
      if (r.status === 429) { await new Promise((res) => setTimeout(res, 60000)); continue; }
      token = r.ok ? (await r.json()).access_token : null;
      if (!token) throw new Error(`fixture sign-in failed: HTTP ${r.status}`);
    }

    // checkout.session.completed shape: paid_at now, paid_tier roadmap, refunded_at null.
    await stamp({ paid_at: new Date().toISOString(), paid_tier: "roadmap", refunded_at: null });
    const live = await get(CHAPTER, token);
    push("fixture Golden purchase gets the text 200 (control for the refund rows)", hasText(live), brief(live));

    // charge.refunded shape: { paid_at: null, refunded_at: now }.
    await stamp({ paid_at: null, refunded_at: new Date().toISOString() });
    const refunded = await get(CHAPTER, token);
    push("refunded account (webhook shape: paid_at null, refunded_at set) refused 403", refunded.status === 403, brief(refunded));

    await stamp({ paid_at: new Date().toISOString(), refunded_at: new Date().toISOString() });
    const both = await get(CHAPTER, token);
    push("refunded account (paid_at and refunded_at both set) refused 403", both.status === 403, brief(both));
  } catch (e) {
    push("refunded account refused 403", false, String(e?.message || e).slice(0, 300));
  } finally {
    if (rowId) await ctx.fetchJson(`${ctx.supabaseUrl}/rest/v1/users?id=eq.${rowId}`, { method: "DELETE", headers: svcHeaders }).catch(() => null);
    if (authId) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${authId}`, { method: "DELETE", headers: svcHeaders }).catch(() => null);
  }
  return out;
}
