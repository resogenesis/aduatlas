import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FiArrowLeft, FiCheck, FiCheckCircle, FiDownload, FiMail, FiX } from "react-icons/fi";
import { getLead, setLeadStatus } from "../../stores/builderStore";

// Mark a lead as "viewed" the first time it's opened, then show the
// full Builder Packet snapshot + actions to claim / pass.

const LeadDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [lead, setLead] = useState(() => getLead(id));

  useEffect(() => {
    if (lead && lead.status === "new") {
      setLeadStatus(lead.id, "viewed");
      setLead({ ...lead, status: "viewed" });
    }
  }, [lead]);

  if (!lead) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="text-paper-dim mb-4">Lead not found.</p>
        <Link to="/builder/leads" className="text-accent">Back to leads</Link>
      </div>
    );
  }

  const handleClaim = () => {
    // INTEGRATION POINT (Supabase + Resend): create a "claim" record,
    // notify the homeowner via Resend that a builder is responding, surface
    // the contact thread inside their dashboard.
    setLeadStatus(lead.id, "claimed");
    setLead({ ...lead, status: "claimed" });
  };

  const handlePass = () => {
    setLeadStatus(lead.id, "lost");
    navigate("/builder/leads", { replace: true });
  };

  const handleDownload = () => {
    // INTEGRATION POINT: server-generated PDF (full RFP packet).
    alert("PDF download — pending integration. The full packet PDF will download here.");
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-5xl mx-auto">
      <Link to="/builder/leads" className="inline-flex items-center gap-2 text-paper-dim hover:text-paper text-sm mb-8 transition-colors">
        <FiArrowLeft /> Back to leads
      </Link>

      {/* Header */}
      <div className="grid lg:grid-cols-12 gap-6 mb-10">
        <div className="lg:col-span-8">
          <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">
            Lead {lead.id} · {STATUS_LABEL[lead.status]}
          </p>
          <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-3">
            {lead.homeowner}
          </h1>
          <p className="text-paper-dim text-base sm:text-lg">
            {lead.aduType} · {lead.desiredSqft} sq ft · {lead.city}, {lead.state} {lead.zip}
          </p>
        </div>

        <div className="lg:col-span-4 bg-accent text-accent-fg rounded-2xl p-5 sm:p-6">
          <p className="text-accent-fg/70 text-xs uppercase tracking-[0.2em] mb-1">Readiness</p>
          <div className="flex items-baseline gap-3">
            <span className="font-display text-5xl">{lead.score}</span>
            <span className="text-accent-fg/70 text-sm">/ 100 · {lead.band}</span>
          </div>
          <div className="mt-4 pt-4 border-t border-accent-fg/20 text-xs space-y-1">
            <Row label="Course" value={`${lead.courseProgress}% complete`} />
            <Row label="Packet" value={`${lead.packetPercent}% filled`} />
          </div>
        </div>
      </div>

      {/* Project brief */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10 mb-6">
        <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-5">Project brief</p>
        <div className="grid sm:grid-cols-2 gap-x-10 gap-y-5">
          <BriefRow label="Purpose" value={lead.purpose} />
          <BriefRow label="Timeline" value={lead.timeline} />
          <BriefRow label="Budget" value={lead.budget} />
          <BriefRow label="Lot size" value={lead.lotSize} />
          <BriefRow label="ADU type" value={lead.aduType} />
          <BriefRow label="Desired sq ft" value={`${lead.desiredSqft}`} />
        </div>
        {lead.notes && (
          <div className="mt-7 pt-7 border-t border-stroke">
            <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-2">Homeowner notes</p>
            <p className="text-paper text-sm sm:text-base leading-relaxed">{lead.notes}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="bg-surface-1-solid border border-stroke rounded-3xl p-7 sm:p-10">
        <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-3">Take action</p>
        <h2 className="font-display font-medium text-paper text-2xl sm:text-3xl leading-snug mb-3">
          {lead.status === "claimed" ? "You've claimed this lead." : "Ready to respond?"}
        </h2>
        <p className="text-paper-dim text-sm sm:text-base leading-relaxed max-w-2xl mb-7">
          {lead.status === "claimed"
            ? "We've notified the homeowner that you're working on a quote. Reach out through the contact info on their packet within 48 hours to keep the lead warm."
            : "Claim this lead to lock in exclusive contact for 48 hours. Pass if it's not a fit. We won't hold it against you."}
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          {lead.status !== "claimed" && (
            <button
              onClick={handleClaim}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              <FiCheckCircle /> Claim lead
            </button>
          )}
          {lead.status === "claimed" && (
            <button
              onClick={() => alert("INTEGRATION POINT (Resend): open compose modal to contact the homeowner.")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
            >
              <FiMail /> Contact homeowner
            </button>
          )}
          <button
            onClick={handleDownload}
            className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-stroke text-paper hover:border-paper-dim transition font-medium"
          >
            <FiDownload /> Download packet (PDF)
          </button>
          {lead.status !== "claimed" && (
            <button
              onClick={handlePass}
              className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm"
            >
              <FiX /> Pass on this lead
            </button>
          )}
          {lead.status === "claimed" && (
            <span className="inline-flex items-center gap-2 text-accent text-sm font-medium px-2">
              <FiCheck /> Claimed
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

const Row = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-accent-fg/70">{label}</span>
    <span>{value}</span>
  </div>
);

const BriefRow = ({ label, value }) => (
  <div>
    <p className="text-paper-dim text-xs uppercase tracking-[0.15em] mb-1">{label}</p>
    <p className="text-paper text-sm sm:text-base">{value}</p>
  </div>
);

const STATUS_LABEL = {
  new: "New",
  viewed: "Viewed",
  claimed: "Claimed",
  won: "Won",
  lost: "Passed",
};

export default LeadDetail;
