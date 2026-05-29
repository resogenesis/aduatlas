import { Link } from "react-router-dom";
import { FiArrowRight } from "react-icons/fi";
import { useReveal } from "../hooks/useReveal";

const stats = [
  { n: "1908", label: "Year Sears sold its first kit home" },
  { n: "30+", label: "ADU and tiny home types in common use today" },
  { n: "$10K to $100K+", label: "Potential hidden site prep and utility costs" },
  { n: "1 in 4", label: "Homeowners 60+ considering an ADU for income or family" },
  { n: "80%+", label: "Homeowners underestimate zoning and pre construction complexity" },
  { n: "6 to 12 Months", label: "Typical ADU timeline from planning to completion" },
];

const chapters = [
  {
    n: "01",
    eyebrow: "The Shift",
    title: "You've probably noticed them everywhere lately.",
    body: (
      <>
        <p>ADUs, tiny homes, and backyard cottages. So what's driving the shift?</p>
        <p>Housing shortages pushed many cities to relax zoning rules. At the same time, rising homeownership costs and changing family needs created demand for more flexible living options: space for aging parents, adult children, rental income, or the ability to age in place.</p>
        <p>As regulations eased, demand grew, and innovation followed.</p>
      </>
    ),
  },
  {
    n: "02",
    eyebrow: "What Changed",
    title: "Today's ADUs combine modern design, factory construction, and improved building tech.",
    body: (
      <>
        <p>Options range from simple budget friendly units to high end architectural designs. You may hear them called casitas, cottages, cabins, sheds, or bunkies. They can be stick built, panelized, modular, prefab, shipping containers, domes, or kits.</p>
        <p>Tiny Homes on Wheels, and the larger versions called Park Models (RVs that don't look like RVs), are manufactured homes built on a steel chassis, subject to federal HUD Standards and delivered onsite complete.</p>
        <p>A modular home is often built with SIPs (structural insulated panels) assembled on site, like a traditional home.</p>
      </>
    ),
  },
  {
    n: "03",
    eyebrow: "Not New, Just Better",
    title: "Sears, Roebuck and Company sold kit homes beginning in 1908.",
    body: (
      <>
        <p>Kit homes are not new. Many of those original homes are still standing today.</p>
        <p>What has changed is quality, efficiency, and design. Modern prefab and modular homes are more refined, energy efficient, and adaptable than ever before.</p>
      </>
    ),
  },
  {
    n: "04",
    eyebrow: "Why We Built ADUAtlas",
    title: "We came to this after years in commercial multifamily real estate.",
    body: (
      <>
        <p>As we researched the ADU industry, professionally and personally, we kept hitting the same problem: most homeowners had no clear place to start and struggled to find practical information written for everyday people.</p>
        <p>ADUAtlas answers the who, what, when, where, and why of building an ADU. Before you spend money on surveys, builders, or plans, take the ADUAtlas course. You may decide an ADU isn't the right fit, or you may discover your perfect tiny dream home.</p>
        <p>Our philosophy is simple: learn before you build, and save yourself time, money, and costly mistakes.</p>
      </>
    ),
  },
  {
    n: "05",
    eyebrow: "Home",
    title: "Our goal is to simplify the process.",
    body: (
      <>
        <p>ADUAtlas helps homeowners explore ADU types, understand local regulations, and connect with local and national builders. We provide educational tools, planning resources, and a growing video library so homeowners can see real world examples, not just read about them.</p>
        <p>Building an ADU takes planning, budgeting, permits, zoning research, and design decisions. ADUAtlas helps simplify that process with realistic budget tools and feasibility studies that give builders what they need to quote accurately.</p>
        <p>Whether you're just starting your research or ready to move forward, ADUAtlas is designed to help you build smarter.</p>
      </>
    ),
  },
];

const pullQuotes = [
  "That's exactly what happened with ADUs.",
  "Faster. Smarter. Cooler. Efficient. Cheaper.",
  "Smaller. Smarter. More refined.",
  "That's why we built ADUAtlas.",
];

const Stat = ({ s, i }) => {
  const ref = useReveal(i * 60);
  return (
    <div ref={ref} className="px-5 sm:px-7 py-7 bg-surface-1-solid">
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
            Pre Construction Intelligence <span className="italic text-paper-dim">for homeowners.</span>
          </h1>
          <p
            className="mt-7 sm:mt-9 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "260ms" }}
          >
            ADUAtlas helps homeowners understand what they can realistically build before spending money on surveys, plans, or builders.
          </p>
          <p
            className="mt-5 text-paper-dim text-base sm:text-lg lg:text-xl max-w-2xl leading-relaxed animate-fade-up"
            style={{ animationDelay: "340ms" }}
          >
            We provide parcel specific research, zoning insights, planning tools, and feasibility guidance, so you can make smarter decisions with greater confidence before moving forward.
          </p>
        </div>
      </section>

      {/* Stat strip */}
      <section className="container mx-auto px-5 sm:px-8 max-w-5xl pb-16">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-px bg-stroke rounded-2xl overflow-hidden">
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
            To build or not to build, that is thy question.
          </p>
          <div className="relative flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="group inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
            >
              Property Snapshot <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/unlock"
              className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-full border border-accent-fg/20 text-accent-fg font-medium hover:border-accent-fg/60 transition"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
};

export default About;
