import { Link } from "react-router-dom";
import { FiArrowLeft, FiCheck, FiPrinter } from "react-icons/fi";

// Shared top bar for the Feasibility Report worksheets: back to the packet
// hub, a saved indicator, and Print (the browser's print-to-PDF is the
// download path — see the print styles in index.css).
const WorksheetBar = ({ savedAt }) => (
  <div className="flex items-center justify-between gap-3 mb-8 print:hidden">
    <Link
      to="/packet"
      className="inline-flex items-center gap-2 text-paper-dim text-sm hover:text-paper transition-colors"
    >
      <FiArrowLeft /> Report packet
    </Link>
    <div className="flex items-center gap-4">
      {savedAt && (
        <span className="inline-flex items-center gap-1.5 text-accent text-sm">
          <FiCheck /> Saved
        </span>
      )}
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper hover:border-accent hover:text-accent transition text-sm font-medium"
      >
        <FiPrinter /> Print / save PDF
      </button>
    </div>
  </div>
);

export default WorksheetBar;
