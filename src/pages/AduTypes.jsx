import { Link } from "react-router-dom";
import PageHeader from "../components/common/PageHeader";
import AduCTA from "../components/common/AduCTA";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/how_it_works.png";
import img5 from "../assets/home/container_img.png";

const types = [
  { name: "Detached ADU", img: img1, desc: "Standalone structure separate from the main house. Offers the most privacy and flexibility.", size: "400–1,200 sqft", cost: "$$$" },
  { name: "Studio Detached ADU", img: img2, desc: "Compact detached unit. Ideal for offices, guest suites, or short-term rentals.", size: "200–500 sqft", cost: "$$" },
  { name: "One-Bedroom Detached ADU", img: img3, desc: "Full-service detached unit with dedicated bedroom, kitchen, and bath.", size: "500–800 sqft", cost: "$$$" },
  { name: "Two-bedroom Detached ADU", img: img4, desc: "Family-ready detached ADU with two bedrooms and open living space.", size: "800–1,200 sqft", cost: "$$$$" },
  { name: "Prefab Detached ADU", img: img5, desc: "Factory-built, rapidly deployable ADU with streamlined permitting in eligible states.", size: "300–1,000 sqft", cost: "$$" },
];

const comparison = [
  ["Type", "Size", "Typical Cost", "Build Time", "Privacy"],
  ["Detached", "400–1,200 sqft", "$$$", "9–14 mo", "High"],
  ["Studio", "200–500 sqft", "$$", "6–9 mo", "Medium"],
  ["One-Bedroom", "500–800 sqft", "$$$", "9–12 mo", "High"],
  ["Two-Bedroom", "800–1,200 sqft", "$$$$", "10–14 mo", "High"],
  ["Prefab", "300–1,000 sqft", "$$", "4–8 mo", "High"],
];

const AduTypes = () => {
  return (
    <div>
      <PageHeader title="Types of ADUs" subtitle="Explore how each ADU type compares so you can choose the best fit for your lot and budget." />

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="flex flex-col gap-5">
          {types.map((t) => (
            <div key={t.name} className="bg-[#F4F7F6] rounded-2xl overflow-hidden grid md:grid-cols-[260px_1fr] gap-4">
              <img src={t.img} alt={t.name} className="w-full h-48 md:h-full object-cover" />
              <div className="p-5 sm:p-6 flex flex-col justify-between gap-3">
                <div>
                  <h3 className="text-xl sm:text-2xl font-semibold text-primary mb-2">{t.name}</h3>
                  <p className="text-secondary text-sm">{t.desc}</p>
                  <div className="flex gap-4 mt-3 text-xs text-gray-600">
                    <span><strong>Size:</strong> {t.size}</span>
                    <span><strong>Cost:</strong> {t.cost}</span>
                  </div>
                </div>
                <Link to="/builders" className="w-fit px-5 py-2 rounded-md bg-[#2F5D50] text-white text-sm font-semibold hover:bg-[#244A40]">
                  Find Builders
                </Link>
              </div>
            </div>
          ))}
        </div>

        <h3 className="text-center text-2xl sm:text-3xl font-semibold text-primary mt-16 mb-6">Guide Comparison</h3>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-[#F4F7F6]">
              <tr>{comparison[0].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-primary">{h}</th>)}</tr>
            </thead>
            <tbody>
              {comparison.slice(1).map((row, i) => (
                <tr key={i} className="border-t border-gray-100">
                  {row.map((cell, j) => <td key={j} className="px-4 py-3 text-secondary">{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <AduCTA />
    </div>
  );
};

export default AduTypes;
