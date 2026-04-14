import { useState } from "react";
import { FiEdit2, FiPlus, FiUpload } from "react-icons/fi";
import { FormField, PrimaryButton } from "../../components/common/FormField";
import img1 from "../../assets/home/choose_img1.png";
import img2 from "../../assets/home/choose_img2.png";
import img3 from "../../assets/home/choose_img3.png";

const tabs = ["Account Details", "ADU Structure Details", "Business Info"];

const Card = ({ title, children, onEdit }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 mb-5">
    <div className="flex justify-between items-center mb-4">
      <h3 className="font-semibold text-primary">{title}</h3>
      {onEdit && (
        <button onClick={onEdit} className="text-xs text-[#2F5D50] font-semibold inline-flex items-center gap-1">
          <FiEdit2 /> Edit
        </button>
      )}
    </div>
    {children}
  </div>
);

const Profile = () => {
  const [tab, setTab] = useState(tabs[0]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-primary mb-1">My Profile</h1>
      <p className="text-secondary text-sm mb-6">Jonny Wilson · jonny@gmail.com</p>

      <div className="flex flex-wrap gap-2 mb-5 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 ${tab === t ? "border-[#2F5D50] text-[#2F5D50]" : "border-transparent text-gray-600"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === tabs[0] && (
        <>
          <Card title="Personal Information" onEdit={() => {}}>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="User Name" placeholder="Jonny" />
              <FormField label="Email Address" type="email" placeholder="jonny@gmail.com" />
              <FormField label="Phone Number" placeholder="(555) 555-5555" />
              <FormField label="Description" placeholder="Short bio" />
            </div>
            <div className="flex justify-end"><PrimaryButton className="w-auto px-6">Submit</PrimaryButton></div>
          </Card>

          <Card title="Location Information" onEdit={() => {}}>
            <div className="grid sm:grid-cols-3 gap-4">
              <FormField label="State" placeholder="California" />
              <FormField label="City" placeholder="Fresno" />
              <FormField label="ZIP Code" placeholder="93650" />
            </div>
            <div className="flex justify-end"><PrimaryButton className="w-auto px-6">Submit</PrimaryButton></div>
          </Card>
        </>
      )}

      {tab === tabs[1] && (
        <>
          <Card title="Property & ADU Details" onEdit={() => {}}>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="How did you hear about ADU Atlas?" placeholder="Google search, friend, ADU..." />
              <FormField label="Property Type" placeholder="Single family, multi..." />
              <FormField label="Planned Use of ADU" placeholder="Rental, family, office..." />
              <FormField label="Estimated Budget Range" placeholder="$150K – $300K" />
              <FormField label="Project Readiness" placeholder="Planning / design / ready" />
              <FormField label="HOA Status" placeholder="Yes / No" />
            </div>
            <div className="flex justify-end"><PrimaryButton className="w-auto px-6">Submit</PrimaryButton></div>
          </Card>

          <Card title="ADU Structures" onEdit={() => {}}>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="ADU Type" placeholder="Shipping Container, Steel Frame, Cabin..." />
              <FormField label="Size Range" placeholder="400–1,200 sqft" />
              <FormField label="Estimated Pricing Range" placeholder="$90,000 – $350,000" />
              <FormField label="How many ADUs have you completed?" placeholder="e.g. 12" />
              <FormField label="How do you estimate projects?" placeholder="Per sqft / fixed bid" />
            </div>
            <div className="flex justify-end"><PrimaryButton className="w-auto px-6">Submit</PrimaryButton></div>
          </Card>

          <Card title="Service Areas" onEdit={() => {}}>
            <p className="text-sm text-secondary mb-3">California, Oregon, Washington, Texas, Colorado, Florida</p>
            <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#2F5D50] text-[#2F5D50] text-sm font-semibold">
              <FiPlus /> Add State
            </button>
          </Card>

          <Card title="Project Images & Video">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[img1, img2, img3].map((g, i) => (
                <img key={i} src={g} alt="" className="w-full h-28 object-cover rounded-lg" />
              ))}
              <label className="border-2 border-dashed border-gray-300 rounded-lg h-28 flex flex-col items-center justify-center text-xs text-gray-500 cursor-pointer hover:border-[#2F5D50]">
                <FiUpload className="text-xl mb-1" />
                Choose File
                <input type="file" className="hidden" />
              </label>
            </div>
          </Card>
        </>
      )}

      {tab === tabs[2] && (
        <Card title="Business Information" onEdit={() => {}}>
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Business Name" placeholder="Acme" />
            <FormField label="Business Type" placeholder="Supplier, Architect, GC" />
            <FormField label="Scope of work" placeholder="What you cover" />
            <FormField label="Permit Date" placeholder="DD/MM/YYYY" />
            <FormField label="Permit Number" placeholder="ADU-2026-0481" />
            <FormField label="Email Address" type="email" placeholder="you@example.com" />
            <FormField label="Phone Number" placeholder="(555) 555-5555" />
            <FormField label="Years of Experience" placeholder="e.g. 12 years" />
            <FormField label="Website Address" placeholder="www.yourcompany.com" />
          </div>
          <FormField label="Business Description" placeholder="Short narrative about the business" />
          <div className="flex justify-end"><PrimaryButton className="w-auto px-6">Submit</PrimaryButton></div>
        </Card>
      )}
    </div>
  );
};

export default Profile;
