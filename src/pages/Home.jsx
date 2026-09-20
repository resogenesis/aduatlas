import Hero from "../components/home/Hero";
import Pillars from "../components/home/Pillars";
import Possible from "../components/home/Possible";
import Stats from "../components/home/Stats";
import Mission from "../components/home/Mission";
import Testimonials from "../components/home/Testimonials";
import ClosingCta from "../components/home/ClosingCta";

// Phase 1 homepage: concise value proposition, property-address CTA, how it
// works, what is possible, proof, mission, and a final address CTA.
const Home = () => (
  <div className="w-full">
    <Hero />
    <Pillars />
    <Possible />
    <Stats />
    <Mission />
    <Testimonials />
    <ClosingCta />
  </div>
);

export default Home;
