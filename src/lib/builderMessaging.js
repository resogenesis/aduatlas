// Homeowner ↔ builder messaging, data layer (decision 2h). The screens that use
// it: src/pages/app/Messages.jsx (the homeowner's threads), src/pages/builder/
// BuilderMessages.jsx (the builder's replies) and the "Message this builder"
// entry point on a claimed profile in src/pages/BuilderProfile.jsx.
//
// WHAT THIS IS. A homeowner starts a conversation from a CLAIMED builder
// profile. The builder may reply only once that conversation carries a homeowner
// message. Builders can never browse homeowners and can never open a
// conversation. The ADUAtlas thread is the system of record; email only notifies
// that a message is waiting.
//
// WHAT THIS IS NOT. Not a chat product. No presence, no typing indicators, no
// attachments, no group threads, no read receipts beyond one unread count.
//
// WHERE THE RULES ACTUALLY LIVE. In the database, in
// supabase/migrations/0011_fulfilment_and_messaging.sql, as RLS policies plus
// column grants on builder_conversations and builder_messages. NOTHING in this
// file is a security control: every function here runs with the signed-in user's
// own session, so the worst a tampered client can do is get an error back. In
// particular:
//
//   • homeowner_user_id has no SELECT grant, so no client — homeowner or
//     builder — can read who the homeowner on a thread is. It is filled from a
//     column DEFAULT, so no client can name anyone else either.
//   • the INSERT policy on builder_conversations requires a paid homeowner and a
//     claimed, approved, active listing.
//   • the INSERT policy on builder_messages requires an existing homeowner
//     message before a builder row is accepted, and neither side can write the
//     other's author value.
//   • only read_at is grantable for UPDATE, so a message body can never be
//     edited after it is sent, and there is no DELETE grant at all.
//
// Both sides of the conversation use the SAME functions. RLS decides which
// threads you can see; `author` says which side you are writing as, and the
// database rejects the wrong one.
//
// WHOSE THREADS A LIST HOLDS (RC4a review, finding 21). The 0011 SELECT policy
// returns a thread when the caller is its homeowner OR owns its listing, and it
// does not look at the caller's role. One account can be both: an admin can
// change a homeowner who already has threads to role "pro" and link a listing
// to it, or change the role of a listing's owner to "homeowner" without
// releasing the listing. Unscoped, the builder portal then showed that
// account's own homeowner threads as threads on its listing (their builder
// replies labelled "You" or with its company name, and counted on its
// dashboard), and the homeowner page showed the listing's threads with other
// homeowners' messages labelled "You". So listConversationSummaries() returns
// one side's threads only: as "builder", the threads on the listing the caller
// owns (builderId, from my_builder()); as "homeowner", the threads the caller
// is the homeowner on. isOwnMessage() is only right on a thread from that list.
//
// The builder's company NAME is not part of a thread. A thread carries
// builder_id, and fetchBuilderNames() below joins it for the HOMEOWNER through
// builders_public_profile, the view behind the PUBLIC builder profile page, so
// the name comes from a surface that is public anyway (decision 2a) and stays
// readable after the homeowner's plan ends (T4-18). A builder already knows its
// own name, and the homeowner side of a thread has no name at all
// (homeowner_user_id is never granted), so nothing is joined the other way.
//
// WHO WROTE A BUILDER MESSAGE. builder_messages records the SIDE that wrote a
// message (author), not the account. A conversation belongs to the listing, so
// after a release and a new link the next owner reads every earlier reply too
// (I4-05c). isOwnMessage() below is how a screen decides what to call "You": on
// the builder side only a reply written since the current claim began, which
// builders.claimed_at marks (0007's trigger restamps it on every change of
// owner). See T4-15 at the function.
//
// EMAIL. Decision 2h makes email a notification that a message is waiting, never
// the channel. After a message row is written, sendConversationMessage() asks
// api/send-email.js ("message-waiting") to tell the OTHER participant, and does
// not wait for the answer or read it. The request names the conversation and
// nothing else: no message text, no address. The server checks that the caller
// is in the conversation, resolves the recipient from the record, sends nothing
// for a listing with no owner, and stamps builder_messages.notified_at (0011)
// only once Resend accepts. Where mail is not configured (staging today) the
// server answers "not-configured" and nothing is sent. So a message is complete
// the moment its row is written, with or without mail, and the screens do not
// promise an email.
import { supabase, supabaseEnabled } from "./supabase";
import { sendEmail, TEMPLATES } from "./email";
import { fetchMyBuilder } from "./builders";

export const MESSAGE_MAX = 4000;

// A thread list stays small (one per builder a homeowner wrote to), but the cap
// keeps a runaway table from ever returning an unbounded payload, the same way
// the admin support thread list is capped.
const MESSAGE_CAP = 2000;

const CONVERSATION_COLUMNS = "id, builder_id, created_at, last_message_at";
const MESSAGE_COLUMNS = "id, conversation_id, author, body, created_at, read_at";

const off = () => ({ ok: false, error: "supabase-disabled" });

// An RLS refusal is not a bug to show the customer raw. The three reasons a
// homeowner can be refused a new thread are all the same sentence to them: this
// listing is not open to messages.
const fail = (error) => {
  const message = error?.message || "unknown error";
  if (/row-level security|permission denied/i.test(message)) return { ok: false, error: "not-allowed", detail: message };
  return { ok: false, error: message };
};

// ── Threads ─────────────────────────────────────────────────────────────────

// Every thread the caller may see, newest activity first. `builderId` keeps
// only the threads on that listing. Without it the list can hold both sides'
// threads for an account that is both (see WHOSE THREADS above), so a screen
// reads listConversationSummaries(), which scopes it to one side.
export const listConversations = async ({ builderId } = {}) => {
  if (!supabaseEnabled) return off();
  let query = supabase.from("builder_conversations").select(CONVERSATION_COLUMNS);
  if (builderId) query = query.eq("builder_id", builderId);
  const { data, error } = await query.order("last_message_at", { ascending: false });
  if (error) return fail(error);
  return { ok: true, conversations: data || [] };
};

// The threads the caller is the HOMEOWNER on (finding 21). RLS also returns the
// threads on a listing the caller owns. owner_user_id is unique (0006), so an
// account owns at most one listing, and my_builder() (0007) returns it or
// nothing; a thread on any other listing can only have come back because the
// caller is its homeowner. A thread on the caller's own listing is kept only
// when is_conversation_homeowner() (0011, granted to authenticated) says the
// caller is its homeowner. That function answers about the caller alone, so it
// tells nobody who any other homeowner is. An ordinary homeowner owns no
// listing, which costs one my_builder() read beside the thread list. When the
// ownership read fails the list fails too: unknown is not provably yours.
const homeownerConversations = async () => {
  const [threads, mine] = await Promise.all([listConversations(), fetchMyBuilder()]);
  if (!threads.ok) return threads;
  if (!mine.ok) return { ok: false, error: mine.error || "unavailable" };
  const listingId = mine.builder?.id || null;
  const onOwnListing = listingId ? threads.conversations.filter((c) => c.builder_id === listingId) : [];
  if (!onOwnListing.length) return threads;
  const asHomeowner = await Promise.all(
    onOwnListing.map((c) =>
      supabase
        .rpc("is_conversation_homeowner", { p_conversation_id: c.id })
        .then(({ data, error }) => !error && data === true, () => false)
    )
  );
  const others = new Set(onOwnListing.filter((_, i) => !asHomeowner[i]).map((c) => c.id));
  return { ok: true, conversations: threads.conversations.filter((c) => !others.has(c.id)) };
};

// The caller's thread with one builder, or null. A homeowner uses this from a
// builder profile to decide between "Message this builder" and "Open your
// conversation". Returns null rather than an error when there is none.
export const fetchConversation = async ({ builderId }) => {
  if (!supabaseEnabled) return off();
  if (!builderId) return { ok: false, error: "builder-required" };
  // A homeowner has at most one thread per builder (the unique index). But an
  // account that also OWNS this listing can read every homeowner's thread on it
  // (RC4a review, the finding 21 root cause on the profile page), so the newest
  // row may be someone else's. Several rows are read, and when there is more
  // than one the caller's own is found with is_conversation_homeowner (0011),
  // which answers only about the caller.
  const { data, error } = await supabase
    .from("builder_conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("builder_id", builderId)
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (error) return fail(error);
  const rows = data || [];
  if (rows.length <= 1) {
    if (!rows.length) return { ok: true, conversation: null };
    const { data: mine, error: e1 } = await supabase.rpc("is_conversation_homeowner", { p_conversation_id: rows[0].id });
    if (e1) return fail(e1);
    return { ok: true, conversation: mine === true ? rows[0] : null };
  }
  for (const row of rows) {
    const { data: mine, error: e2 } = await supabase.rpc("is_conversation_homeowner", { p_conversation_id: row.id });
    if (e2) return fail(e2);
    if (mine === true) return { ok: true, conversation: row };
  }
  return { ok: true, conversation: null };
};

// Thread list with the counts a list view needs: how many messages, how many
// are waiting on the caller, and the last line. Derived from the messages the
// caller may read, so it can never report a thread they cannot open.
//
// One side's threads only (finding 21, WHOSE THREADS above). As "builder" the
// caller passes `builderId`, the id of its own listing from my_builder(), and
// gets the threads on that listing and nothing else; without it the call is
// refused rather than returning threads from both sides. As "homeowner" it
// gets the threads it is the homeowner on.
export const listConversationSummaries = async ({ as, builderId } = {}) => {
  if (!supabaseEnabled) return off();
  if (as !== "homeowner" && as !== "builder") return { ok: false, error: "as must be homeowner or builder" };
  if (as === "builder" && !builderId) return { ok: false, error: "builder-required" };

  const threads = as === "builder" ? await listConversations({ builderId }) : await homeownerConversations();
  if (!threads.ok) return threads;
  if (!threads.conversations.length) return { ok: true, conversations: [] };

  const { data, error } = await supabase
    .from("builder_messages")
    .select(MESSAGE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(MESSAGE_CAP);
  if (error) return fail(error);

  const byThread = new Map();
  for (const m of data || []) {
    const t = byThread.get(m.conversation_id) || { messages: 0, unread: 0, last: null };
    t.messages += 1;
    // Unread means: written by the OTHER side and not yet marked read.
    if (m.author !== as && !m.read_at) t.unread += 1;
    if (!t.last) t.last = m; // rows arrive newest first
    byThread.set(m.conversation_id, t);
  }

  const conversations = threads.conversations.map((c) => {
    const t = byThread.get(c.id) || { messages: 0, unread: 0, last: null };
    // Whether anything was ever written here. The message read above is capped,
    // so an old thread past the cap can show no rows; last_message_at is moved
    // by the 0011 trigger on every insert and never equals created_at once a
    // message exists (the first message is a later request than the thread).
    const hasMessages = t.messages > 0 || c.last_message_at !== c.created_at;
    return {
      ...c,
      messages: t.messages,
      unread: t.unread,
      last_author: t.last?.author || null,
      // When the last line was written, so a list preview can ask isOwnMessage()
      // whether to say "You" (T4-15). null when no message came back.
      last_sent_at: t.last?.created_at || null,
      last_body: t.last ? (t.last.body || "").slice(0, 240) : null,
      last_at: t.last?.created_at || (hasMessages ? c.last_message_at : null),
      has_messages: hasMessages,
      // A builder cannot reply into a thread with no homeowner message. The
      // database enforces it; this lets the UI say so instead of offering a box
      // that will be refused. A builder can never write first, so a thread with
      // any message in it has a homeowner message.
      awaiting_homeowner: !hasMessages,
    };
  });
  return { ok: true, conversations };
};

// ── Messages ────────────────────────────────────────────────────────────────

// The template name belongs to the AUTH map in api/send-email.js; TEMPLATES is
// the frontend's copy of that list and is used when it carries this entry.
const MESSAGE_WAITING = TEMPLATES.MESSAGE_WAITING || "message-waiting";

// Fire and forget, by design. Nothing awaits this and nothing reads its result,
// so a slow, failing or unconfigured mail service can never hold up or fail a
// message that is already written. sendEmail() attaches the caller's access
// token and catches its own errors; the catch here is a second guard.
const notifyMessageWaiting = (conversationId) => {
  try {
    Promise.resolve(sendEmail({ template: MESSAGE_WAITING, data: { conversationId } })).catch(() => {});
  } catch {
    // Never reaches the person who wrote the message.
  }
};

export const fetchMessages = async (conversationId) => {
  if (!supabaseEnabled) return off();
  if (!conversationId) return { ok: false, error: "conversation-required" };
  const { data, error } = await supabase
    .from("builder_messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) return fail(error);
  return { ok: true, messages: data || [] };
};

export const sendConversationMessage = async ({ conversationId, body, as }) => {
  if (!supabaseEnabled) return off();
  if (!conversationId) return { ok: false, error: "conversation-required" };
  if (as !== "homeowner" && as !== "builder") return { ok: false, error: "as must be homeowner or builder" };
  const text = (body || "").trim();
  if (!text) return { ok: false, error: "empty-message" };
  const { data, error } = await supabase
    .from("builder_messages")
    .insert({ conversation_id: conversationId, author: as, body: text.slice(0, MESSAGE_MAX) })
    .select(MESSAGE_COLUMNS)
    .maybeSingle();
  if (error) return fail(error);
  // The row is written: the message is sent. Tell the other side, without
  // waiting (see notifyMessageWaiting).
  notifyMessageWaiting(conversationId);
  return { ok: true, message: data };
};

// Open the conversation and send the first message. Homeowner only, and the
// database is what says so: a builder calling this is refused by the INSERT
// policy, as is a homeowner aiming at an unclaimed listing or a homeowner
// without a paid package.
//
// Reuses an existing thread rather than failing on the (builder, homeowner)
// unique index, so "Message this builder" is safe to press twice. If the thread
// is created but the first message fails to land, the thread is left empty: the
// builder still cannot reply to it (rule 3) and the next attempt reuses it.
export const startConversation = async ({ builderId, body }) => {
  if (!supabaseEnabled) return off();
  if (!builderId) return { ok: false, error: "builder-required" };
  const text = (body || "").trim();
  if (!text) return { ok: false, error: "empty-message" };

  const existing = await fetchConversation({ builderId });
  if (!existing.ok) return existing;

  let conversation = existing.conversation;
  if (!conversation) {
    const { data, error } = await supabase
      .from("builder_conversations")
      .insert({ builder_id: builderId })
      .select(CONVERSATION_COLUMNS)
      .maybeSingle();
    if (error) return fail(error);
    conversation = data;
  }
  if (!conversation?.id) return { ok: false, error: "not-allowed" };

  const sent = await sendConversationMessage({ conversationId: conversation.id, body: text, as: "homeowner" });
  if (!sent.ok) return { ...sent, conversation };
  return { ok: true, conversation, message: sent.message };
};

// id → { name, slug, claimed } for the builders on a homeowner's threads.
//
// T4-18 (RC4 rehearsal): this used to read builders_public, the PAID directory
// view, so the day a homeowner's plan ended the list said "A builder" and the
// thread lost its profile link, although the messages stayed readable. A
// company's name and its profile page are public (decision 2a: the individual
// profile page is public and indexable), so the join now reads
// builders_public_profile, the view the public profile page is built from. The
// `authenticated` role keeps SELECT on it (0015 revoked only anon's), so any
// signed-in homeowner, paid or not, gets the same name and slug a visitor sees
// on /builders/:slug. Nothing paid rides along: the view has no contact column.
//
// `claimed` is the view's boolean (0009): whether a builder account holds the
// listing right now, never which one. The thread page reads it to say what is
// true after ADUAtlas releases a listing (T4-17). It is undefined on a schema
// without that column, which the page treats as "not known".
//
// A listing the view does not show (inactive, or not approved) is absent from
// the map, and the screen says "a builder" rather than guessing; the public
// profile page shows nothing for it either. Never an error the homeowner has to
// read: the thread itself is still theirs to open.
const PUBLIC_PROFILE_VIEW = "builders_public_profile";
const isMissingColumn = (error) => Boolean(error) && (error.code === "42703" || error.code === "PGRST204");

export const fetchBuilderNames = async (ids) => {
  const wanted = [...new Set((ids || []).filter(Boolean))];
  if (!supabaseEnabled || !wanted.length) return new Map();
  try {
    const read = (columns) => supabase.from(PUBLIC_PROFILE_VIEW).select(columns).in("id", wanted);
    let { data, error } = await read("id, slug, name, claimed");
    if (isMissingColumn(error)) ({ data, error } = await read("id, slug, name"));
    if (error) return new Map();
    return new Map((data || []).map((b) => [b.id, { name: b.name, slug: b.slug, claimed: typeof b.claimed === "boolean" ? b.claimed : undefined }]));
  } catch {
    return new Map();
  }
};

// Is this message the signed-in account's own, the only case a screen may label
// "You"?
//
// T4-15 (RC4 rehearsal): after ADUAtlas released a listing and linked it to a
// new account, the new owner's portal labelled the previous owner's replies
// "You", because the thread labelled by side (author = 'builder') and every
// builder reply looked like the viewer's own. builder_messages has no author
// account column, and the schema is frozen for this pass, so the account is
// worked out from what the owner can already read: builders.claimed_at, from
// my_builder(). 0007's builders_on_claim trigger stamps it afresh on EVERY
// change of owner, so a builder reply written before it was written while the
// listing was held by an earlier claim, and is never "You". A reply written
// since then can only be this account's, because a listing has one owner at a
// time and a released listing accepts no builder reply (owns_builder_
// conversation, 0011).
//
//   as "homeowner"  a thread has exactly one homeowner account for its whole
//                   life (homeowner_user_id never changes), so on a thread the
//                   viewer is the homeowner on, every homeowner message is the
//                   viewer's own.
//   as "builder"    own only when `ownSince` (the current claimed_at) is known
//                   and the message is not older than it. Unknown means not
//                   provably yours, so it is not called "You".
//
// Both branches hold only for a thread from the viewer's own side, which is
// what listConversationSummaries() returns (finding 21): on the builder side a
// thread on the viewer's own listing, on the homeowner side a thread the viewer
// is the homeowner on. "A listing has one owner at a time" says nothing about a
// thread on another listing, and a screen must not pass one here.
export const isOwnMessage = (message, { as, ownSince } = {}) => {
  if (!message || message.author !== as) return false;
  if (as === "homeowner") return true;
  const since = Date.parse(ownSince || "");
  const sent = Date.parse(message.created_at || "");
  return Number.isFinite(since) && Number.isFinite(sent) && sent >= since;
};

// One date format for every message screen.
export const formatMessageTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

// Mark the OTHER side's messages in this thread as read. read_at is the only
// column either side may update, so this can never alter what was said.
export const markConversationRead = async ({ conversationId, as }) => {
  if (!supabaseEnabled) return off();
  if (!conversationId) return { ok: false, error: "conversation-required" };
  if (as !== "homeowner" && as !== "builder") return { ok: false, error: "as must be homeowner or builder" };
  const other = as === "homeowner" ? "builder" : "homeowner";
  const { error } = await supabase
    .from("builder_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("author", other)
    .is("read_at", null);
  if (error) return fail(error);
  return { ok: true };
};
