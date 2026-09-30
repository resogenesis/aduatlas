// R3-01 (admin side, contract C1) and R3-25 (reply marks read).
//
// C1: support_messages.kind is 'support' (Concierge written support) or
// 'refund_request'. An admin reply is written with the kind of the thread it
// answers, and the Support tab tells a refund request from Concierge support.
// On RC3 refund requests were filed as Concierge support messages, Amy's replies
// to them went into /support, which only Concierge opens, and so never reached a
// Golden or Platinum customer (j5, j7).
//
// R3-25: on RC3 a reply sent from the study drawer left the Concierge thread at
// "1 unread", because only the Support tab's own thread view marked it read.
//
// Fixtures, named with ctx.prefix and removed at the end: two homeowner account
// rows stamped by the service role with a live Concierge PURCHASE, and their
// messages. The second account is then marked refunded, so it has no page where
// a support reply could appear. Replies go through the admin API as the console
// sends them.
export const meta = {
  name: "372 admin support: replies mark the thread read, carry the thread's kind, and never go where nobody reads them",
  rules: [
    "R3-25: replying marks the customer's messages in that thread read",
    "C1: a refund request is its own thread, told apart from Concierge support",
    "C1: a reply to a refund request is stored with kind refund_request",
    "R3-01: a support reply to a customer with no live Concierge plan is refused and nothing is stored",
  ],
};

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `support-${i + 1}`, rule, status: "skip", detail: "no service role key; the fixture cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const adminToken = await ctx.token("admin");
  const call = (route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/studies/${route}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${adminToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  const insert = (table, row) => ctx.fetchJson(`${rest}/${table}`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
  const concierge = (email) => ({ email, paid_tier: "concierge", paid_at: new Date().toISOString(), paid_origin: "purchase" });

  const ids = [];
  try {
    const a = await insert("users", concierge(`${ctx.prefix}-372-a@regress.aduatlas.test`));
    const aId = a.body?.[0]?.id;
    if (!aId) throw new Error(`fixture account A: HTTP ${a.status} ${JSON.stringify(a.body).slice(0, 200)}`);
    ids.push(aId);
    const b = await insert("users", concierge(`${ctx.prefix}-372-b@regress.aduatlas.test`));
    const bId = b.body?.[0]?.id;
    if (!bId) throw new Error(`fixture account B: HTTP ${b.status} ${JSON.stringify(b.body).slice(0, 200)}`);
    ids.push(bId);

    // 1. Reply marks read. A's Concierge question, written without naming a kind
    // (support is the default).
    const q = await insert("support_messages", { user_id: aId, author: "homeowner", body: `${ctx.prefix} 372 support question` });
    const qId = q.body?.[0]?.id;
    if (!qId) throw new Error(`fixture message: HTTP ${q.status} ${JSON.stringify(q.body).slice(0, 200)}`);
    const r1 = await call("reply", { user_id: aId, body: `${ctx.prefix} 372 support answer` });
    const qAfter = (await ctx.fetchJson(`${rest}/support_messages?id=eq.${qId}&select=read_at`, { headers: H })).body?.[0];
    add("reply marks read", meta.rules[0], r1.status === 200 && Boolean(qAfter?.read_at), `reply -> HTTP ${r1.status}; the customer's message read_at=${qAfter?.read_at ?? "null"}`);

    // 2. A refund request is its own thread.
    const rq = await insert("support_messages", { user_id: aId, author: "homeowner", body: `${ctx.prefix} 372 refund request`, kind: "refund_request" });
    if (!rq.body?.[0]?.id) {
      const why = `support_messages has no kind, so a refund request cannot be told apart from Concierge support (insert with kind -> HTTP ${rq.status} ${String(rq.body?.message || "").slice(0, 100)})`;
      add("refund request is its own thread", meta.rules[1], false, why);
      add("refund reply carries its kind", meta.rules[2], false, why);
    } else {
      const threads = await call("threads");
      const mine = (threads.body?.items || []).filter((t) => t.user_id === aId);
      const kinds = mine.map((t) => t.kind).sort();
      add(
        "refund request is its own thread",
        meta.rules[1],
        kinds.length === 2 && kinds[0] === "refund_request" && kinds[1] === "support",
        `the Support tab lists ${mine.length} thread(s) for the customer: ${JSON.stringify(kinds)}`,
      );
      const ambiguous = await call("reply", { user_id: aId, body: `${ctx.prefix} 372 which thread?` });
      const r2 = await call("reply", { user_id: aId, body: `${ctx.prefix} 372 refund answer`, kind: "refund_request" });
      const stored = (await ctx.fetchJson(`${rest}/support_messages?user_id=eq.${aId}&author=eq.admin&body=eq.${encodeURIComponent(`${ctx.prefix} 372 refund answer`)}&select=kind`, { headers: H })).body?.[0];
      add(
        "refund reply carries its kind",
        meta.rules[2],
        r2.status === 200 && stored?.kind === "refund_request" && ambiguous.status === 400,
        `reply kind=refund_request -> HTTP ${r2.status}, stored kind=${stored?.kind ?? "none"}; a reply naming no thread for a customer with both -> HTTP ${ambiguous.status}`,
      );
    }

    // 3. A support reply nobody could read is refused. B wrote while Concierge
    // was live, then was refunded.
    const bq = await insert("support_messages", { user_id: bId, author: "homeowner", body: `${ctx.prefix} 372 question before refund` });
    if (!bq.body?.[0]?.id) throw new Error(`fixture message B: HTTP ${bq.status} ${JSON.stringify(bq.body).slice(0, 200)}`);
    await ctx.fetchJson(`${rest}/users?id=eq.${bId}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ refunded_at: new Date().toISOString() }) });
    const r3 = await call("reply", { user_id: bId, body: `${ctx.prefix} 372 answer nobody can read` });
    const bAdmin = (await ctx.fetchJson(`${rest}/support_messages?user_id=eq.${bId}&author=eq.admin&select=id`, { headers: H })).body || [];
    add(
      "unreadable support reply refused",
      meta.rules[3],
      r3.status === 409 && bAdmin.length === 0,
      `reply to a refunded Concierge customer -> HTTP ${r3.status} ${JSON.stringify(r3.body?.error || "").slice(0, 140)}; admin messages stored: ${bAdmin.length}`,
    );
  } finally {
    for (const id of ids) await ctx.fetchJson(`${rest}/users?id=eq.${id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } }).catch(() => {});
  }
  return out;
}
