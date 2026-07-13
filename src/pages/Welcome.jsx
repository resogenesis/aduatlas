import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiInfo } from "react-icons/fi";
import { setPaid, TIERS } from "../stores/paymentStore";
import { currentUser, refreshEntitlement } from "../stores/authStore";
import { EV, track } from "../lib/analytics";
import { sendEmail, TEMPLATES } from "../lib/email";

// INTEGRATION POINT (Stripe webhook + Supabase): in production the Stripe
// success_url includes ?session_id=. The webhook will have already set
// users.paid_at via checkout.session.completed. This page confirms the session
// was actually paid before flipping the LOCAL access flag.
//
// SECURITY: the localStorage flag set here is a CLIENT-SIDE UX HINT so the SPA
// renders the unlocked state immediately. The real entitlement gate is
// server-side `users.paid_at` (non-null AND not refunded). A bare /welcome with
// no checkout context must NOT grant access — otherwise anyone can self-grant by
// visiting the URL.
//
// INTEGRATION POINT (Resend): trigger "Welcome — your access is unlocked"
// transactional email here (only on a confirmed purchase).

const VERIFY_ENDPOINT = import.meta.env.VITE_VERIFY_ENDPOINT || "";

const normalizeTier = (raw) =>
  raw === TIERS.REPORT ? TIERS.REPORT : raw === TIERS.ROADMAP ? TIERS.ROADMAP : null;

// states: "checking" | "granted" | "none"
const Welcome = () => {
  const [searchParams] = useSearchParams();

  const sessionId = searchParams.get("session_id");
  const isMock = searchParams.get("mock") === "1";
  const urlTier = normalizeTier(searchParams.get("tier"));
  const needsVerify = Boolean(sessionId && VERIFY_ENDPOINT);

  // Derive the initial status synchronously from the URL so we never call
  // setState in the effect for the mock / bare cases (which would cascade):
  //   - real Stripe session that needs server verification → "checking"
  //   - explicit mock checkout marker                       → "granted"
  //   - bare /welcome (no checkout context)                 → "none" (no access)
  const [status, setStatus] = useState(needsVerify ? "checking" : isMock ? "granted" : "none");
  const [grantedTier, setGrantedTier] = useState(isMock ? urlTier : null);

  useEffect(() => {
    let cancelled = false;

    const onGranted = (resolvedTier) => {
      // Flip the LOCAL access hint + fire side effects. The real gate is
      // server-side users.paid_at; this only drives SPA rendering.
      setPaid(true, resolvedTier || undefined);
      // Pull server truth (webhook-written users.paid_at) into the session
      // mirror so role/paid reflect the purchase without a reload. If the
      // webhook hasn't landed yet the server still says unpaid — re-assert the
      // local hint so a verified checkout is never paywalled by the race; the
      // next initAuth() re-syncs once the webhook lands.
      refreshEntitlement().then((u) => {
        if (u && !u.paid) setPaid(true, resolvedTier || undefined);
      });
      track(EV.PURCHASE_COMPLETED);
      const u = currentUser();
      if (u?.email) {
        sendEmail({
          template: TEMPLATES.WELCOME,
          to: u.email,
          data: { dashboardUrl: window.location.origin + "/dashboard" },
        });
      }
    };

    // Mock checkout flow: we already derived "granted" + tier above; just run
    // the side effects.
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
        try {
          const res = await fetch(`${VERIFY_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}`);
          const json = await res.json();
          if (cancelled) return;
          if (res.ok && json?.paid) {
            const resolved = normalizeTier(json.tier) || urlTier;
            onGranted(resolved);
            setGrantedTier(resolved);
            setStatus("granted");
          } else {
            setStatus("none");
          }
        } catch {
          if (!cancelled) setStatus("none");
        }
      })();
    }

    // Bare /welcome: status is already "none"; do nothing (no access granted).
    return () => {
      cancelled = true;
    };
  }, [sessionId, isMock, needsVerify, urlTier]);

  if (status !== "granted") {
    return (
      <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
        <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">
          <div className="w-20 h-20 mx-auto rounded-full bg-surface-1-solid border border-stroke flex items-center justify-center mb-7">
            <FiInfo className="text-paper-dim text-4xl" />
          </div>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            {status === "checking" ? "Confirming your purchase…" : "No active purchase found."}
          </h1>
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-10 max-w-xl mx-auto">
            {status === "checking"
              ? "Hang tight while we confirm your payment."
              : "We couldn't find a completed checkout for this visit. If you just paid, check your email for the confirmation link — or head back to pick your plan."}
          </p>
          {status === "none" && (
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/unlock"
                className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
              >
                See plans <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-stroke text-paper font-medium hover:border-paper-dim transition"
              >
                Log in to your account
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  const hasReport = grantedTier === TIERS.REPORT;

  return (
    <div className="min-h-[80vh] bg-canvas py-16 sm:py-24">
      <div className="container mx-auto px-5 sm:px-8 max-w-2xl text-center">

        <div className="w-20 h-20 mx-auto rounded-full bg-accent/15 flex items-center justify-center mb-7">
          <FiCheckCircle className="text-accent text-4xl" />
        </div>

        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
          You're in.
        </h1>
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed mb-12 max-w-xl mx-auto">
          {hasReport
            ? "Confirmation is on its way to your email. Start with Module 1. Work through the 10-module ADUAtlas course, then unlock your personalized Property Feasibility Report and Feasibility Packet."
            : "Confirmation is on its way to your email. Start with Module 1 and work through the 10-module ADUAtlas course. Your purchase includes the course; the Property Feasibility Report is available as an upgrade."}
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-10 text-left mb-10">
          <h3 className="text-paper text-xs uppercase tracking-[0.2em] mb-6">Your next 3 steps</h3>
          <ol className="space-y-6">
            {[
              { n: "01", t: "Start Module 1: How to ADU", d: "Process, timelines, and the foundation everything else builds on." },
              { n: "02", t: "Work through the 10 modules", d: "Each module has worksheets pre-filled from your quiz answers." },
              hasReport
                ? { n: "03", t: "Unlock your Property Feasibility Report", d: "The final modules generate your GIS site plan, refined feasibility score, and Feasibility Packet." }
                : { n: "03", t: "Add the Property Feasibility Report", d: "Upgrade any time to unlock the GIS site plan, feasibility score, and builder match." },
            ].map((s) => (
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

        <Link
          to="/dashboard"
          className="group inline-flex items-center gap-2 px-7 py-4 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
        >
          Go to dashboard <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  );
};

export default Welcome;
