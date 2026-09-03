import Accordion from "../components/common/Accordion";
import PublicStubFooter from "../components/gates/PublicStubFooter";
import { useContentText } from "../lib/content";
import { FAQ_ITEMS_COUNT } from "../lib/contentRegistry/faq";

// One component per item so its hooks are called at a stable place per item
// (not inside a .map() callback) — same pattern as RiskCallouts.jsx.
const useFaqItem = (i) => ({
  q: useContentText(`faq.item.${i}.question`),
  a: <p>{useContentText(`faq.item.${i}.answer`)}</p>,
});

const FAQ = () => {
  const eyebrow = useContentText("faq.hero.eyebrow");
  const heading = useContentText("faq.hero.heading");
  const body = useContentText("faq.hero.body");
  const footerNote = useContentText("faq.footer_note");
  // Fixed count (6), so calling one hook-bundle per index below is stable
  // across renders — see useFaqItem above.
  const faqs = [
    useFaqItem(0),
    useFaqItem(1),
    useFaqItem(2),
    useFaqItem(3),
    useFaqItem(4),
    useFaqItem(5),
  ].slice(0, FAQ_ITEMS_COUNT);

  return (
    <div>
      <section className="bg-canvas py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl text-center">
          <p className="text-accent font-semibold tracking-[0.2em] text-xs sm:text-sm mb-3 uppercase">
            {eyebrow}
          </p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-paper leading-tight">
            {heading}
          </h1>
          <p className="mt-5 text-paper-dim text-sm sm:text-base leading-relaxed">
            {body}
          </p>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 py-8 sm:py-12 max-w-3xl">
        <Accordion items={faqs} />
      </section>

      <PublicStubFooter chapterName="Full answers · Chapter 4" />

      <section className="container mx-auto px-5 sm:px-8 max-w-3xl pb-16">
        <p className="text-paper-dim/70 text-xs italic leading-relaxed text-center">
          {footerNote}
        </p>
      </section>
    </div>
  );
};

export default FAQ;
