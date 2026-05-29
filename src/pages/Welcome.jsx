import { useEffect } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCheckCircle } from "react-icons/fi";
import { setPaid } from "../stores/paymentStore";
import { currentUser } from "../stores/authStore";
import { EV, track } from "../lib/analytics";
import { sendEmail, TEMPLATES } from "../lib/email";

// INTEGRATION POINT (Stripe webhook + Supabase): when this page loads in
// production, the Stripe success_url will include ?session_id=. The
// webhook will have already set users.paid_at via the checkout.session.completed
// event. This page just confirms and routes the user into the course.
//
// INTEGRATION POINT (Resend): trigger "Welcome — your access is unlocked"
// transactional email here.

const Welcome = () => {
  useEffect(() => {
    setPaid(true);
    track(EV.PURCHASE_COMPLETED);
    const u = currentUser();
    if (u?.email) {
      sendEmail({
        template: TEMPLATES.WELCOME,
        to: u.email,
        data: { dashboardUrl: window.location.origin + "/dashboard" },
      });
    }
  }, []);

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
          Confirmation is on its way to your email. Start with Chapter 1. The course is 6 chapters and 20+ modules, ending with your personalized Property Feasibility Report and Feasibility Packet.
        </p>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-8 sm:p-10 text-left mb-10">
          <h3 className="text-paper text-xs uppercase tracking-[0.2em] mb-6">Your next 3 steps</h3>
          <ol className="space-y-6">
            {[
              { n: "01", t: "Start Chapter 1: How to ADU", d: "Process, timelines, and the foundation everything else builds on." },
              { n: "02", t: "Work through the modules", d: "20+ modules across 6 chapters, each with worksheets pre-filled from your quiz answers." },
              { n: "03", t: "Unlock your Property Feasibility Report", d: "Chapter 6 generates your GIS site plan, refined feasibility score, and Feasibility Packet." },
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
