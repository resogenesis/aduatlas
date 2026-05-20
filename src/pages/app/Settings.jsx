import { useNavigate } from "react-router-dom";
import { FiCreditCard, FiLogOut, FiMail, FiRotateCcw, FiShield, FiUser } from "react-icons/fi";
import { currentUser, logout } from "../../funnel/authStore";
import { sendEmail, TEMPLATES } from "../../lib/email";
import { EV, track } from "../../lib/analytics";

const Settings = () => {
  const navigate = useNavigate();
  const user = currentUser();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleRefund = async () => {
    track(EV.REFUND_REQUESTED);
    if (user?.email) {
      sendEmail({ template: TEMPLATES.REFUND_REQUESTED, to: user.email });
    }
    alert("Refund request received. Our team will email you within 1 business day.");
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Settings</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-12">
        Your account.
      </h1>

      {/* Account */}
      <Section icon={FiUser} title="Account">
        <Row label="Username" value={user?.username || "—"} />
        <Row label="Email" value={user?.email || "—"} />
        <Row label="Role" value={user?.role === "pro" ? "Builder / Pro" : "Homeowner"} />
      </Section>

      {/* Security */}
      <Section icon={FiShield} title="Security">
        <Row label="Password" value="••••••••" action={{
          label: "Change",
          onClick: () => alert("INTEGRATION POINT (Supabase Auth): password update flow."),
        }} />
        <Row label="Magic link login" value="Enabled" action={{
          label: "Send link",
          onClick: () => alert("INTEGRATION POINT (Resend): trigger magic link email."),
        }} />
      </Section>

      {/* Billing */}
      <Section icon={FiCreditCard} title="Billing">
        <Row label="Plan" value="ADUAtlas Paid Access · $99 (one time)" />
        <Row label="Payment status" value={user?.paid ? "Paid" : "Unpaid"} />
        <Row label="Receipt" value="Available after purchase" action={{
          label: "Email receipt",
          onClick: () => alert("INTEGRATION POINT (Stripe + Resend): pull invoice URL and email."),
        }} />
      </Section>

      {/* Refund */}
      <Section icon={FiRotateCcw} title="Refund (within 7 days)">
        <p className="text-paper-dim text-sm leading-relaxed mb-5">
          We offer a 7 day full refund, no questions asked. If the system isn't useful within a week, request a refund and we'll handle it within one business day.
        </p>
        <button
          onClick={handleRefund}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition text-sm"
        >
          Request refund
        </button>
      </Section>

      {/* Support */}
      <Section icon={FiMail} title="Support">
        <p className="text-paper-dim text-sm leading-relaxed">
          Email <a href="mailto:hello@aduatlas.com" className="text-accent hover:text-paper transition-colors">hello@aduatlas.com</a> and we'll get back to you within one business day.
        </p>
      </Section>

      {/* Sign out */}
      <div className="border-t border-stroke pt-8 mt-10">
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-stroke text-paper-dim hover:text-paper hover:border-paper-dim transition"
        >
          <FiLogOut /> Log out
        </button>
      </div>
    </div>
  );
};

const Section = ({ icon: Icon, title, children }) => (
  <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8 mb-5">
    <div className="flex items-center gap-2 text-paper-dim text-xs uppercase tracking-[0.2em] mb-5">
      <Icon /> {title}
    </div>
    {children}
  </div>
);

const Row = ({ label, value, action }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 border-b border-stroke last:border-b-0">
    <div className="min-w-0">
      <p className="text-paper-dim text-xs">{label}</p>
      <p className="text-paper text-sm sm:text-base truncate">{value}</p>
    </div>
    {action && (
      <button
        onClick={action.onClick}
        className="text-accent text-sm font-medium hover:text-paper transition-colors self-start sm:self-auto shrink-0"
      >
        {action.label}
      </button>
    )}
  </div>
);

export default Settings;
