import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiClock } from "react-icons/fi";
import { chapters, courseProgress, getCompletedChapters } from "../../funnel/courseStore";

const CourseIndex = () => {
  const done = getCompletedChapters();
  const progress = courseProgress();

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
            The Course
          </p>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Six chapters. <span className="italic text-paper-dim">One path.</span>
          </h1>
        </div>
        <div className="text-right">
          <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-1">Progress</p>
          <p className="font-display text-paper text-4xl">{progress}%</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        {chapters.map((c) => {
          const completed = done.has(c.id);
          return (
            <Link
              key={c.id}
              to={`/course/${c.id}`}
              className="group bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-7 hover:border-accent transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-5">
                <span className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-display ${
                  completed ? "bg-accent text-accent-fg" : "bg-canvas border border-stroke text-paper"
                }`}>
                  {completed ? <FiCheck /> : c.n}
                </span>
                <span className="text-paper-dim text-xs flex items-center gap-1.5">
                  <FiClock /> {c.minutes} min
                </span>
              </div>
              <h3 className="font-display text-paper text-lg sm:text-xl leading-snug mb-2">
                Chapter {c.n} — {c.title}
              </h3>
              <p className="text-paper-dim text-sm leading-relaxed mb-5">{c.blurb}</p>
              <span className="inline-flex items-center gap-1.5 text-accent text-sm font-medium group-hover:gap-2.5 transition-all">
                {completed ? "Review" : "Start"} <FiArrowRight />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default CourseIndex;
