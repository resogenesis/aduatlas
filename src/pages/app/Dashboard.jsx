import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiMapPin } from "react-icons/fi";
import { currentUser } from "../../stores/authStore";
import { courseProgress, loadPacket } from "../../stores/courseStore";
import { getPaidTier, hasReportTier, hasTier, TIERS } from "../../stores/paymentStore";
import { formatPrice, planById } from "../../lib/plans";
import { STUDY_STATUS, fetchMyStudy } from "../../lib/studies";

// Overview: the saved property at the center, then the plan, the study, the
// course, and a next-steps list that reflects where this homeowner is.
const Dashboard = () => {
  const user = currentUser();
  const packet = loadPacket();
  const progress = courseProgress();
  const plan = planById(getPaidTier());
  const platinum = hasReportTier();
  const concierge = hasTier(TIERS.CONCIERGE);
  // undefined = loading (Platinum+ only); null = no study / not entitled.
  const [study, setStudy] = useState(() => (platinum ? undefined : null));

  useEffect(() => {
    if (!platinum) return undefined;
    let cancelled = false;
    fetchMyStudy().then((r) => {
      if (!cancelled) setStudy(r.ok ? r.study : null);
    });
    return () => {
      cancelled = true;
    };
  }, [platinum]);

  const studyReady = study?.status === "ready";
  const steps = [
    { key: "property", label: "Add your property details", done: Boolean(packet.address), to: "/my-property", cta: "Add details" },
    { key: "learn", label: "Start the course", done: progress > 0, to: "/course", cta: "Open the course" },
    platinum
      ? { key: "study", label: "Submit your property for the feasibility study", done: Boolean(study), to: "/study", cta: study ? "See status" : "Start" }
      : { key: "upgrade", label: "Add the feasibility study and site plan", done: false, to: "/unlock?tier=report", cta: `Upgrade for ${formatPrice(20000)}` },
    { key: "siteplan", label: "Review your site plan", done: studyReady, to: "/site-plan", cta: "Open" },
    { key: "builders", label: "Find builders who serve your area", done: false, to: "/builders", cta: "Browse" },
  ];
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-primary font-extrabold tracking-tight text-paper text-4xl sm:text-5xl leading-[1.05]">Hello, {user?.username || "there"}.</h1>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-accent text-accent-fg rounded-3xl p-7 sm:p-9">
          <p className="inline-flex items-center gap-2 text-accent-fg/75 text-sm mb-3">
            <FiMapPin /> Your property
          </p>
          <h2 className="font-primary font-extrabold tracking-tight text-3xl sm:text-4xl leading-tight mb-3">{packet.address || "No address yet"}</h2>
          <p className="text-accent-fg/85 text-sm sm:text-base mb-6 max-w-xl">
            {packet.address
              ? [packet.aduType, packet.desiredSqft ? `${packet.desiredSqft} sq ft target` : null, packet.budget].filter(Boolean).join(" · ") || "Add your project goals to round out the brief."
              : "Everything in your portal revolves around your property. Add the address and your goals to begin."}
          </p>
          <Link to="/my-property" className="group inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors">
            {packet.address ? "Edit property" : "Add property"} <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 flex flex-col">
          <p className="text-paper-dim text-sm mb-1">Your plan</p>
          <p className="font-primary font-extrabold tracking-tight text-paper text-3xl mb-1">{plan ? plan.name : "None yet"}</p>
          <p className="text-paper-dim text-sm mb-5">{plan ? `${formatPrice(plan.priceCents)} · ${plan.tagline}` : "Choose a plan to unlock the portal."}</p>
          {plan && plan.id !== TIERS.CONCIERGE && (
            <Link to={`/unlock?tier=${plan.id === TIERS.ROADMAP ? TIERS.REPORT : TIERS.CONCIERGE}`} className="mt-auto inline-flex items-center gap-1 text-accent text-sm font-medium">
              Upgrade to {plan.id === TIERS.ROADMAP ? "Platinum" : "Concierge"} <FiArrowRight />
            </Link>
          )}
          {concierge && (
            <Link to="/support" className="mt-auto inline-flex items-center gap-1 text-accent text-sm font-medium">
              Concierge support <FiArrowRight />
            </Link>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-canvas border border-stroke rounded-3xl p-7 sm:p-9">
          <h2 className="font-primary font-extrabold tracking-tight text-paper text-2xl mb-6">Next steps</h2>
          <ol>
            {steps.map((s, i) => (
              <li key={s.key} className="flex items-center gap-4 py-4 border-t border-stroke first:border-t-0">
                <span className={`shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center text-sm ${s.done ?"bg-accent text-accent-fg": i === nextIndex ?"border-2 border-accent text-accent font-semibold":"border border-stroke text-paper-dim"}`}>
                  {s.done ? <FiCheck /> : i + 1}
                </span>
                <span className={`flex-1 text-sm sm:text-base ${s.done ?"text-paper-dim line-through":"text-paper"}`}>{s.label}</span>
                {!s.done && (
                  <Link to={s.to} className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition ${i === nextIndex ?"bg-accent text-accent-fg hover:bg-accent-dim":"border border-stroke text-paper-dim hover:text-paper"}`}>
                    {s.cta} <FiArrowRight />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-6">
          <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7">
            <p className="text-paper-dim text-sm mb-1">Feasibility study</p>
            <p className="font-primary font-extrabold tracking-tight text-paper text-2xl mb-1">
              {!platinum ? "Platinum" : study === undefined ? "…" : study ? STUDY_STATUS[study.status].label : "Not started"}
            </p>
            <p className="text-paper-dim text-sm mb-4">
              {!platinum ? "Included with Platinum and Concierge." : study ? STUDY_STATUS[study.status].note : "Submit your property details to begin."}
            </p>
            <Link to={platinum ? "/study" : "/unlock?tier=report"} className="inline-flex items-center gap-1 text-accent text-sm font-medium">
              {platinum ? "Open" : "See Platinum"} <FiArrowRight />
            </Link>
          </div>
          <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7">
            <p className="text-paper-dim text-sm mb-1">Course</p>
            <p className="font-primary font-extrabold tracking-tight text-paper text-2xl mb-3">{progress}% complete</p>
            <div className="h-2 rounded-full bg-canvas border border-stroke overflow-hidden mb-4">
              <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <Link to="/course" className="inline-flex items-center gap-1 text-accent text-sm font-medium">
              {progress > 0 ? "Continue" : "Start"} <FiArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
