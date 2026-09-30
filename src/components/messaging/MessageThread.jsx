import { useCallback, useEffect, useRef, useState } from "react";
import { FiRefreshCw, FiSend } from "react-icons/fi";
import { MESSAGE_MAX, fetchMessages, formatMessageTime, isOwnMessage, markConversationRead, sendConversationMessage } from "../../lib/builderMessaging";

// One conversation between a homeowner and a builder (decision 2h), used by both
// sides: the homeowner's Messages page and the builder portal. `as` is the side
// the viewer writes as. The database decides what either side may read and
// write (migration 0011); this component only draws what came back and says
// plainly when the database refused something.
//
// A message thread, not a chat product: no presence, no typing indicator, no
// attachments, no live updates. "Check for new messages" re-reads the thread.
//
// The reply box is replaced with `blockedText` when the viewer may not write.
// On the builder side that is a thread with no homeowner message yet, which the
// database would refuse anyway (rule 3), so the builder is told why instead of
// being handed a box that fails. It is worked out from the messages on screen,
// so "Check for new messages" opens the box as soon as the homeowner has
// written.
//
// `onActivity` tells the parent something changed (a message sent, messages
// marked read) so it can refresh its thread list and unread counts.
//
// "You" MEANS THE SIGNED-IN ACCOUNT, NOT THE SIDE. T4-15 (RC4 rehearsal): a
// conversation belongs to the listing, so after a release and a new link the
// next owner reads every earlier builder reply, and this component used to call
// all of them "You". A message is now "You" only when isOwnMessage() in
// src/lib/builderMessaging.js says the viewer's account wrote it; on the builder
// side that needs `ownSince`, the start of the current claim. A reply from the
// viewer's side that is not provably theirs is labelled `earlierLabel` (the
// company name), drawn like the other side's messages rather than as the
// viewer's own, and `earlierNote` says once, above the thread, why.
const MessageThread = ({ conversationId, as, otherName, ownSince = null, earlierLabel = "", earlierNote = "", blockedText = "", onActivity }) => {
  const [messages, setMessages] = useState(undefined); // undefined = loading
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  // The latest callback, so a parent that passes a fresh function each render
  // does not make the thread reload itself.
  const activityRef = useRef(onActivity);
  useEffect(() => {
    activityRef.current = onActivity;
  });

  const load = useCallback(
    () =>
      fetchMessages(conversationId).then((r) => {
        if (!r.ok) {
          setLoadError(r.error === "supabase-disabled" ? "Messaging is not connected in this environment." : "This conversation could not be loaded. Try again in a minute.");
          setMessages([]);
          return;
        }
        setLoadError("");
        setMessages(r.messages);
        // Reading the thread is what marks the other side's messages read.
        // Best effort: a failure only leaves an unread count standing.
        const other = as === "homeowner" ? "builder" : "homeowner";
        if (!r.messages.some((m) => m.author === other && !m.read_at)) return;
        return markConversationRead({ conversationId, as }).then((marked) => {
          if (marked.ok) activityRef.current?.();
        });
      }),
    [conversationId, as]
  );

  useEffect(() => {
    load();
  }, [load]);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendError("");
    const r = await sendConversationMessage({ conversationId, body, as });
    setSending(false);
    if (!r.ok) {
      setSendError(
        r.error === "not-allowed"
          ? "ADUAtlas did not accept this message for this conversation."
          : r.error === "supabase-disabled"
            ? "Messaging is not connected in this environment."
            : "Your message was not sent. Try again in a minute."
      );
      return;
    }
    setDraft("");
    setMessages((prev) => [...(prev || []), r.message].filter(Boolean));
    activityRef.current?.();
  };

  // T4-15: "You" only for the viewer's own account (see the note above). A reply
  // from the viewer's side written under an earlier claim carries the company
  // name instead.
  const own = (m) => isOwnMessage(m, { as, ownSince });
  const earlier = (m) => m.author === as && !own(m);
  const label = (m) => (own(m) ? "You" : earlier(m) ? earlierLabel || "Earlier account" : otherName);
  const hasEarlier = Boolean(messages?.some(earlier));
  // A homeowner may always write on their own thread. A builder may write once
  // the homeowner has (0011, rule 3).
  const canReply = messages !== undefined && !loadError && (as === "homeowner" || messages.some((m) => m.author === "homeowner"));

  return (
    <section aria-label="Conversation" className="bg-surface-1-solid border border-stroke rounded-3xl p-5 sm:p-7 flex flex-col">
      {messages === undefined && <p className="text-paper-dim text-sm">Loading the conversation…</p>}
      {loadError && (
        <p role="alert" className="text-sm text-red-700 mb-3">
          {loadError}
        </p>
      )}
      {messages && messages.length === 0 && !loadError && <p className="text-paper-dim text-sm mb-4">No messages in this conversation yet.</p>}
      {hasEarlier && earlierNote && !loadError && <p className="text-paper-dim text-sm mb-4">{earlierNote}</p>}
      {messages && messages.length > 0 && (
        <ol className="space-y-3 mb-5" data-testid="message-list">
          {messages.map((m) => {
            const mine = own(m);
            return (
              <li
                key={m.id}
                data-author={m.author}
                data-own={mine ? "true" : "false"}
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-relaxed break-words ${mine ? "ml-auto bg-accent text-accent-fg" : "bg-canvas border border-stroke text-paper"}`}
              >
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={`mt-1 text-xs ${mine ? "text-accent-fg/75" : "text-paper-dim"}`}>
                  {label(m)}, {formatMessageTime(m.created_at)}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      {canReply ? (
        <form onSubmit={send} className="flex flex-col gap-2">
          <label htmlFor={`reply-${conversationId}`} className="text-paper text-sm font-medium">
            Your message
          </label>
          <textarea
            id={`reply-${conversationId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MESSAGE_MAX}
            rows={3}
            className="w-full px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper text-base focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={sending || !draft.trim()} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors disabled:opacity-60 press">
              <FiSend aria-hidden /> {sending ? "Sending…" : "Send"}
            </button>
            <button type="button" onClick={load} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-stroke text-paper text-sm font-medium hover:border-accent transition press">
              <FiRefreshCw aria-hidden /> Check for new messages
            </button>
          </div>
          {sendError && (
            <p role="alert" className="text-sm text-red-700">
              {sendError}
            </p>
          )}
        </form>
      ) : messages === undefined ? null : (
        <div className="flex flex-col gap-3">
          {blockedText && !loadError && <p className="text-paper-dim text-sm">{blockedText}</p>}
          <div>
            <button type="button" onClick={load} className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border border-stroke text-paper text-sm font-medium hover:border-accent transition press">
              <FiRefreshCw aria-hidden /> Check for new messages
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default MessageThread;
