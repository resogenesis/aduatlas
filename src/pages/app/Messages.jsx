import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiMessageCircle } from "react-icons/fi";
import MessageThread from "../../components/messaging/MessageThread";
import { fetchBuilderNames, formatMessageTime, listConversationSummaries } from "../../lib/builderMessaging";
import { isPaid } from "../../stores/paymentStore";

// The homeowner's conversations with builders (decision 2h).
//
//   /messages                   every thread this homeowner has, newest first
//   /messages/:conversationId   one thread, with the reply box
//
// A homeowner starts a conversation from a CLAIMED builder profile ("Message
// this builder" in src/pages/BuilderProfile.jsx); this page has no "new
// conversation" control of its own, because the profile is where the homeowner
// chooses the builder. RLS in migration 0011 decides which threads come back
// and who may open one (a paid homeowner, a claimed listing). The route needs
// only a signed-in account (SignedInOnly in the router): a homeowner whose plan
// has since ended can still read what was said, because the thread is the
// record.
//
// ONLY THE CALLER'S OWN THREADS (RC4a review, finding 21). RLS also returns the
// threads on a listing the account owns, whatever its role, so an account an
// admin moved from "pro" to "homeowner" without releasing its listing used to
// see that listing's threads here, with other homeowners' messages labelled
// "You". listConversationSummaries({ as: "homeowner" }) keeps only the threads
// the account is the homeowner on, so every thread on this page, and every
// "You" in it, is the account's own, and any other thread address is "not
// available".
//
// Nothing here identifies the homeowner to the builder, and nothing here
// promises an email: see the EMAIL note in src/lib/builderMessaging.js.
//
// THE BUILDER'S NAME AND PROFILE LINK are public information (decision 2a), so
// they come from builders_public_profile through fetchBuilderNames() and stay on
// this page after the plan ends. T4-18 (RC4 rehearsal): they used to come from
// the paid directory view, and a refunded homeowner saw "A builder" and lost
// the link to a profile any visitor can open.
//
// WHO CAN READ THIS THREAD NOW. T4-17 (RC4 rehearsal): after ADUAtlas released a
// listing from its portal account, this page still said the builder could read
// the homeowner's messages. Conversations stay with the listing (I4-05c): a
// released listing has no account that can read or answer them, the homeowner
// can still write (is_conversation_homeowner is untouched), and the next
// account to claim or be linked to the listing reads the whole thread. The
// sentence under the heading now follows the public `claimed` flag from the same
// view: claimed, released, or not known (a listing the directory does not show
// right now, or a read that failed), and says only what is true in that state.
// It waits for that read rather than showing one state and then another.
const threadIntro = (claimed) => {
  const privacy = "does not see your name, email address or phone number unless you write them in a message.";
  if (claimed === true) return `The builder that has claimed this listing can read your messages in its ADUAtlas builder portal. It ${privacy} Replies appear on this page.`;
  if (claimed === false) {
    return `No builder manages this listing on ADUAtlas right now, so no builder can read or answer what you write here, and a reply may not come. If a builder account claims the listing later, it will be able to read this whole conversation, including anything you send now. A builder ${privacy}`;
  }
  return `A builder account can read your messages in its ADUAtlas builder portal only while it manages this listing. ADUAtlas cannot confirm that one does right now, so a reply may not come. A builder ${privacy} Replies appear on this page.`;
};

const Messages = () => {
  const { conversationId } = useParams();
  const [threads, setThreads] = useState(undefined); // undefined = loading
  const [names, setNames] = useState(undefined); // undefined = not read yet
  const [error, setError] = useState("");

  const refresh = useCallback(
    () =>
      listConversationSummaries({ as: "homeowner" }).then((r) => {
        if (!r.ok) {
          setError(r.error === "supabase-disabled" ? "Messaging is not connected in this environment." : "Your messages could not be loaded. Try again in a minute.");
          setThreads([]);
          return;
        }
        setError("");
        setThreads(r.conversations);
        return fetchBuilderNames(r.conversations.map((c) => c.builder_id)).then(setNames);
      }),
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const builderOf = (t) => names?.get(t?.builder_id);
  const nameOf = (t) => builderOf(t)?.name || "A builder";
  const open = conversationId && threads ? threads.find((t) => t.id === conversationId) || null : undefined;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      {conversationId ? (
        <Link to="/messages" className="tap-target inline-flex items-center gap-1 text-sm text-paper-dim hover:text-paper mb-6">
          <FiArrowLeft aria-hidden /> All messages
        </Link>
      ) : null}

      <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">
        {conversationId && open ? nameOf(open) : "Messages"}
      </h1>
      <p className="text-paper-dim text-base max-w-2xl mb-8">
        {conversationId
          ? open && names !== undefined
            ? threadIntro(builderOf(open)?.claimed)
            : ""
          : "Your conversations with builders. You start a conversation from the profile of a builder that has claimed its listing, and the builder can reply. Replies appear on this page."}
      </p>

      {error && (
        <p role="alert" className="text-sm text-red-700 mb-6">
          {error}
        </p>
      )}

      {threads === undefined && <p className="text-paper-dim text-sm">Loading your messages…</p>}

      {/* One thread */}
      {conversationId && threads !== undefined && !error && (
        open ? (
          <>
            {builderOf(open)?.slug && (
              <p className="text-sm mb-4">
                <Link to={`/builders/${builderOf(open).slug}`} className="text-accent font-medium inline-flex items-center gap-1">
                  View this builder's profile <FiArrowRight aria-hidden />
                </Link>
              </p>
            )}
            <MessageThread conversationId={open.id} as="homeowner" otherName={nameOf(open)} onActivity={refresh} />
          </>
        ) : (
          <p className="text-paper text-sm">That conversation is not available.</p>
        )
      )}

      {/* Every thread */}
      {!conversationId && threads !== undefined && !error && (
        threads.length === 0 ? (
          <section className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8">
            <h2 className="font-display text-paper text-xl mb-2">No conversations yet</h2>
            <p className="text-paper-dim text-sm leading-relaxed mb-5 max-w-xl">
              Open the profile of a builder that has claimed its listing and choose Message this builder. A builder cannot start a conversation with you.
            </p>
            <Link to={isPaid() ? "/builders" : "/unlock"} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors press">
              {isPaid() ? "Browse builders" : "See plans"} <FiArrowRight aria-hidden />
            </Link>
          </section>
        ) : (
          <ul className="space-y-3" aria-label="Your conversations">
            {threads.map((t) => (
              <li key={t.id}>
                <Link to={`/messages/${t.id}`} className="block bg-canvas border border-stroke rounded-2xl p-5 hover:border-accent transition">
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-paper font-medium inline-flex items-center gap-2 min-w-0">
                      <FiMessageCircle aria-hidden className="shrink-0" /> <span className="truncate">{nameOf(t)}</span>
                    </p>
                    {t.unread > 0 && <span className="shrink-0 px-2 py-0.5 rounded-full bg-accent text-accent-fg text-xs font-semibold">{t.unread} new</span>}
                  </div>
                  {t.last_body && (
                    <p className="text-paper-dim text-sm line-clamp-2 break-words">
                      {t.last_author === "homeowner" ? "You: " : ""}
                      {t.last_body}
                    </p>
                  )}
                  <p className="text-paper-dim text-xs mt-2">{formatMessageTime(t.last_at || t.last_message_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};

export default Messages;
