import PageHeader from "../components/common/PageHeader";
import PublicStubFooter from "../components/funnel/PublicStubFooter";
import heroImg from "../assets/home/hero_image.png";

const typeNames = [
  "Prefab Modular ADU",
  "Panelized ADU",
  "SIP ADU",
  "Custom Stick-Built",
  "Container Home",
  "Shipping Container Hybrid",
  "Park Model / Tiny Home on Foundation",
  "Mobile Tiny Home (on wheels)",
  "A-Frame",
  "Cabin (Kit or Log)",
  "Bunkie",
  "Modern Shed",
  "Backyard Cottage",
  "Casita",
  "Garage Conversion",
  "Basement Conversion",
  "Attached / Home Addition",
  "Detached New Construction",
  "Duplex / Two-Unit",
  "Barndominium",
  "Quonset Hut",
  "Geodesic Dome",
  "Timber Frame",
  "Steel Frame",
  "Concrete / ICF",
  "3D Printed",
  "Luxury Architectural",
  "Micro Studio",
  "Pod / Capsule",
  "Floating / Barge",
];

const AduTypes = () => {
  return (
    <div>
      <PageHeader
        title="ADU Types"
        subtitle="More options than most homeowners realize. The wrong choice for your lot or zoning can quietly add tens of thousands."
        bg={heroImg}
      />

      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-16 max-w-4xl">
        <div className="text-center mb-10">
          <p className="text-paper-dim text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
            There are 30+ ADU and tiny-home types in common use. Each has different cost, timeline, and zoning implications, and not every type is allowed on every lot.
          </p>
        </div>

        <div className="bg-surface-1-solid border border-stroke rounded-2xl p-6 sm:p-8 mb-10">
          <p className="text-paper font-semibold mb-5 text-center">30+ ADU types in common use:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-paper-dim text-sm">
            {typeNames.map((name) => (
              <div key={name} className="flex items-start gap-2">
                <span className="text-accent shrink-0 mt-0.5">·</span>
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-paper-dim text-base sm:text-lg leading-relaxed text-center">
          Side-by-side comparisons (cost ranges, timelines, long-term value impact, and which types match your specific zoning) are inside the ADU system.
        </p>
      </section>

      <PublicStubFooter chapterName="Chapter 2" />
    </div>
  );
};

export default AduTypes;
