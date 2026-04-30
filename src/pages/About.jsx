import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../hooks/useReveal";

const stats = [
  { n: "1908", label: "Year Sears sold its first kit home" },
  { n: "30+", label: "ADU types in common use today" },
  { n: "$10K–$100K", label: "Surprise cost most homeowners miss" },
  { n: "1 in 4", label: "Older homeowners considering an ADU" },
];

const chapters = [
  {
    n: "01",
    eyebrow: "The shift",
    title: "You've probably noticed them everywhere lately.",
    body: (
      <>
        <p>ADUs, tiny homes, backyard cottages. So what's driving all of this?</p>
        <p>It comes down to a few simple factors. Housing shortages pushed cities to relax zoning rules. At the same time, homeownership costs increased, and families started looking for more flexible living options — space for aging parents, adult children, rental income, or the ability to age in place.</p>
        <p>As regulations eased, demand grew — and with demand came innovation.</p>
      </>
    ),
  },
  {
    n: "02",
    eyebrow: "What changed",
    title: "Builders are now combining design, factory construction, and modern building tech.",
    body: (
      <>
        <p>Today's ADUs range from simple, budget-friendly options to high-end architectural designs. You may hear them called casitas, cottages, cabins, sheds, or bunkies. They can be stick-built, panelized, modular, or prefab.</p>
        <p>At ADUAtlas, we focus primarily on detached ADUs, though additions and garage conversions are also part of the broader category.</p>
      </>
    ),
  },
  {
    n: "03",
    eyebrow: "Not new — but better",
    title: "Sears, Roebuck and Company sold kit homes starting in 1908.",
    body: (
      <>
        <p>Many of those homes are still standing today. What's changed is the quality, efficiency, and design. Today's prefab and modular homes are far more refined and adaptable.</p>
        <p>One of the most exciting aspects of this space is creativity. When real housing needs meet modern technology, you get smarter layouts, better energy performance, and options that simply didn't exist before.</p>
      </>
    ),
  },
  {
    n: "04",
    eyebrow: "Why we built it",
    title: "I came to this after years in commercial real estate.",
    body: (
      <>
        <p>Working primarily with smaller multifamily properties, the ADU space caught my attention — both personally and professionally. As I researched, I kept running into the same problem: there wasn't clear, practical information written for everyday homeowners.</p>
      </>
    ),
  },
  {
    n: "05",
    eyebrow: "How it works",
    title: "Our goal is to simplify the process.",
    body: (
      <>
        <p>We help you understand your state and local ADU regulations, explore different ADU types, and connect with local and national builders who know your area. We also offer a growing video library so you can see real examples — not just read about them.</p>
        <p>Building an ADU takes time. Learning the rules, understanding your property, setting a budget, choosing a design, navigating permits, and completing construction can take months. Some builders offer turnkey solutions, which can be a great option — but often at a higher cost.</p>
        <p>ADUAtlas is designed for homeowners at every stage — whether you're just exploring or ready to move forward.</p>
      </>
    ),
  },
];

const pullQuotes = [
  "That's exactly what happened with ADUs.",
  "That's why we built ADUAtlas.",
];

const Stat = ({ s, i }) => {
  const ref = useReveal(i * 80);
  return (
    <div ref={ref} className="px-5 sm:px-7 py-7 bg-surface-1-solid first:rounded-l-2xl last:rounded-r-2xl">
      <p className="font-display text-paper text-3xl sm:text-4xl mb-2">{s.n}</p>
      <p className="text-paper-dim text-xs uppercase tracking-[0.15em] leading-relaxed">{s.label}</p>
    </div>
  );
};

const Chapter = ({ c, i, isLast }) => {
  const ref = useReveal(0);
  return (
    <article ref={ref} className="grid lg:grid-cols-12 gap-6 lg:gap-12 py-12 sm:py-16 border-t border-stroke">
      <div className="lg:col-span-4 lg:sticky lg:top-32 lg:self-start">
        <span className="font-display text-accent text-5xl sm:text-6xl block mb-3">{c.n}</span>
        <p className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase">{c.eyebrow}</p>
      </div>
      <div className="lg:col-span-8">
        <h2 className="font-display font-medium text-paper text-3xl sm:text-4xl lg:text-5xl leading-[1.1] tracking-tight mb-6">
          {c.title}
        </h2>
        <div className="space-y-5 text-paper-dim text-base sm:text-lg leading-relaxed">
          {c.body}
        </div>
        {!isLast && pullQuotes[i] && (
          <p className="font-display italic text-accent text-2xl sm:text-3xl mt-10 leading-snug">
            {pullQuotes[i]}
          </p>
        )}
      </div>
    </article>
  );
};

const About = () => {
  const heroRef = useReveal(0);
  const closingRef = useReveal(0);

  return (
    <div className="bg-canvas">
      {/* Editorial hero */}
      <section className="relative overflow-hidden pt-32 sm:pt-40 lg:pt-48 pb-16 sm:pb-20">
        <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 w-[40rem] h-[40rem] rounded-full bg-accent/10 blur-3xl animate-drift-glow" />
        <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-40 w-[40rem] h-[40rem] rounded-full bg-accent/5 blur-3xl animate-drift-glow" style={{ animationDelay: "-7s" }} />

        <div ref={heroRef} className="relative container mx-auto px-5 sm:px-8 max-w-5xl">
          <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-5 animate-fade-up" style={{ animationDelay: "0ms" }}>
            About ADUAtlas
          </p>
          <h1
            className="font-display font-medium text-paper text-[2.6rem] sm:text-6xl lg:text-7xl xl:text-[5.5rem] leading-[1.02] tracking-tight max-w-4xl animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            Pre-construction intelligence <span className="italic text-paper-dim">for the rest of us.</span>
          </h1>
          <p
            className="mt-7 sm:mt-9 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "260ms" }}
          >
            ADUAtlas exists to give homeowners a real, parcel-specific answer before they spend $500 on a survey or a single hour with a builder. We do the research so you don't have to — and we tell you exactly how confident we are in every line.
          </p>
        </div>
      </section>

      {/* Stat strip */}
      <section className="container mx-auto px-5 sm:px-8 max-w-5xl pb-16">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-stroke rounded-2xl overflow-hidden">
          {stats.map((s, i) => <Stat key={s.label} s={s} i={i} />)}
        </div>
      </section>

      {/* Chapters */}
      <section className="container mx-auto px-5 sm:px-8 max-w-5xl">
        {chapters.map((c, i) => (
          <Chapter key={c.n} c={c} i={i} isLast={i === chapters.length - 1} />
        ))}
      </section>

      {/* Closing card */}
      <section className="container mx-auto px-5 sm:px-8 max-w-4xl py-20 sm:py-28">
        <div ref={closingRef} className="bg-accent text-accent-fg rounded-3xl p-10 sm:p-14 text-center relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-canvas/10 blur-3xl" />
          </div>
          <p className="relative text-accent-fg/70 text-xs font-medium tracking-[0.2em] uppercase mb-5">
            One promise
          </p>
          <h2 className="relative font-display font-medium text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
            Save you time. Reduce confusion. Help you make informed decisions.
          </h2>
          <p className="relative text-accent-fg/80 text-base sm:text-lg max-w-xl mx-auto mb-8 leading-relaxed italic">
            Good luck — and enjoy the process.
          </p>
          <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
            >
              Check your property <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/unlock"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-accent-fg/20 text-accent-fg font-medium hover:border-accent-fg/60 transition"
            >
              See pricing
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
};

export default About;
