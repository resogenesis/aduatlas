import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiCheck, FiCheckCircle, FiClock } from "react-icons/fi";
import {
  chapters,
  getCompletedChapters,
  markChapterComplete,
  unmarkChapter,
} from "../../funnel/courseStore";

// Placeholder content map. Replace with real Markdown / MDX content per chapter
// in Slice 4. (`Lorem ipsum` markers indicate filler.)
const CONTENT = {
  c1: [
    { h: "What you'll learn", p: "The full ADU process from first idea to certificate of occupancy — in the order things actually happen, not the order they're posted on city websites." },
    { h: "Why most homeowners get this wrong", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua." },
    { h: "The five phases", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua." },
  ],
  c2: [
    { h: "30+ types, four real categories", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua." },
    { h: "Cost ranges by type", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
  ],
  c3: [
    { h: "Why builder quotes look low", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua." },
    { h: "The hidden cost stack", p: "Sewer ties, stormwater, trenching, foundation, grading, permits, school fees, impact fees. Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
  ],
  c4: [
    { h: "Who decides what", p: "States set structural code. Cities control zoning. HOAs override both. Lorem ipsum dolor sit amet." },
    { h: "How to read your code", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
  ],
  c5: [
    { h: "What builders ask first", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
    { h: "What to bring", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
  ],
  c6: [
    { h: "Generate your site plan", p: "Inputs from your quiz + property details produce a personalized GIS site plan." },
    { h: "What's in the RFP packet", p: "Lorem ipsum dolor sit amet, consectetur adipiscing elit." },
  ],
};

const CourseChapter = () => {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(getCompletedChapters().has(chapterId));

  const idx = chapters.findIndex((c) => c.id === chapterId);
  const chapter = chapters[idx];
  if (!chapter) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="text-paper-dim mb-4">Chapter not found.</p>
        <Link to="/course" className="text-accent">Back to course</Link>
      </div>
    );
  }

  const next = chapters[idx + 1];
  const prev = chapters[idx - 1];
  const sections = CONTENT[chapterId] || [];

  const handleComplete = () => {
    markChapterComplete(chapterId);
    setCompleted(true);
    if (next) navigate(`/course/${next.id}`);
    else navigate("/dashboard");
  };

  const handleUnmark = () => {
    unmarkChapter(chapterId);
    setCompleted(false);
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
      <Link to="/course" className="inline-flex items-center gap-2 text-paper-dim hover:text-paper text-sm mb-8 transition-colors">
        <FiArrowLeft /> All chapters
      </Link>

      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Chapter {chapter.n} of {chapters.length}
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
        {chapter.title}
      </h1>
      <div className="flex items-center gap-2 text-paper-dim text-sm mb-12">
        <FiClock /> ~{chapter.minutes} min read
        {completed && (
          <>
            <span className="mx-1.5">·</span>
            <span className="inline-flex items-center gap-1.5 text-accent">
              <FiCheckCircle /> Completed
            </span>
          </>
        )}
      </div>

      <article className="space-y-10 mb-14">
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="font-display text-paper text-2xl sm:text-3xl mb-3">{s.h}</h2>
            <p className="text-paper-dim text-base leading-relaxed">{s.p}</p>
          </section>
        ))}
      </article>

      {/* Footer actions */}
      <div className="border-t border-stroke pt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex gap-3">
          {prev && (
            <Link
              to={`/course/${prev.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              <FiArrowLeft /> Chapter {prev.n}
            </Link>
          )}
        </div>

        <div className="flex gap-3">
          {completed ? (
            <button
              onClick={handleUnmark}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm font-medium"
            >
              Mark as not done
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              <FiCheck /> Mark complete
              {next ? " & continue" : ""}
            </button>
          )}
          {completed && next && (
            <Link
              to={`/course/${next.id}`}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-fg font-semibold text-sm hover:bg-paper transition-colors"
            >
              Chapter {next.n} <FiArrowRight />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default CourseChapter;
