import { useNavigate } from "react-router-dom";
import { FiBell, FiLogOut, FiMail, FiShield, FiUser } from "react-icons/fi";
import { currentUser, logout } from "../../stores/authStore";

const Settings = () => {
  const navigate = useNavigate();
  const user = currentUser();

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-3xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Settings</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-12">
        Your account.
      </h1>

      <Section icon={FiUser} title="Account">
        <Row label="Username" value={user?.username || "—"} />
        <Row label="Email" value={user?.email || "—"} />
        <Row label="Role" value="Builder / Pro" />
      </Section>

      <Section icon={FiShield} title="Security">
        <Row label="Password" value="••••••••" action={{
          label: "Change",
          onClick: () => alert("INTEGRATION POINT (Supabase Auth): password update."),
        }} />
      </Section>

      <Section icon={FiBell} title="Notifications">
        <Row label="New lead in service area" value="On" action={{
          label: "Edit",
          onClick: () => alert("INTEGRATION POINT (Supabase): notification preferences."),
        }} />
        <Row label="Weekly digest" value="On" action={{
          label: "Edit",
          onClick: () => alert("INTEGRATION POINT (Supabase): notification preferences."),
        }} />
      </Section>

      <Section icon={FiMail} title="Support">
        <p className="text-paper-dim text-sm leading-relaxed">
          Builder support: <a href="mailto:builders@aduatlas.com" className="text-accent hover:text-paper transition-colors">builders@aduatlas.com</a>
        </p>
      </Section>

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
