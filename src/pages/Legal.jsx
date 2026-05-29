import { Link } from "react-router-dom";

const SUPPORT_EMAIL = "hello@aduatlas.com";
const LAST_UPDATED = "May 28, 2026";

const sections = [
  { id: "overview", label: "Overview" },
  { id: "collect", label: "What we collect" },
  { id: "use", label: "How we use it" },
  { id: "cookies", label: "Cookies and analytics" },
  { id: "third-party", label: "Third-party services" },
  { id: "rights", label: "Your choices" },
  { id: "terms", label: "Terms of service" },
  { id: "refund", label: "Refund policy" },
  { id: "contact", label: "Contact" },
];

const Legal = () => {
  return (
    <div className="bg-canvas">
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 sm:pt-28 pb-10 sm:pb-12 border-b border-stroke">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/8 blur-3xl animate-drift-glow" />
        <div className="relative container mx-auto px-5 sm:px-8 max-w-4xl">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
            <span className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase">
              Legal
            </span>
          </div>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Privacy and <span className="italic">Terms.</span>
          </h1>
          <p className="mt-5 text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed">
            What we collect, what we do with it, the rules of using ADUAtlas, and how refunds work.
          </p>
          <p className="mt-4 text-paper-dim/70 text-xs uppercase tracking-[0.15em]">
            Last updated · {LAST_UPDATED}
          </p>
        </div>
      </section>

      <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-14 sm:py-20 grid lg:grid-cols-12 gap-10">

        {/* TOC */}
        <aside className="lg:col-span-3 lg:sticky lg:top-24 self-start">
          <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-4">On this page</p>
          <ul className="space-y-2">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="text-paper-dim hover:text-paper text-sm transition-colors"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        {/* Body */}
        <article className="lg:col-span-9 space-y-12 text-paper-dim text-base leading-relaxed">

          <section id="overview" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">Overview</h2>
            <p>
              ADUAtlas is a planning and decision-support service for homeowners considering an Accessory Dwelling Unit. We collect the minimum information needed to deliver a property snapshot, the ADU Course, and (when purchased) a Property Feasibility Study.
            </p>
            <p className="mt-3">
              We are not a law firm, an engineering firm, an appraiser, or a permitting authority. Our reports are intended to make conversations with your city, builder, lender, and licensed professionals sharper, not to replace them.
            </p>
          </section>

          <section id="collect" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">What we collect</h2>
            <ul className="space-y-3 list-disc pl-5">
              <li><span className="text-paper">Property address</span> you submit when you check your property.</li>
              <li><span className="text-paper">Quiz answers</span> you provide during the Reality Check (lot size band, budget, timeline, knowledge gaps).</li>
              <li><span className="text-paper">Email address</span> if you choose to receive your results, create an account, or purchase.</li>
              <li><span className="text-paper">Payment information</span> processed by Stripe. We do not see or store full card numbers.</li>
              <li><span className="text-paper">Usage and device data</span> through privacy-respecting analytics: pages viewed, anonymized session data, basic device and browser type.</li>
              <li><span className="text-paper">Account data</span> if you create an account: email, password (hashed), course progress, saved property details.</li>
            </ul>
          </section>

          <section id="use" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">How we use it</h2>
            <ul className="space-y-3 list-disc pl-5">
              <li>Generate your property snapshot, ADU Ready Score, and Property Feasibility Study.</li>
              <li>Deliver the ADU Course and track your progress through chapters.</li>
              <li>Send transactional emails (receipts, password resets, course updates, study delivery).</li>
              <li>Send product updates and tips if you opt in. You can unsubscribe at any time.</li>
              <li>Improve the product through aggregated, anonymized usage analysis.</li>
            </ul>
            <p className="mt-3">
              We do not sell your personal information. We do not share your individual property address with builders without your explicit consent.
            </p>
          </section>

          <section id="cookies" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">Cookies and analytics</h2>
            <p>
              We use a small number of cookies to keep you logged in, remember preferences, and measure how the site is used. We use a privacy-respecting analytics provider; analytics events are aggregated and not used to build advertising profiles.
            </p>
          </section>

          <section id="third-party" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">Third-party services</h2>
            <p>To run ADUAtlas, we rely on a small set of vendors:</p>
            <ul className="space-y-3 list-disc pl-5 mt-3">
              <li><span className="text-paper">Stripe</span> processes payments. Stripe collects card and billing information directly under its own privacy policy.</li>
              <li><span className="text-paper">Supabase</span> hosts our database and authentication.</li>
              <li><span className="text-paper">Resend</span> delivers transactional and course emails.</li>
              <li><span className="text-paper">Mapbox</span> powers address autocomplete on the property check.</li>
              <li><span className="text-paper">Public records and GIS data providers</span> for parcel, zoning, and permit data used in your snapshot and Property Feasibility Study.</li>
            </ul>
          </section>

          <section id="rights" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">Your choices</h2>
            <ul className="space-y-3 list-disc pl-5">
              <li><span className="text-paper">Access and export.</span> Email us and we'll send you a copy of the personal data we hold about you.</li>
              <li><span className="text-paper">Correction.</span> Update your account information at any time from your settings.</li>
              <li><span className="text-paper">Deletion.</span> Email us to delete your account. Some records (purchases, tax records) may be retained where required by law.</li>
              <li><span className="text-paper">Opt out.</span> Unsubscribe from product emails through the link in any email. Transactional messages will continue while your account is active.</li>
            </ul>
          </section>

          <section id="terms" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">Terms of service</h2>
            <p>
              By using ADUAtlas you agree to these terms. The service is provided as a planning and decision-support tool, and is offered as-is, without warranty of fitness for a particular project, permit, or financing outcome.
            </p>
            <p className="mt-3">
              <span className="text-paper">Course access:</span> The ADU Course is yours to keep. You can revisit any chapter at any time. Course content is updated as ADU regulations, types, and costs change; an optional $99 annual renewal gives you the refreshed content for the following 12 months. Without renewal, your access continues to the content as it was at the time of your most recent renewal.
            </p>
            <p className="mt-3">
              <span className="text-paper">Property Feasibility Study:</span> A one-time deliverable priced at $399, reduced by the $99 course credit when purchased after the course. The Study summarizes lot, zoning, setback, buildable area, and pre-site considerations as of the date of delivery. It is not a substitute for a survey, civil drawings, soils report, structural engineering, or city permit.
            </p>
            <p className="mt-3">
              <span className="text-paper">Acceptable use:</span> Do not scrape the site, share your account, or use the service to harass, defraud, or harm others. We may suspend accounts that violate these terms.
            </p>
            <p className="mt-3">
              <span className="text-paper">Disclaimers.</span> Property data is sourced from public records and modeled estimates. Coverage and freshness vary by jurisdiction. Always confirm critical details with your city, a licensed architect or engineer, your lender, and a qualified contractor before committing to a design or breaking ground.
            </p>
          </section>

          <section id="refund" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">Refund policy</h2>
            <p>
              <span className="text-paper">ADU Course ($99):</span> 7-day refund, no questions asked. If the course is not for you, email us within 7 days of purchase from the address associated with your account and we will refund in full and revoke access.
            </p>
            <p className="mt-3">
              <span className="text-paper">Course renewal ($99/year):</span> 7-day refund on a renewal charge if you have not opened any chapter or downloaded any updated material since the renewal.
            </p>
            <p className="mt-3">
              <span className="text-paper">Property Feasibility Study ($399):</span> Refundable up to the point we begin compiling your Study (typically within 24 hours of purchase). Once compilation has started, the Study is non-refundable because the work is bespoke to your parcel.
            </p>
            <p className="mt-3">
              Refunds are issued to the original payment method and typically appear within 5 to 10 business days, depending on your bank.
            </p>
          </section>

          <section id="contact" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">Contact</h2>
            <p>
              Questions, requests, or refund issues:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:text-paper transition-colors">
                {SUPPORT_EMAIL}
              </a>
            </p>
            <p className="mt-3 text-paper-dim text-sm">
              We respond within 2 business days. For account-specific requests, email from the address associated with your account.
            </p>
          </section>

          <div className="pt-8 border-t border-stroke flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <p className="text-paper-dim text-xs">© 2026 ADUAtlas. All rights reserved.</p>
            <Link to="/" className="text-paper hover:text-accent text-sm transition-colors">
              Back to home →
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
};

export default Legal;
