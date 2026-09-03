// Editable content for Legal.jsx (Privacy + Terms). Section order/ids/anchors
// stay code-owned (LEGAL_SECTIONS_META below) — each section's prose is
// admin-editable as ONE text field. Paragraphs are separated by a blank line
// ("\n\n", rendered via the `paragraphs()` helper in src/lib/content.js);
// within a "\n\n"-separated chunk, lines starting with "- " render as a
// bulleted list instead of a paragraph, and a leading "**term**" on any
// line/paragraph renders bold — see Section/renderRich in Legal.jsx. This
// keeps the original page's bullets and bold lead-in terms intact while
// still being a single plain-text field to edit.
const PAGE = "Legal";

// id = anchor id (matches href="#id" and section scroll-mt target) — fixed,
// never editable. label = the TOC link text — editable.
export const LEGAL_SECTIONS_META = [
  { id: "overview", labelKey: "legal.toc.overview" },
  { id: "collect", labelKey: "legal.toc.collect" },
  { id: "use", labelKey: "legal.toc.use" },
  { id: "cookies", labelKey: "legal.toc.cookies" },
  { id: "third-party", labelKey: "legal.toc.third-party" },
  { id: "rights", labelKey: "legal.toc.rights" },
  { id: "terms", labelKey: "legal.toc.terms" },
  { id: "refund", labelKey: "legal.toc.refund" },
  { id: "contact", labelKey: "legal.toc.contact" },
];

export const LEGAL_CONTENT = {
  "legal.last_updated": { page: PAGE, label: "Last updated date", type: "text", default: "May 28, 2026" },
  "legal.support_email": { page: PAGE, label: "Support email (also used for the mailto link)", type: "text", default: "hello@aduatlas.com" },

  // ── Hero ──
  "legal.hero.badge": { page: PAGE, label: "Hero badge", type: "text", default: "Legal" },
  "legal.hero.heading_pre": { page: PAGE, label: "Hero heading (before emphasis)", type: "text", default: "Privacy and" },
  "legal.hero.heading_emphasis": { page: PAGE, label: "Hero heading (emphasized)", type: "text", default: "Terms." },
  "legal.hero.body": { page: PAGE, label: "Hero paragraph", type: "text", default: "What we collect, what we do with it, the rules of using ADUAtlas, and how refunds work." },

  // ── Table of contents labels ──
  "legal.toc.overview": { page: PAGE, label: "TOC label: Overview", type: "text", default: "Overview" },
  "legal.toc.collect": { page: PAGE, label: "TOC label: What we collect", type: "text", default: "What we collect" },
  "legal.toc.use": { page: PAGE, label: "TOC label: How we use it", type: "text", default: "How we use it" },
  "legal.toc.cookies": { page: PAGE, label: "TOC label: Cookies and analytics", type: "text", default: "Cookies and analytics" },
  "legal.toc.third-party": { page: PAGE, label: "TOC label: Third-party services", type: "text", default: "Third-party services" },
  "legal.toc.rights": { page: PAGE, label: "TOC label: Your choices", type: "text", default: "Your choices" },
  "legal.toc.terms": { page: PAGE, label: "TOC label: Terms of service", type: "text", default: "Terms of service" },
  "legal.toc.refund": { page: PAGE, label: "TOC label: Refund policy", type: "text", default: "Refund policy" },
  "legal.toc.contact": { page: PAGE, label: "TOC label: Contact", type: "text", default: "Contact" },

  // ── Section headings ──
  "legal.section.overview.heading": { page: PAGE, label: "Section heading: Overview", type: "text", default: "Overview" },
  "legal.section.collect.heading": { page: PAGE, label: "Section heading: What we collect", type: "text", default: "What we collect" },
  "legal.section.use.heading": { page: PAGE, label: "Section heading: How we use it", type: "text", default: "How we use it" },
  "legal.section.cookies.heading": { page: PAGE, label: "Section heading: Cookies and analytics", type: "text", default: "Cookies and analytics" },
  "legal.section.third-party.heading": { page: PAGE, label: "Section heading: Third-party services", type: "text", default: "Third-party services" },
  "legal.section.rights.heading": { page: PAGE, label: "Section heading: Your choices", type: "text", default: "Your choices" },
  "legal.section.terms.heading": { page: PAGE, label: "Section heading: Terms of service", type: "text", default: "Terms of service" },
  "legal.section.refund.heading": { page: PAGE, label: "Section heading: Refund policy", type: "text", default: "Refund policy" },
  "legal.section.contact.heading": { page: PAGE, label: "Section heading: Contact", type: "text", default: "Contact" },

  // ── Section bodies (paragraphs joined with "\n\n") ──
  "legal.section.overview.body": {
    page: PAGE, label: "Section body: Overview", type: "text",
    default: "ADUAtlas is a planning and decision-support service for homeowners considering an Accessory Dwelling Unit. We collect the minimum information needed to deliver a property snapshot, the ADU Course, and (when purchased) a Property Feasibility Report.\n\nWe are not a law firm, an engineering firm, an appraiser, or a permitting authority. Our reports are intended to make conversations with your city, builder, lender, and licensed professionals sharper, not to replace them.",
  },
  "legal.section.collect.body": {
    page: PAGE, label: "Section body: What we collect (lines starting with \"- \" render as bullets; a leading **term** renders bold)", type: "text",
    default: "- **Property address** you submit when you check your property.\n- **Quiz answers** you provide during the Reality Check (lot size band, budget, timeline, knowledge gaps).\n- **Email address** if you choose to receive your results, create an account, or purchase.\n- **Payment information** processed by Stripe. We do not see or store full card numbers.\n- **Usage and device data** through privacy-respecting analytics: pages viewed, anonymized session data, basic device and browser type.\n- **Account data** if you create an account: email, password (hashed), course progress, saved property details.",
  },
  "legal.section.use.body": {
    page: PAGE, label: "Section body: How we use it (lines starting with \"- \" render as bullets)", type: "text",
    default: "- Generate your property snapshot, Reality Check Score, and Property Feasibility Report.\n- Deliver the ADU Course and track your progress through chapters.\n- Send transactional emails (receipts, password resets, course updates, study delivery).\n- Send product updates and tips if you opt in. You can unsubscribe at any time.\n- Improve the product through aggregated, anonymized usage analysis.\n\nWe do not sell your personal information. We do not share your individual property address with builders without your explicit consent.",
  },
  "legal.section.cookies.body": {
    page: PAGE, label: "Section body: Cookies and analytics", type: "text",
    default: "We use a small number of cookies to keep you logged in, remember preferences, and measure how the site is used. We use a privacy-respecting analytics provider; analytics events are aggregated and not used to build advertising profiles.",
  },
  "legal.section.third-party.body": {
    page: PAGE, label: "Section body: Third-party services (lines starting with \"- \" render as bullets; a leading **term** renders bold)", type: "text",
    default: "To run ADUAtlas, we rely on a small set of vendors:\n\n- **Stripe** processes payments. Stripe collects card and billing information directly under its own privacy policy.\n- **Supabase** hosts our database and authentication.\n- **Resend** delivers transactional and course emails.\n- **Mapbox** powers address autocomplete on the property check.\n- **Public records and GIS data providers** for parcel, zoning, and permit data used in your snapshot and Property Feasibility Report.",
  },
  "legal.section.rights.body": {
    page: PAGE, label: "Section body: Your choices (lines starting with \"- \" render as bullets; a leading **term** renders bold)", type: "text",
    default: "- **Access and export.** Email us and we'll send you a copy of the personal data we hold about you.\n- **Correction.** Update your account information at any time from your settings.\n- **Deletion.** Email us to delete your account. Some records (purchases, tax records) may be retained where required by law.\n- **Opt out.** Unsubscribe from product emails through the link in any email. Transactional messages will continue while your account is active.",
  },
  "legal.section.terms.body": {
    page: PAGE, label: "Section body: Terms of service (a leading **term** on a paragraph renders bold)", type: "text",
    default: "By using ADUAtlas you agree to these terms. The service is provided as a planning and decision-support tool, and is offered as-is, without warranty of fitness for a particular project, permit, or financing outcome.\n\n**Course access:** The ADU Course is yours to keep. You can revisit any chapter at any time. Course content is updated as ADU regulations, types, and costs change; an optional $99 annual renewal gives you the refreshed content for the following 12 months. Without renewal, your access continues to the content as it was at the time of your most recent renewal.\n\n**Property Feasibility Report:** A one-time deliverable priced at $399. If you bought the $99 course first, your $99 is credited toward the $399 Report when you upgrade within 90 days of your course purchase. The Report summarizes lot, zoning, setback, buildable area, and pre-site considerations as of the date of delivery. It is not a substitute for a survey, civil drawings, soils report, structural engineering, or city permit.\n\n**Acceptable use:** Do not scrape the site, share your account, or use the service to harass, defraud, or harm others. We may suspend accounts that violate these terms.\n\n**Disclaimers.** Property data is sourced from public records and modeled estimates. Coverage and freshness vary by jurisdiction. Always confirm critical details with your city, a licensed architect or engineer, your lender, and a qualified contractor before committing to a design or breaking ground.",
  },
  "legal.section.refund.body": {
    page: PAGE, label: "Section body: Refund policy (a leading **term** on a paragraph renders bold)", type: "text",
    default: "**ADU Course ($99):** 7-day refund, no questions asked. If the course is not for you, email us within 7 days of purchase from the address associated with your account and we will refund in full and revoke access.\n\n**Course renewal ($99/year):** 7-day refund on a renewal charge if you have not opened any chapter or downloaded any updated material since the renewal.\n\n**Property Feasibility Report ($399):** Refundable up to the point we begin compiling your Report (typically within 24 hours of purchase). Once compilation has started, the Report is non-refundable because the work is bespoke to your parcel.\n\nRefunds are issued to the original payment method and typically appear within 5 to 10 business days, depending on your bank.",
  },

  // ── Contact section (kept apart from the generic body pattern since the
  // mailto link is built from legal.support_email, not baked into prose) ──
  "legal.contact.lead": { page: PAGE, label: "Contact lead-in", type: "text", default: "Questions, requests, or refund issues:" },
  "legal.contact.followup": { page: PAGE, label: "Contact followup line", type: "text", default: "We respond within 2 business days. For account-specific requests, email from the address associated with your account." },

  // ── Footer ──
  "legal.copyright": { page: PAGE, label: "Copyright line", type: "text", default: "© 2026 ADUAtlas. All rights reserved." },
  "legal.back_link_label": { page: PAGE, label: "Back-to-home link text", type: "text", default: "Back to home →" },
};
