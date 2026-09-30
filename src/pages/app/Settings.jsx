import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiCreditCard, FiLock, FiLogOut, FiMail, FiRotateCcw, FiShield, FiUser } from "react-icons/fi";
import { planById, formatPrice } from "../../lib/plans";
import { currentUser, logout } from "../../stores/authStore";
import { sendEmail, TEMPLATES } from "../../lib/email";
import { MESSAGE_KINDS, fetchMessages, sendMessage } from "../../lib/studies";
import { supabase, supabaseEnabled } from "../../lib/supabase";
import { EV, track } from "../../lib/analytics";

// The customer's account page. Every control here is wired to something that
// actually happens: a row with no implementation behind it does not belong on a
// page a paying customer reads.
//
// THIS ROUTE IS SIGNED-IN ONLY, AND NOT PLAN-GATED, ON PURPOSE. The router
// declares /settings as <SignedInOnly><Settings /></SignedInOnly>
// (src/router/router.jsx; see src/components/messaging/SignedInOnly.jsx), not
// inside the <PaidGate> most of the signed-in app uses. A refund stamps
// refunded_at, which ends the paid plan, so a PaidGate here would show a
// refunded customer a paywall in place of the refund thread and hide
// ADUAtlas's reply from the person it answers (contract C1; check 853 guards
// it). Do not put this route back behind PaidGate.
//
// The page still gates itself on what it can prove, as belt and braces behind
// SignedInOnly: there is no account view without a session (the !user branch
// below; before, an anonymous visitor was shown a Username of "-", "Unpaid" and
// a Request refund button that called the database as nobody), and no refund
// control unless money bought the plan. Neither is the boundary: RLS and
// migration 0024 decide what may be read and filed.
//
// WHAT THE ACCOUNT HOLDS AND WHETHER MONEY BOUGHT IT ARE TWO FACTS (decision
// 2r, R3-16). A sponsored or comped homeowner holds a plan they did not pay
// for, so this page never reads the plan's price as a payment. Both facts come
// from the server: the account's own users row says what it holds and where
// that came from, and my_qualifying_paid_plan() says whether money bought it,
// which is the same question the database asks before it accepts a refund
// request (0024). The localStorage tier mirror is not consulted here.
//
// The refund request is the load-bearing control. The site promises a 48 hour
// full refund, so the request has to REACH ADUAtlas rather than only emailing the
// person who asked. It is filed as a support_messages row of kind
// 'refund_request' (contract C1), which is the thread an admin reads and answers
// in the admin console, and that row is the RECORD. ADUAtlas's replies come back
// into the same thread, and this page shows it (R3-01): before, a refund request
// was filed into the Concierge support thread, which only a Concierge customer
// can open, so a Golden or Platinum customer never saw the answer. The
// operations email is a nudge on top of the record and is allowed to fail
// without costing anyone their refund window: it goes to the fixed OPS_EMAIL
// address the server holds, never to an address this page supplies.
//
// This address is the one a customer can write to unaided, so it stays in the
// copy even though the request no longer depends on anybody reading it.
const OPS_EMAIL = "hello@aduatlas.com";

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";

// The account's billing facts, read from the server for the signed-in account.
const loadBilling = async () => {
  if (!supabaseEnabled || !supabase) return { ok: false, error: "supabase-disabled" };
  try {
    const { data: sess } = await supabase.auth.getSession();
    const authId = sess?.session?.user?.id;
    if (!authId) return { ok: false, error: "not-signed-in" };
    const [row, basis] = await Promise.all([
      supabase.from("users").select("paid_tier, paid_at, refunded_at, paid_origin").eq("auth_user_id", authId).maybeSingle(),
      supabase.rpc("my_qualifying_paid_plan"),
    ]);
    if (row.error) return { ok: false, error: row.error.message };
    if (basis.error) return { ok: false, error: basis.error.message };
    return { ok: true, row: row.data || null, moneyPlan: planById(basis.data)?.id || null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
};

// One word for where the account stands. "bought" is the only state in which
// money was paid for what the account holds, and the only one offered a refund.
const billingState = (billing) => {
  const row = billing?.row;
  if (!row?.paid_at) return row?.refunded_at ? "refunded" : "none";
  if (row.refunded_at) return "refunded";
  if (billing.moneyPlan) return "bought";
  if (row.paid_origin === "admin_comp") return "comped";
  if (row.paid_origin === "sponsorship") return "sponsored";
  // Held, but no payment on record: a sponsorship recorded only in the
  // redemption ledger reads this way. Unknown stays unknown (2b).
  return "unpaid-access";
};

const Settings = () => {
  const navigate = useNavigate();
  const user = currentUser();
  const [refund, setRefund] = useState({ state: "idle", msg: "" });
  // undefined = loading; { ok, row, moneyPlan } once read.
  const [billing, setBilling] = useState(undefined);
  const [thread, setThread] = useState([]);
  const [note, setNote] = useState("");
  const [noteState, setNoteState] = useState({ state: "idle", msg: "" });

  const loadThread = useCallback(async () => {
    const r = await fetchMessages(MESSAGE_KINDS.REFUND_REQUEST);
    setThread(r.ok ? r.messages : []);
  }, []);

  const signedIn = Boolean(user);
  useEffect(() => {
    if (!signedIn) return undefined;
    let cancelled = false;
    loadBilling().then((b) => {
      if (!cancelled) setBilling(b);
    });
    fetchMessages(MESSAGE_KINDS.REFUND_REQUEST).then((r) => {
      if (!cancelled) setThread(r.ok ? r.messages : []);
    });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const state = billing === undefined ? "loading" : billing.ok ? billingState(billing) : "unknown";
  const plan = planById(billing?.row?.paid_tier);
  const planLabel = (() => {
    if (state === "loading") return "Checking your plan";
    if (state === "unknown") return "We could not check your plan just now";
    if (!plan || state === "none") return "No plan yet";
    if (state === "refunded") return `${plan.name} (refunded)`;
    if (state === "bought") return `${plan.name} · ${formatPrice(plan.priceCents)} (one time)`;
    if (state === "comped") return `${plan.name} · given by ADUAtlas at no charge`;
    if (state === "sponsored") return `${plan.name} · sponsored, no charge to you`;
    return plan.name;
  })();
  const paymentLabel = {
    loading: "Checking",
    unknown: "Not available right now",
    none: "No payment",
    bought: "Paid",
    comped: "No payment. ADUAtlas gave you this access at no charge.",
    sponsored: "No payment. Your access is sponsored.",
    "unpaid-access": "No payment on record",
    refunded: `Refunded${billing?.row?.refunded_at ? ` on ${formatDate(billing.row.refunded_at)}` : ""}`,
  }[state];

  const requested = thread.some((m) => m.author === "homeowner");

  const handleRefund = async () => {
    if (refund.state === "sending" || refund.state === "sent" || state !== "bought") return;
    setRefund({ state: "sending", msg: "" });
    track(EV.REFUND_REQUESTED);

    const body = `Refund request under the 48 hour policy. Account: ${user?.email || "not recorded"}. Plan: ${planLabel}.`;
    const filed = await sendMessage(body, MESSAGE_KINDS.REFUND_REQUEST);
    if (!filed.ok) {
      setRefund({
        state: "error",
        msg:
          filed.error === "not-entitled"
            ? `We could not file your request because we could not confirm a payment on this account. Email ${OPS_EMAIL} within your 48 hours and we will look into it and refund any payment in full.`
            : `We could not file your request from here. Email ${OPS_EMAIL} within your 48 hours and we will refund in full.`,
      });
      return;
    }
    loadThread();

    // The request is on record above, so neither email can cost the customer
    // their refund window.
    //
    // The operations nudge goes to the fixed address the server holds. `to` is
    // not passed, and would be ignored if it were: this template's recipient
    // comes from OPS_EMAIL in the environment, which is what makes it impossible
    // to aim at a third party. A failure here is OURS, so it is logged rather
    // than shown to the customer; the filed row is what ADUAtlas works from.
    const nudged = await sendEmail({ template: TEMPLATES.REFUND_REQUEST_OPS, data: { note: body } });
    if (!nudged.ok) console.error("refund ops notification failed:", nudged.error);

    // The customer's own copy goes to the address on their verified session, so
    // no recipient is passed here either. This one the customer is told about,
    // because an unsent confirmation is a promise the page should not make.
    const confirmed = await sendEmail({ template: TEMPLATES.REFUND_REQUESTED });

    setRefund({
      state: "sent",
      msg: confirmed.ok
        ? `Refund request received. It is filed with our team, and a confirmation is on its way${user?.email ? ` to ${user.email}` : ""}. We will reply within one business day, and our reply appears below on this page. Write to ${OPS_EMAIL} if you want to add anything.`
        : `Refund request received. It is filed with our team, and we will reply within one business day. Our reply appears below on this page. We could not send you a confirmation email, so keep this page as your record, or write to ${OPS_EMAIL} if you would rather have it in writing.`,
    });
  };

  const handleNote = async (e) => {
    e.preventDefault();
    const body = note.trim();
    if (!body || noteState.state === "sending") return;
    setNoteState({ state: "sending", msg: "" });
    const r = await sendMessage(body, MESSAGE_KINDS.REFUND_REQUEST);
    if (!r.ok) {
      setNoteState({ state: "error", msg: `Your note was not sent. Email ${OPS_EMAIL} and we will add it to your request.` });
      return;
    }
    setNote("");
    setNoteState({ state: "idle", msg: "" });
    loadThread();
  };

  // No session: nothing on this page can be true, so none of it is shown.
  if (!user) {
    return (
      <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
        <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-6">
          Your account.
        </h1>
        <Section icon={FiLock} title="Sign in">
          <p className="text-paper-dim text-sm leading-relaxed mb-6">
            Log in to see your account, your plan and your refund options. If you have paid but not created an account yet, use the email address you paid with.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/create-account"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition"
            >
              Create your account
            </Link>
          </div>
        </Section>
        <Section icon={FiMail} title="Support">
          <p className="text-paper-dim text-sm leading-relaxed">
            Email <a href={`mailto:${OPS_EMAIL}`} className="text-accent hover:text-paper transition-colors">{OPS_EMAIL}</a> and we'll get back to you within one business day. If you are inside your 48 hour refund window and cannot sign in, write to us and we will refund in full.
          </p>
        </Section>
      </div>
    );
  }

  const mail = (
    <a href={`mailto:${OPS_EMAIL}`} className="text-accent hover:text-paper transition-colors">{OPS_EMAIL}</a>
  );

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
      <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-12">
        Your account.
      </h1>

      {/* Account */}
      <Section icon={FiUser} title="Account">
        <Row label="Username" value={user?.username || "-"} />
        <Row label="Email" value={user?.email || "-"} />
        <Row label="Role" value={user?.role === "pro" ? "Builder / Pro" : "Homeowner"} />
      </Section>

      {/* Security */}
      <Section icon={FiShield} title="Security">
        <Row
          label="Password"
          value="••••••••"
          action={{ label: "Change", onClick: () => navigate("/forgot-password") }}
        />
      </Section>

      {/* Billing */}
      <Section icon={FiCreditCard} title="Billing">
        <Row label="Plan" value={planLabel} testId="billing-plan" />
        <Row label="Payment status" value={paymentLabel} testId="billing-status" />
      </Section>

      {/* Refund. The control is shown only where money bought what the account
          holds; every other account is told plainly why there is nothing to
          refund, and gets the address of a human instead of a button. */}
      <Section icon={FiRotateCcw} title="Refund (within 48 hours)">
        <div data-testid="refund-section" data-refund={state}>
          {state === "loading" && <p className="text-paper-dim text-sm leading-relaxed">Checking your payment.</p>}

          {state === "unknown" && (
            <p className="text-paper-dim text-sm leading-relaxed">
              We could not check your payment just now. Reload this page to try again. If you paid in the last 48 hours and want a refund, write to {mail} and we will refund in full.
            </p>
          )}

          {state === "bought" && (
            <>
              <p className="text-paper-dim text-sm leading-relaxed mb-5">
                We offer a 48 hour full refund, no questions asked. If the system isn't useful within 48 hours of purchase, request a refund and we'll handle it within one business day.
              </p>
              {!requested && (
                <button
                  type="button"
                  onClick={handleRefund}
                  data-testid="request-refund"
                  disabled={refund.state === "sending" || refund.state === "sent"}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stroke text-paper-dim hover:text-paper hover:border-accent transition text-sm disabled:opacity-60 disabled:hover:text-paper-dim disabled:hover:border-stroke"
                >
                  {refund.state === "sending" ? "Sending…" : refund.state === "sent" ? "Request sent" : "Request refund"}
                </button>
              )}
              {requested && !refund.msg && (
                <p className="text-paper-dim text-sm leading-relaxed">
                  Your refund request is filed with our team. Our replies appear below, and you can add a note to the request here.
                </p>
              )}
              {refund.msg && (
                <p
                  role="status"
                  className={`mt-4 text-sm leading-relaxed ${refund.state === "error" ? "text-red-700" : "text-accent"}`}
                >
                  {refund.msg}
                </p>
              )}
            </>
          )}

          {state === "comped" && (
            <p className="text-paper-dim text-sm leading-relaxed">
              You did not pay for this access. ADUAtlas gave it to you at no charge, so there is no payment to refund. If you also paid for a plan with a different email address in the last 48 hours, write to {mail} and we will find that payment and refund it in full.
            </p>
          )}

          {state === "sponsored" && (
            <p className="text-paper-dim text-sm leading-relaxed">
              You did not pay for this access. It is sponsored, so there is no payment to refund. If you also paid for a plan with a different email address in the last 48 hours, write to {mail} and we will find that payment and refund it in full.
            </p>
          )}

          {state === "unpaid-access" && (
            <p className="text-paper-dim text-sm leading-relaxed">
              We have no payment on record for this access, so there is nothing to refund here. If you did pay for it in the last 48 hours, with this or a different email address, write to {mail} and we will find the payment and refund it in full.
            </p>
          )}

          {state === "refunded" && (
            <p className="text-paper-dim text-sm leading-relaxed">
              Your payment was refunded{billing?.row?.refunded_at ? ` on ${formatDate(billing.row.refunded_at)}` : ""}. Write to {mail} if you have a question about it.
            </p>
          )}

          {state === "none" && (
            <p className="text-paper-dim text-sm leading-relaxed">
              We have no purchase recorded on this account, so there is nothing to refund here. Every package carries a 48 hour full refund. If you paid with a different email address in the last 48 hours, write to {mail} and we will find the payment and refund it in full.
            </p>
          )}

          {/* The refund thread: the request and ADUAtlas's replies. Shown
              whenever there is one, whatever the account holds now, so an
              answer is never lost behind a later change of plan. */}
          {thread.length > 0 && (
            <div className="mt-6 border-t border-stroke pt-5" data-testid="refund-thread">
              <p className="text-paper text-sm font-semibold mb-3">Your refund request</p>
              <ul className="space-y-3">
                {thread.map((m) => (
                  <li
                    key={m.id}
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.author === "homeowner" ? "bg-canvas border border-stroke text-paper" : "bg-accent/10 border border-accent/40 text-paper"}`}
                  >
                    <p className="text-paper-dim text-xs mb-1">
                      {m.author === "homeowner" ? "You" : "ADUAtlas"} · {new Date(m.created_at).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-line break-words">{m.body}</p>
                  </li>
                ))}
              </ul>
              {state === "bought" && requested && (
                <form onSubmit={handleNote} className="mt-4 flex flex-col sm:flex-row gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note to your request"
                    aria-label="Add a note to your refund request"
                    className="flex-1 min-w-0 px-4 py-3 bg-canvas border border-stroke rounded-xl text-paper text-base focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <button
                    type="submit"
                    disabled={noteState.state === "sending" || !note.trim()}
                    className="px-5 py-3 rounded-xl border border-stroke text-paper text-sm font-medium hover:border-accent transition disabled:opacity-60"
                  >
                    {noteState.state === "sending" ? "Sending…" : "Send note"}
                  </button>
                </form>
              )}
              {noteState.msg && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  {noteState.msg}
                </p>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* Support */}
      <Section icon={FiMail} title="Support">
        <p className="text-paper-dim text-sm leading-relaxed">
          Email {mail} and we'll get back to you within one business day.
        </p>
      </Section>

      {/* Sign out */}
      <div className="border-t border-stroke pt-8 mt-10">
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl border border-stroke text-paper-dim hover:text-paper hover:border-accent transition"
        >
          <FiLogOut /> Log out
        </button>
      </div>
    </div>
  );
};

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8 mb-5">
    <div className="flex items-center gap-2 text-paper-dim text-xs mb-5">
      <Icon /> {title}
    </div>
    {children}
  </div>
);

const Row = ({ label, value, action, testId }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 border-b border-stroke last:border-b-0">
    <div className="min-w-0">
      <p className="text-paper-dim text-xs">{label}</p>
      <p className="text-paper text-sm sm:text-base break-words" data-testid={testId}>{value}</p>
    </div>
    {action && (
      <button
        onClick={action.onClick}
        className="tap-target text-accent text-sm font-medium hover:text-paper transition-colors self-start sm:self-auto shrink-0"
      >
        {action.label}
      </button>
    )}
  </div>
);

export default Settings;
