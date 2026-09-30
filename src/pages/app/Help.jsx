import { Link } from "react-router-dom";
import { FiArrowRight, FiBookOpen, FiGrid, FiHelpCircle, FiHome, FiMail, FiMessageCircle, FiRotateCcw, FiUsers } from "react-icons/fi";
import { getPaidTier, hasTier, TIERS } from "../../stores/paymentStore";
import { planById } from "../../lib/plans";

// Help: the fifth portal destination (Phase 1 spec, section 4). Every paid
// tier lands here. It explains how the portal is organised, points to the
// refund policy and the contact address, and for Concierge buyers it is the
// door to written support and the consultation at /support. It does not
// replace Concierge support and it has no messaging of its own.
const CONTACT_EMAIL = "hello@aduatlas.com";

const DESTINATIONS = [
  { Icon: FiGrid, to: "/dashboard", label: "Overview", desc: "Where your project stands and what to do next." },
  { Icon: FiBookOpen, to: "/course", label: "My Course", desc: "The ADUAtlas course, module by module. Your progress is saved as you go." },
  {
    Icon: FiHome,
    to: "/my-property",
    label: "My Property and Site Plan",
    desc: "Your project brief, plus the feasibility study, the site plan in two versions, costs and ADU options. The study and site plan are prepared for Platinum and Concierge properties.",
  },
  { Icon: FiUsers, to: "/builders", label: "Builders", desc: "Browse builders by state, ADU type and turnkey preference. Save the ones you like and request an introduction when you are ready." },
  { Icon: FiHelpCircle, to: "/help", label: "Help", desc: "This page explains how the portal is organised, links to the refund policy and gives you a way to reach us." },
];

const Help = () => {
  const plan = planById(getPaidTier());
  const concierge = hasTier(TIERS.CONCIERGE);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <h1 className="font-display text-paper text-4xl sm:text-5xl leading-[1.05] mb-3">Help</h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        How the portal is organised, and how to reach us when you need a person.
      </p>

      {concierge && (
        <section className="bg-accent text-accent-fg rounded-3xl p-7 sm:p-9 mb-8">
          <p className="inline-flex items-center gap-2 text-accent-fg/75 text-sm mb-3">
            <FiMessageCircle aria-hidden /> Concierge
          </p>
          <h2 className="font-display text-3xl sm:text-4xl leading-tight mb-3">Your support is one page away.</h2>
          <p className="text-accent-fg/85 text-sm sm:text-base leading-relaxed mb-6 max-w-xl">
            Write to us through the portal about your study, your site plan or your next steps, and schedule your 60 minutes of private consultation.
          </p>
          <Link to="/support" className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors">
            Open Concierge support <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </section>
      )}

      <section className="bg-canvas border border-stroke rounded-3xl p-7 sm:p-9 mb-6">
        <h2 className="font-display text-paper text-2xl mb-2">How the portal works</h2>
        <p className="text-paper-dim text-sm leading-relaxed mb-6 max-w-2xl">
          The portal has five destinations. {plan ? `You are on the ${plan.name} plan.` : ""}
        </p>
        <ul className="divide-y divide-stroke">
          {DESTINATIONS.map(({ Icon, to, label, desc }) => (
            <li key={to} className="flex items-start gap-4 py-4">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-surface-1-solid text-paper inline-flex items-center justify-center">
                <Icon aria-hidden />
              </span>
              <div className="min-w-0">
                <Link to={to} className="text-paper font-medium hover:text-accent transition-colors">
                  {label}
                </Link>
                <p className="text-paper-dim text-sm leading-relaxed mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
        {!concierge && (
          <p className="text-paper-dim text-sm leading-relaxed mt-6 pt-5 border-t border-stroke">
            Concierge adds written support through the portal and 60 minutes of private consultation.{" "}
            <Link to={`/unlock?tier=${TIERS.CONCIERGE}`} className="text-accent font-medium">
              See Concierge
            </Link>
            .
          </p>
        )}
      </section>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7">
          <p className="inline-flex items-center gap-2 text-paper-dim text-sm mb-3">
            <FiRotateCcw aria-hidden /> Refunds
          </p>
          <h2 className="font-display text-paper text-xl mb-3">48 hour full refund on every package</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-5">
            If ADUAtlas is not for you, ask within 48 hours of purchase and we refund in full. The feasibility study and site plan follow their own rule once we have started preparing them.
          </p>
          <div className="flex flex-col gap-2 text-sm">
            <Link to="/legal#refund" className="inline-flex items-center gap-1 text-accent font-medium">
              Read the refund policy <FiArrowRight />
            </Link>
            <Link to="/settings" className="inline-flex items-center gap-1 text-accent font-medium">
              Request a refund from your account <FiArrowRight />
            </Link>
          </div>
        </section>

        <section className="bg-surface-1-solid border border-stroke rounded-3xl p-7">
          <p className="inline-flex items-center gap-2 text-paper-dim text-sm mb-3">
            <FiMail aria-hidden /> Contact
          </p>
          <h2 className="font-display text-paper text-xl mb-3">Write to us</h2>
          <p className="text-paper-dim text-sm leading-relaxed mb-5">
            Questions about your account, your plan or anything in the portal. We reply within one business day.
          </p>
          <a href={`mailto:${CONTACT_EMAIL}?subject=ADUAtlas%20portal`} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-accent text-accent-fg text-sm font-semibold hover:bg-accent-dim transition-colors">
            <FiMail aria-hidden /> {CONTACT_EMAIL}
          </a>
        </section>
      </div>
    </div>
  );
};

export default Help;
