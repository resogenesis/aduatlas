import { FiPlus } from "react-icons/fi";
import img1 from "../../assets/home/choose_img1.png";
import img2 from "../../assets/home/choose_img2.png";
import img3 from "../../assets/home/choose_img3.png";

const builds = [
  { id: 1, name: "Detached Prefab — Oakland", status: "In Review", img: img1 },
  { id: 2, name: "Studio Conversion — Austin", status: "Published", img: img2 },
  { id: 3, name: "Two-Bedroom — Portland", status: "Draft", img: img3 },
];

const ManageBuilds = () => {
  return (
    <div>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-primary">Manage Builds</h1>
          <p className="text-secondary text-sm">Your ADU project listings and their current status.</p>
        </div>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#2F5D50] text-white text-sm font-semibold">
          <FiPlus /> New Build
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {builds.map((b) => (
          <div key={b.id} className="bg-white rounded-xl overflow-hidden border border-gray-200">
            <img src={b.img} alt={b.name} className="w-full h-40 object-cover" />
            <div className="p-4">
              <h3 className="font-semibold text-primary">{b.name}</h3>
              <p className="text-xs mt-1">
                <span className={`px-2 py-1 rounded ${b.status === "Published" ? "bg-green-100 text-green-700" : b.status === "In Review" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"}`}>{b.status}</span>
              </p>
              <div className="mt-3 flex gap-2">
                <button className="flex-1 px-3 py-2 rounded-md bg-[#2F5D50] text-white text-xs font-semibold">Edit</button>
                <button className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-xs">Preview</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ManageBuilds;
