import { FiBookOpen, FiHelpCircle, FiVideo } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import AduCTA from "../components/common/AduCTA";
import Accordion from "../components/common/Accordion";
import heroImg from "../assets/home/hero_image.png";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/how_it_works.png";
import img5 from "../assets/home/container_img.png";

const steps = [
  {
    n: "1",
    title: "Review State Rules (Structure & Code)",
    bullets: [
      "The state mandates structures with the IRC regulations. Review your state ADU Rules and the IRC-based statewide regulations.",
      "Ask your builder how they meet or exceed your state IRC standards.",
    ],
    img: img1,
  },
  {
    n: "2",
    title: "Confirm Local Zoning (City Rules)",
    bullets: [
      "Review your city's ADU regulations.",
      "Check HOA and deed restrictions.",
      "Verify: height limits, setbacks, lot coverage, parking, occupancy, and allowed ADU types.",
    ],
    img: img2,
  },
  {
    n: "3",
    title: "Complete Pre-Site Feasibility",
    bullets: [
      "Use the ADUAtlas pre-site worksheet.",
      "Identify: size, placement, setbacks, access path, slope/drainage, trees, utilities, and obstructions.",
      "Generate your ADUAtlas Property Readiness Score (APRS).",
      "Use the provided lot dimensions for initial feasibility before ordering a formal survey.",
    ],
    img: img3,
  },
  {
    n: "4",
    title: "Understand Timeline",
    bullets: [
      "Research & Feasibility: 4–6 weeks",
      "Design & Engineering: 2–8+ weeks (or prefab production timeline)",
      "Permitting: 4–16+ weeks (varies by city; multiple permits likely)",
      "Site Prep & Build: 8–24+ weeks (site and ADU type dependent)",
    ],
    img: img4,
  },
  {
    n: "5",
    title: "Verify Utilities (Major Cost Driver)",
    bullets: [
      "Schedule utility locate/marking.",
      "Identify sewer, water, electric, gas connections.",
      "Refine your pre-site cost estimate and update your APRS score.",
    ],
    img: img5,
  },
  {
    n: "6",
    title: "Obtain your lot dimensions (basic feasibility)",
    bullets: [
      "Contact local and national ADU builders.",
      "Website feasibility, budget range, timeline, and next steps.",
      "Identify required trades (survey, engineering, foundation, utilities).",
    ],
    img: img1,
  },
  {
    n: "7",
    title: "Meet with the City",
    bullets: [
      "Schedule a pre-application meeting with your building or housing department.",
      "Confirm zoning interpretation, permit requirements, and approval pathway before final design.",
    ],
    img: img2,
  },
];

const faqs = [
  { q: "What is an ADU?", a: "An Accessory Dwelling Unit (ADU) is a secondary residential unit located on a residential property. ADUs can be attached or detached and typically include a kitchen, bathroom, and living area. ADUs are often referred to by other names such as tiny house, casita, backyard cottage, granny flat, or backyard home, depending on region and design." },
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
        subtitle="Whether you are ready to build or just starting out ADU Atlas walks you through the process. Utilize the ADUAtlas worksheet to prepare to speak with a builder or to prepare an ADU Ready score, whether building, buying or selling an ADU."
        bg={heroImg}
      />

      <section className="bg-[#2F5D50] py-8">
        <div className="container mx-auto px-4 sm:px-6">
          <h3 className="text-white text-xl sm:text-2xl font-semibold text-center mb-2">Step-by-Step ADU Guide</h3>
          <p className="text-white/80 text-sm text-center mb-6">Educate yourself before you speak with a professional</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: FiBookOpen, text: "Learn the basics of ADUs and compare the different types" },
              { icon: FiHelpCircle, text: "Check out the ADU Atlas FAQ to help you avoid common mistakes" },
              { icon: FiVideo, text: "Learn directly from industry experts in our video library" },
            ].map((it, i) => {
              const Icon = it.icon;
              return (
                <div key={i} className="flex items-start gap-3 text-white text-sm">
                  <Icon className="shrink-0 mt-0.5 text-lg" />
                  <span>{it.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h2 className="text-center text-3xl sm:text-4xl font-semibold text-primary mb-10">Homeowner Step-by-Step Guide</h2>
        <div className="flex flex-col gap-5">
          {steps.map((s) => (
            <div key={s.n} className="grid md:grid-cols-[1fr_auto] gap-4 items-center bg-[#F4F7F6] rounded-2xl p-4 sm:p-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 shrink-0 rounded-full bg-[#2F5D50] text-white flex items-center justify-center font-semibold text-lg">{s.n}</div>
                <div>
                  <h4 className="font-semibold text-lg text-primary">{s.title}</h4>
                  <ul className="mt-2 space-y-1">
                    {s.bullets.map((b, i) => (
                      <li key={i} className="text-secondary text-sm flex items-start gap-2">
                        <span className="text-[#2F5D50] mt-1.5 shrink-0">●</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <img src={s.img} alt="" className="w-full md:w-56 h-32 md:h-28 object-cover rounded-xl" />
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#F4F7F6] py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          <h2 className="text-center text-3xl sm:text-4xl font-semibold text-primary mb-3">Frequently Asked Questions</h2>
          <p className="text-center text-secondary text-sm mb-8">What makes shipping container farms unique is that they're not exclusive to professional farmers.</p>
          <Accordion items={faqs} />
        </div>
      </section>

      <AduCTA />
    </div>
  );
};

export default HowToAdu;
