import AduCTA from "../components/common/AduCTA";
import PageHeader from "../components/common/PageHeader";
import heroImg from "../assets/home/hero_image.png";

const About = () => {
  return (
    <div>
      <PageHeader
        title="About ADUAtlas"
        subtitle="Simplifying ADU regulations and connecting homeowners with trusted professionals"
        bg={heroImg}
      />

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 max-w-3xl">
        <div className="space-y-5 text-secondary text-base leading-relaxed">
          <p>
            You've probably noticed them everywhere lately — ADUs, tiny homes, backyard cottages. So what's driving all of this?
          </p>
          <p>
            It comes down to a few simple factors. Housing shortages pushed cities to relax zoning rules. At the same time, homeownership costs increased, and families started looking for more flexible living options — space for aging parents, adult children, rental income, or the ability to age in place.
          </p>
          <p>
            As regulations eased, demand grew — and with demand came innovation.
          </p>
          <p className="font-semibold text-primary">That's exactly what happened with ADUs.</p>
          <p>
            Builders are now combining modern design, factory construction, and improved building technology to create smaller homes that are more efficient, flexible, and often faster to build. Today's ADUs range from simple, budget-friendly options to high-end architectural designs. You may hear them called casitas, cottages, cabins, sheds, or bunkies. They can be stick-built, panelized, modular, or prefab.
          </p>
          <p>
            At ADUAtlas, we focus primarily on detached ADUs, though additions and garage conversions are also part of the broader category.
          </p>
          <p>
            This idea isn't new. Home kits have been around for over a century — Sears, Roebuck and Company sold kit homes starting in 1908, and many are still standing today. What's changed is the quality, efficiency, and design. Today's prefab and modular homes are far more refined and adaptable.
          </p>
          <p>
            One of the most exciting aspects of this space is creativity. When real housing needs meet modern technology, you get smarter layouts, better energy performance, and options that simply didn't exist before.
          </p>
          <p>
            I came to this after years in commercial real estate, working primarily with smaller multifamily properties. The ADU space caught my attention — both personally and professionally. As I researched, I kept running into the same problem: there wasn't clear, practical information written for everyday homeowners.
          </p>
          <p className="font-semibold text-primary">That's why we built ADUAtlas.</p>
          <p>
            Our goal is to simplify the process. We help you understand your state and local ADU regulations, explore different ADU types, and connect with local and national builders who know your area. We also offer a growing video library so you can see real examples — not just read about them.
          </p>
          <p>
            Building an ADU takes time. Learning the rules, understanding your property, setting a budget, choosing a design, navigating permits, and completing construction can take months. Some builders offer turnkey solutions, which can be a great option — but often at a higher cost.
          </p>
          <p>
            ADUAtlas is designed for homeowners at every stage — whether you're just exploring or ready to move forward.
          </p>
          <p>
            Our goal is simple: save you time, reduce confusion, and help you make informed decisions. We do the research so you don't have to — just remember to always confirm local regulations and builder details, as rules can change.
          </p>
          <p className="font-semibold text-primary">Good luck — and enjoy the process.</p>
        </div>
      </section>

      <AduCTA />
    </div>
  );
};

export default About;
