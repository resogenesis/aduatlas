import Accordion from "../components/common/Accordion";
import PageHeader from "../components/common/PageHeader";

const faqs = [
  { q: "What is an ADU?", a: "An Accessory Dwelling Unit is a secondary, self-contained housing unit on the same lot as a primary residence." },
  { q: "Do I need a permit to build an ADU?", a: "Yes — virtually every U.S. jurisdiction requires a building permit and zoning review." },
  { q: "How much does an ADU cost?", a: "Costs range widely by region and type, but most projects fall between $150K and $450K all-in." },
  { q: "What's the difference between detached and attached ADUs?", a: "Detached ADUs are standalone structures; attached ADUs share a wall with the primary home." },
  { q: "How long does an ADU project take?", a: "From planning to certificate of occupancy, expect 9–18 months on average." },
  { q: "Can I rent out my ADU?", a: "In most jurisdictions, yes — though short-term rental rules vary by city." },
  { q: "Will an ADU increase my property taxes?", a: "Generally yes, based on added assessed value, not the full cost of construction." },
  { q: "Do I need a licensed architect?", a: "Not always — many cities accept designs from licensed contractors or ADU specialists." },
  { q: "What utilities does an ADU need?", a: "Water, sewer, electric, and often separate metering depending on your jurisdiction." },
  { q: "How do I find a qualified ADU builder?", a: "Use ADUAtlas to match with verified builders familiar with your local zoning." },
];

const FAQ = () => {
  return (
    <div>
      <PageHeader title="Frequently Asked Questions" subtitle="Answers to the most common ADU questions we hear" />
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 max-w-3xl">
        <Accordion items={faqs} />
      </section>
    </div>
  );
};

export default FAQ;
