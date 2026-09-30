import { Link } from "react-router-dom";
import { FiAlertCircle, FiArrowLeft, FiCheck, FiPrinter } from "react-icons/fi";
import { useWorksheetSaveState } from "./worksheetKit";

// Shared top bar for the Feasibility Report worksheets: back to the packet
// hub, a saved indicator, and Print (the browser's print-to-PDF is the
// download path — see the print styles in index.css).
//
// T4-20 (RC4 rehearsal): the indicator says what happened to the save. "Saved"
// only once the server has accepted it; while the copy is only in this browser
// (not sent yet, refused, or failed) it says so. See useWorksheetSaveState.
const WorksheetBar = ({ savedAt }) => {
  const saveState = useWorksheetSaveState(savedAt);
  return (
    <div className="flex items-center justify-between gap-3 mb-8 print:hidden">
      <Link
        to="/packet"
        className="inline-flex items-center gap-2 text-paper-dim text-sm hover:text-paper transition-colors"
      >
        <FiArrowLeft /> Report packet
      </Link>
      <div className="flex items-center gap-4">
        {saveState === "saved" && (
          <span className="inline-flex items-center gap-1.5 text-accent text-sm" role="status" data-save-state="saved">
            <FiCheck /> Saved
          </span>
        )}
        {saveState === "saving" && (
          <span className="text-paper-dim text-sm" role="status" data-save-state="saving">
            Saving…
          </span>
        )}
        {saveState === "device" && (
          <span
            className="inline-flex items-center gap-1.5 text-amber-700 text-sm text-right leading-tight"
            role="status"
            data-save-state="device"
            title="Not saved to your account yet. This browser keeps your changes."
          >
            <FiAlertCircle className="shrink-0" aria-hidden />
            <span>
              Saved on this device only<span className="hidden sm:inline">, not to your account yet</span>
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stroke text-paper hover:border-accent hover:text-accent transition text-sm font-medium"
        >
          <FiPrinter /> Print / save PDF
        </button>
      </div>
    </div>
  );
};

export default WorksheetBar;
