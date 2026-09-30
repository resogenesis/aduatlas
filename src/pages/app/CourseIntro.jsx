import { Link } from "react-router-dom";
import { FiArrowLeft, FiArrowRight, FiClock } from "react-icons/fi";
import Sections from "../../components/course/Sections";
import { useCourseItem } from "../../stores/courseStore";
import { AdminEditableSection } from "../../lib/adminEditBridge";

// Course-level introduction — the welcome that frames the whole course.
// Not a module chapter: it carries no completion state and sits outside the
// progress math. Authored from ADUAtlas's own course-introduction script.
// The text is paid course content, so it is fetched from /api/course with the
// session token rather than shipped in the bundle (DEF-07). The server applies
// a published "course.intro" edit before it answers.
const introStatus = (item) => {
  if (item.state === "loading") return "The introduction is loading.";
  if (item.status === 401) return "Your session has ended. Sign in again to read the introduction.";
  if (item.status === 403) return "The introduction is part of the paid course. This account does not include it.";
  return "The introduction did not load. Refresh the page to try again.";
};

const CourseIntro = () => {
  const item = useCourseItem("intro");
  const sections = item.state === "ready" && Array.isArray(item.data?.sections) ? item.data.sections : null;
  return (
  <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
    <Link to="/course" className="tap-target inline-flex items-center gap-2 text-paper-dim hover:text-paper text-sm mb-8 transition-colors">
      <FiArrowLeft /> Back to course
    </Link>

    <h1 className="font-display text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
      Welcome to ADUAtlas.
    </h1>
    <div className="flex items-center gap-2 text-paper-dim text-sm mb-12">
      <FiClock /> ~6 min
    </div>

    {sections ? (
      <AdminEditableSection keys={["course.intro"]} label="Course Intro">
        <Sections sections={sections} />
      </AdminEditableSection>
    ) : (
      <p className="text-paper-dim text-base mb-14" role="status">{introStatus(item)}</p>
    )}

    <div className="border-t border-stroke pt-8 mt-14 flex justify-end">
      <Link
        to="/course/m1c1"
        className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-fg font-semibold hover:bg-accent-dim transition-colors"
      >
        Begin Module 1 <FiArrowRight />
      </Link>
    </div>
  </div>
  );
};

export default CourseIntro;
