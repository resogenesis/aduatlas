import Accordion from "../components/common/Accordion";
import lotPlanImg from "../assets/faq/lot-plan-scenario.png";

const faqs = [
  {
    q: "Is building an ADU the same everywhere?",
    a: (
      <>
        <p>No. ADU rules and costs vary by state, city, and even ZIP code. What is allowed, affordable, and practical depends on:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>State building code</li>
          <li>City zoning rules</li>
          <li>Property conditions</li>
          <li>Utilities and access</li>
          <li>Budget and goals</li>
        </ul>
        <p className="mt-2">Confirm local regulations and site conditions early.</p>
      </>
    ),
  },
  {
    q: "What is an ADU / JADU?",
    a: (
      <>
        <p>An Accessory Dwelling Unit (ADU) is a secondary residential unit on a residential property. It can be attached or detached and typically includes a kitchen, bathroom, and living space. ADUAtlas focuses on detached ADUs.</p>
        <p className="mt-2">A JADU has a max size of 500 sq ft, is located within an existing structure, shares utilities, includes a kitchenette, and has a separate exterior entrance.</p>
        <p className="mt-2">Also called: tiny home, casita, granny flat, backyard cottage — usually a reference for any type of ADU. These names are typically localized.</p>
      </>
    ),
  },
  {
    q: "Why do rules vary by state and city?",
    a: (
      <>
        <p>States typically mandate the structure using the International Residential Code (IRC), which governs structural elements and safety. Ask your builder how they meet or exceed the IRC.</p>
        <p className="mt-2">Cities and counties control zoning: height, setbacks, placement, parking, design, and utility connections. Understanding who regulates what reduces project risk.</p>
        <p className="mt-2">State regulations vary — some states like Texas prohibit cities from prohibiting ADUs, and a few have no regulations. Some cities have defined ADU regulations and some have none; however, most will have some kind of building code for any structure. Be sure to check both your state and city building codes before you begin your plan.</p>
      </>
    ),
  },
  {
    q: "Key aspects and usage examples of the IRC building code",
    a: (
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Structural requirements:</strong> Defines standards for foundations (shallow and deep), wall framing (wood, steel, concrete), and roof construction.</li>
        <li><strong>Means of egress:</strong> Regulations for safe exit routes, including stairway width, headroom, and exterior door requirements.</li>
        <li><strong>Safety features:</strong> Provisions for fire resistance (smoke alarms), sanitation (plumbing), and safety lighting.</li>
        <li><strong>Energy conservation:</strong> Insulation and energy efficiency standards.</li>
        <li><strong>Permitting:</strong> Rules for new construction, renovations, repairs, and structural demolition.</li>
      </ul>
    ),
  },
  {
    q: "Can I buy a cheap ADU online?",
    a: (
      <>
        <p>Yes, but caution is required. Many low-cost or imported units:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Do not meet IRC standards</li>
          <li>May not be certified for state or local permitting</li>
          <li>May fall under different federal housing codes</li>
        </ul>
        <p className="mt-2">Always verify compliance with a licensed architect or engineer before purchasing. Some deceptive ads show a finished ADU but are only selling the frame. There are very reliable online ADU sellers — they will have a website and a contact to verify the structural elements. If the ad seems too good to be true, it probably is.</p>
      </>
    ),
  },
  {
    q: "Do ADUAtlas builders know my local zoning?",
    a: (
      <>
        <p>Builders list the cities and ZIP codes they serve. Many are familiar with local rules, but regulations can change, so verify both your state and local building codes. ADUAtlas updates regulations regularly, but you still need to confirm in case the city has made any updates.</p>
        <p className="mt-2">You should:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Review zoning first</li>
          <li>Ask about their experience in your city</li>
          <li>Confirm IRC and permitting knowledge</li>
        </ul>
      </>
    ),
  },
  {
    q: "How much does an ADU cost?",
    a: (
      <>
        <p>There is no set price. On the low side, expect around $10K for site prep (connecting utilities and a foundation) and $60K for the ADU — a minimum of about $70K total. A modular home on wheels may be the least expensive option but is prohibited in many areas. Verify with your local ADU zoning regulations.</p>
        <p className="mt-2">Costs depend on:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Size, layout, materials, finishes</li>
          <li>Finish level — builder grade vs. luxury</li>
          <li>Site prep and utilities</li>
          <li>Access and delivery</li>
          <li>Location</li>
        </ul>
        <p className="mt-2">General ranges:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Structure only: ~$25,000 and up</li>
          <li>Site prep / utilities: $10,000–$100,000+</li>
        </ul>
        <p className="mt-2">Site work is often the largest surprise expense. ADUAtlas solves that with a Paid Access package for $79.99 that includes a GIS look at your property with dimensions, a pre-filled pre-site estimate worksheet, a National Property ADU Ready Score, and a utility contact who visits your home and marks utility access points (water, gas, and sewer are usually underground).</p>
      </>
    ),
  },
  {
    q: "What costs are not included in advertised ADU prices?",
    a: (
      <>
        <p>Usually excluded:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Utility connections — gas, sewer, water, and electric</li>
          <li>Trenching and excavation for utilities</li>
          <li>Foundations</li>
          <li>Grading and drainage</li>
          <li>Engineering and surveys</li>
          <li>Permits and fees</li>
          <li>Crane or access costs</li>
        </ul>
        <p className="mt-2">Some ADUs are sold with a finished interior including appliances and some are not. Be sure to ask — builders differ on interior and exterior options (roof type, siding, insulation, windows). An advertised low price may include the basics only.</p>
        <p className="mt-2">Some builders can do everything; some cannot. ADUAtlas helps you understand what "everything" means so when you get a price estimate you will understand the cost. A builder that does everything will cost more, and if they cannot complete something they may suggest a subcontractor. Find an experienced builder you like — typically they will be upfront about total costs.</p>
        <p className="mt-2">Cities and contractors treat payment differently, but most ask for 1/3 up front, 1/3 at midpoint, and 1/3 upon completion. Some cities mandate construction payment timelines and some do not. Be sure to ask.</p>
      </>
    ),
  },
  {
    q: "Do I need a survey?",
    a: (
      <>
        <p>Usually yes, but it depends on the city.</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Typical cost: $500–$2,000</li>
          <li>Timeframe: 2–3 weeks</li>
        </ul>
        <p className="mt-2">ADUAtlas provides a GIS survey that includes your property dimensions with our $79.99 access package, plus three pre-filled estimating tools that can save you a lot of money. Most cities require a certified survey for permitting and to create a site plan.</p>
      </>
    ),
  },
  {
    q: "What are common mistakes homeowners make building an ADU / tiny house?",
    a: (
      <>
        <p>Buying or designing before confirming:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Skipping zoning limits — setbacks, size, height, parking, placement. Errors here can cost money, cause delays, trigger fines, or result in permit rejection.</li>
          <li>Underestimating utility connection costs, permits, city inspection costs, and timelines</li>
          <li>Not identifying site constraints</li>
        </ul>
        <p className="mt-2">Early planning prevents redesigns and delays. The carpenter's rule: measure twice, cut once.</p>
        <p className="mt-2">ADUAtlas Paid Access for $79.99 is an inexpensive tool to help you identify common — and not-so-common — potential errors, with realistic approximate estimates and a clear understanding of what to expect. For example, in areas that freeze, water and sewer lines are typically 3–4 ft underground. If your water line is 20 ft from your ADU, connecting it could cost ~$100 per linear foot to excavate (~$2,000 total), plus ~$1,000 for a plumber to install.</p>
        <p className="mt-2">Paid Access also prepares you before you speak with a builder and the city. They will ask about ADU size, budget, timeline, ADU type, and a few other details. ADUAtlas guides you through the process.</p>
      </>
    ),
  },
  {
    q: "Will my property taxes increase?",
    a: (
      <p>Often, yes — sometimes with or without improvements. Tax treatment varies by location. Consult your local assessor or tax professional.</p>
    ),
  },
  {
    q: "Are grants available?",
    a: (
      <>
        <p>Sometimes. Availability depends on:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>State and local programs</li>
          <li>Funding cycles</li>
          <li>Eligibility requirements</li>
        </ul>
        <p className="mt-2">Check early. States and cities with incentives are often those facing a housing shortage, such as California, Washington, and Colorado.</p>
      </>
    ),
  },
  {
    q: "How accurate is zoning information on ADUAtlas?",
    a: (
      <>
        <p>Regulations change. ADUAtlas:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Updates information regularly</li>
          <li>Provides direct municipal links</li>
        </ul>
        <p className="mt-2">Always confirm with your city before final design or construction.</p>
      </>
    ),
  },
  {
    q: "What does \"IRC-compliant\" mean?",
    a: (
      <>
        <p>This is a standard building code many states mandate at a minimum. The structure meets the International Residential Code for:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Structural safety</li>
          <li>Electrical and plumbing</li>
          <li>Energy efficiency</li>
          <li>Life safety</li>
        </ul>
        <p className="mt-2">Ask your builder how they meet or exceed those expectations. Most states require IRC compliance for ADUs; some do not.</p>
      </>
    ),
  },
  {
    q: "How does ADUAtlas match me with builders?",
    a: (
      <>
        <p>You can search builders on your own by ADU type. Paid Access helps you find builders that operate in your state. Matches are based on:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>City and ZIP code</li>
          <li>ADU types</li>
          <li>Service area</li>
        </ul>
        <p className="mt-2">Builders operate locally, regionally, or nationally.</p>
      </>
    ),
  },
  {
    q: "What do I get with paid access?",
    a: (
      <>
        <p>Paid Access includes a feasibility study with:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Pre-filled pre-site-prep worksheet</li>
          <li>National ADU Property Readiness Score</li>
          <li>GIS satellite property view with dimensions</li>
          <li>Utility contact to locate and mark access points</li>
          <li>Local and national builder/supplier contacts by state</li>
        </ul>
        <p className="mt-2">No subscriptions required. Annual Access is $79.99 — a one-time fee.</p>
        <p className="mt-2">The ADUAtlas Feasibility Study isn't a commitment to build — it's how you find out if an ADU is actually possible on your property before you spend time or money.</p>
        <p className="mt-2">With a completed study, you'll know what your lot can support, what it could cost, and whether it's worth pursuing — so you can evaluate your current home or a property you're considering, whether it's for aging in place, housing a parent, or creating rental income, without committing to a plan.</p>
        <p className="mt-2">For $79.99, get a clear answer now — before you invest more time or head in the wrong direction.</p>
      </>
    ),
  },
  {
    q: "Does ADUAtlas guarantee approvals or pricing?",
    a: (
      <p>No. ADUAtlas provides planning guidance only. Permits, pricing, and timelines are determined by your local jurisdiction and the professionals you hire.</p>
    ),
  },
  {
    q: "What does ADUAtlas not do?",
    a: (
      <>
        <p>ADUAtlas does not:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Sell ADUs</li>
          <li>Provide construction quotes</li>
          <li>File permits</li>
          <li>Act as a contractor or broker</li>
          <li>Guarantee approvals or costs</li>
        </ul>
        <p className="mt-2">It is a planning and education platform at this point.</p>
      </>
    ),
  },
  {
    q: "Why do I need the ADUAtlas feasibility study before I speak with a builder?",
    a: (
      <>
        <p>Local zoning rules and site conditions decide what's even possible. Before talking to a builder, you need to understand:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>Local zoning rules — including allowable ADU sq ft as a percentage of the primary residence</li>
          <li>Setbacks (typically on three sides) and required distance from the primary residence</li>
          <li>Desired ADU type and custom size</li>
          <li>Lot size, lot dimensions, and the location of the primary residence</li>
        </ul>
        <p className="mt-2"><strong>Scenario:</strong> After you spend $500 on an official survey, you learn your lot is 30' × 120' = 3,600 sq ft, with a primary house of 24' × 44' = 1,056 sq ft. Apply a local rule that the ADU must be 50% or less of the primary home and a minimum of 500 sq ft, with setbacks of 3' to the alley, 3' on each side, and 10' from the main house.</p>
        <p className="mt-2">In this case, a 24' × 22' = 528 sq ft ADU is 50% of the primary home and is legal. An additional 16" of footprint is technically buildable, but the 50% rule caps you at 528 sq ft.</p>
        <p className="mt-2">Now add the costs: utility hook-up and site prep with excavation ≈ $25K, the ADU ≈ $100K, plus permits, builder fees, and delivery ≈ another $25K. That's $150K for a 528 sq ft ADU. Does it still make sense?</p>
        <p className="mt-2">Use the $79 ADUAtlas feasibility study <em>before</em> ordering an official survey or speaking with a builder. Our pre-filled pre-site and ADU feasibility worksheets give you these details — you add your specific dimensions from the survey and the regulations from your ZIP code.</p>
        <figure className="mt-4">
          <img src={lotPlanImg} alt="Sample 30' x 120' lot plan showing primary home, ADU placement, setbacks, and utility points" className="w-full rounded-lg border border-gray-200" />
          <figcaption className="mt-2 text-xs text-gray-300 italic">Sample lot plan: 30' × 120' lot with a 24' × 44' primary home and a 24' × 22' (528 sq ft) ADU.</figcaption>
        </figure>
      </>
    ),
  },
  {
    q: "What information will builders need?",
    a: (
      <>
        <p>The first question: is it legal to build what you want? The ADUAtlas feasibility study answers that. Most builders cannot provide accurate pricing until you know the exact details — though some may give a price range based on what they offer.</p>
        <p className="mt-2">A builder will need to know:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>City and ZIP code</li>
          <li>Total budget — pre-site and structure</li>
          <li>ADU type, size, and height</li>
          <li>Lot dimensions</li>
          <li>Placement preference</li>
          <li>Site access</li>
          <li>Known utility or access issues</li>
        </ul>
        <p className="mt-2">Prepared homeowners receive accurate pricing.</p>
      </>
    ),
  },
  {
    q: "How does ADUAtlas help prevent buying the wrong ADU?",
    a: (
      <>
        <p>By guiding you through:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>State vs. city authority</li>
          <li>Zoning constraints</li>
          <li>Site and utility planning</li>
          <li>Builder expectations</li>
        </ul>
        <p className="mt-2">The goal is to prevent purchasing a structure that cannot be permitted or installed.</p>
      </>
    ),
  },
  {
    q: "What is a National ADU Ready Score?",
    a: (
      <>
        <p>It provides homeowners, real estate agents, and home buyers with a score that determines whether an ADU can be built on a property — and which elements make it easy or impossible. Typically, you'd need an official survey including property dimensions and other elements, which costs a minimum of $500.</p>
        <p className="mt-2"><em>Why spend $500 before you even know if you can build?</em></p>
        <p className="mt-2">ADUAtlas provides a geospatial survey with the information needed to determine feasibility, plus a cost-free contact who comes to your home to mark the location of your utility access.</p>
        <p className="mt-2">Three pre-filled worksheets help determine:</p>
        <ul className="list-disc pl-5 mt-2 space-y-1">
          <li>A pre-filled pre-site cost estimate spreadsheet</li>
          <li>A questionnaire that determines the National ADU Ready Score</li>
          <li>A pre-filled total budget with estimated timelines</li>
        </ul>
        <p className="mt-2">Based on your local ADU regulations, the ADUAtlas feasibility study helps you determine what you can build and a realistic approximate estimate of how much it will cost. After you complete the study, you'll be prepared to walk into any conversation with a builder or your city.</p>
      </>
    ),
  },
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
