import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiClock } from "react-icons/fi";
import {
  chapters,
  getCompletedChapters,
  markChapterComplete,
  unmarkChapter,
} from "../../stores/courseStore";

// Course content per chapter. Plain { h, p } sections rendered as an article.
// Written for homeowners with no construction background; jurisdiction-specific
// rules are flagged as "varies" with examples, never stated as universal.
const CONTENT = {
  c1: [
    { h: "What you'll learn", p: "The full ADU process from first idea to certificate of occupancy, in the order things actually happen — not the order they're posted on city websites. By the end you'll be able to say what phase you're in, what the next decision is, and roughly what it costs." },
    { h: "What an ADU actually is", p: "An Accessory Dwelling Unit is a second, self-contained home on a lot that already has a primary residence. Self-contained means it has its own kitchen, bathroom, sleeping area, and its own entrance. That legal definition matters: a bedroom with a mini-fridge is not an ADU, and it won't appraise, insure, or rent as one. The three physical forms — detached, attached, and conversion — are covered in Chapter 2." },
    { h: "The five phases, in real order", p: "Every successful ADU moves through the same five phases: (1) Education — understanding the process and your local rules; (2) Feasibility — confirming your specific lot can support an ADU and what size; (3) Design & budget — turning constraints into a plan and a real number; (4) Permitting — city review and approval; (5) Construction & final inspection — building it and earning the certificate of occupancy that makes it legal to occupy. You are in Phase 1 right now." },
    { h: "Why most homeowners get this wrong", p: "The single most common mistake is calling a builder first. A builder can only quote what you tell them, and in Phase 1 you don't yet know your setbacks, your buildable area, or your hidden site costs — so the quote is fiction. Homeowners who lead with feasibility get accurate quotes the first time; homeowners who lead with a builder get a low number that balloons later. This course exists to get you to Phase 3 before you ever pick up the phone." },
    { h: "Realistic timeline", p: "From serious start to move-in, most ADU projects take 8–18 months: roughly 1–3 months of feasibility and design, 1–4 months in permitting (wildly variable by city), and 4–8 months of construction. Conversions of existing space are faster; new detached units on difficult lots are slower. Anyone promising 90 days is either pre-fabricating off-site or skipping a step you'll pay for later." },
  ],
  c2: [
    { h: "Three forms, then everything else", p: "Every ADU is one of three forms. Detached (DADU): a standalone building in the yard — the most flexible and usually the most expensive. Attached: shares a wall with the main house, often an addition. Conversion: turning existing permitted space — a garage, basement, or attic — into a dwelling, typically the cheapest path because the shell already exists. Everything else (tiny homes, container units, prefab) is a construction method inside one of these three forms, not a separate legal category." },
    { h: "The JADU — a cheaper fourth option", p: "A Junior ADU (JADU) is a unit of 500 sq ft or less created within the walls of the existing home, often a converted bedroom with an exterior entrance and an efficiency kitchen. It can share a bathroom with the main house. Because it uses existing space and lighter requirements, a JADU is often the lowest-cost way to add a legal unit — but rules and even whether JADUs exist vary by state and city. Some jurisdictions let you build both a JADU and a regular ADU on the same lot." },
    { h: "Construction methods", p: "Site-built (stick-built) is framed on your lot — most common, most customizable. Modular/prefab is built in a factory in sections and craned onto your foundation — faster and often more predictable on price, but needs crane access and a finished foundation waiting. Panelized and SIP (structural insulated panel) systems sit in between. Garage conversions are almost always site-built because you're working inside an existing structure." },
    { h: "Cost ranges by type", p: "Plan on rough all-in ranges of roughly $100–$250 per square foot for a garage or interior conversion, and $250–$500+ per square foot for new detached construction, before site work. A 600 sq ft detached unit therefore commonly lands anywhere from $150k to $300k+ depending on region, finishes, and site difficulty. These are planning numbers, not quotes — Chapter 3 shows what the low quotes leave out." },
    { h: "How to choose", p: "Match the form to your goal, lot, and budget — in that order. Rental income on a tight budget usually points to a conversion or JADU. Housing an aging parent who needs single-level access and privacy points to a detached unit. A large lot with side-yard access unlocks options a narrow urban lot doesn't. Your quiz answers already narrowed this; your feasibility results in Chapter 6 will confirm what physically fits." },
  ],
  c3: [
    { h: "Why builder quotes always look low", p: "A builder's quote covers what a builder controls: the structure itself — framing, roof, finishes, fixtures. It usually excludes the site work that turns a design into a livable, connected building. That gap is where budgets blow up. The quote isn't dishonest; it's answering a narrower question than the one you're actually asking, which is 'what will this cost me, total, out the door?'" },
    { h: "The hidden cost stack", p: "Budget for these on top of the structure: utility connections (water, sewer, electrical, sometimes gas), sewer or septic tie-ins and the trenching to reach them, a new electrical panel or service upgrade, grading and drainage, the foundation, and permit and impact fees. In many jurisdictions there are also school fees and utility capacity charges. Individually each is a few thousand dollars; together they routinely add 20–40% to the structural quote." },
    { h: "Utilities are the usual surprise", p: "The most common budget shock is the distance and difficulty of connecting utilities. If your sewer main is on the far side of the property, or your existing electrical panel is already near capacity, you can spend $10k–$30k+ before a single wall goes up. This is exactly what feasibility surfaces early — and why homeowners who skip it get blindsided during construction when it's too late to redesign." },
    { h: "Build your budget from the bottom up", p: "Take the structural cost (square footage × your type's cost-per-sq-ft range), then add a site-work line, a fees line, a design/engineering line, and a contingency of 10–20% for what the site reveals once digging starts. That bottom-up total — not the builder's headline number — is your real budget. Chapter 6's feasibility output pre-fills most of these lines from your property data." },
    { h: "Financing, briefly", p: "Common ADU funding sources are cash, a home equity line of credit (HELOC), a cash-out refinance, a renovation loan, or dedicated ADU financing products that appraise the future rental income. Each has trade-offs in rate, timeline, and how much equity you need. You don't need to decide now — but knowing your ceiling before design keeps you from drawing a unit you can't fund." },
  ],
  c4: [
    { h: "Who decides what", p: "Three layers of rules stack on your project. States (and the building code they adopt) set structural, life-safety, and energy requirements — the how-it's-built rules. Cities and counties control zoning — the what-you-can-build-where rules: setbacks, height, size limits, lot coverage, and parking. HOAs, where they exist, add private restrictions on top. When two rules conflict, the more restrictive one usually wins, though some states have passed laws that override local limits to encourage ADUs." },
    { h: "The zoning rules that decide your ADU", p: "Six numbers shape almost every ADU: setbacks (how far the unit must sit from each property line), maximum height, maximum size (as square feet or a percentage of the main house), lot coverage (how much of the lot can be built on), parking requirements, and minimum lot size. These are the inputs to your buildable envelope — the actual patch of ground where an ADU is allowed. Chapter 6 turns these into a drawing." },
    { h: "State law can override your city", p: "Some states have passed ADU-friendly legislation that limits how restrictive cities can be — for example capping setbacks at 4 feet, removing parking requirements near transit, guaranteeing a minimum allowed size, or requiring ministerial (non-discretionary) approval so a code-compliant application can't be denied on taste. Whether any of this applies depends entirely on your state and even your specific location, so treat these as possibilities to check, not guarantees." },
    { h: "How to read your own code", p: "Find your property's zoning designation (your county assessor or city GIS portal usually shows it), then look up that zone's ADU or accessory-structure standards on the city planning site. Read for the six numbers above. If the language is impenetrable — and it often is — that's normal; the feasibility step exists to translate it against your actual lot dimensions instead of leaving you to guess." },
    { h: "Don't forget the HOA", p: "If you're in an HOA, its covenants can restrict or effectively block an ADU even where the city allows one — though a growing number of states have limited HOAs' ability to prohibit them outright. Pull your CC&Rs early. Discovering an HOA restriction after you've paid for design is one of the most expensive and avoidable mistakes in the whole process." },
  ],
  c5: [
    { h: "What builders ask first", p: "A good builder opens with questions, not a price: Do you have a site plan and know your setbacks? What's your ADU type and target size? Is your budget realistic for that scope? Where are your utilities? Walking in able to answer these marks you as a serious, low-risk client — and serious clients get sharper quotes and better crews, because the builder isn't pricing in the chaos of an unprepared homeowner." },
    { h: "What to bring to the conversation", p: "Bring your property's key facts (address, lot size, zoning), your feasibility results (buildable envelope and max size), your ADU type and rough square footage, your budget ceiling, and your timeline. This is exactly the Builder Packet this course assembles for you. Handing it over up front replaces weeks of back-and-forth and lets multiple builders quote the same defined scope — which is the only way their numbers are comparable." },
    { h: "Fixed-price vs cost-plus", p: "Two common contract structures: fixed-price (the builder commits to a number for a defined scope — more predictable, but change orders cost you) and cost-plus (you pay actual costs plus a fee — more transparent, but the final total is uncertain). Neither is inherently better; what matters is that the scope is defined well enough that the number means something. A fixed price on a vague scope is just a low number waiting to grow." },
    { h: "How to compare quotes", p: "Never compare quotes on the bottom line alone. Compare what's included: does each cover site work, utilities, permits, and design, or just the structure? A 'cheaper' quote that excludes $40k of site work is the expensive one. Put all bids against the same Builder Packet scope, then line up the inclusions column by column. The right builder is often not the lowest number — it's the clearest one." },
    { h: "Red flags", p: "Walk away from: no license or insurance you can verify, a large up-front deposit, a quote with no line-item breakdown, pressure to skip permits, and reluctance to give references or show completed ADUs. Permit-skipping is the most dangerous — an unpermitted unit can't be legally rented, can block a future sale, and may have to be torn out. Cheap and fast is not worth an illegal building." },
  ],
  c6: [
    { h: "From constraints to a buildable envelope", p: "Feasibility is where the abstract rules become a specific drawing. Take your lot's dimensions, subtract the required setbacks on every side, subtract the footprint of the existing house and anything that must stay, and what remains is your buildable envelope — the real area where an ADU is legally allowed to sit. Everything about size and placement flows from this shape." },
    { h: "Your personalized site plan", p: "ADUAtlas generates a site plan for your specific parcel: your lot outlined with dimensions, the existing home's footprint, the setback lines applied from your local zoning, any overlays, and the largest ADU placement that fits inside the envelope. It turns 'I think I have room' into 'here is exactly where and how big.' This is the single most valuable artifact to hand a builder." },
    { h: "What's in the RFP packet", p: "Your Feasibility Packet bundles everything a builder needs to quote accurately: the site plan and buildable envelope, your ADU type and target square footage, the applicable zoning constraints, your budget and timeline, utility and access notes, and four working worksheets for budget, timeline, permits, and inspections. It's a request-for-proposal that any builder can price against the same defined scope." },
    { h: "How the numbers were derived", p: "Every constraint in your packet traces to a source: setbacks and size limits from your jurisdiction's code, lot dimensions from parcel records, cost ranges from regional ADU data. Nothing is invented. Where a value couldn't be confirmed for your specific property, the packet flags it as an assumption to verify rather than presenting a guess as fact — so you and your builder know exactly what's solid and what needs a site visit." },
    { h: "Your next move", p: "With a completed packet you're at the end of Phase 3 and ready for Phase 4. Send the packet to two or three builders for comparable quotes, or use ADUAtlas Builder Match to reach builders who only work with prepared homeowners. Either way you're walking in with a defined scope and a real budget — the exact opposite of the homeowner who called a builder on day one." },
  ],
};

const CourseChapter = () => {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(getCompletedChapters().has(chapterId));

  const idx = chapters.findIndex((c) => c.id === chapterId);
  const chapter = chapters[idx];
  if (!chapter) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="text-paper-dim mb-4">Chapter not found.</p>
        <Link to="/course" className="text-accent">Back to course</Link>
      </div>
    );
  }

  const next = chapters[idx + 1];
  const prev = chapters[idx - 1];
  const sections = CONTENT[chapterId] || [];

  const handleComplete = () => {
    markChapterComplete(chapterId);
    setCompleted(true);
    if (next) navigate(`/course/${next.id}`);
    else navigate("/dashboard");
  };

  const handleUnmark = () => {
    unmarkChapter(chapterId);
    setCompleted(false);
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
      <Link to="/course" className="inline-flex items-center gap-2 text-paper-dim hover:text-paper text-sm mb-8 transition-colors">
        <FiArrowLeft /> All chapters
      </Link>

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Chapter {chapter.n} of {chapters.length}
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
        {chapter.title}
      </h1>
      <div className="flex items-center gap-2 text-paper-dim text-sm mb-12">
        <FiClock /> ~{chapter.minutes} min read
        {completed && (
          <>
            <span className="mx-1.5">·</span>
            <span className="inline-flex items-center gap-1.5 text-accent">
              <FiCheckCircle /> Completed
            </span>
          </>
        )}
      </div>

      <article className="space-y-10 mb-14">
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="font-display text-paper text-2xl sm:text-3xl mb-3">{s.h}</h2>
            <p className="text-paper-dim text-base leading-relaxed">{s.p}</p>
          </section>
        ))}
      </article>

      {/* Footer actions */}
      <div className="border-t border-stroke pt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex gap-3">
          {prev && (
            <Link
              to={`/course/${prev.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              <FiArrowLeft /> Chapter {prev.n}
            </Link>
          )}
        </div>

        <div className="flex gap-3">
          {completed ? (
            <button
              onClick={handleUnmark}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              Mark as not done
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              <FiCheck /> Mark complete
              {next ? " & continue" : ""}
            </button>
          )}
          {completed && next && (
            <Link
              to={`/course/${next.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
            >
              Chapter {next.n} <FiArrowRight />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseChapter;
