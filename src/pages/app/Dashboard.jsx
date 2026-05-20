import { Link } from "react-router-dom";
import { FiArrowRight, FiBookOpen, FiCheck, FiDownload, FiMapPin } from "react-icons/fi";
import { currentUser } from "../../funnel/authStore";
import { courseProgress, loadPacket, packetProgress } from "../../funnel/courseStore";
import { isComplete, loadAnswers } from "../../funnel/quizStore";
import { calculateScore } from "../../funnel/scoring";

// Dashboard reframed as the project control panel.
// Spine = Build Ready 5-item checklist + property card.
// Course collapses into a single 'Knowledge' link in the support layer.

const Dashboard = () => {
  const user = currentUser();
  const answers = loadAnswers();
  const hasQuiz = isComplete(answers);
  const score = hasQuiz ? calculateScore(answers).score : null;

  const packet = packetProgress();
  const progress = courseProgress();
  const p = loadPacket();

  const builderReady = buildReadyChecklist({ packet: p, score, courseProgress: progress });
  const completedCount = builderReady.filter((x) => x.done).length;
  const isReady = completedCount === builderReady.length;

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">

      {/* Welcome strip */}
      <div className="mb-10">
        <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
          Project control panel
        </p>
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Hey, <span className="italic text-paper-dim">{user?.username || "there"}.</span>
        </h1>
        <p className="text-paper-dim text-base sm:text-lg mt-3 max-w-2xl">
          Turn curiosity into a buildable plan. Hit all five Build Ready milestones to unlock builder matches.
        </p>
      </div>

      {/* Property card — top of the hierarchy */}
      <div className="bg-accent text-accent-fg rounded-3xl p-7 sm:p-10 mb-6">
        <div className="flex items-center gap-2 text-accent-fg/70 text-xs font-medium tracking-[0.2em] uppercase mb-3">
          <FiMapPin /> Your property
        </div>
        <h2 className="font-display font-medium text-3xl sm:text-4xl leading-tight mb-3">
          {p.address || "Address not yet added."}
        </h2>
        <p className="text-accent-fg/80 text-sm sm:text-base mb-6 max-w-xl">
          {p.address
            ? `${p.aduType || "ADU type pending"} · ${p.desiredSqft ? `${p.desiredSqft} sq ft target` : "size pending"} · ${p.budget || "budget pending"}`
            : "Add your address and project details to anchor your plan to a real lot."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            to="/my-property"
            className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
          >
            {p.address ? "Edit property details" : "Add property details"}
            <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </div>

      {/* Build Ready 5-item checklist, the spine */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10 mb-6">
        <div className="flex items-end justify-between gap-4 mb-7 flex-wrap">
          <div>
            <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Build Ready</p>
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl">
              {isReady ? "You're build ready." : `${completedCount} of 5 milestones`}
            </h2>
          </div>
          {isReady && (
            <Link
              to="/builders"
              className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
            >
              See builder matches <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
            </Link>
          )}
        </div>

        <div className="space-y-px">
          {builderReady.map((item) => (
            <div
              key={item.key}
              className="flex items-start gap-5 py-5 border-t border-stroke first:border-t-0 -mx-7 sm:-mx-10 px-7 sm:px-10"
            >
              <span className={`shrink-0 mt-0.5 w-9 h-9 rounded-full flex items-center justify-center ${
                item.done ? "bg-accent text-accent-fg" : "bg-canvas border border-stroke"
              }`}>
                {item.done ? <FiCheck /> : <span className="font-display text-paper-dim text-sm">{item.n}</span>}
              </span>
              <div className="flex-1 min-w-0">
                <h3 className={`font-display text-base sm:text-lg leading-snug ${item.done ? "text-paper-dim" : "text-paper"}`}>
                  {item.label}
                </h3>
                <p className="text-paper-dim text-xs sm:text-sm mt-0.5">
                  {item.done ? item.doneCopy : item.todoCopy}
                </p>
              </div>
              {!item.done && item.cta && (
                <Link
                  to={item.cta.to}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim text-xs font-medium transition self-center shrink-0"
                >
                  {item.cta.label} <FiArrowRight className="text-xs" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Builder Packet progress + Knowledge support layer */}
      <div className="grid lg:grid-cols-3 gap-6">

        {/* Packet (2 cols) */}
        <div className="lg:col-span-2 bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9">
          <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
            <div>
              <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Builder Packet</p>
              <p className="font-display text-paper text-2xl">{packet.percent}% complete</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Link
                to="/my-property"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-stroke text-paper hover:border-paper-dim transition text-xs font-medium"
              >
                Edit
              </Link>
              <button
                onClick={() => alert("INTEGRATION POINT: PDF generation pending.")}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent text-accent-fg font-semibold text-xs hover:bg-paper transition-colors"
              >
                <FiDownload /> Download draft
              </button>
            </div>
          </div>
          <div className="w-full h-2 bg-canvas border border-stroke rounded-full overflow-hidden mb-6">
            <div className="h-full bg-accent transition-all duration-500" style={{ width: `${packet.percent}%` }} />
          </div>
          <p className="text-paper-dim text-xs">
            {packet.filled} of {packet.total} fields filled. Builders need every field for accurate quotes.
          </p>
        </div>

        {/* Knowledge support layer (1 col) */}
        <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-9">
          <div className="flex items-center gap-2 text-paper-dim text-xs uppercase tracking-[0.2em] mb-3">
            <FiBookOpen /> Knowledge
          </div>
          <h3 className="font-display text-paper text-xl mb-2">Course library</h3>
          <p className="text-paper-dim text-sm leading-relaxed mb-5">
            Optional reading. {progress}% of chapters completed.
          </p>
          <Link
            to="/course"
            className="inline-flex items-center gap-1.5 text-accent text-sm font-medium hover:text-paper transition-colors"
          >
            Open course <FiArrowRight />
          </Link>
        </div>
      </div>
    </div>
  );
};

// Translate state into the 5-item Build Ready checklist.
const buildReadyChecklist = ({ packet, score, courseProgress }) => {
  return [
    {
      key: "viability",
      n: "1",
      label: "Property viability confirmed",
      done: Boolean(packet.address && packet.lotSize),
      doneCopy: `${packet.lotSize || "Lot size"} · ${packet.zip || "—"}`,
      todoCopy: "Add address + lot size in My Property.",
      cta: { label: "Add property", to: "/my-property" },
    },
    {
      key: "type",
      n: "2",
      label: "ADU type selected",
      done: Boolean(packet.aduType),
      doneCopy: packet.aduType || "",
      todoCopy: "Pick the ADU type that fits your lot and goal.",
      cta: { label: "Pick type", to: "/my-property" },
    },
    {
      key: "budget",
      n: "3",
      label: "Budget range set",
      done: Boolean(packet.budget),
      doneCopy: packet.budget || "",
      todoCopy: "Set a realistic site prep + structure budget.",
      cta: { label: "Set budget", to: "/my-property" },
    },
    {
      key: "financing",
      n: "4",
      label: "Financing path identified",
      done: Boolean(packet.budget) && courseProgress >= 50,
      doneCopy: "Path mapped in course chapter 3.",
      todoCopy: "Cover financing in Chapter 3: Budget & Site Prep.",
      cta: { label: "Open chapter", to: "/course/c3" },
    },
    {
      key: "risks",
      n: "5",
      label: "Site & utility risks understood",
      done: Boolean(packet.siteAccess && packet.utilityNotes),
      doneCopy: "Site + utility notes captured.",
      todoCopy: "Add site access + utility notes so builders see your constraints.",
      cta: { label: "Add notes", to: "/my-property" },
    },
  ];
};

export default Dashboard;
