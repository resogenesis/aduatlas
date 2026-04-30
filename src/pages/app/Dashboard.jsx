import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiClock, FiDownload, FiLock, FiPlay } from "react-icons/fi";
import { currentUser } from "../../funnel/authStore";
import {
  chapters,
  courseProgress,
  getCompletedChapters,
  isBuildersUnlocked,
  isFeasibilityUnlocked,
  nextChapter,
  packetProgress,
} from "../../funnel/courseStore";
import { calculateScore } from "../../funnel/scoring";
import { isComplete, loadAnswers } from "../../funnel/quizStore";

const Dashboard = () => {
  const user = currentUser();
  const answers = loadAnswers();
  const hasQuiz = isComplete(answers);
  const score = hasQuiz ? calculateScore(answers).score : null;

  const progress = courseProgress();
  const done = getCompletedChapters();
  const next = nextChapter();
  const packet = packetProgress();
  const feasUnlocked = isFeasibilityUnlocked();
  const buildersUnlocked = isBuildersUnlocked();

  const notifications = buildNotifications({ hasQuiz, progress, packet, feasUnlocked });

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">

      {/* Welcome strip */}
      <div className="mb-10">
        <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
          Welcome back
        </p>
        <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Hey, <span className="italic text-paper-dim">{user?.username || "there"}.</span>
        </h1>
        <p className="text-paper-dim text-base sm:text-lg mt-3 max-w-2xl">
          Your ADU plan is in progress. Complete the next step to move closer to being builder-ready.
        </p>
      </div>

      {/* Notifications strip */}
      {notifications.length > 0 && (
        <div className="mb-8 space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="flex items-center gap-3 bg-surface-1-solid border border-stroke rounded-xl px-5 py-3">
              <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
              <p className="text-paper text-sm flex-1">{n.text}</p>
              {n.cta && (
                <Link to={n.cta.to} className="text-accent text-xs font-medium hover:text-paper transition-colors">
                  {n.cta.label} →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Top row: Score + Next Up */}
      <div className="grid lg:grid-cols-12 gap-6 mb-6">
        {/* Score */}
        <div className="lg:col-span-5 bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-8 flex items-center gap-7">
          <div className="relative w-28 h-28 shrink-0">
            <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
              <circle cx="60" cy="60" r="52" fill="none" stroke="#2A2D26" strokeWidth="6" />
              {score != null && (
                <circle cx="60" cy="60" r="52" fill="none" stroke="#C6F24E" strokeWidth="6" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 52}
                  strokeDashoffset={(2 * Math.PI * 52) - (score / 100) * (2 * Math.PI * 52)}
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-paper text-3xl leading-none">{score ?? "—"}</span>
              <span className="text-paper-dim text-[0.65rem] uppercase tracking-[0.2em] mt-1">/ 100</span>
            </div>
          </div>
          <div>
            <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-1">Readiness Score</p>
            <h3 className="font-display text-paper text-xl mb-2">{hasQuiz ? "Your snapshot" : "Take the quiz"}</h3>
            {hasQuiz ? (
              <p className="text-paper-dim text-sm leading-relaxed">
                Refines as you complete the course and fill your property details.
              </p>
            ) : (
              <Link to="/quiz" className="text-accent text-sm font-medium hover:text-paper transition-colors">
                Start the 2-min check →
              </Link>
            )}
          </div>
        </div>

        {/* Next Up */}
        <div className="lg:col-span-7 bg-accent text-accent-fg rounded-3xl p-7 sm:p-8">
          <p className="text-accent-fg/70 text-xs font-medium tracking-[0.2em] uppercase mb-2 flex items-center gap-2">
            <FiPlay /> Next up
          </p>
          {next ? (
            <>
              <h3 className="font-display font-medium text-2xl sm:text-3xl leading-snug mb-2">
                Chapter {next.n} — {next.title}
              </h3>
              <p className="text-accent-fg/80 text-sm sm:text-base mb-5 max-w-xl">
                {next.blurb}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  to={`/course/${next.id}`}
                  className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
                >
                  Continue reading <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
                </Link>
                <span className="inline-flex items-center gap-1.5 text-accent-fg/70 text-sm">
                  <FiClock /> ~{next.minutes} min
                </span>
              </div>
            </>
          ) : (
            <>
              <h3 className="font-display font-medium text-2xl sm:text-3xl leading-snug mb-2">
                You've completed every chapter.
              </h3>
              <p className="text-accent-fg/80 text-sm sm:text-base mb-5 max-w-xl">
                Run your Feasibility Study and send your Builder Packet next.
              </p>
              <Link
                to="/feasibility"
                className="group inline-flex items-center gap-2 px-6 py-3 rounded-full bg-canvas text-paper font-semibold hover:bg-surface-1-solid transition-colors"
              >
                Generate Feasibility <FiArrowRight className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Roadmap (the spine) */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10 mb-6">
        <div className="flex items-end justify-between gap-4 mb-7 flex-wrap">
          <div>
            <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Roadmap</p>
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl">
              Your path to builder-ready
            </h2>
          </div>
          <div className="text-right">
            <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-1">Course progress</p>
            <p className="font-display text-paper text-3xl">{progress}%</p>
          </div>
        </div>

        <div className="space-y-px">
          {chapters.map((c, i) => {
            const completed = done.has(c.id);
            const isNext = next && next.id === c.id;
            return (
              <Link
                key={c.id}
                to={`/course/${c.id}`}
                className={`flex items-center gap-5 py-5 border-t border-stroke first:border-t-0 transition-colors hover:bg-canvas/60 -mx-7 sm:-mx-10 px-7 sm:px-10 ${
                  isNext ? "bg-canvas/40" : ""
                }`}
              >
                <span className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium ${
                  completed ? "bg-accent text-accent-fg" :
                  isNext ? "bg-accent/15 text-accent border border-accent/40" :
                  "bg-canvas border border-stroke text-paper-dim"
                }`}>
                  {completed ? <FiCheck /> : <span className="font-display">{c.n}</span>}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className={`font-display text-base sm:text-lg leading-snug ${completed ? "text-paper-dim" : "text-paper"}`}>
                    Chapter {c.n} — {c.title}
                  </h3>
                  <p className="text-paper-dim text-xs sm:text-sm mt-0.5 truncate">{c.blurb}</p>
                </div>
                <span className="text-paper-dim text-xs hidden sm:flex items-center gap-1.5 shrink-0">
                  <FiClock /> {c.minutes} min
                </span>
              </Link>
            );
          })}

          {/* Final two milestones */}
          <RoadmapMilestone
            title="Run Feasibility Study"
            blurb="GIS site plan, refined readiness score."
            to="/feasibility"
            unlocked={feasUnlocked}
            lockText={`Unlocks at 80% course progress (you're at ${progress}%)`}
          />
          <RoadmapMilestone
            title="Send Builder Packet"
            blurb="Match with builders who only see prepared homeowners."
            to="/builders"
            unlocked={buildersUnlocked}
            lockText="Unlocks after Feasibility + 75% packet completion"
          />
        </div>
      </div>

      {/* Builder Packet progress card */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10">
        <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
          <div>
            <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Your Builder Packet</p>
            <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl">
              {packet.percent}% complete
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/my-property"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              Edit details
            </Link>
            <button
              type="button"
              onClick={() => alert("INTEGRATION POINT: PDF generation pending. Your packet draft will download here.")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
            >
              <FiDownload /> Download draft
            </button>
          </div>
        </div>

        <div className="w-full h-2 bg-canvas border border-stroke rounded-full overflow-hidden mb-7">
          <div className="h-full bg-accent transition-all duration-500" style={{ width: `${packet.percent}%` }} />
        </div>

        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2.5">
          {packet.fields.map((f) => (
            <li key={f.key} className="flex items-center gap-3 text-sm">
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                f.done ? "bg-accent text-accent-fg" : "border border-stroke"
              }`}>
                {f.done ? <FiCheck className="text-xs" /> : <span className="w-1 h-1 rounded-full bg-stroke" />}
              </span>
              <span className={f.done ? "text-paper" : "text-paper-dim"}>{f.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const RoadmapMilestone = ({ title, blurb, to, unlocked, lockText }) => {
  const Tag = unlocked ? Link : "div";
  return (
    <Tag
      to={unlocked ? to : undefined}
      className={`flex items-center gap-5 py-5 border-t border-stroke transition-colors -mx-7 sm:-mx-10 px-7 sm:px-10 ${
        unlocked ? "hover:bg-canvas/60" : "opacity-70"
      }`}
    >
      <span className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-canvas border border-stroke text-paper-dim">
        <FiLock className="text-sm" />
      </span>
      <div className="flex-1 min-w-0">
        <h3 className={`font-display text-base sm:text-lg leading-snug ${unlocked ? "text-paper" : "text-paper-dim"}`}>
          {title}
        </h3>
        <p className="text-paper-dim text-xs sm:text-sm mt-0.5">
          {unlocked ? blurb : lockText}
        </p>
      </div>
      {unlocked && <FiArrowRight className="text-paper-dim shrink-0" />}
    </Tag>
  );
};

const buildNotifications = ({ hasQuiz, progress, packet, feasUnlocked }) => {
  const list = [];
  if (!hasQuiz) {
    list.push({
      id: "quiz",
      text: "You haven't taken the Reality Check yet — that's where everything starts.",
      cta: { label: "Take it now", to: "/quiz" },
    });
  }
  if (progress < 80 && hasQuiz && !feasUnlocked) {
    list.push({
      id: "feas",
      text: `Feasibility unlocks at 80% course progress. You're at ${progress}%.`,
      cta: { label: "Continue course", to: "/course" },
    });
  }
  if (packet.percent < 50 && hasQuiz) {
    list.push({
      id: "packet",
      text: "Your Builder Packet is incomplete — fill in your property details so builders can quote accurately.",
      cta: { label: "Complete property", to: "/my-property" },
    });
  }
  return list;
};

export default Dashboard;
