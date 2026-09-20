import { useState } from "react";
import { Link } from "react-router-dom";
import { FiArrowRight, FiBookOpen, FiCheckCircle, FiChevronDown, FiFileText, FiSave } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import { useContentText } from "../lib/content";
import { INCLUDES_COUNT } from "../lib/contentRegistry/courseOutline";
import { AdminEditableSection } from "../lib/adminEditBridge";
import { modules } from "../stores/courseStore";
import { formatPrice, PLANS, PLAN_IDS } from "../lib/plans";
import { isPaid } from "../stores/paymentStore";

// Public Course page (Phase 1 scope §2): the outline a homeowner sees before
// buying. Modules, chapter counts and timing come straight from the course
// store; descriptions are editable per module id.

const INCLUDE_ICONS = [FiBookOpen, FiCheckCircle, FiSave, FiFileText];
const lessons = (m) => m.chapters.filter((c) => c.kind !== "quiz");
const minutes = (m) => m.chapters.reduce((a, c) => a + (c.minutes || 0), 0);
const totalLessons = modules.reduce((a, m) => a + lessons(m).length, 0);
const totalHours = Math.round(modules.reduce((a, m) => a + minutes(m), 0) / 60);

const ModuleRow = ({ m, i, open, onToggle }) => {
  const desc = useContentText(`courseoutline.module.${m.id}.desc`);
  const list = lessons(m);
  return (
    <AdminEditableSection keys={[`courseoutline.module.${m.id}.desc`]} label={`Module ${i + 1}`}>
      <li className="border-t border-stroke last:border-b">
        <button type="button" onClick={onToggle} aria-expanded={open} className="w-full grid grid-cols-[3rem_1fr_auto] sm:grid-cols-[4rem_1fr_9rem_2rem] gap-4 items-start text-left py-6">
          <span className="font-display text-accent text-2xl leading-none">{String(i + 1).padStart(2, "0")}</span>
          <span>
            <span className="block font-display text-paper text-xl sm:text-2xl leading-tight mb-1.5">{m.title}</span>
            <span className="block text-paper-dim text-sm sm:text-base leading-relaxed">{desc}</span>
          </span>
          <span className="hidden sm:block text-paper-dim text-sm text-right pt-1">
            {list.length} lessons
            <br />
            {minutes(m)} min
          </span>
          <FiChevronDown className={`text-paper-dim mt-1.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {open && (
          <ol className="pb-6 pl-12 sm:pl-16 grid sm:grid-cols-2 gap-x-8 gap-y-2">
            {list.map((c) => (
              <li key={c.id} className="text-sm text-paper flex items-baseline gap-2">
                <span className="text-paper-dim tabular-nums w-5 shrink-0">{c.n}.</span>
                <span>
                  {c.title}
                  <span className="text-paper-dim"> · {c.minutes} min</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </li>
    </AdminEditableSection>
  );
};

const CourseOutline = () => {
  const [open, setOpen] = useState(0);
  const heading = useContentText("courseoutline.header.title");
  const body = useContentText("courseoutline.header.body");
  const includesHeading = useContentText("courseoutline.includes.heading");
  const includes = [
    useContentText("courseoutline.include.0.label"),
    useContentText("courseoutline.include.1.label"),
    useContentText("courseoutline.include.2.label"),
    useContentText("courseoutline.include.3.label"),
  ];
  const modulesHeading = useContentText("courseoutline.modules.heading");
  const ctaHeading = useContentText("courseoutline.cta.heading");
  const ctaBody = useContentText("courseoutline.cta.body");
  const ctaButton = useContentText("courseoutline.cta.button");
  const golden = PLANS.find((p) => p.id === PLAN_IDS.GOLDEN);
  const paid = isPaid();

  return (
    <div className="w-full bg-canvas">
      <AdminEditableSection keys={["courseoutline.header.title", "courseoutline.header.body"]} label="Course header">
        <PageHeader title={heading} subtitle={body}>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-stroke border border-stroke rounded-2xl overflow-hidden max-w-3xl">
            {[
              [modules.length, "Modules"],
              [totalLessons, "Short lessons"],
              [`~${totalHours} hrs`, "Total time"],
              [formatPrice(golden.priceCents), "With Golden"],
            ].map(([v, l]) => (
              <div key={l} className="bg-canvas px-5 py-4">
                <dt className="font-display text-paper text-2xl sm:text-3xl leading-none">{v}</dt>
                <dd className="text-paper-dim text-sm mt-1.5">{l}</dd>
              </div>
            ))}
          </dl>
        </PageHeader>
      </AdminEditableSection>

      <AdminEditableSection keys={["courseoutline.modules.heading"]} label="Module list heading">
        <section className="container mx-auto px-5 sm:px-8 py-16 sm:py-20 max-w-5xl">
          <h2 className="font-display text-paper text-3xl sm:text-4xl leading-[1.05] mb-8">{modulesHeading}</h2>
          <ol>
            {modules.map((m, i) => (
              <ModuleRow key={m.id} m={m} i={i} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
            ))}
          </ol>
        </section>
      </AdminEditableSection>

      <AdminEditableSection keys={["courseoutline.includes.heading", ...Array.from({ length: INCLUDES_COUNT }, (_, i) => `courseoutline.include.${i}.label`)]} label="Each module includes">
        <section className="bg-surface-1-solid border-y border-stroke">
          <div className="container mx-auto px-5 sm:px-8 py-16 max-w-5xl">
            <h2 className="font-display text-paper text-3xl sm:text-4xl leading-[1.05] mb-8">{includesHeading}</h2>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {includes.map((label, i) => {
                const Icon = INCLUDE_ICONS[i];
                return (
                  <li key={i} className="bg-canvas border border-stroke rounded-2xl p-6 flex items-start gap-3">
                    <Icon className="text-accent text-xl mt-0.5 shrink-0" aria-hidden />
                    <p className="text-paper text-sm sm:text-base leading-snug">{label}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </AdminEditableSection>

      <AdminEditableSection keys={["courseoutline.cta.heading", "courseoutline.cta.body", "courseoutline.cta.button"]} label="Closing call to action">
        <section className="container mx-auto px-5 sm:px-8 py-16 sm:py-20 max-w-5xl">
          <div className="bg-forest-deep text-white rounded-3xl p-8 sm:p-12 grid lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-8">
              <h2 className="font-display text-3xl sm:text-4xl leading-[1.05] mb-3">{ctaHeading}</h2>
              <p className="text-white/80 text-base sm:text-lg leading-relaxed">{ctaBody}</p>
            </div>
            <div className="lg:col-span-4 lg:justify-self-end flex flex-wrap gap-3">
              <Link to={paid ? "/course" : "/unlock?tier=roadmap"} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white text-forest-deep font-semibold text-sm hover:bg-mist transition-colors">
                {paid ? "Open the course" : ctaButton} <FiArrowRight />
              </Link>
            </div>
          </div>
        </section>
      </AdminEditableSection>
    </div>
  );
};

export default CourseOutline;
