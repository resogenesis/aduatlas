import { useEffect, useState } from "react";
import { FiSend } from "react-icons/fi";
import { fetchMessages, fetchMyStudy, sendMessage } from "../../lib/studies";
import { supabaseEnabled } from "../../lib/supabase";

// Concierge support: portal messages plus consultation scheduling and usage.
// Concierge only (route is gated). Consultation time is capped at 60 minutes.
const Support = () => {
  const [messages, setMessages] = useState([]);
  const [study, setStudy] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    fetchMessages().then((r) => setMessages(r.ok ? r.messages : []));
    fetchMyStudy().then((r) => setStudy(r.ok ? r.study : null));
  };
  useEffect(() => {
    load();
  }, []);

  const send = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError("");
    const r = await sendMessage(body);
    setSending(false);
    if (!r.ok) {
      setError(r.error === "supabase-disabled" ? "Messaging is not connected in this environment." : `Could not send: ${r.error}`);
      return;
    }
    setDraft("");
    load();
  };

  const used = study?.consult_minutes_used ?? 0;
  const left = Math.max(0, 60 - used);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">Concierge support</h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        Ask about your study, your site plan, or your next steps. Concierge is guidance, not construction project management.
      </p>

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-7 flex flex-col">
          <h2 className="font-primary font-extrabold tracking-tight text-paper text-xl mb-4">Messages</h2>
          <ul className="space-y-3 flex-1 mb-5 max-h-[50vh] overflow-y-auto pr-1">
            {messages.length === 0 && <li className="text-paper-dim text-sm">No messages yet. Ask your first question below.</li>}
            {messages.map((m) => (
              <li key={m.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.author ==="homeowner"?"ml-auto bg-accent text-accent-fg":"bg-canvas border border-stroke text-paper"}`}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={`mt-1 text-[0.65rem] ${m.author ==="homeowner"?"text-accent-fg/70":"text-paper-dim"}`}>
                  {m.author === "homeowner" ? "You" : "ADUAtlas"} · {new Date(m.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
          <form onSubmit={send} className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your question"
              aria-label="Message"
              className="flex-1 px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={!supabaseEnabled}
            />
            <button type="submit" disabled={sending || !supabaseEnabled} className="px-4 py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors disabled:opacity-60" aria-label="Send">
              <FiSend />
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {error}
            </p>
          )}
        </section>

        <section className="bg-canvas border border-stroke rounded-3xl p-6 sm:p-7">
          <h2 className="font-primary font-extrabold tracking-tight text-paper text-xl mb-2">Private consultation</h2>
          <p className="font-primary font-extrabold tracking-tight text-paper text-4xl mb-1">{left} min</p>
          <p className="text-paper-dim text-sm mb-5">remaining of 60. Use it as one 60-minute call or two 30-minute calls.</p>
          {study?.consult_link ? (
            <a href={study.consult_link} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors">
              Schedule a call
            </a>
          ) : (
            <p className="text-paper-dim text-sm">Ask for a time in the messages and we will send you a scheduling link.</p>
          )}
        </section>
      </div>
    </div>
  );
};

export default Support;
