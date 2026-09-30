import { useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiKey, FiMapPin, FiUserCheck, FiImage, FiTag, FiShield } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import { FormField, PrimaryButton } from "../components/common/FormField";
import { captureLead } from "../lib/supabase";

// Public page for builders. Two kinds of listing (Phase 1 spec 5.2): ADUAtlas
// seeds the directory from public information, so a builder may already be
// listed and claims that listing with the code from our invitation. A builder
// who is not listed creates an account (/builders/join), completes the
// company profile, and ADUAtlas approves it. Either way the referral link and
// the builder dashboard switch on only once the listing is claimed and
// approved, and the Verified badge is a separate step after ADUAtlas checks
// the business information. The interest form stays as the option for a
// builder who would rather have ADUAtlas set the profile up for them.
//
// WHAT ADUAtlas RECORDS BEFORE A CLAIM, exactly (decision 2c). Saying an
// unclaimed listing has "no counts" would be false, so this page does not say
// it. Nor does it overstate the counts. log_builder_event (migration 0006) is
// granted to `authenticated` only and raises "not signed in" without a users
// row, so an ANONYMOUS view is not recorded at all; a builder account's own
// view is dropped; and referral_events_homeowner_daily_uidx keys a view on
// (builder, user, kind, day), so a signed-in homeowner counts at most ONCE A
// DAY per listing. An introduction request is recorded when a homeowner asks
// for one (intro_requests, one per homeowner and builder). So what ADUAtlas has
// before a claim is its own marketplace measurement, not a traffic report.
// What an unclaimed listing has none of: a referral link, a dashboard, access
// to those numbers, the Verified badge, and a Messages page a homeowner can
// write to on ADUAtlas. (A builder never starts a conversation, claimed or not,
// decision 2h; an introduction ADUAtlas forwards reaches an unclaimed listing's
// contact address through the intro-forward email.)
//
// This page is where state outreach sends builders, so it carries no
// single-state examples: the form placeholders stay generic.
//
// Principle stated on this page on purpose: ADUAtlas helps the homeowner find
// the right builder. It does not sell access to homeowner lists.

const HELP = [
  {
    Icon: FiUserCheck,
    title: "Homeowners who have done the homework",
    desc: "Homeowners reach the directory through an ADUAtlas plan, which includes the course. Platinum and Concierge homeowners also have a feasibility study and a site plan for their property.",
  },
  {
    Icon: FiMapPin,
    title: "Listed where you actually work",
    desc: "Your profile is organized by the states and cities you serve and the states where you are licensed, so a homeowner filtering by area can find you.",
  },
  {
    Icon: FiCheckCircle,
    title: "Introductions, not cold leads",
    desc: "Homeowners save the builders they like and request an introduction when their plan is ready. An introduction reaches you because that homeowner read your profile and asked for it, not because ADUAtlas sent your details out.",
  },
  {
    Icon: FiTag,
    // All four money facts, in the words of the invitation in spec 5.2: $0 for
    // 90 days after the claim, $49 a month after that, $0 for clicks,
    // inquiries and qualified leads at any time, and $500 only when an ADUAtlas
    // referred homeowner signs a project. The fee applies during the trial too,
    // so "free to start" cannot stand on its own. Still no promised number of
    // introductions, leads or projects.
    title: "Free to start",
    desc: "Your first 90 days after you claim your listing are free. After that, marketplace membership is $49 a month. There is no charge for a profile view, a link click, an inquiry or a qualified homeowner lead, at any time, and no promised number of any of them. If an ADUAtlas referred homeowner signs an ADU project with your company, our standard referral fee is $500, in the first 90 days and after. Builders with an existing affiliate or referral program keep their own tracking link and terms.",
  },
];

const STEPS = [
  { title: "Create your builder account", desc: "It takes a minute, and your account is separate from the homeowner side of ADUAtlas." },
  { title: "Claim your listing or complete a new profile", desc: "If ADUAtlas already lists your company, enter the claim code from our invitation and the listing becomes yours. Otherwise fill in the company profile and submit it for review." },
  { title: "ADUAtlas checks and approves it", desc: "We check the business details. Approved profiles go live in the directory, and a claimed profile we have checked carries the Verified badge." },
  { title: "Share your referral link", desc: "Your link switches on when you claim your listing or your new profile is approved. Your dashboard opens at the same time, with the profile views and introduction requests your listing has collected, the clicks on your link, and the plans bought through it." },
];

const PROFILE = [
  "Company name, logo and short bio",
  "Business city and state, website and one outside link",
  "States and cities you serve, and the states where you are licensed",
  "The ADU types you build, including detached units, conversions and prefab",
  "Your build methods, such as site built, modular or kit",
  "Whether you take projects turnkey, from design through the build",
  "Up to three project photos and two videos",
  "The Verified badge once you have claimed the profile and ADUAtlas has checked the business information",
];

const ForBuilders = () => {
  const [form, setForm] = useState({ company: "", email: "", state: "", cities: "", website: "" });
  const [status, setStatus] = useState("idle"); // idle | sending | done | error
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setStatus("error");
      return;
    }
    setStatus("sending");
    const res = await captureLead({
      email: form.email,
      source: "builder",
      quizAnswers: { company: form.company, state: form.state, cities: form.cities, website: form.website },
    });
    setStatus(res.ok ? "done" : "error");
  };

  return (
    <div>
      <PageHeader
        title="Built for builders too."
        subtitle="ADUAtlas prepares homeowners before they call a builder. When they are ready, they look for you in our directory."
      >
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Link
            to="/builders/join"
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors"
          >
            Create your builder account <FiArrowRight />
          </Link>
          <a href="#get-listed" className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-stroke text-paper font-medium text-sm hover:border-accent transition-colors">
            Or send us your details
          </a>
        </div>
      </PageHeader>

      <section className="container mx-auto px-5 sm:px-8 max-w-6xl section-y grid lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-5">
          <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent inline-flex items-center justify-center text-xl mb-4">
            <FiKey aria-hidden />
          </span>
          <h2 className="font-display text-paper text-3xl sm:text-4xl mb-4">You may already be listed</h2>
          <p className="text-paper-dim text-base leading-relaxed max-w-md">
            ADUAtlas builds its directory from public information before builders join, one state and one city at a time, so homeowners can compare builders from day one.
          </p>
        </div>
        <div className="lg:col-span-6 lg:col-start-7 text-paper-dim text-base leading-relaxed space-y-4">
          <p>
            If we sent you an invitation, it includes a claim code. Create your builder account, enter the code in your portal, and the listing becomes yours. You complete the profile and your referral link switches on. Once ADUAtlas has checked your business information, your profile shows the Verified badge, which means exactly that: profile claimed and business information verified by ADUAtlas.
          </p>
          <p>
            Until a listing is claimed it has no referral link and no dashboard, it cannot carry the Verified badge, homeowners cannot message it on ADUAtlas (they can only ask ADUAtlas for an introduction), and nobody at your company can see the numbers we collect. Claiming is what opens all of that.
          </p>
          <p>
            Be clear about what we do record. For every listing we publish, claimed or not, ADUAtlas measures its own marketplace: when a homeowner who is signed in opens the profile, counted once a day per homeowner, and when a homeowner asks us for an introduction. A visitor who is not signed in is not counted at all, and neither is another builder looking at your listing, so these are not website traffic figures. They are how we know a listing is worth keeping, and they are what you start reading on your dashboard the day you claim it. Being listed does not put you into a referral program, and we do not promise you a number of introductions or projects.
          </p>
          <p className="text-sm">
            Listed but no invitation yet? Write to{" "}
            <a href="mailto:hello@aduatlas.com?subject=Claim%20my%20builder%20listing" className="text-accent font-medium">
              hello@aduatlas.com
            </a>{" "}
            with your company name and we will send your claim code.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-5 sm:px-8 max-w-6xl section-y">
        <h2 className="font-display text-paper text-3xl sm:text-4xl mb-8">How ADUAtlas helps builders</h2>
        <ul className="grid md:grid-cols-2 gap-6">
          {HELP.map(({ Icon, title, desc }) => (
            <li key={title} className="bg-canvas border border-stroke rounded-3xl p-7 lift">
              <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent inline-flex items-center justify-center text-xl mb-4">
                <Icon aria-hidden />
              </span>
              <h3 className="font-display text-paper text-xl mb-2">{title}</h3>
              <p className="text-paper-dim text-sm leading-relaxed">{desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-surface-1-solid border-y border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-6xl py-16">
          <h2 className="font-display text-paper text-3xl sm:text-4xl mb-8">How it works</h2>
          <ol className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="bg-canvas border border-stroke rounded-3xl p-6">
                <p className="font-display text-accent text-3xl mb-3">{i + 1}</p>
                <h3 className="font-display text-paper text-lg mb-2">{s.title}</h3>
                <p className="text-paper-dim text-sm leading-relaxed">{s.desc}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            <Link to="/builders/join" className="inline-flex items-center gap-2 text-accent font-semibold text-sm">
              Create your builder account <FiArrowRight />
            </Link>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-5 sm:px-8 max-w-6xl section-y grid lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-5">
          <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent inline-flex items-center justify-center text-xl mb-4">
            <FiImage aria-hidden />
          </span>
          <h2 className="font-display text-paper text-3xl sm:text-4xl mb-4">What your profile shows</h2>
          <p className="text-paper-dim text-base leading-relaxed max-w-md">
            Enough for a homeowner to know whether you are a fit, without a sales pitch.
          </p>
        </div>
        <ul className="lg:col-span-6 lg:col-start-7 grid gap-3">
          {PROFILE.map((item) => (
            <li key={item} className="flex items-start gap-3 text-paper text-sm sm:text-base">
              <FiCheckCircle className="text-accent mt-1 shrink-0" aria-hidden />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-surface-1-solid border-y border-stroke">
        <div className="container mx-auto px-5 sm:px-8 max-w-6xl py-16 grid lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5">
            <span className="w-11 h-11 rounded-xl bg-accent/10 text-accent inline-flex items-center justify-center text-xl mb-4">
              <FiShield aria-hidden />
            </span>
            <h2 className="font-display text-paper text-3xl sm:text-4xl mb-4">The homeowner stays in control</h2>
          </div>
          <div className="lg:col-span-6 lg:col-start-7 text-paper-dim text-base leading-relaxed space-y-4">
            <p>
              ADUAtlas helps the homeowner find the right builder. It does not sell access to homeowner lists. Builders never browse homeowner accounts, and no builder sees a homeowner's name or contact details unless that homeowner chooses to share them.
            </p>
            <p>
              That protects you as well. When an introduction reaches you, it comes from one homeowner who chose your company, not from a list that five other builders are calling at the same time.
            </p>
          </div>
        </div>
      </section>

      <section id="get-listed" className="container mx-auto px-5 sm:px-8 max-w-6xl section-y grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <h2 className="font-display text-paper text-3xl sm:text-4xl mb-4">Prefer that we set it up?</h2>
          <p className="text-paper-dim text-base leading-relaxed max-w-md mb-4">
            Tell us where you build and how to reach you. We draft the profile and send it to you to approve before it goes live.
          </p>
          <p className="text-paper-dim text-sm mb-4">
            Ready to do it yourself?{" "}
            <Link to="/builders/join" className="text-accent font-medium">
              Create your builder account
            </Link>
            .
          </p>
          <p className="text-paper-dim text-sm">
            Prefer email? Write to{" "}
            <a href="mailto:hello@aduatlas.com?subject=Builder%20listing" className="text-accent font-medium">
              hello@aduatlas.com
            </a>
            .
          </p>
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          {status === "done" ? (
            <div className="bg-canvas border border-stroke rounded-3xl p-8">
              <FiCheckCircle className="text-accent text-3xl mb-3" aria-hidden />
              <h3 className="font-display text-paper text-2xl mb-2">Thanks, we have your details.</h3>
              <p className="text-paper-dim text-sm leading-relaxed">
                We will reach out within a few business days with a draft of your profile.
              </p>
              <Link to="/find-a-builder" className="inline-flex items-center gap-2 mt-6 text-accent font-medium text-sm">
                See how homeowners find builders <FiArrowRight />
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="bg-canvas border border-stroke rounded-3xl p-8 grid gap-4">
              <FormField label="Company" value={form.company} onChange={set("company")} required placeholder="Your company name" />
              <FormField label="Work email" type="email" value={form.email} onChange={set("email")} required placeholder="you@company.com" />
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="State" value={form.state} onChange={set("state")} required placeholder="ST" />
                <FormField label="Cities you serve" value={form.cities} onChange={set("cities")} placeholder="The cities and towns you serve, separated by commas" />
              </div>
              <FormField label="Website" value={form.website} onChange={set("website")} placeholder="https://" />
              {status === "error" && (
                <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
                  Something went wrong. Check the email address, or write to hello@aduatlas.com.
                </p>
              )}
              <PrimaryButton type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Sending" : "Send my details"}
              </PrimaryButton>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};

export default ForBuilders;
