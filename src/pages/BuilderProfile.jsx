import { useParams, Link } from "react-router-dom";
import { FiPlay, FiMapPin, FiCheck } from "react-icons/fi";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/container_img.png";
import img5 from "../assets/home/how_it_works.png";
import img6 from "../assets/home/hero_image.png";

const gallery = [img1, img2, img3, img4, img5, img6, img1, img2, img3, img4, img5, img6];

const BuilderProfile = () => {
  const { id } = useParams();
  return (
    <div className="container mx-auto px-4 sm:px-6 py-10">
      <Link to="/builders" className="text-sm text-[#2F5D50] font-semibold">← Back to directory</Link>

      <div className="grid lg:grid-cols-[320px_1fr] gap-8 mt-4">
        <aside className="bg-white rounded-2xl border border-gray-200 p-5">
          <img src={img1} alt="" className="w-full h-40 rounded-xl object-cover mb-4" />
          <h2 className="text-xl font-semibold text-primary">Pacific ADU Builders</h2>
          <p className="text-sm text-gray-500 inline-flex items-center gap-1 mt-1"><FiMapPin /> Austin, TX</p>

          <div className="flex gap-2 mt-4">
            <button className="flex-1 py-2 rounded-md bg-[#2F5D50] text-white text-sm font-semibold">Contact</button>
            <button className="flex-1 py-2 rounded-md border border-gray-300 text-sm">Save</button>
          </div>

          <div className="mt-6 space-y-3 text-sm">
            <div>
              <h4 className="font-semibold text-primary mb-1">ADU Types</h4>
              <p className="text-secondary">Detached, Prefab, Two-Bedroom</p>
            </div>
            <div>
              <h4 className="font-semibold text-primary mb-1">Size Range</h4>
              <p className="text-secondary">400–1,200 sqft</p>
            </div>
            <div>
              <h4 className="font-semibold text-primary mb-1">Pricing Range</h4>
              <p className="text-secondary">$90,000 – $350,000</p>
            </div>
          </div>

          <div className="mt-5 p-3 rounded-lg bg-[#2F5D50] text-white text-sm">
            <p className="font-semibold mb-1">Talk to this builder</p>
            <p className="text-white/80 text-xs">Profile ID: {id}</p>
          </div>
        </aside>

        <section className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-8">
          <h3 className="text-xl font-semibold text-primary mb-3">About</h3>
          <p className="text-secondary text-sm leading-relaxed">
            Pacific ADU Builders designs and constructs detached and prefab ADUs across the Southwest. With more than 12 years of experience navigating local zoning and permitting, our team delivers move-in-ready units on schedule and on budget.
          </p>

          <h3 className="text-xl font-semibold text-primary mt-6 mb-3">Services Offered</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {["Feasibility Study", "Permitting", "Site Prep", "Construction", "Finish Work", "Post-build Warranty"].map((s) => (
              <div key={s} className="text-sm inline-flex items-center gap-2"><FiCheck className="text-[#2F5D50]" /> {s}</div>
            ))}
          </div>

          <h3 className="text-xl font-semibold text-primary mt-6 mb-3">Service Area</h3>
          <p className="text-secondary text-sm">California, Oregon, Washington, Texas, Colorado, Florida (+)</p>

          <h3 className="text-xl font-semibold text-primary mt-8 mb-3">Project Gallery</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gallery.map((g, i) => (
              <div key={i} className="relative rounded-xl overflow-hidden">
                <img src={g} alt="" className="w-full h-36 object-cover" />
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center">
                    <FiPlay className="text-[#2F5D50] ml-0.5" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default BuilderProfile;
