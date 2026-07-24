import { Link } from "react-router-dom";
import { FiArrowRight, FiCheck, FiClock, FiLock, FiHelpCircle } from "react-icons/fi";
import {
  modules,
  courseProgress,
  getCompletedChapters,
  getModuleProgress,
} from "../../stores/courseStore";

const CourseIndex = () => {
  const done = getCompletedChapters();
  const progress = courseProgress();
  const authored = modules.filter((m) => m.chapters.length > 0);

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-10">
        <div>
          <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
            The Course
          </p>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Ten modules. <span className="italic text-paper-dim">One path.</span>
          </h1>
        </div>
        <div className="text-right">
          <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-1">Progress</p>
          <p className="font-display text-paper text-4xl">{progress}%</p>
        </div>
      </div>

      <div className="space-y-5">
        {modules.map((m) => {
          const prog = getModuleProgress(m.id);
          const empty = m.chapters.length === 0;
          return (
            <div
              key={m.id}
              className={`bg-surface-1-solid border rounded-2xl overflow-hidden ${
                prog.complete ? "border-accent/40" : "border-stroke"
              }`}
            >
              {/* Module header */}
              <div className="flex items-start gap-4 p-5 sm:p-6 border-b border-stroke/70">
                <span
                  className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center font-display text-lg ${
                    prog.complete
                      ? "bg-accent text-accent-fg"
                      : empty
                      ? "bg-canvas border border-stroke text-paper-dim"
                      : "bg-canvas border border-stroke text-paper"
                  }`}
                >
                  {prog.complete ? <FiCheck /> : empty ? <FiLock className="text-sm" /> : m.n}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-paper-dim text-[11px] font-medium tracking-[0.16em] uppercase">
                      Module {m.n}
                    </p>
                    {m.tag && (
                      <span className="text-[10px] font-medium tracking-wider uppercase text-accent border border-accent/40 rounded-full px-2 py-0.5">
                        {m.tag}
                      </span>
                    )}
                  </div>
                  <h2 className="font-display text-paper text-xl sm:text-2xl leading-snug mt-0.5">
                    {m.title}
                  </h2>
                  <p className="text-paper-dim text-sm leading-relaxed mt-1">{m.blurb}</p>
                </div>
                {!empty && (
                  <span className="shrink-0 text-paper-dim text-xs tabular-nums self-center">
                    {prog.done}/{prog.total}
                  </span>
                )}
              </div>

              {/* Chapter list */}
              {empty ? (
                <p className="px-5 sm:px-6 py-5 text-paper-dim/70 text-sm italic">
                  Content coming soon.
                </p>
              ) : (
                <ul className="divide-y divide-stroke/60">
                  {m.chapters.map((c) => {
                    const isDone = done.has(c.id);
                    const isQuiz = c.kind === "quiz";
                    return (
                      <li key={c.id}>
                        <Link
                          to={`/course/${c.id}`}
                          className="group flex items-center gap-3 px-5 sm:px-6 py-3.5 hover:bg-canvas/60 transition-colors"
                        >
                          <span
                            className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                              isDone
                                ? "bg-accent text-accent-fg"
                                : "bg-canvas border border-stroke text-paper-dim"
                            }`}
                          >
                            {isDone ? <FiCheck /> : isQuiz ? <FiHelpCircle className="text-xs" /> : c.n}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-paper text-sm font-medium truncate">
                              {isQuiz ? c.title : `${c.title}`}
                            </span>
                          </span>
                          <span className="shrink-0 text-paper-dim/70 text-xs flex items-center gap-1.5">
                            <FiClock className="text-[11px]" /> {c.minutes}m
                          </span>
                          <FiArrowRight className="shrink-0 text-paper-dim group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-paper-dim text-xs leading-relaxed mt-8">
        {authored.length} of {modules.length} modules available now. The rest arrive as each
        module's lessons are finalized — your progress is saved as you go.
      </p>
    </div>
  );
};

export default CourseIndex;
