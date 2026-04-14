import AduCTA from "../components/common/AduCTA";
import PageHeader from "../components/common/PageHeader";
import heroImg from "../assets/home/hero_image.png";

const About = () => {
  return (
    <div>
      <PageHeader
        title="About ADUAtlas"
        subtitle="Simplifying ADU regulations and connecting homeowners with trusted professionals"
        bg={heroImg}
      />
      <section className="container mx-auto px-4 sm:px-6 py-12 sm:py-20 grid lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-5">
          <h2 className="text-3xl sm:text-4xl font-semibold text-primary">Our Mission</h2>
          <p className="text-secondary leading-relaxed">
            ADUAtlas is a national platform built to help homeowners navigate every step of planning and building an Accessory Dwelling Unit. We cut through the complexity of zoning, permitting, and construction so you can make confident decisions.
          </p>
          <p className="text-secondary leading-relaxed">
            We also match you — by ZIP code — with verified local and national builders and suppliers who understand your city’s rules.
          </p>
        </div>
        <img src={heroImg} alt="ADU" className="w-full rounded-2xl object-cover aspect-[4/3]" />
      </section>
      <AduCTA />
    </div>
  );
};

export default About;
