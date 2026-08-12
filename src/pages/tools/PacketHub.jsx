import { Link } from "react-router-dom";
import { FiArrowRight, FiCheckCircle, FiClipboard, FiDollarSign, FiFileText, FiGrid, FiLayers, FiLock, FiMap, FiPackage, FiPhoneCall } from "react-icons/fi";
import { courseProgress, FEASIBILITY_UNLOCK_AT, isFeasibilityUnlocked, loadPacket } from "../../stores/courseStore";
import { loadWorksheets } from "../../stores/worksheetStore";

// Report Packet hub — every $399 Feasibility Report deliverable in one place:
// the GIS/buildable-envelope diagram, the SIX planning worksheets (from the
// ADUAtlas workbook), the ADU Ready Score, and the utility-locate contact.
// Every worksheet is printable via Print / save-PDF.

const PacketHub = () => {
  const ws = loadWorksheets();
  const packet = loadPacket();
  const feasOpen = isFeasibilityUnlocked();
  const progress = courseProgress();

  const started = (key) => {
    const v = ws[key]?.values || ws[key] || {};
    return Object.values(v).some((x) => x !== "" && x != null && x !== false);
  };
  const grade = ws.readyScore?.grade || null;

  const worksheetCards = [
    {
      to: "/packet/pre-site-estimate",
      Icon: FiDollarSign,
      title: "1 · Pre-site estimate",
      desc: "Utilities (distance, depth, fees, cost per foot) plus retaining walls, obstacles, foundation, and survey — with live totals.",
      key: "preSiteEstimate",
    },
    {
      to: "/packet/pre-site-verification",
      Icon: FiClipboard,
      title: "2 · Pre-site verification",
      desc: "Eight steps — utility locate, connection charges, plumber estimates, city fees and timelines — that turn the study into verified numbers.",
      key: "preSiteVerification",
    },
    {
      to: "/packet/builder-prep",
      Icon: FiFileText,
      title: "3 · Builder preparation",
      desc: "The same project information and the same questions for every builder or GC — pre-filled from your project brief.",
      key: "builderPrep",
    },
    {
      to: "/packet/traditional-build",
      Icon: FiGrid,
      title: "4 · Traditional build comparison",
      desc: "Three companies side by side across every cost category, from plans and permits to utilities and landscaping.",
      key: "traditionalBuild",
    },
    {
      to: "/packet/modular-prefab",
      Icon: FiPackage,
      title: "5 · Modular / prefab estimate",
      desc: "Manufacturer vs. GC scope: documents to request, city approval verification, quote comparison, and who's responsible for what.",
      key: "modularPrefab",
    },
    {
      to: "/packet/total-cost",
      Icon: FiLayers,
      title: "6 · Total ADU project cost",
      desc: "The final rollup — verified costs plus your selected quote, estimated vs. final, timelines and notes.",
      key: "totalProjectCost",
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
        Six planning worksheets take you from pre-site estimate to a complete, comparable project
        cost. They save as you type — use Print / save PDF on any of them to build the packet you
        hand to builders, suppliers, and city staff.
      </p>
      <p className="text-paper-dim text-sm mb-10">
        <Link to="/my-property" className="text-accent hover:text-paper transition-colors">
          Keep your project brief current →
        </Link>
      </p>

      {/* Diagram + Ready Score */}
      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <Card
          to="/feasibility"
          Icon={FiMap}
          title="Property diagram & feasibility"
          desc="Your lot in 3D/2D/satellite: setbacks, buildable envelope, and the largest potential ADU footprint — plus the readiness checklist."
          status={feasOpen ? "Open" : `Unlocks at ${FEASIBILITY_UNLOCK_AT}% course progress (you're at ${progress}%)`}
          locked={!feasOpen}
        />
        <Card
          to="/packet/ready-score"
          Icon={FiCheckCircle}
          title="ADU Ready Score (NAPE)"
          desc="The official National ADU Property Evaluation: five weighted categories, 100 points, graded A–F — with automatic no-go detection."
          status={grade ? `Grade ${grade}` : "Not scored yet"}
          done={Boolean(grade)}
        />
      </div>

      {/* The six worksheets */}
      <h2 className="font-display text-paper text-2xl sm:text-3xl mt-8 mb-4">The six planning worksheets</h2>
      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {worksheetCards.map((c) => (
          <Card
            key={c.to}
            to={c.to}
            Icon={c.Icon}
            title={c.title}
            desc={c.desc}
            status={started(c.key) ? "In progress" : "Not started"}
            done={started(c.key)}
          />
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
              utility-locating service. Step 1 of the Pre-site Verification worksheet is exactly
              this: have the connection points marked, record the distances, and your estimates
              become real.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const Card = ({ to, Icon, title, desc, status, done, locked }) => (
  <Link
    to={to}
    className="group bg-surface-1-solid border border-stroke rounded-3xl p-6 sm:p-8 hover:border-accent transition-colors flex flex-col"
  >
    <div className="flex items-center justify-between mb-4">
      <Icon className="text-accent text-2xl" />
      <span className={`inline-flex items-center gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
        locked ? "text-paper-dim border-stroke" : done ? "text-accent border-accent/40 bg-accent/10" : "text-paper-dim border-stroke"
      }`}>
        {locked && <FiLock className="text-[0.6rem]" />}
        {status}
      </span>
    </div>
    <h3 className="font-display text-paper text-xl sm:text-2xl mb-2 leading-tight">{title}</h3>
    <p className="text-paper-dim text-sm leading-relaxed grow mb-4">{desc}</p>
    <span className="inline-flex items-center gap-2 text-accent text-sm font-semibold group-hover:gap-3 transition-all">
      Open <FiArrowRight />
    </span>
  </Link>
);

export default PacketHub;
