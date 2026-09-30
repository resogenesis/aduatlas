// /api/admin/studies/* — the fulfilment queue for the admin console.
// Dispatched by api/admin/[...action].js. Service role + requireAdmin.
//
//   GET  studies/list                       every order + owner email + project brief
//   POST studies/update  { id, status?, admin_note?, consult_minutes_used?, consult_link?, reopen? }
//   POST studies/upload  { id, kind: "report"|"site_plan", dataUrl, filename? }
//   GET  studies/threads                    every thread (one per customer and kind), newest first
//   GET  studies/messages?user_id=...[&kind=support|refund_request]   one customer's thread
//   POST studies/reply   { user_id, body, kind? }   admin reply into that thread
//   POST studies/mark-read { user_id, kind? }       stamp that homeowner's unread messages
//   GET  studies/file?path=...              short-lived signed URL for a stored file
//
// TWO KINDS OF THREAD (contract C1, migration 0024). support_messages.kind is
// 'support' (Concierge written support) or 'refund_request'. A reply is written
// with the kind of the thread it answers, so a refund request's answer lands in
// the refund thread the customer reads on their settings page, and a Concierge
// answer lands in /support. A reply that would reach nobody is refused with the
// reason instead of being stored: 'support' needs a live Concierge plan (it is
// the only kind /support shows, and only to Concierge), and 'refund_request'
// needs a refund request to answer. Replying marks the customer's messages in
// that thread read, from whichever screen the reply was sent. On a database
// without 0024 every message is treated as 'support' and no kind is written.
//
// Written support is sold with Concierge and it is not tied to a study, so the
// threads route stands on its own: a customer who has written but has no study
// row still has to be answerable. Nothing here exposes builder claim codes,
// tracking data or verification internals.
//
// THE LIFECYCLE (decision 2i). Richard produces the feasibility study and the
// site plan himself in Phase 1, so this queue is the whole of the workflow and
// is deliberately the minimum: one order, one status, one note, the files, and
// the brief the customer filled in. No assignees, no due dates, no priorities.
// Migration 0011 holds the stored-token mapping; LIFECYCLE below is the same
// mapping in the operator's words, and it is the only place they are written.
//
// "Paid" is the one state with no studies row behind it: a Platinum or Concierge
// buyer who has not submitted their intake yet. list() synthesises those rows so
// the queue shows an order that is waiting on the CUSTOMER rather than hiding it
// until intake arrives. They carry no study id and nothing about them can be
// edited, because there is nothing there to edit.
//
// A DRAFT IS NOT AN ORDER AND NEVER APPEARS HERE (decision 2q, migration 0018).
// See the DRAFT constant below for where that is enforced and why the database,
// not this file, is the boundary.
import { requireAdmin, readBody } from "../_admin.js";

// A DRAFT IS NOT AN ORDER (decision 2q, migration 0018). A homeowner at any
// tier, free and Golden included, may save feasibility intake as a draft; only a
// live Platinum or Concierge entitlement may transition it to 'submitted'. So a
// draft never appears in this queue, through EITHER of the two reads below — the
// studies read that lists the orders, and the awaiting-intake read that
// synthesises the derived "Paid" rows. It is also never movable or uploadable to
// from here: a console that could promote a draft would be a second door into
// the workflow the database boundary just closed.
//
// Migration 0018 is what makes this filter a tidy-up rather than the guarantee.
// A free or Golden account cannot reach 'submitted' at all, so nothing here is
// the only thing standing between an unentitled intake and the fulfilment
// queue.
const DRAFT = "draft";

// Stored token → the operator label from decision 2i, in lifecycle order.
// 'needs_info' is last because it is the off-ramp, not a stage.
//
// 'draft' is deliberately ABSENT. It is the customer's state before an order
// exists, not an operator step, and 0018 refuses the backwards move anyway: a
// submitted study never becomes a draft again.
const LIFECYCLE = [
  ["submitted", "Intake Complete"],
  ["in_review", "Ready for Review"],
  ["work_started", "Work Started"],
  ["deliverables_ready", "Deliverables Ready"],
  ["ready", "Delivered"],
  ["needs_info", "Needs Info"],
];
const STATUSES = LIFECYCLE.map(([k]) => k);
const STATUS_LABEL = Object.fromEntries(LIFECYCLE);

// The two kinds of support_messages thread (C1).
const KINDS = ["support", "refund_request"];
const KIND_LABELS = { support: "Concierge support", refund_request: "Refund request" };
// A database without migration 0024 has no kind column: 42703 from a select,
// PGRST204 from an insert or update that names it.
const noKindColumn = (error) => ["42703", "PGRST204"].includes(error?.code) && /kind/.test(error?.message || "");
// Written support is part of Concierge and /support shows it to a LIVE Concierge
// plan only, so a support reply reaches exactly these customers.
const conciergeLive = (u) => Boolean(u?.paid_at) && !u?.refunded_at && u?.paid_tier === "concierge";

// The tiers that buy the feasibility study and the site plan. Ids predate the
// plan names: 'report' is Platinum, 'roadmap' is Golden. See src/lib/plans.js.
const STUDY_TIERS = ["report", "concierge"];

// The twelve project-brief fields, in the order src/stores/courseStore.js
// PACKET_FIELDS declares them. Duplicated rather than imported because that
// module is a browser store and reaches for import.meta.env.
const BRIEF_FIELDS = [
  "address", "zip", "lotSize", "purpose", "aduType", "desiredSqft",
  "stories", "budget", "timeline", "siteAccess", "utilityNotes", "hoaNotes",
];

// Reduce a merged homeowner packet to what the person producing the study needs,
// and to nothing the customer did not actually provide. An unanswered field is
// OMITTED, never defaulted: decision 2b, unknown means unknown. Reducing here
// rather than shipping the whole jsonb also keeps the queue payload bounded.
//
// The input is public.homeowner_packet_full.builder_packet, NOT
// users.builder_packet. Migration 0013 moved worksheets{} (which is where the
// Ready Score lives, under the 'readyScore' key) and lot into
// public.homeowner_worksheets and strips both keys from every write to the old
// column, so users.builder_packet is now the project brief alone. 0013 PART 7
// added that service-role-only view to present the merged legacy shape this
// function reads. A customer with no worksheets row simply has neither key, so
// lot and ready_score come back null and the console prints nothing for them —
// it never receives a zero standing in for a score that does not exist.
const projectBrief = (packet) => {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;

  const fields = {};
  for (const key of BRIEF_FIELDS) {
    const v = packet[key];
    const text = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    if (text) fields[key] = text;
  }

  // Lot geometry from the feasibility tool. Blank inputs are dropped, and
  // dims_estimated is carried through because an estimated width and depth were
  // derived from a recorded AREA and were never stated by the customer.
  let lot = null;
  const rawLot = packet.lot;
  if (rawLot && typeof rawLot === "object" && !Array.isArray(rawLot)) {
    const input = {};
    for (const [k, v] of Object.entries(rawLot.input || {})) {
      const text = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
      if (text) input[k] = text;
    }
    const look = rawLot.lookup && typeof rawLot.lookup === "object" ? rawLot.lookup : null;
    lot = {
      input: Object.keys(input).length ? input : null,
      dims_estimated: Boolean(rawLot.dimsEstimated),
      address: typeof rawLot.address === "string" && rawLot.address.trim() ? rawLot.address.trim() : null,
      // Public-records snapshot, NOT customer-entered. Two numbers only.
      lookup: look
        ? {
            lot_size: Number(look.lotSize) || null,
            building_size: Number(look.buildingSize) || null,
            fetched_at: typeof look.fetchedAt === "string" ? look.fetchedAt : null,
          }
        : null,
    };
    if (!lot.input && !lot.lookup && !lot.address) lot = null;
  }

  // ADU Ready Score (the NAPE worksheet). The grade is null until every item is
  // answered, and that stays null here rather than becoming a number.
  const rs = packet.worksheets && typeof packet.worksheets === "object" ? packet.worksheets.readyScore : null;
  const ready_score = rs && typeof rs === "object"
    ? {
        points: Number.isFinite(Number(rs.points)) ? Number(rs.points) : null,
        grade: typeof rs.grade === "string" ? rs.grade : null,
        completed_at: typeof rs.completedAt === "string" ? rs.completedAt : null,
        answers: rs.answers && typeof rs.answers === "object" && !Array.isArray(rs.answers) ? rs.answers : null,
      }
    : null;

  const worksheets = packet.worksheets && typeof packet.worksheets === "object" ? Object.keys(packet.worksheets) : [];

  if (!Object.keys(fields).length && !lot && !ready_score && !worksheets.length) return null;
  return { fields, lot, ready_score, worksheets };
};
const BUCKET = "studies";
const DATA_URL_RE = /^data:(image\/(png|jpeg|jpg|webp)|application\/pdf);base64,(.+)$/;
const MAX_BYTES = 6 * 1024 * 1024;
const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "application/pdf": "pdf" };
const safe = (s) => (s || "").replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80);

// The queue. Three reads, because the queue has to show an order that has no
// studies row yet, and because the brief no longer lives in one column.
//
//   1. every studies row, with the owner's email and tier.
//   2. the PROJECT BRIEF for those rows, from public.homeowner_packet_full. The
//      brief is the twelve questions /my-property tells the customer "flow into
//      your feasibility study", plus the lot dimensions and the Ready Score.
//      Migration 0013 moved worksheets{} and lot out of users.builder_packet
//      into public.homeowner_worksheets, so selecting users.builder_packet — as
//      this endpoint used to — hands the producer of the $279 deliverable a
//      brief with the Ready Score and the lot geometry silently missing. 0013
//      PART 7 created homeowner_packet_full, service-role only, to present the
//      merged shape; the queue reads the brief from there and nowhere else.
//      Keyed by user_id and chunked, so the request stays bounded however many
//      orders exist. A user with no row in the view contributes no brief rather
//      than an empty one (decision 2b).
//   3. every live Platinum or Concierge buyer, so a paid order with no intake
//      appears as "Paid" instead of being invisible until the customer submits.
//      Read from the same view, so a waiting order shows the same brief the
//      producer will see once intake arrives.
const BRIEF_ID_CHUNK = 200;

// user_id → brief, read from the merged view. Absent means "no packet row",
// which projectBrief() also reports as null: nothing is invented to fill it.
const briefsByUser = async (ctx, userIds) => {
  const byUser = new Map();
  const ids = [...new Set(userIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += BRIEF_ID_CHUNK) {
    const { data, error } = await ctx.svc
      .from("homeowner_packet_full")
      .select("user_id, builder_packet")
      .in("user_id", ids.slice(i, i + BRIEF_ID_CHUNK));
    if (error) throw new Error(error.message);
    for (const row of data || []) byUser.set(row.user_id, projectBrief(row.builder_packet));
  }
  return byUser;
};

const list = async (req, res, ctx) => {
  const { data, error } = await ctx.svc
    .from("studies")
    .select(
      "id, user_id, status, intake, homeowner_note, admin_note, report_path, site_plan_path, " +
        "consult_minutes_used, consult_link, submitted_at, work_started_at, ready_at, updated_at, " +
        "users!inner(email, paid_tier, paid_at, refunded_at)"
    )
    .neq("status", DRAFT)
    .order("submitted_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });

  const rows = data || [];
  let briefs;
  try {
    briefs = await briefsByUser(ctx, rows.map((s) => s.user_id));
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }

  const items = rows.map((s) => ({
    ...s,
    email: s.users?.email,
    paid_tier: s.users?.paid_tier,
    // Whether a message written from the study drawer can reach this customer.
    written_support: conciergeLive(s.users),
    brief: briefs.get(s.user_id) ?? null,
    users: undefined,
  }));

  // Paid, intake not submitted. A refunded buyer is not an order. The view is a
  // left join from public.users, so it carries one row per account with the same
  // email, tier and billing columns the users table had.
  //
  // THE SECOND READ, and the second place a draft could have reached the queue.
  // This one is keyed on the ACCOUNT rather than on a studies row, so filtering
  // drafts out of the query above is not enough on its own: the three conditions
  // here are what keep an unentitled drafter out. Only a live, un-refunded
  // Platinum or Concierge account is an order awaiting intake, so a free or
  // Golden homeowner who has saved a draft appears in neither read.
  const { data: buyers, error: bErr } = await ctx.svc
    .from("homeowner_packet_full")
    .select("user_id, email, paid_tier, paid_at, builder_packet")
    .in("paid_tier", STUDY_TIERS)
    .not("paid_at", "is", null)
    .is("refunded_at", null)
    .order("paid_at", { ascending: true });
  if (bErr) return res.status(500).json({ error: bErr.message });

  // Built from the ORDERS above, which excludes drafts, and that is deliberate:
  // a Platinum buyer who has saved a draft but not submitted it is still
  // awaiting intake, so they belong in the derived "Paid" row rather than
  // disappearing from the queue altogether. Nothing about the draft is shown —
  // the row carries intake: null exactly as it does for a buyer who has typed
  // nothing yet — and the tier filter on the query below is what keeps a free or
  // Golden drafter out of this set entirely.
  const withStudy = new Set(items.map((s) => s.user_id));
  const awaiting = (buyers || [])
    .filter((u) => !withStudy.has(u.user_id))
    .map((u) => ({
      id: null, // no studies row exists; nothing here is editable
      user_id: u.user_id,
      status: "paid",
      email: u.email,
      paid_tier: u.paid_tier,
      paid_at: u.paid_at,
      written_support: u.paid_tier === "concierge",
      intake: null,
      brief: projectBrief(u.builder_packet),
      submitted_at: null,
      work_started_at: null,
      ready_at: null,
      report_path: null,
      site_plan_path: null,
    }));

  res.status(200).json({ items: [...awaiting, ...items], lifecycle: LIFECYCLE });
};

// A DELIVERED STUDY DOES NOT MOVE BACKWARDS SILENTLY, AND ITS DELIVERY DATE IS
// KEPT. Delivered is what the customer's portal shows as done, so moving a
// delivered order back to an earlier stage changes what they see and needs
// `reopen: true`, which the console sends only after Amy or Richard confirms;
// without it the move is refused with the delivery date. ready_at is the date the
// study was FIRST delivered: a redelivery after a reopen does not move it, so the
// customer is never told a later date than the one they received it on.
const update = async (req, res, ctx) => {
  const { id, status, admin_note, consult_minutes_used, consult_link, reopen } = readBody(req);
  if (!id) return res.status(400).json({ error: "id required" });
  const patch = {};
  let current = null;
  if (status !== undefined) {
    if (!STATUSES.includes(status)) return res.status(400).json({ error: "invalid status" });
    const { data: cur, error: cErr } = await ctx.svc.from("studies").select("id, status, ready_at").eq("id", id).neq("status", DRAFT).maybeSingle();
    if (cErr) return res.status(500).json({ error: cErr.message });
    if (!cur) return res.status(404).json({ error: "no order with that id" });
    current = cur;
    if (cur.status === "ready" && status !== "ready" && reopen !== true) {
      const on = cur.ready_at ? ` on ${String(cur.ready_at).slice(0, 10)}` : "";
      return res.status(409).json({
        error: `This study was delivered${on}. Moving it back to ${STATUS_LABEL[status] || status} changes what the customer sees in their portal, so it has to be confirmed. Nothing was changed.`,
        needs_reopen: true,
        delivered_at: cur.ready_at || null,
      });
    }
    patch.status = status;
    if (status === "ready" && !cur.ready_at) patch.ready_at = new Date().toISOString();
    // work_started_at is deliberately NOT stamped here. Migration 0011 stamps it
    // in the database on the first transition into 'work_started', and makes it
    // immutable afterwards. The refund copy promises the customer that date, so
    // it must not depend on this endpoint being the only writer: see the header
    // of 0011_fulfilment_and_messaging.sql. The updated row is returned below,
    // so the console reads back whatever the database actually recorded.
  }
  if (admin_note !== undefined) patch.admin_note = admin_note || null;
  if (consult_minutes_used !== undefined) {
    const n = Number(consult_minutes_used);
    if (!Number.isInteger(n) || n < 0 || n > 60) return res.status(400).json({ error: "minutes must be 0-60" });
    patch.consult_minutes_used = n;
  }
  if (consult_link !== undefined) patch.consult_link = consult_link || null;
  if (!Object.keys(patch).length) return res.status(400).json({ error: "nothing to update" });
  // Orders only. A draft is the customer's own unfinished intake and is not in
  // this queue, so no id for one is reachable from the console; the filter is
  // here so that a pasted or stale id cannot promote a draft into the workflow
  // with the service role, which bypasses the RLS boundary in 0018.
  // With a status change, the status read above is part of the filter, so a
  // delivery that landed in between is not overwritten by a stale screen.
  let q = ctx.svc.from("studies").update(patch).eq("id", id).neq("status", DRAFT);
  if (current) q = q.eq("status", current.status);
  const { data, error } = await q.select().maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  // Nothing matched: the id is unknown, or it names a draft rather than an
  // order, or the order moved while this was being saved. Said out loud rather
  // than returned as a 200 with a null study, which would look to the operator
  // like a save that worked.
  if (!data) {
    return current
      ? res.status(409).json({ error: "This order changed while you were editing it. Reopen it and save again." })
      : res.status(404).json({ error: "no order with that id" });
  }
  res.status(200).json({ ok: true, study: data });
};

const upload = async (req, res, ctx) => {
  const { id, kind, dataUrl, filename } = readBody(req);
  if (!id || !["report", "site_plan"].includes(kind)) return res.status(400).json({ error: "id and kind (report|site_plan) required" });
  const match = typeof dataUrl === "string" ? dataUrl.match(DATA_URL_RE) : null;
  if (!match) return res.status(400).json({ error: "dataUrl must be a base64 PDF or image" });
  const contentType = match[1];
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > MAX_BYTES) return res.status(400).json({ error: "file too large (max 6MB)" });

  // Orders only, for the same reason as update(): a deliverable is never
  // attached to a draft, which is intake the customer has not bought work on.
  const { data: study, error: sErr } = await ctx.svc
    .from("studies")
    .select("user_id")
    .eq("id", id)
    .neq("status", DRAFT)
    .maybeSingle();
  if (sErr) return res.status(500).json({ error: sErr.message });
  if (!study) return res.status(404).json({ error: "study not found" });

  const path = `${study.user_id}/deliverables/${kind}-${Date.now()}-${safe(filename) || kind}.${EXT[contentType]}`;
  const { error: upErr } = await ctx.svc.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (upErr) return res.status(500).json({ error: upErr.message });

  const column = kind === "report" ? "report_path" : "site_plan_path";
  const { error: updErr } = await ctx.svc.from("studies").update({ [column]: path }).eq("id", id);
  if (updErr) return res.status(500).json({ error: updErr.message });
  res.status(200).json({ ok: true, path });
};

const file = async (req, res, ctx) => {
  const path = (req.query?.path || new URL(req.url, "http://x").searchParams.get("path") || "").trim();
  if (!path) return res.status(400).json({ error: "path required" });
  const { data, error } = await ctx.svc.storage.from(BUCKET).createSignedUrl(path, 600);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ url: data.signedUrl });
};

const param = (req, name) => (req.query?.[name] || new URL(req.url, "http://x").searchParams.get(name) || "").trim();

// One customer's thread. With kind, only that thread; without it, every message
// the customer has, each carrying its kind.
const messages = async (req, res, ctx) => {
  const userId = param(req, "user_id");
  if (!userId) return res.status(400).json({ error: "user_id required" });
  const kind = param(req, "kind") || null;
  if (kind && !KINDS.includes(kind)) return res.status(400).json({ error: "kind must be support or refund_request" });
  let q = ctx.svc.from("support_messages").select("id, author, body, created_at, read_at, kind").eq("user_id", userId);
  if (kind) q = q.eq("kind", kind);
  let { data, error } = await q.order("created_at", { ascending: true });
  if (noKindColumn(error)) {
    // Before 0024 every message is support, and there is no refund thread.
    if (kind === "refund_request") return res.status(200).json({ messages: [] });
    ({ data, error } = await ctx.svc
      .from("support_messages")
      .select("id, author, body, created_at, read_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }));
    data = (data || []).map((m) => ({ ...m, kind: "support" }));
  }
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ messages: data || [] });
};

// Every support thread, whether or not the customer has a study. One row per
// customer with their tier, the latest message and what is still unread.
// Support volume is small (one thread per paying customer at most), so the
// grouping happens here rather than in a view; the cap keeps a runaway table
// from ever returning an unbounded payload.
const THREAD_MESSAGE_CAP = 5000;

// One thread per customer AND kind (C1): a customer who has Concierge support and
// has also asked for a refund appears twice, and each row says which it is and
// whether a reply written into it would reach the customer.
const threads = async (req, res, ctx) => {
  const COLUMNS = "user_id, author, body, created_at, read_at, users!inner(email, paid_tier, paid_at, refunded_at)";
  let { data, error } = await ctx.svc
    .from("support_messages")
    .select(`${COLUMNS}, kind`)
    .order("created_at", { ascending: false })
    .limit(THREAD_MESSAGE_CAP);
  if (noKindColumn(error)) {
    ({ data, error } = await ctx.svc.from("support_messages").select(COLUMNS).order("created_at", { ascending: false }).limit(THREAD_MESSAGE_CAP));
  }
  if (error) return res.status(500).json({ error: error.message });

  const byUser = new Map();
  for (const m of data || []) {
    const kind = m.kind || "support";
    const threadId = `${m.user_id}:${kind}`;
    const t = byUser.get(threadId) || {
      thread_id: threadId,
      user_id: m.user_id,
      kind,
      kind_label: KIND_LABELS[kind] || kind,
      // A refund thread is read on the customer's settings page whatever their
      // plan; a support thread only by a live Concierge plan.
      customer_can_read: kind === "refund_request" ? true : conciergeLive(m.users),
      email: m.users?.email || null,
      paid_tier: m.users?.paid_tier || null,
      messages: 0,
      unread: 0,
      last_body: null,
      last_author: null,
      last_at: null,
      waiting_since: null,
    };
    t.messages += 1;
    if (m.author === "homeowner" && !m.read_at) {
      t.unread += 1;
      t.waiting_since = m.created_at; // rows arrive newest first, so this ends on the oldest unread
    }
    if (!t.last_at) {
      t.last_body = (m.body || "").slice(0, 240);
      t.last_author = m.author;
      t.last_at = m.created_at;
    }
    byUser.set(threadId, t);
  }
  const items = [...byUser.values()].sort((a, b) => (a.last_at < b.last_at ? 1 : -1));
  res.status(200).json({ items });
};

// Marks the customer's messages as read. Admin-only, and it never touches the
// bodies — read_at is the only column written.
const markThreadRead = async (ctx, userId, kind) => {
  const build = (withKind) => {
    let q = ctx.svc.from("support_messages").update({ read_at: new Date().toISOString() }).eq("user_id", userId).eq("author", "homeowner").is("read_at", null);
    if (withKind && kind) q = q.eq("kind", kind);
    return q.select("id");
  };
  let { data, error } = await build(true);
  if (noKindColumn(error)) ({ data, error } = await build(false));
  return { count: (data || []).length, error };
};

const markRead = async (req, res, ctx) => {
  const { user_id, kind } = readBody(req);
  if (!user_id) return res.status(400).json({ error: "user_id required" });
  if (kind !== undefined && kind !== null && !KINDS.includes(kind)) return res.status(400).json({ error: "kind must be support or refund_request" });
  const { error } = await markThreadRead(ctx, user_id, kind || null);
  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ ok: true });
};

// A reply is written with the kind of the thread it answers (C1). A caller that
// names no kind is answering the customer's only thread; a customer with both a
// support thread and a refund request has to be answered in one of them by name.
const reply = async (req, res, ctx) => {
  const { user_id, body, kind: askedKind } = readBody(req);
  if (!user_id || !body || typeof body !== "string" || !body.trim()) return res.status(400).json({ error: "user_id and body required" });
  if (askedKind !== undefined && askedKind !== null && !KINDS.includes(askedKind)) return res.status(400).json({ error: "kind must be support or refund_request" });

  const { data: user, error: uErr } = await ctx.svc.from("users").select("id, paid_tier, paid_at, refunded_at").eq("id", user_id).maybeSingle();
  if (uErr) return res.status(500).json({ error: uErr.message });
  if (!user) return res.status(404).json({ error: "no customer with that id" });

  let kindColumn = true;
  let { data: theirs, error: tErr } = await ctx.svc.from("support_messages").select("author, kind").eq("user_id", user_id).limit(THREAD_MESSAGE_CAP);
  if (noKindColumn(tErr)) {
    kindColumn = false;
    ({ data: theirs, error: tErr } = await ctx.svc.from("support_messages").select("author").eq("user_id", user_id).limit(THREAD_MESSAGE_CAP));
  }
  if (tErr) return res.status(500).json({ error: tErr.message });
  const written = new Set((theirs || []).filter((m) => m.author === "homeowner").map((m) => (kindColumn && m.kind) || "support"));

  let kind = askedKind || null;
  if (!kind) {
    if (written.size > 1) {
      return res.status(400).json({ error: "This customer has a Concierge support thread and a refund request. Say which one this reply answers. Nothing was sent." });
    }
    kind = [...written][0] || "support";
  }
  if (kind === "refund_request" && !written.has("refund_request")) {
    return res.status(409).json({ error: "This customer has not asked for a refund, so there is no refund request to answer. Nothing was sent." });
  }
  if (kind === "support" && !conciergeLive(user)) {
    return res.status(409).json({
      error: `Written support is part of Concierge, and this customer has no live Concierge plan, so they have no page where this reply would appear. Nothing was sent.${written.has("refund_request") ? " Their refund request is answered in its own thread." : ""}`,
    });
  }

  const { data, error } = await ctx.svc
    .from("support_messages")
    .insert({ user_id, author: "admin", body: body.slice(0, 4000), ...(kindColumn ? { kind } : {}) })
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  // Answering is reading: the customer's messages in this thread are marked read
  // from whichever screen the reply came, so the Support tab never shows a thread
  // as waiting after it was answered.
  const marked = await markThreadRead(ctx, user_id, kindColumn ? kind : null);
  res.status(200).json({
    ok: true,
    kind,
    message: data,
    marked_read: marked.count,
    ...(marked.error ? { warning: `The reply was sent, but the customer's messages were not marked read (${marked.error.message}).` } : {}),
  });
};

const ROUTES = {
  list: { GET: list },
  update: { POST: update },
  upload: { POST: upload },
  file: { GET: file },
  messages: { GET: messages },
  threads: { GET: threads },
  "mark-read": { POST: markRead },
  reply: { POST: reply },
};

export default async function handler(req, res) {
  const ctx = await requireAdmin(req);
  if (!ctx) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  const pathname = (req.url || "").split("?")[0];
  const action = pathname.split("/").filter(Boolean).pop();
  const route = ROUTES[action];
  if (!route) return res.status(404).json({ error: "not found" });
  const fn = route[req.method];
  if (!fn) return res.status(405).json({ error: `${req.method} not allowed` });
  await fn(req, res, ctx);
}
