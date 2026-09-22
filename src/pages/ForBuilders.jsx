import { useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiMapPin, FiUserCheck, FiImage, FiTag } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import { FormField, PrimaryButton } from "../components/common/FormField";
import { captureLead } from "../lib/supabase";

// Public page for builders (Richard, 2026-09-22): what ADUAtlas does for them
// and how to get listed. Phase 1 keeps the directory free and ADUAtlas-managed
// (scope §5), so the ask is a short interest form, not self-service signup.

const HELP = [
  {
    Icon: FiUserCheck,
    title: "Homeowners who have done the homework",
    desc: "Everyone in the directory has taken the ADUAtlas course. Platinum and Concierge homeowners arrive with a feasibility study and a site plan for their property.",
  },
  {
    Icon: FiMapPin,
    title: "Listed where you actually work",
    desc: "Your profile is organized by state and the cities you serve, so homeowners nearby find you first.",
  },
  {
    Icon: FiCheckCircle,
    title: "Introductions, not cold leads",
    desc: "Homeowners save the builders they like and request an introduction when their plan is ready. You hear from people who already know their lot and budget.",
  },
  {
    Icon: FiTag,
    title: "Free to be listed",
    desc: "There is no fee to be in the directory while we grow it. ADUAtlas sets up your profile for you.",
  },
];

const PROFILE = [
  "Company name, logo and website",
  "Cities and states you serve",
  "ADU types you build: detached, attached, conversions, prefab, two-story",
  "Custom, prefab or both",
  "Up to three project photos and two videos",
  "One outside link, such as a portfolio or reviews page",
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
        <a
          href="#get-listed"
          className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors"
        >
          Get listed <FiArrowRight />
        </a>
      </PageHeader>

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
        <div className="container mx-auto px-5 sm:px-8 max-w-6xl py-16 grid lg:grid-cols-12 gap-10 items-start">
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
        </div>
      </section>

      <section id="get-listed" className="container mx-auto px-5 sm:px-8 max-w-6xl section-y grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <h2 className="font-display text-paper text-3xl sm:text-4xl mb-4">Get listed</h2>
          <p className="text-paper-dim text-base leading-relaxed max-w-md mb-4">
            Tell us where you build and how to reach you. We set up the profile and send it to you to approve before it goes live.
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
                <FormField label="State" value={form.state} onChange={set("state")} required placeholder="CA" />
                <FormField label="Cities you serve" value={form.cities} onChange={set("cities")} placeholder="Sacramento, Davis, Roseville" />
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
