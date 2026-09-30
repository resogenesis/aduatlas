// T4-15, T4-16, T4-17 and T4-18 (RC4 rehearsal): four minor defects in builder
// messaging, each checked as the person involved SEES it.
//
//   T4-15  After a listing is TRANSFERRED (released, then linked to another
//          builder account), the new owner's portal labelled the previous
//          owner's replies "You", in the thread and in the list preview.
//   T4-16  The builder dashboard's "Homeowner inquiries" tile counted a thread a
//          homeowner opened and never wrote in (0011's trigger records
//          builder_contacted when the thread is created).
//   T4-17  After ADUAtlas released the listing, the homeowner's thread still
//          said the builder that claimed the listing can read the messages.
//   T4-18  After the homeowner's plan ended, /messages said "A builder" and the
//          thread lost "View this builder's profile", although a builder's name
//          and profile page are public (decision 2a).
//   F21    RC4a review, finding 21. RLS on builder_conversations (0011) returns a
//          thread to its homeowner OR to the owner of its listing, whatever the
//          account's role, so an account can be on both sides. A homeowner an
//          admin later made a builder saw its OWN homeowner threads in the
//          builder portal as threads on its listing (other companies' replies
//          labelled "You" or with its company name) and in its dashboard counts
//          (an empty one taken off its inquiries). Made a homeowner again while
//          still owning the listing, it saw the listing's threads on /messages
//          with other homeowners' messages labelled "You".
//
// Fixtures, all created here with the service role, named ${ctx.prefix}-864-*
// (no other check in the same run shares that namespace) and removed at the
// end: a Golden homeowner who signs in (stamped the way api/stripe-webhook.js
// stamps a paid session), a second homeowner row with no login (the one who
// opens a thread and never writes), two builder accounts (A, the first owner,
// and B, the account the listing is transferred to), and one approved, active
// listing A has claimed. The homeowner opens the conversation and writes, and A
// replies, through the REST API with their own sessions, so RLS in 0011 decides
// exactly as it does for the product. The transfer and the release go through
// the admin console's own routes (/api/admin/builders/unlink-owner and
// link-owner) as the staging admin persona.
//
// Order of events, so each rule reads the state it is about:
//   1. A owns the listing: the homeowner writes, A replies, the second homeowner
//      opens an empty thread. The admin releases the listing and links B.
//   2. The homeowner (paid) signs in: the builder's name on /messages and the
//      thread's "can read" sentence while the listing is claimed are the
//      CONTROLS for 4 and 3.
//   3. B signs in: the list preview and the thread (1), then B replies and its
//      own reply is the "You" control; the dashboard tiles (2).
//   4. The homeowner's plan ends (refunded_at): the name and the profile link on
//      /messages (4).
//   5. The admin releases the listing: the homeowner's thread sentence (3).
//   6. One account on both sides (5 and 6), in its own try so a failure there
//      cannot lose the results above. A fourth account D, a paid homeowner,
//      messages listing Z (owned by A, released in step 1), and A replies; D
//      opens an empty thread with listing Y (owned by B, released in step 5).
//      D's role is then set to "pro" the way the admin console's update-user
//      writes it (users.role, with the service role here so the rule stays
//      about what the pages show) and D is given listing M; A replies again,
//      after M's claim began. The second homeowner's thread on M and its first
//      message are written with the service role, and D replies there through
//      REST as M's builder. D signs in: the portal list, a direct visit to the
//      Z thread, the labels on the M thread (D's reply as "You" and the
//      homeowner line are the controls) and the dashboard tiles (5). D's role
//      is set back to "homeowner", keeping M: /messages and a direct visit to
//      the M thread, with D's own Z thread and its "You" as the control (6).
//
// On RC4 every rule fails on its behavioural half: the controls hold there.
// Passwords are random per run and the accounts are deleted at the end. A failed
// sign-in is still reported with the typed values redacted, because a
// Playwright fill() error repeats the value it was typing.
export const meta = {
  name: "864 builder messaging minors (T4-15, T4-16, T4-17, T4-18, RC4a finding 21)",
  rules: [
    "T4-15: after a listing transfer, the new owner's portal labels only its own replies You, never the previous owner's",
    "T4-16: the builder dashboard's Homeowner inquiries count leaves out a conversation with no homeowner message",
    "T4-17: after ADUAtlas releases the listing, the homeowner's thread no longer says a builder can read the messages, and says a reply may not come",
    "T4-18: after the homeowner's plan ends, /messages still shows the builder's public name and its public profile link",
    "F21 builder side: an account that owns a listing and also has homeowner threads sees only its listing's threads in the portal and in the dashboard's Conversations and Homeowner inquiries tiles",
    "F21 homeowner side: an account made a homeowner while it still owns a listing sees only its own homeowner threads on /messages, never the listing's threads",
  ],
};

const DESKTOP = { viewport: { width: 1280, height: 900 } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const flat = (s) => String(s || "").replace(/\s+/g, " ").trim();
const redact = (text, secrets) => secrets.filter(Boolean).reduce((s, v) => s.split(v).join("[redacted]"), String(text || ""));
// Waits for the locator, unlike isVisible(), which answers at once.
const seen = (loc, timeout = 15000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);

export default async function (ctx) {
  const out = [];
  const add = (name, rule, ok, detail) => out.push({ name, rule, status: ok ? "pass" : "fail", detail });
  if (!ctx.serviceKey) return meta.rules.map((rule, i) => ({ name: `messaging-minors-${i + 1}`, rule, status: "skip", detail: "no service role key in REGRESS_ENV_FILE; fixtures cannot be created" }));

  const rest = `${ctx.supabaseUrl}/rest/v1`;
  const H = { apikey: ctx.serviceKey, Authorization: `Bearer ${ctx.serviceKey}`, "Content-Type": "application/json" };
  const svc = (p, o = {}) => ctx.fetchJson(`${rest}/${p}`, { ...o, headers: { ...H, ...(o.headers || {}) } });
  const asUser = (token) => ({ apikey: ctx.anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
  const brief = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 160)}`;

  const made = { auth: [], users: [], builders: [] };
  const mkAccount = async (tag, role) => {
    const email = `${ctx.prefix}-864-${tag}@regress.aduatlas.test`;
    const password = `R${Math.random().toString(36).slice(2)}!${Date.now().toString(36)}`;
    const c = await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST", headers: H,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { regress: ctx.prefix, ...(role ? { role } : {}) } }),
    });
    const authId = c.body?.id || c.body?.user?.id;
    if (!authId) throw new Error(`fixture ${tag} sign-up failed: HTTP ${c.status}`);
    made.auth.push(authId);
    let rowId = null;
    for (let i = 0; i < 12 && !rowId; i += 1) {
      const r = await svc(`users?auth_user_id=eq.${authId}&select=id`);
      rowId = Array.isArray(r.body) && r.body[0]?.id;
      if (!rowId) await sleep(400);
    }
    if (!rowId) throw new Error(`fixture ${tag} users row never appeared`);
    made.users.push(rowId);
    let token = null;
    for (let i = 0; i < 6 && !token; i += 1) {
      const r = await fetch(`${ctx.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: ctx.anonKey }, body: JSON.stringify({ email, password }),
      });
      if (r.status === 429) { await sleep(60000); continue; }
      if (!r.ok) throw new Error(`fixture ${tag} sign-in failed: HTTP ${r.status}`);
      token = (await r.json()).access_token;
    }
    return { tag, email, password, authId, rowId, token };
  };
  const signIn = async (page, acct) => {
    try {
      await page.goto(`${ctx.base}/login`, { waitUntil: "networkidle" });
      await page.locator("main input[type=email]").waitFor({ state: "visible" });
      await page.fill("main input[type=email]", acct.email);
      await page.fill("main input[type=password]", acct.password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }), page.click("main button[type=submit]")]);
    } catch (e) {
      throw new Error(`sign-in through /login failed for the ${acct.tag} fixture: ${redact(e?.message, [acct.password, acct.email]).slice(0, 240)}`);
    }
  };
  const must = (r, what) => {
    if (r.status < 200 || r.status >= 300) throw new Error(`${what}: ${brief(r)}`);
    return r.body;
  };

  // The admin console's own ownership routes, as the staging admin persona.
  const adminToken = await ctx.token("admin");
  const admin = (route, body) =>
    ctx.fetchJson(`${ctx.base}/api/admin/builders/${route}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  // The sentence under the thread heading on /messages/:id.
  const threadIntro = async (page) => {
    const h1 = page.getByRole("heading", { level: 1 }).first();
    await h1.waitFor({ state: "visible" });
    const p = h1.locator("xpath=following-sibling::p[1]");
    // The sentence waits for the builder read on the fixed page; give it time.
    for (let i = 0; i < 40; i += 1) {
      const t = flat(await p.innerText().catch(() => ""));
      if (t) return t;
      await sleep(250);
    }
    return "";
  };
  // A dashboard tile's value, by its exact label. Waits until it is a number.
  const tileValue = async (page, label) => {
    const read = () =>
      page.evaluate((l) => {
        const el = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === l);
        return el?.nextElementSibling ? el.nextElementSibling.textContent.trim() : null;
      }, label);
    let v = null;
    for (let i = 0; i < 80; i += 1) {
      v = await read();
      if (v != null && /^\d[\d,]*$/.test(v)) return { value: Number(v.replace(/,/g, "")), raw: v };
      await sleep(250);
    }
    return { value: null, raw: v };
  };

  // Section 6 (F21). Reads the fixtures of section 1 through these, set there.
  const fx = {};
  const dualSecrets = {};
  const openThread = async (acct, builderId, what) => {
    const row = must(await ctx.fetchJson(`${rest}/builder_conversations?select=id`, {
      method: "POST", headers: { ...asUser(acct.token), Prefer: "return=representation" }, body: JSON.stringify({ builder_id: builderId }),
    }), what)?.[0];
    if (!row?.id) throw new Error(`${what}: no id returned`);
    return row.id;
  };
  const write = async (acct, conversationId, author, body, what) =>
    must(await ctx.fetchJson(`${rest}/builder_messages`, {
      method: "POST", headers: { ...asUser(acct.token), Prefer: "return=minimal" },
      body: JSON.stringify({ conversation_id: conversationId, author, body }),
    }), what);
  const newListing = async (tag, name, ownerRowId) => {
    // No claimed_at: 0007's builders_on_claim stamps it with the database's now().
    const row = must(await svc("builders", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ slug: `${ctx.prefix}-864-${tag}`, name, state: "AZ", profile_status: "approved", active: true, owner_user_id: ownerRowId }),
    }), `listing ${tag}`)?.[0];
    if (!row?.id) throw new Error(`listing ${tag}: no id returned`);
    made.builders.push(row.id);
    return row;
  };
  const setRole = async (acct, role) =>
    must(await svc(`users?id=eq.${acct.rowId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ role }) }), `role ${role} for ${acct.tag}`);
  const lastLabel = async (page, text) => flat(await page.locator("li", { hasText: text }).first().locator("p").last().innerText().catch(() => ""));
  const bothSides = async () => {
    const { proA, proB, quiet } = fx;
    const dual = await mkAccount("dual");
    Object.assign(dualSecrets, { password: dual.password, email: dual.email });
    must(await svc(`users?id=eq.${dual.rowId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ paid_at: new Date().toISOString(), paid_tier: "roadmap", paid_origin: "purchase", refunded_at: null }),
    }), "dual paid stamp");
    const zName = `Regress 864 Zed Builders ${ctx.prefix}`;
    const z = await newListing("zed", zName, proA.rowId);
    const y = await newListing("why", `Regress 864 Why Builders ${ctx.prefix}`, proB.rowId);

    // D as a homeowner: a thread with Z that A answers, and an empty one with Y.
    const onZ = await openThread(dual, z.id, "dual opens a thread with Z");
    const dualText = `Question from the dual account, ${ctx.prefix}. Do you pour foundations?`;
    await write(dual, onZ, "homeowner", dualText, "dual's homeowner message");
    const aEarly = `Z answers the dual account before its claim, ${ctx.prefix}.`;
    await write(proA, onZ, "builder", aEarly, "Z's first reply");
    await openThread(dual, y.id, "dual opens an empty thread with Y");

    // D becomes a builder and owns M. A replies again, after M's claim began.
    await setRole(dual, "pro");
    const mName = `Regress 864 Dual Builders ${ctx.prefix}`;
    const m = await newListing("dual", mName, dual.rowId);
    const aLate = `Z answers the dual account after its claim, ${ctx.prefix}.`;
    await write(proA, onZ, "builder", aLate, "Z's second reply");
    // A real conversation on M: the second homeowner's thread (0011's trigger
    // records builder_contacted for it) and its first message, then D's reply.
    const onM = must(await svc("builder_conversations", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ builder_id: m.id, homeowner_user_id: quiet.id }),
    }), "thread on M")?.[0]?.id;
    if (!onM) throw new Error("thread on M: no id returned");
    const quietText = `Hello from a homeowner on M, ${ctx.prefix}. Are you taking new projects?`;
    must(await svc("builder_messages", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ conversation_id: onM, author: "homeowner", body: quietText }),
    }), "homeowner message on M");
    const dualReply = `Reply from M, the dual account's listing, ${ctx.prefix}. We are.`;
    const replied = await ctx.fetchJson(`${rest}/builder_messages`, {
      method: "POST", headers: { ...asUser(dual.token), Prefer: "return=minimal" },
      body: JSON.stringify({ conversation_id: onM, author: "builder", body: dualReply }),
    });

    const dctx = await browser.newContext(DESKTOP);
    try {
      const dp = await dctx.newPage();
      dp.setDefaultTimeout(20000);
      await signIn(dp, dual);

      // The portal (5).
      await dp.goto(`${ctx.base}/builder/messages`, { waitUntil: "networkidle" });
      const mListed = await seen(dp.locator(`a[href="/builder/messages/${onM}"]`));
      const zListed = await dp.locator(`a[href="/builder/messages/${onZ}"]`).count();
      await dp.goto(`${ctx.base}/builder/messages/${onZ}`, { waitUntil: "networkidle" });
      const zRefused = await seen(dp.getByText("That conversation is not available."), 15000);
      const zShown = [];
      for (const [what, text] of [["D's own message", dualText], ["Z's earlier reply", aEarly], ["Z's later reply", aLate]]) {
        if (await dp.getByText(text).count()) zShown.push(`${what} labelled "${(await lastLabel(dp, text)).slice(0, 60)}"`);
      }
      await dp.goto(`${ctx.base}/builder/messages/${onM}`, { waitUntil: "networkidle" });
      const sawQuiet = await seen(dp.locator("li", { hasText: quietText }));
      const sawReply = await seen(dp.locator("li", { hasText: dualReply }));
      const quietLabel = sawQuiet ? await lastLabel(dp, quietText) : "";
      const replyLabel = sawReply ? await lastLabel(dp, dualReply) : "";
      await dp.goto(`${ctx.base}/builder`, { waitUntil: "networkidle" });
      const inquiries = await tileValue(dp, "Homeowner inquiries");
      const conversations = await tileValue(dp, "Conversations");
      add(
        "dual-account-portal-shows-only-its-listing",
        meta.rules[4],
        mListed && zListed === 0 && zRefused && zShown.length === 0 && /^Homeowner\b/.test(quietLabel) && replied.status === 201 && /^You\b/.test(replyLabel)
          && inquiries.value === 1 && conversations.value === 1,
        `portal list: M's thread ${mListed ? "listed" : "absent"}, D's own homeowner thread with Z listed ${zListed} time(s); Z thread by address: ${zRefused ? "not available" : "opened"}${zShown.length ? `, shows ${zShown.join("; ")}` : ""}; M thread (controls): homeowner line labelled "${quietLabel.slice(0, 60) || "not shown"}", D's reply (insert ${replied.status}) labelled "${replyLabel.slice(0, 60) || "not shown"}"; dashboard: Homeowner inquiries ${inquiries.raw ?? "not shown"}, Conversations ${conversations.raw ?? "not shown"} (expected 1 and 1: one written thread on M, none empty; D's written Z thread and empty Y thread are not M's)`
      );

      // /messages as a homeowner who still owns M (6).
      await setRole(dual, "homeowner");
      await dp.goto(`${ctx.base}/messages`, { waitUntil: "networkidle" });
      const landed = new URL(dp.url()).pathname;
      const zOwnListed = await seen(dp.locator(`a[href="/messages/${onZ}"]`));
      const mOnMessages = await dp.locator(`a[href="/messages/${onM}"]`).count();
      await dp.goto(`${ctx.base}/messages/${onM}`, { waitUntil: "networkidle" });
      const mRefused = await seen(dp.getByText("That conversation is not available."), 15000);
      const mShown = [];
      for (const [what, text] of [["the other homeowner's message", quietText], ["M's reply", dualReply]]) {
        if (await dp.getByText(text).count()) mShown.push(`${what} labelled "${(await lastLabel(dp, text)).slice(0, 60)}"`);
      }
      await dp.goto(`${ctx.base}/messages/${onZ}`, { waitUntil: "networkidle" });
      const sawOwn = await seen(dp.locator("li", { hasText: dualText }));
      const ownLabel = sawOwn ? await lastLabel(dp, dualText) : "";
      add(
        "dual-account-messages-shows-only-its-own",
        meta.rules[5],
        zOwnListed && mOnMessages === 0 && mRefused && mShown.length === 0 && /^You\b/.test(ownLabel),
        `/messages (landed on ${landed}): D's own thread with Z ${zOwnListed ? "listed" : "absent"}, the other homeowner's thread on M listed ${mOnMessages} time(s); M thread by address: ${mRefused ? "not available" : "opened"}${mShown.length ? `, shows ${mShown.join("; ")}` : ""}; control: D's own message on the Z thread labelled "${ownLabel.slice(0, 60) || "not shown"}"`
      );
    } finally {
      await dctx.close().catch(() => {});
    }
  };

  let browser;
  try {
    // ── 1. Fixtures, the conversation, and the transfer ─────────────────────
    const home = await mkAccount("home");
    must(await svc(`users?id=eq.${home.rowId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ paid_at: new Date().toISOString(), paid_tier: "roadmap", paid_origin: "purchase", refunded_at: null }),
    }), "paid stamp");
    const quiet = must(await svc("users", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ email: `${ctx.prefix}-864-quiet@regress.aduatlas.test`, role: "homeowner" }),
    }), "second homeowner row")?.[0];
    if (!quiet?.id) throw new Error("second homeowner row: no id returned");
    made.users.push(quiet.id);
    const proA = await mkAccount("pro-a", "pro");
    const proB = await mkAccount("pro-b", "pro");
    Object.assign(fx, { proA, proB, quiet });

    const listingName = `Regress 864 Builders ${ctx.prefix}`;
    const listing = must(await svc("builders", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug: `${ctx.prefix}-864-listing`, name: listingName, state: "AZ", profile_status: "approved", active: true,
        owner_user_id: proA.rowId, claimed_at: new Date().toISOString(),
      }),
    }), "fixture listing")?.[0];
    if (!listing?.id) throw new Error("fixture listing: no id returned");
    made.builders.push(listing.id);

    const conv = must(await ctx.fetchJson(`${rest}/builder_conversations?select=id`, {
      method: "POST", headers: { ...asUser(home.token), Prefer: "return=representation" }, body: JSON.stringify({ builder_id: listing.id }),
    }), "homeowner opens the conversation")?.[0];
    if (!conv?.id) throw new Error("homeowner conversation: no id returned");
    const homeText = `Hello from ${ctx.prefix}. Do you build detached ADUs in Tucson?`;
    must(await ctx.fetchJson(`${rest}/builder_messages`, {
      method: "POST", headers: { ...asUser(home.token), Prefer: "return=minimal" },
      body: JSON.stringify({ conversation_id: conv.id, author: "homeowner", body: homeText }),
    }), "homeowner message");
    const aText = `Reply from the first owner, ${ctx.prefix}. Yes, we build them.`;
    must(await ctx.fetchJson(`${rest}/builder_messages`, {
      method: "POST", headers: { ...asUser(proA.token), Prefer: "return=minimal" },
      body: JSON.stringify({ conversation_id: conv.id, author: "builder", body: aText }),
    }), "first owner's reply");
    // The thread a homeowner opened and never wrote in. The 0011 trigger records
    // builder_contacted for it, exactly as for a thread made through the page.
    must(await svc("builder_conversations", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ builder_id: listing.id, homeowner_user_id: quiet.id }),
    }), "empty thread");

    must(await admin("unlink-owner", { id: listing.id }), "release the first owner");
    must(await admin("link-owner", { id: listing.id, email: proB.email }), "link the new owner");
    const owned = (await svc(`builders?id=eq.${listing.id}&select=owner_user_id,claimed_at`)).body?.[0];
    if (owned?.owner_user_id !== proB.rowId) throw new Error(`transfer did not land: owner is ${owned?.owner_user_id ?? "null"}`);

    browser = await ctx.launch();

    // ── 2. The homeowner while paid and the listing claimed (controls) ──────
    const hctx = await browser.newContext(DESKTOP);
    const hp = await hctx.newPage();
    hp.setDefaultTimeout(20000);
    await signIn(hp, home);
    await hp.goto(`${ctx.base}/messages`, { waitUntil: "networkidle" });
    const listItem = hp.locator(`a[href="/messages/${conv.id}"]`);
    await seen(listItem);
    const namedWhilePaid = await seen(listItem.filter({ hasText: listingName }), 15000);
    await hp.goto(`${ctx.base}/messages/${conv.id}`, { waitUntil: "networkidle" });
    await seen(hp.getByText(aText));
    const claimedIntro = await threadIntro(hp);
    const assertsReader = (t) => /has claimed this listing can read your messages/i.test(t);

    // ── 3. The new owner: labels (T4-15) and the dashboard (T4-16) ──────────
    const bctx = await browser.newContext(DESKTOP);
    const bp = await bctx.newPage();
    bp.setDefaultTimeout(20000);
    await signIn(bp, proB);
    await bp.goto(`${ctx.base}/builder/messages`, { waitUntil: "networkidle" });
    const bItem = bp.locator(`a[href="/builder/messages/${conv.id}"]`);
    const listed = await seen(bItem);
    // The preview is the last line, the first owner's reply. Let the page finish
    // choosing its prefix before reading it.
    if (listed) await seen(bItem.filter({ hasText: aText.slice(0, 30) }));
    await sleep(1500);
    const preview = listed ? flat(await bItem.first().innerText()) : "";
    const previewSaysYou = new RegExp(`You:\\s*${aText.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(preview);

    const bText = `Reply from the new owner, ${ctx.prefix}. We can visit next week.`;
    const bSent = await ctx.fetchJson(`${rest}/builder_messages`, {
      method: "POST", headers: { ...asUser(proB.token), Prefer: "return=minimal" },
      body: JSON.stringify({ conversation_id: conv.id, author: "builder", body: bText }),
    });
    await bp.goto(`${ctx.base}/builder/messages/${conv.id}`, { waitUntil: "networkidle" });
    const sawA = await seen(bp.locator("li", { hasText: aText }));
    const sawB = await seen(bp.locator("li", { hasText: bText }));
    const labelOf = async (text) => flat(await bp.locator("li", { hasText: text }).first().locator("p").last().innerText().catch(() => ""));
    const aLabel = sawA ? await labelOf(aText) : "";
    const bLabel = sawB ? await labelOf(bText) : "";
    const aIsYou = /^You\b/.test(aLabel);
    const bIsYou = /^You\b/.test(bLabel);
    add(
      "transfer-previous-owner-not-you",
      meta.rules[0],
      listed && !previewSaysYou && sawA && !aIsYou && bSent.status === 201 && sawB && bIsYou,
      `list preview: "${preview.slice(0, 160)}" (says You for the first owner's reply: ${previewSaysYou}); first owner's reply labelled "${aLabel.slice(0, 80) || "not shown"}"; new owner's own reply (control, insert ${bSent.status}) labelled "${bLabel.slice(0, 80) || "not shown"}"`
    );

    await bp.goto(`${ctx.base}/builder`, { waitUntil: "networkidle" });
    const inquiries = await tileValue(bp, "Homeowner inquiries");
    const conversations = await tileValue(bp, "Conversations");
    const events = await svc(`referral_events?builder_id=eq.${listing.id}&kind=eq.builder_contacted&select=id`);
    const eventCount = Array.isArray(events.body) ? events.body.length : null;
    add(
      "inquiries-leave-out-empty-thread",
      meta.rules[1],
      inquiries.value === 1 && conversations.value === 1,
      `Homeowner inquiries tile: ${inquiries.raw ?? "not shown"} (expected 1: one thread a homeowner wrote in, one empty thread, no introduction request); Conversations tile: ${conversations.raw ?? "not shown"}; builder_contacted events for the listing: ${eventCount ?? brief(events)}`
    );
    await bctx.close();

    // ── 4. The homeowner's plan ends (T4-18) ────────────────────────────────
    must(await svc(`users?id=eq.${home.rowId}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ refunded_at: new Date().toISOString() }),
    }), "refund stamp");
    const paidView = await ctx.fetchJson(`${rest}/builders_public?id=eq.${listing.id}&select=id`, { headers: asUser(home.token) });
    const publicView = await ctx.fetchJson(`${rest}/builders_public_profile?id=eq.${listing.id}&select=id,slug,name,claimed`, { headers: asUser(home.token) });
    const publicRow = Array.isArray(publicView.body) ? publicView.body[0] : null;
    await hp.goto(`${ctx.base}/messages`, { waitUntil: "networkidle" });
    await seen(listItem);
    const namedAfter = await seen(listItem.filter({ hasText: listingName }), 15000);
    await hp.goto(`${ctx.base}/messages/${conv.id}`, { waitUntil: "networkidle" });
    await seen(hp.getByText(aText));
    const profileLink = hp.getByRole("link", { name: /view this builder's profile/i });
    const hasLink = await seen(profileLink, 15000);
    const linkHref = hasLink ? await profileLink.first().getAttribute("href") : null;
    const heading = flat(await hp.getByRole("heading", { level: 1 }).first().innerText().catch(() => ""));
    add(
      "plan-ended-keeps-public-name-and-link",
      meta.rules[3],
      namedWhilePaid && namedAfter && heading === listingName && hasLink && linkHref === `/builders/${listing.slug}` && publicRow?.name === listingName,
      `while paid (control): name on /messages ${namedWhilePaid}; after the plan ended: name on /messages ${namedAfter}, thread heading "${heading.slice(0, 80)}", profile link ${hasLink ? linkHref : "absent"}; the refunded session reads the paid view as ${brief(paidView)} and the public profile view as ${publicRow ? `the listing (claimed ${publicRow.claimed})` : brief(publicView)}`
    );

    // ── 5. ADUAtlas releases the listing (T4-17) ────────────────────────────
    must(await admin("unlink-owner", { id: listing.id }), "release the new owner");
    await hp.goto(`${ctx.base}/messages/${conv.id}`, { waitUntil: "networkidle" });
    await seen(hp.getByText(aText));
    const releasedIntro = await threadIntro(hp);
    const saysNobody = /\bno (builder|company|account)\b[^.]*\b(manages|can read)\b/i.test(releasedIntro);
    const saysNoReply = /reply may not come/i.test(releasedIntro);
    add(
      "released-thread-says-what-is-true",
      meta.rules[2],
      assertsReader(claimedIntro) && !assertsReader(releasedIntro) && saysNobody && saysNoReply && !/[—–→←]/.test(releasedIntro),
      `while claimed (control): "${claimedIntro.slice(0, 120)}"; after the release: "${releasedIntro.slice(0, 300)}" (still says the builder can read: ${assertsReader(releasedIntro)}; says no builder manages or can read it: ${saysNobody}; says a reply may not come: ${saysNoReply})`
    );
    await hctx.close();

    // ── 6. One account on both sides (F21) ──────────────────────────────────
    await bothSides().catch((e) => {
      const why = `step failed before the pages were read: ${redact(e?.message, [dualSecrets.password, dualSecrets.email]).slice(0, 240)}`;
      for (const [name, rule] of [["dual-account-portal-shows-only-its-listing", meta.rules[4]], ["dual-account-messages-shows-only-its-own", meta.rules[5]]]) {
        if (!out.some((r) => r.name === name)) add(name, rule, false, why);
      }
    });
  } finally {
    if (browser) await browser.close().catch(() => {});
    // The listing first: its conversations, messages and events go with it.
    for (const id of made.builders) await svc(`builders?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.users) await svc(`users?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
    for (const id of made.auth) await ctx.fetchJson(`${ctx.supabaseUrl}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: H }).catch(() => {});
  }
  return out;
}
