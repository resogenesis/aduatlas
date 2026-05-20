import { useState } from "react";
import { FiCheck, FiSave } from "react-icons/fi";
import { loadBuilderProfile, saveBuilderProfile } from "../../funnel/builderStore";

const ADU_TYPES = [
  "Detached prefab", "Detached stick-built", "Garage conversion",
  "Basement conversion", "SIP panel", "Container", "Modular",
  "Backyard cottage", "Casita", "ICF / concrete",
];

const Profile = () => {
  const [p, setP] = useState(loadBuilderProfile);
  const [savedAt, setSavedAt] = useState(null);

  const set = (key, val) => setP((prev) => ({ ...prev, [key]: val }));

  const toggleType = (t) => {
    const has = p.aduTypes.includes(t);
    set("aduTypes", has ? p.aduTypes.filter((x) => x !== t) : [...p.aduTypes, t]);
  };

  const handleSave = (e) => {
    e.preventDefault();
    saveBuilderProfile(p);
    setSavedAt(new Date());
  };

  return (
    <div className="px-5 sm:px-8 lg:px-12 py-10 sm:py-14 max-w-4xl mx-auto">
      <p className="text-accent text-xs font-medium tracking-[0.2em] uppercase mb-3">Profile</p>
      <h1 className="font-display font-medium text-paper text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight mb-3">
        Your company profile.
      </h1>
      <p className="text-paper-dim text-base sm:text-lg max-w-2xl mb-10">
        We use this to match you to the right Builder Packets. Be specific about service area and ADU types. Narrower is better.
      </p>

      <form onSubmit={handleSave} className="space-y-7">
        {/* Company */}
        <Section title="Company">
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Company name" value={p.companyName} onChange={(v) => set("companyName", v)} placeholder="Acme ADU Builders" />
            <Field label="Years in business" value={p.yearsExperience} onChange={(v) => set("yearsExperience", v)} placeholder="8" />
          </div>
        </Section>

        {/* Contact */}
        <Section title="Contact">
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Contact name" value={p.contactName} onChange={(v) => set("contactName", v)} placeholder="Jane Doe" />
            <Field label="Phone" value={p.phone} onChange={(v) => set("phone", v)} placeholder="(555) 123-4567" />
          </div>
          <div className="mt-5">
            <Field label="Public email" type="email" value={p.email} onChange={(v) => set("email", v)} placeholder="leads@acmeadu.com" />
          </div>
        </Section>

        {/* Service area */}
        <Section title="Service area">
          <Field
            label="ZIP codes or cities you serve"
            value={p.serviceAreas}
            onChange={(v) => set("serviceAreas", v)}
            placeholder="91103, 91101, Pasadena, La Cañada"
            hint="Comma-separated. Used to filter which Builder Packets you see."
          />
        </Section>

        {/* ADU types */}
        <Section title="ADU types you build">
          <div className="flex flex-wrap gap-2">
            {ADU_TYPES.map((t) => {
              const active = p.aduTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleType(t)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border transition ${
                    active
                      ? "bg-accent text-accent-fg border-accent"
                      : "bg-canvas text-paper-dim border-stroke hover:border-paper-dim hover:text-paper"
                  }`}
                >
                  {active && <FiCheck className="inline -mt-0.5 mr-1" />} {t}
                </button>
              );
            })}
          </div>
        </Section>

        {/* About */}
        <Section title="About">
          <div>
            <label className="block text-paper text-xs font-medium tracking-[0.15em] uppercase mb-2">
              Short bio
            </label>
            <textarea
              rows={4}
              value={p.about}
              onChange={(e) => set("about", e.target.value)}
              placeholder="3–4 sentences. What's your edge? What do homeowners love about working with you?"
              className="w-full px-4 py-3.5 rounded-xl bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition resize-y"
            />
          </div>
        </Section>

        {/* Save */}
        <div className="flex items-center gap-4 pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-3.5 rounded-full bg-accent text-accent-fg font-semibold hover:bg-paper transition-colors"
          >
            <FiSave /> Save profile
          </button>
          {savedAt && (
            <span className="inline-flex items-center gap-1.5 text-accent text-sm">
              <FiCheck /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
};

const Section = ({ title, children }) => (
  <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8">
    <p className="text-paper-dim text-xs uppercase tracking-[0.2em] mb-5">{title}</p>
    {children}
  </div>
);

const Field = ({ label, value, onChange, placeholder, type = "text", hint }) => (
  <div>
    <label className="block text-paper text-xs font-medium tracking-[0.15em] uppercase mb-2">
      {label}
    </label>
    <input
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3.5 rounded-xl bg-canvas border border-stroke text-paper text-sm placeholder:text-paper-dim/50 focus:outline-none focus:border-accent transition"
    />
    {hint && <p className="mt-1.5 text-xs text-paper-dim/70">{hint}</p>}
  </div>
);

export default Profile;
