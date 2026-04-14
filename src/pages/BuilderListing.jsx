import { Link } from "react-router-dom";
import { FiSearch, FiMapPin, FiFilter } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/container_img.png";
import img5 from "../assets/home/how_it_works.png";
import img6 from "../assets/home/hero_image.png";

const imgs = [img1, img2, img3, img4, img5, img6];
const builders = Array.from({ length: 6 }).map((_, i) => ({
  id: i + 1,
  name: "Pacific ADU Builders",
  location: "Austin, TX",
  type: "Detached + Prefab",
  img: imgs[i % imgs.length],
  rating: 4.7,
  verified: true,
}));

const BuilderListing = () => {
  return (
    <div>
      <PageHeader title="Builder Directory" subtitle="Search verified ADU builders and suppliers near you." />
      <section className="container mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input placeholder="Search builder name or ZIP" className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 text-sm" />
          </div>
          <button className="px-5 py-3 rounded-lg bg-[#F4F7F6] border border-gray-200 text-sm font-semibold inline-flex items-center gap-2">
            <FiFilter /> Filters
          </button>
          <button className="px-5 py-3 rounded-lg bg-[#2F5D50] text-white text-sm font-semibold">Search</button>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {builders.map((b) => (
            <Link key={b.id} to={`/builders/${b.id}`} className="bg-white rounded-xl overflow-hidden border border-gray-200 hover:shadow-md transition">
              <div className="relative">
                <img src={b.img} alt={b.name} className="w-full h-44 object-cover" />
                {b.verified && <span className="absolute top-2 left-2 bg-[#2F5D50] text-white text-xs font-semibold px-2 py-1 rounded">Verified</span>}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-primary">{b.name}</h3>
                <p className="text-xs text-gray-500 inline-flex items-center gap-1 mt-1"><FiMapPin /> {b.location}</p>
                <p className="text-xs text-secondary mt-1">{b.type}</p>
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-yellow-600">★ {b.rating}</span>
                  <span className="px-3 py-1.5 rounded-md bg-[#2F5D50] text-white text-xs font-semibold">View Profile</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

export default BuilderListing;
