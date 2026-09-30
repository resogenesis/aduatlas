import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiAlertCircle, FiArrowRight, FiCheckCircle, FiInfo, FiRefreshCw, FiUserPlus } from "react-icons/fi";
import { setPaid, TIERS } from "../stores/paymentStore";
import { currentUser, hasServerSession, refreshEntitlement } from "../stores/authStore";
import { EV, track } from "../lib/analytics";

// The post-checkout page. Stripe's success_url is
// /welcome?session_id=...&tier=...&email=..., and this page confirms with the
// server that the session was actually PAID before flipping the local access
// hint. The Stripe webhook is what writes users.paid_at; that row, not this
// page, is the entitlement.
//
// SECURITY: the localStorage flag set here is a CLIENT-SIDE UX HINT so the SPA
// renders the unlocked state immediately. The real entitlement gate is
// server-side `users.paid_at` (non-null AND not refunded) + `users.paid_tier`.
// A bare /welcome with no checkout context must NOT grant access, and neither
// may anything a visitor can type into the URL.
//
// Step 4 of the locked flow (understand, choose, pay, create or access an
// account, intake and course, receive the work) happens here: a buyer who paid
// before creating an account is asked to create one, carrying the email Stripe
// billed, because that address is what the webhook wrote the purchase against.
//
// THE WELCOME EMAIL IS NO LONGER SENT FROM HERE. It used to be fired from this
// component's effect, which meant it only existed for a buyer whose browser
// stayed on this screen: anyone who closed the tab had paid between $79 and $500
// and was never told to create an account. api/stripe-webhook.js sends it now,
// from the checkout.session.completed event, to the address Stripe billed, once
// per event through the stripe_events ledger. The browser is no longer on the
// critical path of the only message a paying customer has to receive, and this
// page does not duplicate it: a second send from here would mail the buyer again
// on every reload of this URL.
//
// THREE ANSWERS, NOT TWO. Verification used to collapse "Stripe says this was not
// paid" and "we could not reach Stripe" into one state, and this page then told a
// customer whose card had just been charged "No active purchase found." A network
// blip is not evidence that a purchase does not exist. api/verify-session.js now
// returns a `status`, and "unavailable" gets its own screen that says something
// true and recoverable.

// The default is a real route in this repo, so a production build made without
// VITE_VERIFY_ENDPOINT still verifies the session rather than silently refusing
// to grant a genuine purchase.
const VERIFY_ENDPOINT = import.meta.env.VITE_VERIFY_ENDPOINT || "/api/verify-session";

// One automatic retry before the buyer is asked to do anything, because the
// common cause of "unavailable" is a transient blip on a single request.
const AUTO_RETRY_MS = 2500;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeTier = (raw) => (Object.values(TIERS).includes(raw) ? raw : null);

// The email carried over from checkout. It only prefills the account form, so
// it is sanitized for shape rather than trusted for anything.
const normalizeEmail = (raw) => {
  const e = (raw || "").trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : "";
};

// states: "checking" | "granted" | "none" | "unavailable"
//   none        Stripe answered, and there is no paid session behind this id
//   unavailable we could not get an answer, and must not claim there is none
const Welcome = () => {
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get("session_id");
  // ?mock=1 is honoured in a DEV build only. Vite replaces import.meta.env.DEV
  // with the literal false in a production build, so isMock is constant-false
  // there and the branch below, which would otherwise let a visitor self-grant
  // any tier from the URL, is dropped from the bundle by dead-code elimination.
  const isMock = import.meta.env.DEV && searchParams.get("mock") === "1";
  const urlTier = normalizeTier(searchParams.get("tier"));
  const checkoutEmail = normalizeEmail(searchParams.get("email"));
  const needsVerify = Boolean(sessionId);

  // Derive the initial status synchronously from the URL so we never call
  // setState in the effect for the mock / bare cases (which would cascade):
  //   - a Stripe session id that needs server verification → "checking"
  //   - a dev-build mock checkout marker                   → "granted"
  //   - bare /welcome (no checkout context)                → "none" (no access)
  const [status, setStatus] = useState(needsVerify ? "checking" : isMock ? "granted" : "none");
  const [grantedTier, setGrantedTier] = useState(isMock ? urlTier : null);
  const [signedIn, setSignedIn] = useState(() => Boolean(currentUser()));
  // Bumped to re-run verification: once automatically, then by the buyer.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;

    const onGranted = async (resolvedTier) => {
      // Flip the LOCAL access hint + fire side effects. This only drives SPA
      // rendering; the server gate is users.paid_at + users.paid_tier.
      setPaid(true, resolvedTier || undefined);
      track(EV.PURCHASE_COMPLETED);

      // Pull server truth ONLY when this browser already holds a Supabase
      // session, and let whatever it says stand. The old code re-asserted
      // setPaid(true) whenever refreshEntitlement() reported the user was not
      // paid, which let a client-side hint outrank the server's answer. There
      // is no re-assert now: the server always wins.
      //
      // The normal post-checkout case has no session at all, because payment
      // precedes account creation. Hydrating from a null session clears the
      // mirror, which would paywall the buyer whose payment Stripe just
      // confirmed, so the refresh is skipped until there is a session to read.
      // The verified grant stays a local hint; once the account exists,
      // authStore's hydration writes the mirror from the row the webhook set.
      if (await hasServerSession()) {
        // The webhook and this redirect race. Re-READING the server a few times
        // lets the webhook land; it is not an override, because whatever the
        // server says at each read is what the mirror ends up holding. If the
        // webhook is slow the buyer is briefly gated, which is the correct way
        // round: the alternative was a client flag outranking the server.
        for (let attemptNo = 0; attemptNo < 3; attemptNo += 1) {
          const u = await refreshEntitlement();
          if (cancelled) return;
          setSignedIn(Boolean(currentUser()));
          if (u?.paid) break;
          if (attemptNo < 2) await new Promise((r) => setTimeout(r, 1500));
          if (cancelled) return;
        }
      }
    };

    // Could not reach a verdict. Never claim the purchase does not exist; retry
    // once on our own, then hand the buyer a button.
    const onUnavailable = () => {
      setStatus("unavailable");
      if (attempt === 0) {
        retryTimer = setTimeout(() => {
          if (!cancelled) setAttempt(1);
        }, AUTO_RETRY_MS);
      }
    };

    // Dev-build mock checkout: we already derived "granted" + tier above; just
    // run the side effects.
    if (isMock && !needsVerify) {
      onGranted(urlTier);
      return () => {
        cancelled = true;
      };
    }

    // Real Stripe session: verify server-side that it was actually paid before
    // granting. This is the only path that legitimately flips state async.
    if (needsVerify) {
      (async () => {
        setStatus("checking");
        try {
          const res = await fetch(`${VERIFY_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}`);
          let json = null;
          try {
            json = await res.json();
          } catch {
            json = null;
          }
          if (cancelled) return;
          if (res.ok && json?.paid) {
            const resolved = normalizeTier(json.tier) || urlTier;
            setGrantedTier(resolved);
            setStatus("granted");
            await onGranted(resolved);
            return;
          }
          // "unpaid" and "not-found" are answers from Stripe and may be stated.
          // Anything else, including a 5xx or an unparseable body, is not.
          const answered = res.ok && (json?.status === "unpaid" || json?.status === "not-found");
          if (answered) setStatus("none");
          else onUnavailable();
        } catch {
          // The request itself failed, so we know nothing about the payment.
          if (!cancelled) onUnavailable();
        }
      })();
    }

    // Bare /welcome: status is already "none"; do nothing (no access granted).
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [sessionId, isMock, needsVerify, urlTier, checkoutEmail, attempt]);

  const createAccountTo = checkoutEmail
    ? `/create-account?email=${encodeURIComponent(checkoutEmail)}`
    : "/create-account";

  // We could not confirm the payment. The buyer may well have been charged, so
  // everything on this screen has to be true whether they were or not: the one
  // thing we know is that we could not get an answer, and the one thing that
  // always helps is creating the account the purchase attaches to.
  if (status === "unavailable") {
    return (
      <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
        <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-surface-1-solid border border-stroke flex items-center justify-center mb-7">
            <FiAlertCircle className="text-paper-dim text-4xl" />
          </div>
          <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            We couldn't confirm your payment yet.
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-4 max-w-xl mx-auto">
            This is a problem on our side, not with your card. We could not reach our payment provider to check, so we are not going to tell you either way.
          </p>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto">
            If you were charged, the payment is recorded and nothing is lost. Create your account with the email address you paid with and your package opens as soon as the payment lands on it. Or try again in a moment.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={() => setAttempt((a) => a + 1)}
              className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors press"
            >
              <FiRefreshCw aria-hidden /> Try again
            </button>
            <Link
              to={createAccountTo}
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition press"
            >
              <FiUserPlus aria-hidden /> Create your account
            </Link>
          </div>
          <p className="text-paper-dim/80 text-xs leading-relaxed mt-6 max-w-md mx-auto">
            Still stuck? Email{" "}
            <a href="mailto:hello@aduatlas.com" className="text-accent hover:text-paper transition-colors">
              hello@aduatlas.com
            </a>{" "}
            with the email address you paid with and we will sort it out by hand.
          </p>
        </div>
      </div>
    );
  }

  if (status !== "granted") {
    return (
      <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
        <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-surface-1-solid border border-stroke flex items-center justify-center mb-7">
            <FiInfo className="text-paper-dim text-4xl" />
          </div>
          <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            {status === "checking" ? "Confirming your purchase…" : "No active purchase found."}
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto">
            {status === "checking"
              ? "Hang tight while we confirm your payment."
              : "We couldn't find a completed checkout for this visit. If you just paid, check your email for the confirmation, or head back to pick your plan."}
          </p>
          {status === "none" && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/unlock"
                className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors press"
              >
                See plans <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition press"
              >
                Log in to your account
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Platinum and Concierge: the property deliverables and the worksheets.
  const platinum = grantedTier === TIERS.REPORT || grantedTier === TIERS.CONCIERGE;

  // The first step also named "Module 1: How to ADU". Module 1 is titled "ADU
  // Basics" in src/stores/courseStore.js, so the page was sending a buyer to look
  // for a module that does not exist under that name.
  // COPY RULE: this page used to sell "state and city resources", which reads as a
  // library of per-state and per-city material in the portal. There is no such
  // surface. What the course actually does is teach a homeowner how to find the
  // look up and verify the rules their own state and city apply, which is a real
  // thing Module 2 does. That is what it says now, in the same words the pricing
  // page and the paywall use. Nothing here may describe a feature nobody built.
  const lead = signedIn
    ? platinum
      ? "Your payment is confirmed. Start with Module 1 while we get ready to prepare your feasibility study and your site plan in two versions."
      : "Your payment is confirmed. Start with Module 1 and work through the ADUAtlas course. Golden includes the whole course, which teaches you how to find and verify your own state and city rules, plus the builder directory. The preparation worksheets, the ADU Ready Score, the feasibility study and the site plan in two versions are part of Platinum."
    : platinum
      ? "Your payment is confirmed. One step left: create your account with the email you paid with. That opens the course, the preparation worksheets and your ADU Ready Score, and the property intake for your feasibility study and your site plan in two versions."
      : "Your payment is confirmed. One step left: create your account with the email you paid with. That opens the course, which teaches you how to find and verify your own state and city rules, and the builder directory.";

  const steps = signedIn
    ? [
        { n: "01", t: "Start Module 1: ADU Basics", d: "What an ADU is, the main types, and the foundation everything else builds on." },
        platinum
          ? { n: "02", t: "Work through the 9 modules", d: "Short lessons, then the preparation worksheets and your ADU Ready Score." }
          : { n: "02", t: "Work through the 9 modules", d: "Short lessons on how the process works and how to look up and verify your own state and city rules, with a knowledge check at the end of each one." },
        platinum
          ? { n: "03", t: "Submit your property details", d: "Your feasibility study and your site plan in two versions appear in your portal when they are ready." }
          : { n: "03", t: "Add the feasibility study and site plan", d: "Upgrade to Platinum any time; what you paid for Golden applies as a credit." },
      ]
    : [
        { n: "01", t: "Create your account", d: "Use the email you paid with, so your purchase attaches to the right account." },
        { n: "02", t: "Start Module 1: ADU Basics", d: "What an ADU is, the main types, and the foundation everything else builds on." },
        platinum
          ? { n: "03", t: "Submit your property details", d: "Your feasibility study and your site plan in two versions appear in your portal when they are ready." }
          : { n: "03", t: "Add the feasibility study and site plan", d: "Upgrade to Platinum any time; what you paid for Golden applies as a credit." },
      ];

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
      <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">

        <div className="w-20 h-20 mx-auto rounded-full bg-accent/15 flex items-center justify-center mb-7">
          <FiCheckCircle className="text-accent text-4xl" />
        </div>

        <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
          You're in.
        </h1>
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-12 max-w-xl mx-auto">
          {lead}
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-10 text-left mb-10">
          <h3 className="text-paper text-xs mb-6">Your next 3 steps</h3>
          <ol className="space-y-6">
            {steps.map((s) => (
              <li key={s.n} className="flex items-start gap-5">
                <span className="font-display text-accent text-2xl leading-none w-8 shrink-0">{s.n}</span>
                <div>
                  <p className="font-display text-paper text-lg mb-1">{s.t}</p>
                  <p className="text-paper-dim text-sm leading-relaxed">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* A buyer who paid before creating an account gets account creation as
            the primary action; a buyer who was already signed in goes straight
            to their portal. */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {signedIn ? (
            <Link
              to="/dashboard"
              className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors press"
            >
              Go to your dashboard <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : (
            <Link
              to={createAccountTo}
              className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors press"
            >
              <FiUserPlus aria-hidden /> Create your account
            </Link>
          )}
          <Link
            to="/course"
            className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl border border-stroke text-paper font-medium hover:border-accent transition press"
          >
            Go to the course
          </Link>
        </div>

        {!signedIn && (
          <p className="text-paper-dim/80 text-xs leading-relaxed mt-6 max-w-md mx-auto">
            {checkoutEmail
              ? `Create your account with ${checkoutEmail} so your purchase and your work stay together.`
              : "Create your account with the email you paid with, so your purchase and your work stay together."}
          </p>
        )}

        {/* A statement about how the system behaves, not a promise about one
            message: the confirmation is sent server-side from the Stripe webhook,
            so it does not depend on this page having been open. */}
        <p className="text-paper-dim/70 text-[0.7rem] leading-relaxed mt-4">
          A confirmation email goes to the address you paid with. 48 hour full refund on every package.
        </p>
      </div>
    </div>
  );
};

export default Welcome;
