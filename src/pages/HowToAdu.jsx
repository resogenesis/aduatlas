import PageHeader from "../components/common/PageHeader";
import AduCTA from "../components/common/AduCTA";
import heroImg from "../assets/home/hero_image.png";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/how_it_works.png";

const steps = [
  { n: "1", title: "Start with your property basics", desc: "Gather address, lot size, setbacks, and HOA info before anything else.", img: img1 },
  { n: "2", title: "Understand state vs. city rules", desc: "State defines the structure; your city governs setbacks, height, and parking.", img: img2 },
  { n: "3", title: "Choose the ADU type that fits", desc: "Detached, attached, or conversion — each has cost and permitting tradeoffs.", img: img3 },
  { n: "4", title: "Run a feasibility + cost check", desc: "Use our Site Ready Score and Utility Cost Estimator to pressure-test the project.", img: img4 },
  { n: "5", title: "Get matched with local pros", desc: "We connect you with vetted builders and suppliers who work in your ZIP.", img: img1 },
  { n: "6", title: "Prepare before you hire", desc: "Walk into every conversation with a worksheet, scope, and expectations locked.", img: img2 },
];

const HowToAdu = () => {
  return (
    <div>
      <PageHeader
        title="How to ADU"
        subtitle="Step-by-Step ADU Guide"
        bg={heroImg}
      />
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h2 className="text-center text-3xl sm:text-4xl font-semibold text-primary mb-10">Homeowner Step-by-Step Guide</h2>
        <div className="flex flex-col gap-5">
          {steps.map((s) => (
            <div key={s.n} className="grid md:grid-cols-[1fr_auto] gap-4 items-center bg-[#F4F7F6] rounded-2xl p-4 sm:p-6">
              <div className="flex gap-4">
                <div className="w-12 h-12 shrink-0 rounded-full bg-[#2F5D50] text-white flex items-center justify-center font-semibold">{s.n}</div>
                <div>
                  <h4 className="font-semibold text-lg text-primary">{s.title}</h4>
                  <p className="text-secondary text-sm mt-1">{s.desc}</p>
                </div>
              </div>
              <img src={s.img} alt="" className="w-full md:w-56 h-32 md:h-28 object-cover rounded-xl" />
            </div>
          ))}
        </div>
      </section>
      <AduCTA />
    </div>
  );
};

export default HowToAdu;
