import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiClock, FiRefreshCw } from "react-icons/fi";
import {
  chapters,
  chapterById,
  moduleById,
  getCompletedChapters,
  markChapterComplete,
  unmarkChapter,
  useCourseItem,
} from "../../stores/courseStore";
import ModuleQuiz from "../../components/course/ModuleQuiz";
import Sections from "../../components/course/Sections";
import { AdminEditableSection } from "../../lib/adminEditBridge";

// Renders one chapter (or a module quiz) from the shared course structure.
// The title, minutes and order come from the outline in courseStore. The body
// or quiz is fetched from /api/course with the session token when the page
// opens, because the course text is not in the bundle (DEF-07). The server
// applies any published admin edit before it answers.

// What the page says while the lesson text is not in hand. Plain sentences,
// and a refusal is never shown as a network fault.
const LessonStatus = ({ item }) => {
  if (item.state === "loading") {
    return (
      <p className="text-paper-dim text-base mb-14" role="status">
        The lesson is loading.
      </p>
    );
  }
  if (item.status === 401) {
    return (
      <div className="mb-14 bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
        <p className="text-paper text-base mb-2">Your session has ended. Sign in again to open this lesson.</p>
        <Link to="/login" className="text-accent text-sm">Sign in</Link>
      </div>
    );
  }
  if (item.status === 403) {
    return (
      <div className="mb-14 bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
        <p className="text-paper text-base mb-2">This lesson is part of the paid course. This account does not include it.</p>
        <Link to="/pricing" className="text-accent text-sm">See plans</Link>
      </div>
    );
  }
  if (item.status === 404) {
    return <p className="text-paper-dim text-base mb-14">We could not find this lesson.</p>;
  }
  return (
    <div className="mb-14 bg-surface-1-solid border border-stroke rounded-2xl px-5 py-4">
      <p className="text-paper text-base mb-3">This lesson did not load. Check your connection and try again.</p>
      <button
        type="button"
        onClick={item.retry}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-stroke text-paper-dim hover:text-paper hover:border-accent transition text-sm font-medium"
      >
        <FiRefreshCw /> Try again
      </button>
    </div>
  );
};

const CourseChapter = () => {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(getCompletedChapters().has(chapterId));

  const idx = chapters.findIndex((c) => c.id === chapterId);
  const chapter = chapterById(chapterId);
  // Called before the "chapter not found" early return below, per rules of
  // hooks. An unknown chapter id fetches nothing.
  const item = useCourseItem(chapter ? chapterId : null);
  if (!chapter) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="text-paper-dim mb-4">Chapter not found.</p>
        <Link to="/course" className="tap-target text-accent">Back to course</Link>
      </div>
    );
  }

  const mod = moduleById(chapter.moduleId);
  const next = chapters[idx + 1];
  const prev = chapters[idx - 1];
  const isQuiz = chapter.kind === "quiz";
  const ready = item.state === "ready";
  const quiz = isQuiz && ready && Array.isArray(item.data?.quiz?.questions) ? item.data.quiz : null;
  const sections = !isQuiz && ready && Array.isArray(item.data?.sections) ? item.data.sections : null;

  // Position within the module's content chapters (quiz excluded from the count).
  // A quiz has no position among them, so it is labelled as the module quiz
  // rather than printed as lesson "0" (R3-26).
  const contentChapters = mod.chapters.filter((c) => c.kind !== "quiz");
  const contentPos = contentChapters.findIndex((c) => c.id === chapterId) + 1;
  const positionLabel = isQuiz
    ? "Module quiz"
    : contentPos > 0
      ? `Lesson ${contentPos} of ${contentChapters.length}`
      : null;

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
      <Link to="/course" className="tap-target inline-flex items-center gap-2 text-paper-dim hover:text-paper text-sm mb-8 transition-colors">
        <FiArrowLeft /> Back to course
      </Link>

      <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
        {chapter.title}
      </h1>
      <div className="flex items-center gap-2 text-paper-dim text-sm mb-12">
        <FiClock /> ~{chapter.minutes} min
        {positionLabel && (
          <>
            <span aria-hidden>·</span>
            <span data-testid="chapter-position">{positionLabel}</span>
          </>
        )}
        {completed && (
          <>
            <span className="mx-1.5">·</span>
            <span className="inline-flex items-center gap-1.5 text-accent">
              <FiCheckCircle /> Completed
            </span>
          </>
        )}
      </div>

      {quiz ? (
        <ModuleQuiz key={chapterId} quiz={quiz} quizId={chapterId} completed={completed} onComplete={() => complete(false)} />
      ) : sections ? (
        <AdminEditableSection keys={[`course.chapter.${chapterId}`]} label={chapter.title}>
          <Sections sections={sections} />
        </AdminEditableSection>
      ) : (
        // A ready answer without the expected shape is treated as not found
        // rather than offered a retry that would return the same answer.
        <LessonStatus item={ready ? { state: "error", status: 404 } : item} />
      )}

      {/* Footer actions */}
      <div className="border-t border-stroke pt-8 mt-14 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex gap-3">
          {prev && (
            <Link
              to={`/course/${prev.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stroke text-paper-dim hover:text-paper hover:border-accent transition text-sm font-medium"
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
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-colors ${ completed ?"bg-accent text-accent-fg hover:bg-accent-dim":"border border-stroke text-paper-dim/50 cursor-not-allowed"}`}
              >
                Next <FiArrowRight />
              </Link>
            )
          ) : completed ? (
            <>
              <button
                onClick={handleUnmark}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-stroke text-paper-dim hover:text-paper hover:border-accent transition text-sm font-medium"
              >
                Mark as not done
              </button>
              {next && (
                <Link
                  to={`/course/${next.id}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-fg font-semibold text-sm hover:bg-accent-dim transition-colors"
                >
                  Next <FiArrowRight />
                </Link>
              )}
            </>
          ) : (
            <button
              onClick={() => complete(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors"
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
