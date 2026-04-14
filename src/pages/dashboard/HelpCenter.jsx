import { FormField, PrimaryButton } from "../../components/common/FormField";

const HelpCenter = () => {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-primary mb-1">Help Centre</h1>
      <p className="text-secondary text-sm mb-6">Submit a support ticket — we respond within 1 business day.</p>

      <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 max-w-3xl">
        <form onSubmit={(e) => e.preventDefault()}>
          <FormField label="Subject" placeholder="Briefly describe your issue" required />
          <div className="mb-4">
            <label className="block text-sm font-semibold text-gray-800 mb-1.5">Description</label>
            <textarea
              rows={6}
              placeholder="Tell us what's going on..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 text-sm focus:outline-none focus:border-[#2F5D50] focus:ring-1 focus:ring-[#2F5D50]"
            />
          </div>
          <div className="flex gap-3">
            <PrimaryButton type="submit" className="w-auto px-6">Submit</PrimaryButton>
            <button type="button" className="px-6 py-3 rounded-lg border border-gray-300 text-sm">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default HelpCenter;
