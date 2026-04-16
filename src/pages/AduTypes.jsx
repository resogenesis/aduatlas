import { useState } from "react";
import { FiChevronDown } from "react-icons/fi";
import PageHeader from "../components/common/PageHeader";
import AduCTA from "../components/common/AduCTA";
import heroImg from "../assets/home/hero_image.png";
import img1 from "../assets/home/choose_img1.png";
import img2 from "../assets/home/choose_img2.png";
import img3 from "../assets/home/choose_img3.png";
import img4 from "../assets/home/how_it_works.png";
import img5 from "../assets/home/container_img.png";

const imgs = [img1, img2, img3, img4, img5];

const types = [
  { name: "3D Printed ADU", desc: "A smart dwelling constructed using large-scale 3D printers that extrude concrete of composite materials layer by layer to form structural walls. Key Traits: Rapid build, cost-effective, custom-form possibility, reduced labour, emerging building methods.", price: "$150,000–$400,000+", time: "3–6 months", value: "Variable – Limited lender familiarity in most markets" },
  { name: "A-Frame", desc: "A triangular structure with steeply sloped rooflines forming the shape of the letter 'A'. Key Traits: Strong snow shedding, dramatic aesthetic, compact footprint, with open lofts.", price: "$60,000–$180,000+", time: "3–6 months", value: "Moderate to High – Popular in rural and mountain regions" },
  { name: "Barndominium", desc: "A residential structure built using metal building systems in barn-style construction, often with open interiors. Key Traits: Steel framing, large spans, cost-efficient shell, lower exterior maintenance.", price: "$80,000–$250,000+", time: "3–6 months", value: "Moderate to High – Strong in rural and semi-rural markets" },
  { name: "Bunkie", desc: "A small, simple detached sleeping cabin, typically without full plumbing. Key Traits: Minimal utilities, compact size (often sub-200 sqft), used for guests or seasonal use.", price: "$10,000–$40,000", time: "2–8 weeks (kits)", value: "Low to Moderate – Often lacks full utilities; may not qualify as full ADU" },
  { name: "Cabin (Kit or Log)", desc: "A rustic dwelling built from pre-cut kits or traditional log construction. Key Traits: Rustic appearance, engineered kit packages, can be full-time livable if code-compliant.", price: "$50,000–$200,000+", time: "2–6 months", value: "Moderate – Rustic style may limit urban zoning acceptance" },
  { name: "Container Home", desc: "Made from shipping containers. Key Traits: Compact (Length 20-40ft); Width 8' Height 8.5'. Can appraise well if IRC-compliant and properly finished.", price: "$25,000–$120,000+", time: "2–6 months", value: "Moderate – Can appraise well if IRC-compliant and properly finished" },
  { name: "Custom Stick-Built ADU", desc: "A traditionally framed wood structure built entirely on site using dimensional lumber. Key Traits: Full customization, follows standard residential construction practices, highest design flexibility.", price: "$120,000–$350,000+", time: "4–9 months", value: "High – Typically strongest appraisal impact and most lender friendly" },
  { name: "Geodesic Dome ADU", desc: "A spherical or partial sphere structure composed of triangular elements forming a dome. Key Traits: Energy efficient triangle, high wind resistance, unique interior geometry.", price: "$35,000–$100,000+", time: "2–5 months", value: "Variable – Unique design may limit resale appeal in some markets" },
  { name: "Luxury Architectural ADU", desc: "A high-end, architect-designed, contemporary dwelling featuring premium materials and custom interior. Key Traits: High finishes, large glazing, independent landscaping, density value impact.", price: "$250,000–$600,000+", time: "6–12 months", value: "High – Premium resale in high-value markets" },
  { name: "Modern Shed", desc: "A minimalist, box-type structure with clean roof lines, often derived from shed-style architecture. Key Traits: Simple geometry, cost-effective, popular for studios and compact living.", price: "$20,000–$80,000", time: "1–3 months", value: "Moderate – Depends heavily on foundation and utility connections" },
  { name: "Panelized ADU", desc: "A home built from factory-fabricated wall and roof panels assembled on site. Key Traits: Faster framing, quality-controlled panels, reduced site labor.", price: "$80,000–$250,000+", time: "3–6 months", value: "High – Comparable to stick-built when permanently installed" },
  { name: "Park Model / Tiny Home on Foundation", desc: "A compact dwelling originally designed like an RV-style park model but permanently installed on a foundation. Key Traits: Small footprint (often under 400 sqft), must meet local building codes if on foundation.", price: "$40,000–$120,000+", time: "2–4 months", value: "Low to Moderate – Financing and zoning vary widely" },
  { name: "Pre-Fab Modular ADU", desc: "A factory-built dwelling constructed in modules and transported to the site for assembly. Key Traits: Controlled factory build, faster timelines, IRC-compliant when certified.", price: "$80,000–$250,000+", time: "3–6 months", value: "High – Often appraises similarly to stick-built if permanently installed" },
  { name: "Quonset Hut ADU", desc: "A semi-cylindrical steel structure originally used for military storage, adapted for residential use. Key Traits: Arched steel shell, durable, open interior span.", price: "$25,000–$100,000", time: "2–4 months", value: "Moderate – Appraisal depends on finish quality and local acceptance" },
  { name: "Shipping Container Hybrid ADU", desc: "A dwelling that combines shipping containers with traditional wood or steel framing. Key Traits: Greater design flexibility than single-container builds, engineered integration required.", price: "$80,000–$220,000+", time: "3–6 months", value: "Moderate – Better resale than basic container units" },
  { name: "SIP (Structural Insulated Panel) ADU", desc: "A structure built using rigid foam insulation sandwiched between structural boards to form load-bearing panels. Key Traits: High energy efficiency, tight building envelope, faster enclosure stage.", price: "$100,000–$300,000+", time: "3–6 months", value: "High – Strong long-term energy savings and appraisal appeal" },
  { name: "Timber Frame ADU", desc: "A structure built with large, exposed wood beams joined with traditional or engineered connections. Key Traits: Visible structural wood, high craftsmanship, durable long-term performance.", price: "$150,000–$400,000+", time: "4–8 months", value: "High – Strong aesthetic, appeal and resale in premium markets" },
];

const comparison = [
  ["Type", "Approx. Price Range", "Time to Build / Install", "Long-Term Value Impact"],
  ...types.map((t) => [t.name, t.price, t.time, t.value]),
];

const AduTypes = () => {
  const [filter, setFilter] = useState("All");
  const [dropOpen, setDropOpen] = useState(false);
  const typeNames = ["All", ...types.map((t) => t.name)];
  const filtered = filter === "All" ? types : types.filter((t) => t.name === filter);

  return (
    <div>
      <PageHeader
        title="ADU Types and Types of ADUs"
        subtitle={<>Understand the different ADU options available<br />and find the best fit for your property and needs.</>}
        bg={heroImg}
      />

      <section className="container mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="max-w-3xl mx-auto mb-10 space-y-4 text-secondary text-sm sm:text-base leading-relaxed">
          <p>
            The range of ADU types and tiny homes has expanded rapidly with growing demand for flexible, affordable housing. Homeowners can now choose from prefab ADUs, modular homes, kit homes, and custom-built backyard homes, available in a wide range of sizes, designs, and price points.
          </p>
          <p>
            ADUs are typically priced based on size, design complexity, materials, and construction method. Options range from fully finished, move-in-ready units delivered to your property to DIY kits assembled on-site. Understanding these differences helps homeowners select the right structure for their budget, timeline, and local zoning requirements.
          </p>
          <p className="font-semibold text-primary">Explore the most common ADU and tiny home types below:</p>
        </div>
      </section>

      <section className="container mx-auto px-4 sm:px-6 pb-10 sm:pb-14">
        <div className="relative inline-block mb-8">
          <button
            onClick={() => setDropOpen((v) => !v)}
            className="flex items-center gap-2 px-4 py-3 rounded-lg border border-gray-300 text-sm bg-white min-w-[220px] justify-between"
          >
            <span>{filter === "All" ? "Select ADUs Types" : filter}</span>
            <FiChevronDown className={`transition-transform ${dropOpen ? "rotate-180" : ""}`} />
          </button>
          {dropOpen && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
              {typeNames.map((n) => (
                <button
                  key={n}
                  onClick={() => { setFilter(n); setDropOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-[#F4F7F6] ${filter === n ? "font-semibold text-[#2F5D50]" : "text-gray-700"}`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {filtered.map((t, i) => (
            <div key={t.name} className="bg-white rounded-xl overflow-hidden border border-gray-200">
              <img src={imgs[i % imgs.length]} alt={t.name} className="w-full h-56 object-cover" />
              <div className="p-5">
                <h3 className="text-xl font-semibold text-primary mb-2">{t.name}</h3>
                <p className="text-secondary text-sm leading-relaxed">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-[#F4F7F6] py-10 sm:py-14">
        <div className="container mx-auto px-4 sm:px-6">
          <h3 className="text-center text-2xl sm:text-3xl font-semibold text-primary mb-6">Quick Comparison</h3>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-[#F4F7F6]">
                <tr>{comparison[0].map((h) => <th key={h} className="px-4 py-3 text-left font-semibold text-primary whitespace-nowrap">{h}</th>)}</tr>
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
        </div>
      </section>

      <AduCTA />
    </div>
  );
};

export default AduTypes;
