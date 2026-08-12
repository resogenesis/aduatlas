import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiClock } from "react-icons/fi";
import {
  chapters,
  chapterById,
  moduleById,
  getCompletedChapters,
  markChapterComplete,
  unmarkChapter,
} from "../../stores/courseStore";
import { CHAPTER_CONTENT, MODULE_QUIZZES } from "../../stores/courseContent";
import ModuleQuiz from "../../components/course/ModuleQuiz";
import Sections from "../../components/course/Sections";

// Renders one chapter (or a module quiz) from the shared course structure.
// Content sections come from courseContent, rendered by the shared Sections
// component (also used by the course intro).

const CourseChapter = () => {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(getCompletedChapters().has(chapterId));

  const idx = chapters.findIndex((c) => c.id === chapterId);
  const chapter = chapterById(chapterId);
  if (!chapter) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="text-paper-dim mb-4">Chapter not found.</p>
        <Link to="/course" className="text-accent">Back to course</Link>
      </div>
    );
  }

  const mod = moduleById(chapter.moduleId);
  const next = chapters[idx + 1];
  const prev = chapters[idx - 1];
  const isQuiz = chapter.kind === "quiz";
  const sections = CHAPTER_CONTENT[chapterId] || [];
  const quiz = isQuiz ? MODULE_QUIZZES[chapter.moduleId] : null;

  // Position within the module's content chapters (quiz excluded from the count).
  const contentChapters = mod.chapters.filter((c) => c.kind !== "quiz");
  const contentPos = contentChapters.findIndex((c) => c.id === chapterId) + 1;

  const complete = (goNext = true) => {
    markChapterComplete(chapterId);
    setCompleted(true);
    if (goNext && next) navigate(`/course/${next.id}`);
    else if (goNext) navigate("/dashboard");
  };

  const handleUnmark = () => {
    unmarkChapter(chapterId);
    setCompleted(false);
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
      <Link to="/course" className="inline-flex items-center gap-2 text-paper-dim hover:text-paper text-sm mb-8 transition-colors">
        <FiArrowLeft /> Back to course
      </Link>

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Module {chapter.moduleN} · {chapter.moduleTitle}
        {!isQuiz && (
          <span className="text-paper-dim"> · Chapter {contentPos} of {contentChapters.length}</span>
        )}
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
        {chapter.title}
      </h1>
      <div className="flex items-center gap-2 text-paper-dim text-sm mb-12">
        <FiClock /> ~{chapter.minutes} min
        {completed && (
          <>
            <span className="mx-1.5">·</span>
            <span className="inline-flex items-center gap-1.5 text-accent">
              <FiCheckCircle /> Completed
            </span>
          </>
        )}
      </div>

      {isQuiz && quiz ? (
        <ModuleQuiz quiz={quiz} completed={completed} onComplete={() => complete(false)} />
      ) : (
        <Sections sections={sections} />
      )}

      {/* Footer actions */}
      <div className="border-t border-stroke pt-8 mt-14 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex gap-3">
          {prev && (
            <Link
              to={`/course/${prev.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              <FiArrowLeft /> Previous
            </Link>
          )}
        </div>

        <div className="flex gap-3">
          {isQuiz ? (
            // Quiz completion happens via its own Submit; here we just offer
            // forward navigation once it's done.
            next && (
              <Link
                to={completed ? `/course/${next.id}` : "#"}
                onClick={(e) => !completed && e.preventDefault()}
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-sm transition-colors ${
                  completed
                    ? "bg-accent text-accent-fg hover:bg-paper"
                    : "border border-stroke text-paper-dim/50 cursor-not-allowed"
                }`}
              >
                Next <FiArrowRight />
              </Link>
            )
          ) : completed ? (
            <>
              <button
                onClick={handleUnmark}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm font-medium"
              >
                Mark as not done
              </button>
              {next && (
                <Link
                  to={`/course/${next.id}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
                >
                  Next <FiArrowRight />
                </Link>
              )}
            </>
          ) : (
            <button
              onClick={() => complete(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              <FiCheck /> Mark complete
              {next ? " & continue" : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseChapter;
