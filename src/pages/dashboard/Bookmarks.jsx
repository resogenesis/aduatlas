import { Link } from "react-router-dom";
import { FiBookmark } from "react-icons/fi";
import img1 from "../../assets/home/choose_img1.png";
import img2 from "../../assets/home/choose_img2.png";
import img3 from "../../assets/home/choose_img3.png";
import img4 from "../../assets/home/container_img.png";
import img5 from "../../assets/home/how_it_works.png";
import img6 from "../../assets/home/hero_image.png";

const imgs = [img1, img2, img3, img4, img5, img6];
const items = Array.from({ length: 6 }).map((_, i) => ({
  id: i + 1,
  name: "Pacific ADU Builders",
  location: "Austin, TX",
  img: imgs[i],
}));

const Bookmarks = () => {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-primary mb-1">Bookmarks</h1>
      <p className="text-secondary text-sm mb-6">Builders and suppliers you've saved for later.</p>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {items.map((b) => (
          <div key={b.id} className="bg-white rounded-xl overflow-hidden border border-gray-200">
            <div className="relative">
              <img src={b.img} alt={b.name} className="w-full h-40 object-cover" />
              <button className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white flex items-center justify-center">
                <FiBookmark className="text-[#2F5D50] fill-[#2F5D50]" />
              </button>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-primary">{b.name}</h3>
              <p className="text-xs text-gray-500 mt-1">{b.location}</p>
              <Link to={`/builders/${b.id}`} className="mt-3 inline-block w-full text-center px-3 py-2 rounded-md bg-[#2F5D50] text-white text-xs font-semibold">
                View Profile
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Bookmarks;
