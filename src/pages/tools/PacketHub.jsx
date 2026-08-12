import { Link } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiClock, FiDollarSign, FiFileText, FiLayers, FiLock, FiMap, FiPhoneCall } from "react-icons/fi";
import { courseProgress, FEASIBILITY_UNLOCK_AT, isFeasibilityUnlocked, loadPacket } from "../../stores/courseStore";
import { loadWorksheets } from "../../stores/worksheetStore";

// Report Packet hub — one place for every $399 Feasibility Report
// deliverable: the GIS/buildable-envelope diagram, the four worksheets
// (budget, timelines, questionnaire, Ready Score — Module 9's packet), and
// the utility-locate contact. Each worksheet is printable via Print/save-PDF.

const PacketHub = () => {
  const ws = loadWorksheets();
  const packet = loadPacket();
  const feasOpen = isFeasibilityUnlocked();
  const progress = courseProgress();

  const started = (w) => Boolean(w && Object.keys(w).length);
  const budgetStarted = started(ws.budget) && ws.budget.rows?.some((r) => r.low || r.high);
  const timelineStarted = started(ws.timeline) && ws.timeline.phases?.some((p) => p.low || p.high);
  const questionnaireStarted = started(ws.questionnaire) && Object.values(ws.questionnaire.answers || {}).some(Boolean);
  const grade = ws.readyScore?.grade || null;

  const cards = [
    {
      to: "/feasibility",
      Icon: FiMap,
      title: "Property diagram & feasibility",
      desc: "Your lot in 3D/2D/satellite: setbacks, buildable envelope, and the largest potential ADU footprint — plus the readiness checklist.",
      status: feasOpen ? "Open" : `Unlocks at ${FEASIBILITY_UNLOCK_AT}% course progress (you're at ${progress}%)`,
      locked: !feasOpen,
    },
    {
      to: "/packet/budget",
      Icon: FiDollarSign,
      title: "Pre-site budget worksheet",
      desc: "The dynamic spreadsheet: structure, foundation, utilities, site prep, permits — low/high ranges with live totals and site considerations.",
      status: budgetStarted ? "In progress" : "Not started",
      done: budgetStarted,
    },
    {
      to: "/packet/timeline",
      Icon: FiClock,
      title: "Project timelines worksheet",
      desc: "Builder, permit, inspection, and city phases with your estimated ranges — ask your city, then capture what they tell you.",
      status: timelineStarted ? "In progress" : "Not started",
      done: timelineStarted,
    },
    {
      to: "/packet/questionnaire",
      Icon: FiFileText,
      title: "Builder questionnaire",
      desc: "Pre-filled from your project brief: your answers to what builders ask, and the same question list for every builder you meet.",
      status: questionnaireStarted ? "In progress" : "Pre-filled from your brief",
      done: questionnaireStarted,
    },
    {
      to: "/packet/ready-score",
      Icon: FiCheckCircle,
      title: "ADU Ready Score",
      desc: "Twenty questions, graded A–F — preparedness, property flags, and budget flags, aligned with the course's NAPE evaluation.",
      status: grade ? `Grade ${grade}` : "Not scored yet",
      done: Boolean(grade),
    },
    {
      to: "/utility-estimator",
      Icon: FiLayers,
      title: "Utility & site-prep estimator",
      desc: "Ballpark the utility and site-prep slice a structural quote leaves out, tuned to your property.",
      status: feasOpen ? "Open" : `Unlocks at ${FEASIBILITY_UNLOCK_AT}% course progress`,
      locked: !feasOpen,
    },
  ];

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-6xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
        Property Feasibility Report
      </p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-4">
        Your report packet.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-4">
        {packet.address
          ? <>Everything for <span className="text-paper">{packet.address}</span> in one place.</>
          : "Every deliverable in one place."}{" "}
        The worksheets pull from your project brief and save as you type — use Print / save PDF on
        any of them to build the packet you hand to builders, suppliers, and city staff.
      </p>
      <p className="text-paper-dim text-sm mb-10">
        <Link to="/my-property" className="text-accent hover:text-paper transition-colors">
          Keep your project brief current →
        </Link>
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {cards.map((c) => (
          <Link
            key={c.to + c.title}
            to={c.to}
            className="group bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8 hover:border-accent transition-colors flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <c.Icon className="text-accent text-2xl" />
              <span className={`inline-flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                c.locked
                  ? "text-paper-dim border-stroke"
                  : c.done
                    ? "text-accent border-accent/40 bg-accent/10"
                    : "text-paper-dim border-stroke"
              }`}>
                {c.locked && <FiLock className="text-[0.6rem]" />}
                {c.status}
              </span>
            </div>
            <h3 className="font-display text-paper text-xl sm:text-2xl mb-2 leading-tight">{c.title}</h3>
            <p className="text-paper-dim text-sm leading-relaxed grow mb-4">{c.desc}</p>
            <span className="inline-flex items-center gap-2 text-accent text-sm font-semibold group-hover:gap-3 transition-all">
              Open <FiArrowRight />
            </span>
          </Link>
        ))}
      </div>

      {/* Utility locate */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-3">
          <FiPhoneCall className="text-accent text-2xl" />
          <h3 className="font-display text-paper text-xl sm:text-2xl">Utility locating</h3>
        </div>
        <div className="grid sm:grid-cols-2 gap-6 text-sm leading-relaxed">
          <div>
            <p className="text-paper font-semibold mb-1">Call 811 before any digging — it's free.</p>
            <p className="text-paper-dim">
              811 is the national "call before you dig" number: one call (or a visit to{" "}
              <a href="https://811beforeyoudig.com" target="_blank" rel="noreferrer" className="text-accent hover:text-paper transition-colors">
                811beforeyoudig.com
              </a>
              ) reaches your local one-call center, and utility companies come mark their lines at
              no cost. Call at least two working days before digging — it's required before
              excavation.
            </p>
          </div>
          <div>
            <p className="text-paper font-semibold mb-1">Private lines need a private locator.</p>
            <p className="text-paper-dim">
              811 marks public utilities up to the meter. Lines on your side of the meter — a sewer
              run to the street, power to a shed, irrigation — are found by a professional private
              utility-locating service. Worth scheduling before you finalize ADU placement; note
              what they find in your utility notes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PacketHub;
