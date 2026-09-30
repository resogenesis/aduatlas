import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiMessageCircle } from "react-icons/fi";
import MessageThread from "../../components/messaging/MessageThread";
import { formatMessageTime, isOwnMessage, listConversationSummaries } from "../../lib/builderMessaging";
import { fetchMyBuilder } from "../../lib/builders";

// The builder's side of messaging (decision 2h), under BuilderLayout's pro-only
// gate.
//
//   /builder/messages                   every thread homeowners opened with
//                                       this builder's listing
//   /builder/messages/:conversationId   one thread, with the reply box once the
//                                       homeowner has written
//
// WHAT THIS PAGE CAN NEVER DO, and where that is enforced (migration 0011):
//   • start a conversation. There is no control for it here, and the only
//     INSERT policy on builder_conversations requires the caller to be the
//     paying homeowner on the row.
//   • reply before the homeowner has written (rule 3, in the builder_messages
//     INSERT policy). MessageThread shows why instead of a box that fails.
//   • say who the homeowner is. homeowner_user_id is not granted to any client,
//     so there is nothing to show: a thread is "a homeowner" and its dates.
//   • reach another builder's threads. The SELECT policy returns a thread only
//     to its homeowner or to the account that owns its listing.
//
// ONLY THIS LISTING'S THREADS (RC4a review, finding 21). That SELECT policy does
// not look at the account's role, so an account that is also the homeowner on
// threads of its own (a homeowner an admin later made a builder and linked to a
// listing) gets those threads back too. They are not conversations on this
// listing: their builder replies were written by other companies' accounts, and
// labelling them "You" or with this company's name was false. So the page reads
// its listing's id from my_builder() first and lists only the threads on it
// (listConversationSummaries with builderId), and a thread address that is not
// on this listing is "not available". An account that owns no listing has no
// threads here.
//
// EARLIER REPLIES ON THE LISTING. T4-15 (RC4 rehearsal): conversations belong
// to the listing, not the account (I4-05c), so after ADUAtlas releases a listing
// and links it to a new account, that account reads every earlier reply too,
// and this page used to label all of them "You". builder_messages records only
// the side, so the page reads its own listing's claimed_at through my_builder()
// (0007 restamps it on every change of owner) and calls a reply "You" only when
// it was written since then (isOwnMessage in src/lib/builderMessaging.js).
// Older replies carry the company name, and the thread says once that they came
// from the account that managed the listing at the time. Until my_builder()
// answers, nothing is listed or labelled.
const loadError = (r) => (r.error === "supabase-disabled" ? "Messaging is not connected in this environment." : "Your messages could not be loaded. Try again in a minute.");

const BuilderMessages = () => {
  const { conversationId } = useParams();
  const [threads, setThreads] = useState(undefined); // undefined = loading
  const [error, setError] = useState("");
  // { id, name, claimed_at } of this account's listing; undefined while
  // loading, null when the account owns none or it could not be read.
  const [listing, setListing] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchMyBuilder().then((r) => {
      if (cancelled) return;
      if (r.ok && r.builder?.id) {
        setListing({ id: r.builder.id, name: r.builder.name || "", claimed_at: r.builder.claimed_at || null });
        return;
      }
      // No listing, no threads (finding 21). A failed read cannot say which
      // threads are this listing's, so it lists none and says so.
      setListing(null);
      setError(r.ok ? "" : loadError(r));
      setThreads([]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const listingId = listing?.id || null;
  const refresh = useCallback(() => {
    if (!listingId) return Promise.resolve();
    return listConversationSummaries({ as: "builder", builderId: listingId }).then((r) => {
      if (!r.ok) {
        setError(loadError(r));
        setThreads([]);
        return;
      }
      setError("");
      setThreads(r.conversations);
    });
  }, [listingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A thread on another listing is never opened here (finding 21), even if a
  // list ever held one.
  const open = conversationId && threads ? threads.find((t) => t.id === conversationId && t.builder_id === listingId) || null : undefined;
  // The list shows a thread once the homeowner has written in it, which is also
  // when the builder may reply (0011, rule 3) and what the dashboard counts. A
  // thread opened without a first message stays reachable by its own address,
  // where MessageThread says why there is no reply box.
  const listed = (threads || []).filter((t) => t.has_messages);
  const started = (t) => `Conversation started ${formatMessageTime(t.created_at)}`;
  const ownSince = listing?.claimed_at || null;
  const company = listing?.name || "";
  // The list preview's prefix for the last line (T4-15): "You" only for this
  // account's own reply, the company name for a reply sent under an earlier claim.
  const previewPrefix = (t) => {
    if (t.last_author !== "builder" || listing === undefined) return "";
    if (isOwnMessage({ author: "builder", created_at: t.last_sent_at }, { as: "builder", ownSince })) return "You: ";
    return `${company || "Earlier account"}: `;
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      {conversationId ? (
        <Link to="/builder/messages" className="tap-target inline-flex items-center gap-1 text-sm text-paper-dim hover:text-paper mb-6">
          <FiArrowLeft aria-hidden /> All messages
        </Link>
      ) : (
        <Link to="/builder" className="tap-target inline-flex items-center gap-1 text-sm text-paper-dim hover:text-paper mb-6">
          <FiArrowLeft aria-hidden /> Dashboard
        </Link>
      )}

      <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">{conversationId && open ? "A homeowner" : "Messages"}</h1>
      <p className="text-paper-dim text-base max-w-2xl mb-8">
        {conversationId && open
          ? `${started(open)}. ADUAtlas does not show you who this homeowner is. If they want you to have their email address or phone number, they will write it in a message.`
          : "Homeowners on an ADUAtlas plan can message you from your profile. You can reply to any conversation a homeowner starts, and you cannot start one yourself. ADUAtlas does not show you who a homeowner is."}
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700 mb-6">
          {error}
        </p>
      )}

      {threads === undefined && <p className="text-paper-dim text-sm">Loading your messages…</p>}

      {/* One thread */}
      {conversationId && threads !== undefined && !error && listing !== undefined && (
        open ? (
          <MessageThread
            conversationId={open.id}
            as="builder"
            otherName="Homeowner"
            ownSince={ownSince}
            earlierLabel={company || "Earlier account"}
            earlierNote={
              ownSince
                ? `Replies labelled ${company || "Earlier account"} were sent before your account claimed this listing, by the account that managed it at the time.`
                : "ADUAtlas could not confirm when your account claimed this listing, so no builder reply here is labelled You."
            }
            blockedText="The homeowner has not written in this conversation yet. You can reply once they send a message."
            onActivity={refresh}
          />
        ) : (
          <p className="text-paper text-sm">That conversation is not available.</p>
        )
      )}

      {/* Every thread */}
      {!conversationId && threads !== undefined && !error && (
        listed.length === 0 ? (
          <section className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8">
            <h2 className="font-display text-paper text-xl mb-2">No messages yet</h2>
            <p className="text-paper-dim text-sm leading-relaxed max-w-xl">
              When a homeowner on an ADUAtlas plan messages you from your profile, the conversation appears here and you can reply. Your messages are kept on this page, so check it for new ones.
            </p>
          </section>
        ) : (
          <ul className="space-y-3" aria-label="Conversations with homeowners">
            {listed.map((t) => (
              <li key={t.id}>
                <Link to={`/builder/messages/${t.id}`} className="block bg-canvas border border-stroke rounded-2xl p-5 hover:border-accent transition">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-paper font-medium inline-flex items-center gap-2">
                      <FiMessageCircle aria-hidden className="shrink-0" /> A homeowner
                    </p>
                    {t.unread > 0 && <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent text-accent-fg text-xs font-semibold">{t.unread} new</span>}
                  </div>
                  {t.last_body && (
                    <p className="text-paper-dim text-sm line-clamp-2 break-words">
                      {previewPrefix(t)}
                      {t.last_body}
                    </p>
                  )}
                  <p className="text-paper-dim text-xs mt-2">
                    {t.last_at ? `Last message ${formatMessageTime(t.last_at)}` : started(t)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};

export default BuilderMessages;
