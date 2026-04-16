import { FiPlay } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import AduCTA from "../components/common/AduCTA";
import heroImg from "../assets/home/hero_image.png";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/how_it_works.png";
import img5 from "../assets/home/container_img.png";

const imgs = [img1, img2, img3, img4, img5, img1];
const videos = Array.from({ length: 6 }).map((_, i) => ({
  id: i,
  title: "Demo Video Title",
  img: imgs[i],
}));

const Videos = () => {
  return (
    <div>
      <PageHeader
        title="Video Library"
        bg={heroImg}
      />
      <section className="container mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-3xl mx-auto mb-10 space-y-4 text-secondary text-sm sm:text-base leading-relaxed">
          <p>
            The ADUAtlas Video Library features short and long-form videos showcasing ADU builds, tiny homes, prefab ADUs, and modular home construction. Watch everything from a finished ADU delivered by crane to a custom backyard home built from the ground up, including step-by-step construction and installation footage.
          </p>
          <p>
            Explore videos covering ADU design ideas, building methods, costs, timelines, and real-world projects. The library includes builder showcases, sponsor features, homeowner videos, AI-generated concepts, and unique ADU builds across a wide range of styles and budgets.
          </p>
          <p>
            Browse the ADUAtlas Video Library to discover real ADU projects, innovative designs, and expert insights across the growing accessory dwelling unit market.
          </p>
        </div>
      </section>
      <section className="container mx-auto px-4 sm:px-6 pb-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((v) => (
            <div key={v.id} className="cursor-pointer">
              <div className="relative rounded-xl overflow-hidden group">
                <img src={v.img} alt={v.title} className="w-full h-48 object-cover group-hover:scale-105 transition" />
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
                    <FiPlay className="text-[#2F5D50] text-2xl ml-1" />
                  </div>
                </div>
              </div>
              <h3 className="mt-3 font-semibold text-primary text-lg">{v.title}</h3>
            </div>
          ))}
        </div>
      </section>
      <AduCTA />
    </div>
  );
};

export default Videos;
