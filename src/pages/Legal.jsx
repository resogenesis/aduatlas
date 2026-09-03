import { Link } from "react-router-dom";
import { useContentText, paragraphs } from "../lib/content";
import { LEGAL_SECTIONS_META } from "../lib/contentRegistry/legal";

const TocLink = ({ id, labelKey }) => {
  const label = useContentText(labelKey);
  return (
    <li>
      <a
        href={`#${id}`}
        className="text-paper-dim hover:text-paper text-sm transition-colors"
      >
        {label}
      </a>
    </li>
  );
};

// Legal's body text supports two lightweight, plain-text conventions so
// bulleted lists and bold lead-in terms (e.g. "**Course access:** ...") from
// the original hand-written JSX survive being edited as plain text:
//   - a line starting with "- " renders as a bullet, not a paragraph
//   - a leading "**term**" in any line/paragraph renders bold
// A "\n\n"-separated chunk whose every line starts with "- " renders as one
// <ul>; any other chunk renders as one <p>.
const renderRich = (text) => {
  const m = text.match(/^\*\*(.+?)\*\*(.*)$/s);
  if (!m) return text;
  return (
    <>
      <span className="text-paper">{m[1]}</span>
      {m[2]}
    </>
  );
};

const Section = ({ id, headingKey, bodyKey }) => {
  const heading = useContentText(headingKey);
  const body = useContentText(bodyKey);
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">{heading}</h2>
      {paragraphs(body).map((chunk, i) => {
        const lines = chunk.split("\n").filter(Boolean);
        const isList = lines.length > 0 && lines.every((l) => l.startsWith("- "));
        if (isList) {
          return (
            <ul key={i} className={`space-y-3 list-disc pl-5${i > 0 ? " mt-3" : ""}`}>
              {lines.map((l, j) => <li key={j}>{renderRich(l.slice(2))}</li>)}
            </ul>
          );
        }
        return <p key={i} className={i > 0 ? "mt-3" : undefined}>{renderRich(chunk)}</p>;
      })}
    </section>
  );
};

const Legal = () => {
  const lastUpdated = useContentText("legal.last_updated");
  const supportEmail = useContentText("legal.support_email");

  const heroBadge = useContentText("legal.hero.badge");
  const heroHeadingPre = useContentText("legal.hero.heading_pre");
  const heroHeadingEmphasis = useContentText("legal.hero.heading_emphasis");
  const heroBody = useContentText("legal.hero.body");

  const contactHeading = useContentText("legal.section.contact.heading");
  const contactLead = useContentText("legal.contact.lead");
  const contactFollowup = useContentText("legal.contact.followup");

  const copyright = useContentText("legal.copyright");
  const backLinkLabel = useContentText("legal.back_link_label");

  return (
    <div className="bg-canvas">
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 sm:pt-28 pb-10 sm:pb-12 border-b border-stroke">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-0 w-[28rem] h-[28rem] rounded-full bg-accent/8 blur-3xl animate-drift-glow" />
        <div className="relative container mx-auto px-5 sm:px-8 max-w-4xl">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse-soft" />
            <span className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase">
              {heroBadge}
            </span>
          </div>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            {heroHeadingPre} <span className="italic">{heroHeadingEmphasis}</span>
          </h1>
          <p className="mt-5 text-paper-dim text-base sm:text-lg max-w-2xl leading-relaxed">
            {heroBody}
          </p>
          <p className="mt-4 text-paper-dim/70 text-xs uppercase tracking-[0.15em]">
            Last updated · {lastUpdated}
          </p>
        </div>
      </section>

      <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-14 sm:py-20 grid lg:grid-cols-12 gap-10">

        {/* TOC */}
        <aside className="lg:col-span-3 lg:sticky lg:top-24 self-start">
          <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-4">On this page</p>
          <ul className="space-y-2">
            {LEGAL_SECTIONS_META.map((s) => (
              <TocLink key={s.id} id={s.id} labelKey={s.labelKey} />
            ))}
          </ul>
        </aside>

        {/* Body */}
        <article className="lg:col-span-9 space-y-12 text-paper-dim text-base leading-relaxed">

          <Section id="overview" headingKey="legal.section.overview.heading" bodyKey="legal.section.overview.body" />
          <Section id="collect" headingKey="legal.section.collect.heading" bodyKey="legal.section.collect.body" />
          <Section id="use" headingKey="legal.section.use.heading" bodyKey="legal.section.use.body" />
          <Section id="cookies" headingKey="legal.section.cookies.heading" bodyKey="legal.section.cookies.body" />
          <Section id="third-party" headingKey="legal.section.third-party.heading" bodyKey="legal.section.third-party.body" />
          <Section id="rights" headingKey="legal.section.rights.heading" bodyKey="legal.section.rights.body" />
          <Section id="terms" headingKey="legal.section.terms.heading" bodyKey="legal.section.terms.body" />
          <Section id="refund" headingKey="legal.section.refund.heading" bodyKey="legal.section.refund.body" />

          <section id="contact" className="scroll-mt-20">
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl tracking-tight mb-4">{contactHeading}</h2>
            <p>
              {contactLead}{" "}
              <a href={`mailto:${supportEmail}`} className="text-accent hover:text-paper transition-colors">
                {supportEmail}
              </a>
            </p>
            <p className="mt-3 text-paper-dim text-sm">
              {contactFollowup}
            </p>
          </section>

          <div className="pt-8 border-t border-stroke flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <p className="text-paper-dim text-xs">{copyright}</p>
            <Link to="/" className="text-paper hover:text-accent text-sm transition-colors">
              {backLinkLabel}
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
};

export default Legal;
