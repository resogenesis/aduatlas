import Hero from "../components/home/Hero";
import Pillars from "../components/home/Pillars";
import Possible from "../components/home/Possible";
import Plans from "../components/home/Plans";
import BuilderTeaser from "../components/home/BuilderTeaser";
import Mission from "../components/home/Mission";
import Testimonials from "../components/home/Testimonials";
import ClosingCta from "../components/home/ClosingCta";

// Phase 1 homepage: value proposition, property-address CTA, how it works,
// what is possible, plans, builder access, mission, proof, final address CTA.
const Home = () => (
  <div className="w-full">
    <Hero />
    <Pillars />
    <Possible />
    <Plans />
    <BuilderTeaser />
    <Mission />
    <Testimonials />
    <ClosingCta />
  </div>
);

export default Home;
