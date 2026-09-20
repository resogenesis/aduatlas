import Hero from "../components/home/Hero";
import Pillars from "../components/home/Pillars";
import Possible from "../components/home/Possible";
import Plans from "../components/home/Plans";
import BuilderTeaser from "../components/home/BuilderTeaser";
import Testimonials from "../components/home/Testimonials";
import Mission from "../components/home/Mission";
import ClosingCta from "../components/home/ClosingCta";

// Phase 1 homepage: photo-first hero with the address box, numbered journey,
// what is possible, plans, builder access, proof, mission, final address CTA.
const Home = () => (
  <div className="w-full">
    <Hero />
    <Pillars />
    <Possible />
    <Plans />
    <BuilderTeaser />
    <Testimonials />
    <Mission />
    <ClosingCta />
  </div>
);

export default Home;
