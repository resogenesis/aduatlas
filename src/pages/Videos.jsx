import { FiPlay } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/how_it_works.png";
import img5 from "../assets/home/container_img.png";
import img6 from "../assets/home/hero_image.png";

const imgs = [img1, img2, img3, img4, img5, img6];
const videos = Array.from({ length: 12 }).map((_, i) => ({
  id: i,
  title: `ADU Build Tour #${i + 1}`,
  img: imgs[i % imgs.length],
}));

const Videos = () => {
  return (
    <div>
      <PageHeader title="Video Library" subtitle="Watch and explore real ADU build tours, walkthroughs, and how-to guides." />
      <section className="container mx-auto px-4 sm:px-6 py-12">
        <div className="flex gap-2 mb-8">
          {["All", "Tours", "How-to", "Builders"].map((t, i) => (
            <button key={t} className={`px-4 py-2 rounded-md text-sm font-semibold ${i === 0 ? "bg-[#2F5D50] text-white" : "bg-[#F4F7F6] text-gray-700"}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((v) => (
            <div key={v.id} className="relative rounded-xl overflow-hidden group cursor-pointer">
              <img src={v.img} alt={v.title} className="w-full h-48 object-cover group-hover:scale-105 transition" />
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <div className="w-12 h-12 bg-white/90 rounded-full flex items-center justify-center">
                  <FiPlay className="text-[#2F5D50] text-xl ml-1" />
                </div>
              </div>
              <p className="absolute bottom-2 left-3 text-white text-sm font-medium drop-shadow">{v.title}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Videos;
