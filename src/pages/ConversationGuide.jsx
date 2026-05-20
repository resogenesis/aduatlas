import { Link } from "react-router-dom";
import { FiArrowRight, FiDownload, FiMapPin, FiPrinter, FiShare2 } from "react-icons/fi";

// Builder Conversation Guide — a standalone deliverable bundled with the
// Feasibility Report. Intentionally print-friendly and screenshot-friendly
// so homeowners distribute it for us.
//
// Sample is for: 1247 Mulberry Lane, Pasadena CA 91103.

const sampleAddress = "1247 Mulberry Lane, Pasadena CA 91103";

const sections = [
  {
    n: "01",
    eyebrow: "Scope clarity",
    title: "What exactly is in your bid, and what's not?",
    questions: [
      "Is site prep included? Specifically: grading, foundation, excavation? If not, what's your typical range?",
      "Are utility hookups (sewer tie in, water, electric panel upgrade, gas line) in your number? Or quoted separately?",
      "Are permit, plan check, school, and impact fees included or pass-through?",
      "What's your contingency line for unforeseen site conditions, and what triggers it?",
      "Is interior finish at builder grade, or is your number for a base shell only?",
    ],
  },
  {
    n: "02",
    eyebrow: "Lot-specific risks",
    title: "Have you actually looked at my lot?",
    questions: [
      "My sewer is ~28 ft from the proposed pad. What's your contingency for a shallow tie in or grinder pump need?",
      "There's a mature pepper tree at my rear lot line. How do you handle root encroachment if the foundation lands within 8 ft?",
      "My existing electric panel is 100A. What sub-panel capacity will the ADU need, and does your number include the upgrade?",
      "Are there neighbor-fence or access constraints I should know about that change your delivery cost?",
    ],
  },
  {
    n: "03",
    eyebrow: "Timeline + permitting",
    title: "What does your timeline really mean?",
    questions: [
      "From signed contract to certificate of occupancy: what's your honest range, not your marketing range?",
      "Who handles permit submission and revisions: you, my architect, or me?",
      "Have you built in Pasadena recently? How many ADUs in the last 12 months?",
      "What's the longest delay you've had on a project like mine in the last year, and what caused it?",
    ],
  },
  {
    n: "04",
    eyebrow: "References + licensing",
    title: "Trust but verify.",
    questions: [
      "Can I see your CSLB license number and current bond?",
      "Three recent ADU clients in Pasadena or LA County I can call directly, with names and numbers.",
      "Any liens, complaints, or unresolved disputes filed against your company in the last 3 years?",
      "What's your insurance coverage: general liability, workers' comp limits, builder's risk?",
    ],
  },
  {
    n: "05",
    eyebrow: "Payment + protection",
    title: "How does my money get handled?",
    questions: [
      "What's your payment schedule? (California caps the down payment at the lesser of $1,000 or 10%.)",
      "What happens to my deposit if you go out of business or walk away?",
      "Do you accept lien waivers from your subs, and will you provide them with each draw?",
      "What's your warranty on structure, mechanicals, and workmanship? For how long, and what's excluded?",
    ],
  },
];

const ConversationGuide = () => {
  return (
    <div className="bg-canvas min-h-screen">
      {/* Toolbar — hidden on print */}
      <div className="border-b border-stroke print:hidden">
        <div className="container mx-auto px-5 sm:px-8 max-w-4xl py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 text-paper-dim text-sm">
            <FiMapPin /> {sampleAddress}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => alert("INTEGRATION POINT: server-side PDF generation pending.")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
            >
              <FiDownload /> Download PDF
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-stroke text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              <FiPrinter /> Print
            </button>
            <button
              onClick={() => {
                if (navigator.share) navigator.share({ title: "ADUAtlas Builder Conversation Guide", url: window.location.href });
                else { navigator.clipboard.writeText(window.location.href); alert("Link copied to clipboard."); }
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-stroke text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              <FiShare2 /> Share
            </button>
          </div>
        </div>
      </div>

      {/* Document */}
      <article className="container mx-auto px-5 sm:px-8 max-w-3xl py-12 sm:py-16">
        <p className="text-accent text-xs sm:text-sm font-medium tracking-[0.2em] uppercase mb-4">
          Builder Conversation Guide
        </p>
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-5">
          Five conversations <span className="italic text-paper-dim">every builder should pass.</span>
        </h1>
        <p className="text-paper-dim text-base sm:text-lg leading-relaxed max-w-2xl mb-3">
          Take this to every builder you talk to. Same questions, same scope. Bids become apples to apples instead of guesses.
        </p>
        <p className="text-paper-dim/70 text-sm italic mb-12">
          Pulled from the Feasibility Report for {sampleAddress}. Lot-specific questions update with your address.
        </p>

        <div className="space-y-10">
          {sections.map((s) => (
            <section key={s.n} className="border-t border-stroke pt-10">
              <div className="flex items-baseline gap-5 mb-5">
                <span className="font-display text-accent text-3xl sm:text-4xl">{s.n}</span>
                <div>
                  <p className="text-paper-dim text-xs font-medium tracking-[0.2em] uppercase mb-1">{s.eyebrow}</p>
                  <h2 className="font-display text-paper text-2xl sm:text-3xl leading-snug">{s.title}</h2>
                </div>
              </div>
              <ol className="space-y-3 ml-0 sm:ml-16">
                {s.questions.map((q, i) => (
                  <li key={i} className="flex items-start gap-3 text-paper-dim text-sm sm:text-base leading-relaxed">
                    <span className="font-display text-paper-dim/60 text-sm pt-0.5 shrink-0 w-6">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-paper">{q}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>

        {/* Footer signature */}
        <div className="mt-16 pt-8 border-t border-stroke">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-paper-dim text-xs">
              ADUAtlas Builder Conversation Guide · {sampleAddress}
            </p>
            <p className="text-paper-dim/70 text-[0.65rem] italic">
              Generated as part of your $399 Feasibility Report.
            </p>
          </div>
        </div>

        {/* CTA — hidden on print */}
        <div className="print:hidden mt-12 bg-accent text-accent-fg rounded-3xl p-8 sm:p-10 text-center">
          <h2 className="font-display font-medium text-2xl sm:text-3xl leading-tight mb-3">
            Want this for your address?
          </h2>
          <p className="text-accent-fg/80 text-sm sm:text-base mb-6 max-w-xl mx-auto">
            The Conversation Guide is generated automatically with every $399 Feasibility Report, with questions tuned to your lot's actual risks.
          </p>
          <Link
            to="/unlock"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
          >
            See pricing tiers <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </article>
    </div>
  );
};

export default ConversationGuide;
