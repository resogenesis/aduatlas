import Accordion from "../components/common/Accordion";

const faqs = [
  { q: "What is an ADU?", a: "An Accessory Dwelling Unit (ADU) is a secondary residential unit located on a residential property. ADUs can be attached or detached and typically include a kitchen, bathroom, and living area. ADUs are often referred to by other names such as tiny house, casita, backyard cottage, granny flat, or backyard home, depending on region and design." },
  { q: "Why do zoning laws vary by state and city?", a: "Each state sets broad structural standards (IRC), but cities layer their own zoning rules on top — setbacks, height limits, lot coverage, parking, and occupancy requirements all vary by municipality." },
  { q: "Why do rules vary by state and city?", a: "States define the structural code (IRC), while cities control land use through zoning — setbacks, density, parking, and permitted uses differ from one jurisdiction to the next." },
  { q: "Can I buy a cheap ADU online?", a: "You can find low-cost units on Amazon or from importers, but they often don't meet local building codes, IRC standards, or zoning requirements. Always verify compliance before purchasing." },
  { q: "Do ADUAtlas builders know my local zoning?", a: "Builders on ADUAtlas are matched by ZIP code and are familiar with local zoning and permitting requirements in your area." },
  { q: "How much does an ADU cost?", a: "Costs range widely by region and type, but most projects fall between $150K and $450K all-in, depending on size, site conditions, and local labor rates." },
  { q: "What costs are not included in advertised ADU prices?", a: "Site prep, utility connections, permits, engineering, surveys, landscaping, and contingency are commonly excluded from advertised unit prices." },
  { q: "Do I need a survey?", a: "In most cases, yes — a survey confirms lot boundaries, setbacks, and easements. Some cities require a formal survey before issuing permits." },
  { q: "What is the biggest mistake homeowners make?", a: "Starting without understanding local zoning, skipping the feasibility step, or hiring a builder who isn't familiar with your city's ADU regulations." },
  { q: "Will my property taxes increase?", a: "Generally yes, based on added assessed value, not the full cost of construction." },
  { q: "Are grants available?", a: "Some states and cities offer grants, fee waivers, or expedited permitting for ADU construction. Check your local housing department for current programs." },
  { q: "How accurate is zoning information on ADUAtlas?", a: "We compile data from official state and municipal sources and update regularly, but always confirm with your local building department before making decisions." },
  { q: "What does \"IRC-compliant\" mean?", a: "IRC stands for International Residential Code — the baseline building standard adopted (with amendments) by most U.S. states for residential construction including ADUs." },
  { q: "How does ADUAtlas match me with builders?", a: "We match you by ZIP code with verified local and national builders and suppliers who understand your city's zoning and permitting requirements." },
  { q: "What do I get with paid access?", a: "Paid access unlocks the full feasibility toolkit: site-ready score, utility cost estimator, downloadable worksheets, and priority builder matching." },
  { q: "One-day vs. annual access?", a: "One-day access is ideal for a quick feasibility check. Annual access is best if you're actively planning — you get unlimited tools, priority support, and builder introductions." },
  { q: "Does ADUAtlas guarantee approvals or pricing?", a: "No. ADUAtlas provides educational tools and connects you with professionals, but permit approvals and final pricing depend on your local jurisdiction and builder." },
  { q: "What does ADUAtlas not do?", a: "ADUAtlas does not design, build, or permit ADUs. We educate homeowners, provide planning tools, and connect you with qualified professionals." },
  { q: "When should I talk to a builder?", a: "After you've reviewed your state and city rules, completed a pre-site feasibility check, and have a clear understanding of your budget and timeline." },
  { q: "What will builders ask first?", a: "Property address, lot size, desired ADU type, budget range, timeline, and whether you've reviewed local zoning requirements." },
  { q: "How does ADUAtlas help prevent buying the wrong ADU?", a: "By educating you on local zoning, IRC compliance, and site feasibility before you commit to a design or builder — so you avoid costly mistakes." },
  { q: "Is building an ADU the same everywhere?", a: "No. Every state, city, and even neighborhood can have different rules. That's why confirming local regulations and site conditions is critical before you start." },
  { q: "Can I buy an ADU built outside the United States?", a: "You can, but imported units must still meet local building codes, IRC standards, and zoning requirements. Compliance is your responsibility." },
  { q: "Why choose annual access instead of one-day access?", a: "Annual access gives you unlimited use of all tools, priority builder introductions, and ongoing support throughout your planning and build process." },
  { q: "What does \"IRC-compliant\" actually mean?", a: "It means the structure meets the International Residential Code — the baseline building standard for residential construction adopted by most U.S. states." },
  { q: "Why won't builders give accurate quotes without site details?", a: "Every site is different — slope, soil, utilities, access, and local code requirements all affect cost. Without site-specific information, any quote is a guess." },
  { q: "What costs are not included in the advertised ADU prices?", a: "Site prep, utility connections, permits, engineering, surveys, landscaping, and contingency are commonly excluded from advertised unit prices." },
  { q: "Does ADUAtlas guarantee anything?", a: "We guarantee access to accurate, up-to-date educational content and tools — but not permit approvals, construction outcomes, or final pricing." },
  { q: "What information will builders ask me for first?", a: "Property address, lot dimensions, desired ADU type, budget range, project timeline, and whether you've checked local zoning." },
  { q: "How does ADUAtlas help me avoid buying the wrong ADU?", a: "By walking you through zoning, feasibility, and compliance checks before you commit — so you don't end up with a unit that can't be permitted or placed on your lot." },
  { q: "How much value can an ADU add to my property?", a: "ADUs can add significant value — typically 20–30% of the primary home's value — depending on location, size, and quality of construction." },
  { q: "Are grants or incentives available to build an ADU?", a: "Some states and cities offer grants, fee waivers, or expedited permitting. Check your local housing department for current programs." },
  { q: "Where can I find the deed to my property?", a: "Your county recorder's office or assessor's website typically has deed records. Your title company from the home purchase can also provide a copy." },
  { q: "What is the biggest mistake people make when building an ADU?", a: "Starting without understanding local zoning, skipping feasibility, or hiring a builder unfamiliar with your city's ADU regulations." },
  { q: "How much does it cost to build an ADU?", a: "Most ADU projects cost between $150K and $450K all-in, depending on type, size, site conditions, and local labor rates." },
  { q: "How does ADUAtlas match me with builders and suppliers?", a: "We match by ZIP code with verified professionals who understand your local zoning, permitting, and construction requirements." },
  { q: "How accurate are zoning regulations on ADUAtlas?", a: "We compile from official state and municipal sources and update regularly — but always confirm with your local building department." },
  { q: "Do I need a survey to build an ADU?", a: "In most jurisdictions, yes. A survey confirms boundaries, setbacks, and easements — and many cities require one before issuing permits." },
];

const FAQ = () => {
  return (
    <div>
      <section className="bg-white py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl text-center">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-primary leading-tight">
            ADUAtlas — Frequently Asked Questions You Need to Know
          </h1>
          <p className="mt-4 text-secondary text-sm sm:text-base leading-relaxed">
            Building an ADU is not a one-size-fits-all process. Most ADU questions do not have a single answer because what is allowed, affordable, and practical depends on your state's building code, your city's zoning rules, your property conditions, your budget, and your goals. What works in one ZIP code may not work in the next. That is why confirming local regulations and site conditions early is critical.
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-3xl">
        <Accordion items={faqs} />
      </section>
    </div>
  );
};

export default FAQ;
