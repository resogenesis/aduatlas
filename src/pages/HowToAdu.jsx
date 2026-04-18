import { FiBookOpen, FiClipboard, FiBarChart2 } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import AduCTA from "../components/common/AduCTA";
import Accordion from "../components/common/Accordion";
import heroImg from "../assets/home/hero_image.png";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/how_it_works.png";
import img5 from "../assets/home/container_img.png";

const categories = [
  {
    icon: FiBookOpen,
    title: "Education",
    bullets: [
      "City and state regulations by location",
      "Explore 20+ ADU types and structure options",
      "FAQs covering everything from property taxes to \"low-cost\" ADU claims",
      "Know what to ask your city, builder, and suppliers",
    ],
  },
  {
    icon: FiClipboard,
    title: "Planning Tools",
    bullets: [
      "Step-by-step ADU guide",
      "Pre-site and budget estimate worksheets",
      "Clear preparation for timelines, scope, and costs",
    ],
  },
  {
    icon: FiBarChart2,
    title: "Feasibility Study + Builder Match",
    bullets: [
      "GIS-based property overview with lot dimensions",
      "Pre-filled pre-site and utility hookup estimates",
      "ADU Property Readiness Score",
      "Matched with local and national builders and suppliers",
    ],
    note: "All for $79 — see the Sign Up tab at the top of any page.",
  },
];

const imgs = [img1, img2, img3, img4, img5, img1, img2, img3, img4, img5];

const steps = [
  {
    n: "1",
    title: "Explore ADU Types & Video Library",
    desc: "Review ADU types and compare structures (prefab, modular, container, etc.). Watch real build videos to understand delivery, installation, timelines, and quality.",
  },
  {
    n: "2",
    title: "Review ADU FAQ",
    desc: "Get clear answers on cost, timelines, permits, property taxes, utility hookups, and common ADU mistakes.",
  },
  {
    n: "3",
    title: "Check State & City ADU Regulations",
    desc: "Understand what you can legally build based on your location, including zoning, setbacks, height limits, and occupancy rules.",
  },
  {
    n: "4",
    title: "Complete the ADUAtlas Feasibility Study ($79.99)",
    desc: "Access a GIS view of your property with lot dimensions. Get access to both National and Local Builders and Suppliers. Get a utility contact that will mark your utilities access for free.",
    bullets: [
      "Pre-filled Utility & Pre-Site Cost Estimate Worksheet",
      "National ADU Property Readiness Score",
      "Pre-filled Total Budget Worksheet with timelines",
      "Receive matches with local and national builders and suppliers",
    ],
    note: "This access helps determine feasibility before spending ~$500 on a formal survey. And saves you a lot of time!",
  },
  {
    n: "5",
    title: "Order a Professional Property Survey",
    desc: "Confirm lot dimensions, elevations, and boundaries. Use this to finalize site prep costs (grading, excavation, foundation, utility hookups). Typical turnaround is about 2–3 weeks and average cost is approximately $500.",
  },
  {
    n: "6",
    title: "Contact Multiple ADU Builders (Minimum of 3)",
    desc: "Request estimates for size, pricing, timelines, and scope of work. Compare experience, build methods, and familiarity with local regulations. Typical turnaround: 6–12 weeks.",
  },
  {
    n: "7",
    title: "Verify HOA & Local Restrictions",
    desc: "Confirm HOA rules, deed restrictions, and city zoning requirements (setbacks, access, parking, and placement). Typical turnaround: 1–2 weeks.",
  },
  {
    n: "8",
    title: "Finalize Budget & Site Plan",
    desc: "Refine your total project cost and align with your builder on scope, layout, and site plan based on survey results and regulations. Typical turnaround: 4 weeks.",
  },
  {
    n: "9",
    title: "Submit Plans & Apply for Permits",
    desc: "Work with your builder or city to submit plans and secure permits for site prep, utilities, and construction. Typical turnaround: 1–2 months.",
  },
  {
    n: "10",
    title: "Build, Inspect, and Obtain Certificate of Occupancy",
    desc: "Construction begins. Inspections occur at required stages (varies by city). Upon completion, pass final inspection and obtain a Certificate of Occupancy. Typical turnaround: 4–6 months.",
  },
];

const faqs = [
  { q: "What is an ADU?", a: "An Accessory Dwelling Unit (ADU) is a secondary residential unit located on a residential property. ADUs can be attached or detached and typically include a kitchen, bathroom, and living area." },
  { q: "Why do zoning laws vary by state and city?", a: "Each state sets broad structural standards (IRC), but cities layer their own zoning rules on top — setbacks, height limits, lot coverage, parking, and occupancy requirements all vary by municipality." },
  { q: "Can I buy a cheap ADU online (Amazon, imported units, etc.)?", a: "You can, but imported or low-cost units often don't meet local building codes, IRC standards, or zoning requirements. Always verify compliance before purchasing." },
  { q: "Do builders listed on ADUAtlas know my local zoning?", a: "Builders on ADUAtlas are matched by ZIP code and are familiar with local zoning and permitting requirements in your area." },
  { q: "How much does it cost to build an ADU?", a: "Costs range widely by region and type, but most projects fall between $150K and $450K all-in, depending on size, site conditions, and local labor rates." },
  { q: "How does ADUAtlas match me with builders and suppliers?", a: "We match you by ZIP code with verified local and national builders and suppliers who understand your city's zoning and permitting requirements." },
  { q: "How accurate are zoning regulations on ADUAtlas?", a: "We compile data from official state and municipal sources and update regularly, but always confirm with your local building department before making decisions." },
  { q: "Do I need a survey to build an ADU?", a: "In most cases, yes — a survey confirms lot boundaries, setbacks, and easements. Some cities require a formal survey before issuing permits." },
  { q: "What is the biggest mistake people make when building an ADU?", a: "Starting without understanding local zoning, skipping the feasibility step, or hiring a builder who isn't familiar with your city's ADU regulations." },
  { q: "How much value can an ADU add to my property?", a: "ADUs can add significant value — typically 20–30% of the primary home's value — depending on location, size, and quality of construction." },
  { q: "Will my property taxes increase?", a: "Generally yes, based on added assessed value, not the full cost of construction." },
  { q: "Are grants or incentives available to build an ADU?", a: "Some states and cities offer grants, fee waivers, or expedited permitting for ADU construction. Check your local housing department." },
  { q: "Where can I find the deed to my property?", a: "Your county recorder's office or assessor's website typically has deed records. Your title company from the home purchase can also provide a copy." },
];

const HowToAdu = () => {
  return (
    <div>
      <PageHeader
        title="How to ADU"
        subtitle="Whether you are ready to build or just starting out, ADU Atlas walks you through the process. Utilize the ADUAtlas worksheet to prepare to speak with a builder or to prepare an ADU Ready score, whether building, buying or selling an ADU."
        bg={heroImg}
      />

      <section className="bg-[#2F5D50] py-8 sm:py-10">
        <div className="container mx-auto px-4 sm:px-6">
          <h3 className="text-white text-xl sm:text-2xl font-semibold text-center mb-2">Start Your ADU Journey with ADUAtlas</h3>
          <p className="text-white/80 text-sm text-center mb-8 max-w-3xl mx-auto">
            Our 10-step guide gives you a clear path—what you can legally build, expected timelines, cost ranges, ADU types, and key FAQs. Matched by ZIP code, you'll connect with both local and national builders and suppliers. Whether you're just starting or ready to build, ADUAtlas keeps you informed and prepared.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {categories.map((cat) => {
              const Icon = cat.icon;
              return (
                <div key={cat.title} className="bg-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-white mb-3">
                    <Icon className="text-xl" />
                    <h4 className="font-semibold text-lg">{cat.title}</h4>
                  </div>
                  <ul className="space-y-2">
                    {cat.bullets.map((b, i) => (
                      <li key={i} className="text-white/90 text-sm flex items-start gap-2">
                        <span className="text-white mt-1 shrink-0">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                  {cat.note && <p className="text-white/70 text-xs mt-3 italic">{cat.note}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h2 className="text-center text-3xl sm:text-4xl font-semibold text-primary mb-10">10 Step Guide to Building an ADU</h2>
        <div className="flex flex-col gap-5">
          {steps.map((s) => (
            <div key={s.n} className="grid md:grid-cols-[1fr_auto] gap-4 items-start bg-[#F4F7F6] rounded-2xl p-4 sm:p-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 shrink-0 rounded-full bg-[#2F5D50] text-white flex items-center justify-center font-semibold text-lg">{s.n}</div>
                <div>
                  <h4 className="font-semibold text-lg text-primary">{s.title}</h4>
                  <p className="text-secondary text-sm mt-1">{s.desc}</p>
                  {s.bullets && (
                    <ul className="mt-2 space-y-1">
                      {s.bullets.map((b, i) => (
                        <li key={i} className="text-secondary text-sm flex items-start gap-2">
                          <span className="text-[#2F5D50] mt-1.5 shrink-0">●</span>
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {s.note && <p className="text-[#2F5D50] text-sm mt-2 font-medium">{s.note}</p>}
                </div>
              </div>
              <img src={imgs[parseInt(s.n) - 1]} alt="" className="w-full md:w-56 h-32 md:h-28 object-cover rounded-xl" />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#F4F7F6] py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          <h2 className="text-center text-3xl sm:text-4xl font-semibold text-primary mb-3">Frequently Asked Questions</h2>
          <p className="text-center text-secondary text-sm mb-8">Common questions about building an ADU — answered clearly.</p>
          <Accordion items={faqs} />
        </div>
      </section>

      <AduCTA />
    </div>
  );
};

export default HowToAdu;
