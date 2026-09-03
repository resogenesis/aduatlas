import { FiPlay } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import heroImg from "../assets/home/hero_image.png";
import ContentImage from "../components/common/ContentImage";
import { useContentText, paragraphs } from "../lib/content";
import { VIDEOS_COUNT } from "../lib/contentRegistry/videos";

const VideoCard = ({ i }) => {
  const title = useContentText(`videos.card.${i}.title`);
  return (
    <div className="cursor-pointer">
      <div className="relative rounded-xl overflow-hidden group">
        <ContentImage
          contentKey={`videos.card.${i}.image`}
          className="w-full h-48 object-cover group-hover:scale-105 transition"
        />
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="w-14 h-14 bg-white/90 rounded-full flex items-center justify-center">
            <FiPlay className="text-[#2F5D50] text-2xl ml-1" />
          </div>
        </div>
      </div>
      <h3 className="mt-3 font-semibold text-primary text-lg">{title}</h3>
    </div>
  );
};

const Videos = () => {
  const headerTitle = useContentText("videos.header.title");
  const intro = useContentText("videos.intro");

  return (
    <div>
      <PageHeader
        title={headerTitle}
        bg={heroImg}
      />
      <section className="container mx-auto px-4 sm:px-6 py-12">
        <div className="max-w-3xl mx-auto mb-10 space-y-4 text-secondary text-sm sm:text-base leading-relaxed">
          {paragraphs(intro).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </section>
      <section className="container mx-auto px-4 sm:px-6 pb-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: VIDEOS_COUNT }, (_, i) => <VideoCard key={i} i={i} />)}
        </div>
      </section>
    </div>
  );
};

export default Videos;
